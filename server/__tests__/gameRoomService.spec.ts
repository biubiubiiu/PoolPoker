import { describe, expect, it, vi } from 'vitest';
import type { Card, Player, ServerRoom } from '../../shared/types/game';
import { applyGameRoomCommand } from '../gameRoomService';
import { recordGameStep } from '../gameState';
import { getClientRoomState, removeRoom, saveRoom } from '../roomManager';

vi.mock('../wecomWebhook', () => ({
  sendRoundResultToWecom: vi.fn(),
}));

function createTestCard(id: string, rank: string, ballNumber: number, suitType: Card['suitType'] = 'spade'): Card {
  const suitSymbolMap: Record<Card['suitType'], string> = {
    spade: '♠',
    heart: '♥',
    club: '♣',
    diamond: '♦',
    'joker-small': '🃏',
    'joker-big': '👑',
  };
  const colorMap: Record<Card['suitType'], Card['color']> = {
    spade: 'black',
    club: 'black',
    heart: 'red',
    diamond: 'red',
    'joker-small': 'gray',
    'joker-big': 'gold',
  };

  return {
    id,
    suit: suitSymbolMap[suitType],
    suitType,
    color: colorMap[suitType],
    rank,
    ballNumber,
  };
}

function createPlayer(overrides: Partial<Player>): Player {
  return {
    id: overrides.id ?? overrides.userId ?? 'socket-1',
    userId: overrides.userId ?? 'user-1',
    sessionToken: overrides.sessionToken,
    name: overrides.name ?? 'Player',
    avatar: overrides.avatar ?? '🎱',
    isHost: overrides.isHost ?? false,
    online: overrides.online ?? true,
    cardCount: overrides.cards?.length ?? overrides.cardCount ?? 0,
    activeCardCount: overrides.activeCardCount ?? overrides.cards?.length ?? overrides.cardCount ?? 0,
    cards: overrides.cards ?? [],
    pocketedCards: overrides.pocketedCards ?? [],
    wins: overrides.wins ?? 0,
    isWinner: overrides.isWinner ?? false,
    totalScore: overrides.totalScore ?? 0,
  };
}

function createRoom(overrides: Partial<ServerRoom> = {}): ServerRoom {
  const hostUserId = overrides.hostUserId ?? 'user-1';
  return {
    code: overrides.code ?? '1234',
    hostUserId,
    hostSocketId: overrides.hostSocketId ?? 'socket-1',
    status: overrides.status ?? 'playing',
    players: overrides.players ?? [
      createPlayer({
        id: 'socket-1',
        userId: hostUserId,
        name: 'Host',
        isHost: true,
        cards: [createTestCard('c1', 'A', 1)],
      }),
    ],
    deck: overrides.deck ?? [],
    accidentalBalls: overrides.accidentalBalls ?? [],
    breakBalls: overrides.breakBalls ?? [],
    winners: overrides.winners ?? [],
    lastWinnerUserId: overrides.lastWinnerUserId,
    lastTurnOrder: overrides.lastTurnOrder,
    turnOrder: overrides.turnOrder ?? [],
    roundCount: overrides.roundCount ?? 0,
    settings: overrides.settings ?? {
      cardsPerPlayer: 2,
      maxPlayers: 8,
      includeBlackEight: true,
      ballConfigKey: 'xingpai',
    },
    logs: overrides.logs ?? [],
    lastRoundScores: overrides.lastRoundScores ?? [],
    gameHistory: overrides.gameHistory ?? [],
  };
}

