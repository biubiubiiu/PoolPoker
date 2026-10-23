import { describe, expect, it } from 'vitest';
import type { Card, Player, ServerRoom } from '../../../shared/types/game';
import { createRoundFinishedPayload } from '../../hook/snapshot';

function createDummyCard(ballNumber: number): Card {
  return {
    id: `c_${ballNumber}`,
    suit: '♠',
    suitType: 'spade',
    color: 'black',
    rank: `${ballNumber}`,
    ballNumber,
  };
}

function createTestPlayer(partial: Partial<Player> & { id: string; userId: string; name: string }): Player {
  return {
    cardCount: partial.cards?.length ?? 0,
    cards: [],
    pocketedCards: [],
    isHost: false,
    isWinner: false,
    online: true,
    wins: 0,
    totalScore: 0,
    ...partial,
  };
}

function createTestRoom(partial: Partial<ServerRoom>): ServerRoom {
  return {
    code: '1234',
    status: 'finished',
    hostUserId: 'u_1',
    hostSocketId: 's_1',
    players: [],
    deck: [],
    breakBalls: [],
    accidentalBalls: [],
    winners: [],
    turnOrder: [],
    lastTurnOrder: [],
    roundCount: 1,
    settings: {
      cardsPerPlayer: 5,
      includeBlackEight: true,
      maxPlayers: 8,
    },
    logs: [],
    lastRoundScores: [],
    gameHistory: [],
    ...partial,
  };
}

describe('Hook Snapshot (脱敏不可变快照生成器)', () => {
  it('支持多人获胜、并列榜首与 1-2-2-4 竞赛排名', () => {
    const room = createTestRoom({
      code: '1234',
      status: 'finished',
      players: [
        createTestPlayer({
          id: 's_1',
          userId: 'u_1',
          name: '小明',
          cards: [createDummyCard(8)], // 8 已经打落，有效手牌为 0
          totalScore: 100,
          wins: 2,
        }),
        createTestPlayer({
          id: 's_2',
          userId: 'u_2',
          name: '阿强',
          totalScore: 100, // 与小明并列第一
          wins: 1,
        }),
        createTestPlayer({
          id: 's_3',
          userId: 'u_3',
          name: '小李',
          cards: [createDummyCard(1)], // 1 未打落，有效手牌 1
          totalScore: 50,
          wins: 0,
        }),
      ],
      deck: [],
      accidentalBalls: [8], // 8 进了
      winners: [
        { name: '小明', id: 's_1', userId: 'u_1', wins: 2 },
        { name: '阿强', id: 's_2', userId: 'u_2', wins: 1 },
      ],
      lastRoundScores: [
        { userId: 'u_1', delta: 10 },
        { userId: 'u_2', delta: 10 },
        { userId: 'u_3', delta: -20 },
      ],
      lastTurnOrder: ['u_1', 'u_2', 'u_3'],
      lastWinnerUserId: 'u_1',
    });

    const payload = createRoundFinishedPayload(room);

    expect(payload.roomCode).toBe('1234');
    expect(payload.winners.length).toBe(2);
    expect(payload.winners.map((w) => w.name)).toEqual(['小明', '阿强']);

    // 区分物理余牌数与有效余牌数（小明虽然有物理手牌1张，但因为是胜者，有效余牌必定为0）
    const p1 = payload.scores.find((s) => s.userId === 'u_1');
    expect(p1?.physicalCardsCount).toBe(1);
    expect(p1?.effectiveCardsCount).toBe(0);

    const p3 = payload.scores.find((s) => s.userId === 'u_3');
    expect(p3?.physicalCardsCount).toBe(1);
    expect(p3?.effectiveCardsCount).toBe(1);

    // 并列榜首 (总分与得分相同，按中文拼音字典序排：阿强 在 小明 前)
    expect(payload.leaders.length).toBe(2);
    expect(payload.leaders.map((l) => l.name)).toEqual(['阿强', '小明']);

    // 竞赛排名 1-2-2-4 检查
    expect(payload.standings[0].rank).toBe(1);
    expect(payload.standings[1].rank).toBe(1); // 同分并列第 1
    expect(payload.standings[2].rank).toBe(3); // 第三人顺延为第 3

    // 预计下局开球者
    expect(payload.nextTurnFirstPlayer?.name).toBe('小明');
  });

  it('正确支持非榜首玩家的同分并列 (例如 100, 80, 80, 60 得到 [1, 2, 2, 4])', () => {
    const room = createTestRoom({
      code: '5678',
      status: 'finished',
      roundCount: 6,
      players: [
        createTestPlayer({ id: 's_1', userId: 'u_1', name: '玩家A', totalScore: 100 }),
        createTestPlayer({ id: 's_2', userId: 'u_2', name: '玩家B', totalScore: 80 }),
        createTestPlayer({ id: 's_3', userId: 'u_3', name: '玩家C', totalScore: 80 }), // 非榜首同分
        createTestPlayer({ id: 's_4', userId: 'u_4', name: '玩家D', totalScore: 60 }),
      ],
      winners: [{ name: '玩家A', id: 's_1', userId: 'u_1', wins: 3 }],
      lastRoundScores: [],
      logs: [], // 日志为空，验证不依赖日志推算
    });

    const payload = createRoundFinishedPayload(room);
    expect(payload.roundNumber).toBe(6);
    expect(payload.standings.map((s) => s.rank)).toEqual([1, 2, 2, 4]);
    expect(payload.leaders.map((l) => l.name)).toEqual(['玩家A']);
  });

  it('快照具备绝对不可变性，后续修改原 room 不影响已生成的快照', () => {
    const room = createTestRoom({
      code: '8888',
      status: 'finished',
      players: [
        createTestPlayer({
          id: 's_1',
          userId: 'u_1',
          name: '小明',
          totalScore: 50,
        }),
      ],
      deck: [],
      accidentalBalls: [],
      winners: [{ name: '小明', id: 's_1', userId: 'u_1', wins: 1 }],
      lastRoundScores: [{ userId: 'u_1', delta: 50 }],
    });

    const payload = createRoundFinishedPayload(room);
    expect(payload.scores[0].name).toBe('小明');
    expect(payload.scores[0].totalScore).toBe(50);

    // 修改 room
    room.players[0].name = '被修改的小明';
    room.players[0].totalScore = 9999;
    room.code = '9999';

    // 快照中的字段完全不受原引用影响
    expect(payload.roomCode).toBe('8888');
    expect(payload.scores[0].name).toBe('小明');
    expect(payload.scores[0].totalScore).toBe(50);
  });
});