describe('gameRoomService', () => {
  it('starts a game through the command boundary and seeds undo history', () => {
    const room = createRoom({
      status: 'waiting',
      players: [
        createPlayer({ id: 'socket-1', userId: 'user-1', name: 'Host', isHost: true }),
        createPlayer({ id: 'socket-2', userId: 'user-2', name: 'Guest' }),
      ],
    });

    const rejected = applyGameRoomCommand(room, { type: 'start_game', actorUserId: 'user-2' });
    expect(rejected).toEqual({ shouldBroadcast: false, changed: false });
    expect(room.status).toBe('waiting');

    const accepted = applyGameRoomCommand(room, { type: 'start_game', actorUserId: 'user-1' });

    expect(accepted).toEqual({ shouldBroadcast: true, changed: true });
    expect(room.status).toBe('playing');
    expect(room.roundCount).toBe(1);
    expect(room.players.every((p) => p.cards.length === 2)).toBe(true);
    expect(room.turnOrder).toHaveLength(2);
    expect(room.gameHistory).toHaveLength(1);
    expect(room.logs[room.logs.length - 1]?.text).toContain('游戏正式开始');
  });

  it('pockets a card, finishes the round, scores losers, and records one history step', () => {
    const winningCard = createTestCard('c1', 'A', 1);
    const loserCard = createTestCard('c5', '5', 5);
    const room = createRoom({
      players: [
        createPlayer({ id: 'socket-1', userId: 'user-1', name: 'Host', isHost: true, cards: [winningCard] }),
        createPlayer({ id: 'socket-2', userId: 'user-2', name: 'Guest', cards: [loserCard] }),
      ],
    });
    recordGameStep(room);

    const result = applyGameRoomCommand(room, { type: 'pocket_ball', actorUserId: 'user-1', cardId: 'c1' });

    expect(result).toEqual({ shouldBroadcast: true, changed: true });
    expect(room.status).toBe('finished');
    expect(room.players[0].pocketedCards).toEqual([winningCard]);
    expect(room.winners.map((w) => w.userId)).toEqual(['user-1']);
    expect(room.lastRoundScores).toEqual([
      { userId: 'user-2', delta: -2 },
      { userId: 'user-1', delta: 2 },
    ]);
    expect(room.gameHistory).toHaveLength(2);
    expect(room.gameHistory[room.gameHistory.length - 1]?.actionText).toContain('打进 1号球');
  });

  it('retracts the previous gameplay operation as a single boundary behavior', () => {
    const card1 = createTestCard('c1', 'A', 1);
    const card2 = createTestCard('c2', '2', 2);
    const room = createRoom({
      players: [
        createPlayer({
          id: 'socket-1',
          userId: 'user-1',
          name: 'Host',
          isHost: true,
          cards: [card1, card2],
        }),
      ],
    });
    recordGameStep(room);
    applyGameRoomCommand(room, { type: 'pocket_ball', actorUserId: 'user-1', cardId: 'c1' });

    const result = applyGameRoomCommand(room, { type: 'retract_ball' });

    expect(result).toEqual({ shouldBroadcast: true, changed: true });
    expect(room.players[0].cards).toEqual([card1, card2]);
    expect(room.players[0].pocketedCards).toEqual([]);
    expect(room.gameHistory).toHaveLength(1);
    expect(room.logs[room.logs.length - 1]?.text).toBe('↩️ 已撤回到上一步操作');
  });

  it('keeps referee pocket fallback and penalty draw behavior behind the same interface', () => {
    const penaltyCard = createTestCard('c9', '9', 9);
    const room = createRoom({
      players: [
        createPlayer({
          id: 'socket-1',
          userId: 'user-1',
          name: 'Host',
          isHost: true,
          cards: [createTestCard('c1', 'A', 1)],
        }),
        createPlayer({
          id: 'socket-2',
          userId: 'user-2',
          name: 'Guest',
          cards: [createTestCard('c2', '2', 2)],
        }),
      ],
      deck: [penaltyCard],
    });
    recordGameStep(room);

    const fallback = applyGameRoomCommand(room, {
      type: 'referee_pocket_ball',
      actorSocketId: 'socket-1',
      targetUserId: 'user-2',
      ballNumber: 8,
    });
    const penalty = applyGameRoomCommand(room, { type: 'referee_draw_penalty', targetUserId: 'user-2' });

    expect(fallback).toEqual({ shouldBroadcast: true, changed: true });
    expect(room.accidentalBalls).toEqual([8]);
    expect(room.logs.some((l) => l.text.includes('Guest 打进 8号球'))).toBe(true);
    expect(penalty).toEqual({ shouldBroadcast: true, changed: true });
    expect(room.players[1].cards).toContainEqual(penaltyCard);
    expect(room.players[1].cards).toHaveLength(2);
    expect(room.logs[room.logs.length - 1]?.text).toContain('裁判代记：Guest 犯规');
  });
});

describe('v2 confirmed table events', () => {
  const makePairRoom = () =>
    createRoom({
      players: [
        createPlayer({
          userId: 'user-1',
          cards: [
            createTestCard('four-a', '4', 4),
            createTestCard('four-b', '4', 4, 'heart'),
            createTestCard('king', 'K', 13),
          ],
        }),
        createPlayer({
          userId: 'user-2',
          cards: [createTestCard('four-c', '4', 4, 'diamond'), createTestCard('eight', '8', 8)],
        }),
      ],
    });

  it('records one of a pair, leaves the other as free, and ignores duplicate reports', () => {
    const room = makePairRoom();
    recordGameStep(room);
    const command = {
      type: 'referee_pocket_ball' as const,
      actorSocketId: 'socket-1',
      targetUserId: 'user-1',
      ballNumber: 4,
    };
    expect(applyGameRoomCommand(room, command).changed).toBe(true);
    const event = room.sceneEvent;
    expect(event?.revision).toBe(1);
    expect(room.players[0].cards.map((c) => c.id)).toEqual(['four-b', 'king']);
    expect(room.players[1].cards).toHaveLength(2);
    expect(applyGameRoomCommand(room, command).changed).toBe(false);
    expect(applyGameRoomCommand(room, { type: 'pocket_ball', actorUserId: 'user-1', cardId: 'four-b' }).changed).toBe(
      false
    );
    expect(room.sceneEvent).toEqual(event);
    expect(room.gameHistory).toHaveLength(2);
  });

  it('undo restores both the ball and hand, advances the event revision, and rejects stale undo', () => {
    const room = makePairRoom();
    recordGameStep(room);
    applyGameRoomCommand(room, { type: 'pocket_ball', actorUserId: 'user-1', cardId: 'four-a' });
    const firstId = room.sceneEvent?.id;
    expect(applyGameRoomCommand(room, { type: 'retract_ball', expectedRevision: 0 }).changed).toBe(false);
    expect(room.players[0].cards).toHaveLength(2);
    expect(applyGameRoomCommand(room, { type: 'retract_ball', expectedRevision: 1 }).changed).toBe(true);
    expect(room.revision).toBe(2);
    expect(room.sceneEvent?.id).not.toBe(firstId);
    expect(room.players[0].cards).toHaveLength(3);
    expect(room.players[0].pocketedCards).toEqual([]);
  });

  it('supports shared victory with retained free cards', () => {
    const room = createRoom({
      players: [
        createPlayer({ userId: 'user-1', cards: [createTestCard('a', '4', 4), createTestCard('b', '4', 4, 'heart')] }),
        createPlayer({ userId: 'user-2', cards: [createTestCard('c', '4', 4, 'diamond')] }),
      ],
    });
    applyGameRoomCommand(room, { type: 'pocket_ball', actorUserId: 'user-1', cardId: 'a' });
    expect(room.status).toBe('finished');
    expect(room.winners).toHaveLength(2);
    expect(room.players.every((p) => p.cards.length === 1)).toBe(true);
  });
});

describe('v2 public presentation projection', () => {
  it('reports effective counts and public event facts without private hands or penalty cards', () => {
    const room = createRoom({
      code: 'test-v2-projection',
      players: [
        createPlayer({ userId: 'user-1', cards: [createTestCard('a', '4', 4), createTestCard('b', 'K', 13)] }),
        createPlayer({ userId: 'user-2', cards: [createTestCard('c', '4', 4), createTestCard('d', '8', 8)] }),
      ],
      deck: [createTestCard('private-penalty', 'J', 11)],
    });
    saveRoom(room);
    try {
      applyGameRoomCommand(room, { type: 'pocket_ball', actorUserId: 'user-1', cardId: 'a' });
      const view = getClientRoomState(room.code, 'user-1');
      expect(view?.players[1].cards).toEqual([]);
      expect(view?.players[1].cardCount).toBe(2);
      expect(view?.players[1].activeCardCount).toBe(1);
      expect(view?.sceneEvent?.ballNumber).toBe(4);
      applyGameRoomCommand(room, { type: 'referee_draw_penalty', targetUserId: 'user-2' });
      const afterPenalty = getClientRoomState(room.code, 'user-1');
      expect(afterPenalty?.sceneEvent?.targetUserId).toBe('user-2');
      expect(afterPenalty?.sceneEvent?.ballNumber).toBeUndefined();
      expect(JSON.stringify(afterPenalty)).not.toContain('private-penalty');
    } finally {
      removeRoom(room.code);
    }
  });
});
