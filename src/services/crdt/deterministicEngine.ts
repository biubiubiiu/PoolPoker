/**
 * Deterministic CRDT Reducer for PoolPoker
 *
 * Given an immutable Genesis snapshot and an arbitrary collection of GameEvents,
 * computes the deterministic room state without requiring any central server or host.
 */

import type { Card } from '../../../shared/types/game';
import { compareGameEvents, deriveGenesisCards, type GameEvent, type GenesisSnapshot } from './gameEvents';

export interface ComputedPlayerState {
  userId: string;
  name: string;
  seatIndex: number;
  cardCount: number;
  cards: Card[]; // 玩家未落袋的剩余卡牌 (若启用了脱敏裁剪，非自己且未结算则为空数组)
  pocketedCards: Card[]; // 已被该玩家主动打出落袋的卡牌
  isWinner: boolean;
}

export interface ComputedRoomState {
  gameId: string;
  roomCode: string;
  status: 'playing' | 'finished';
  pocketedBallNumbers: number[];
  pocketedBallsMask: number;
  accidentalBalls: number[];
  breakBalls: number[];
  players: ComputedPlayerState[];
  winners: Array<{ userId: string; name: string }>;
  deckRemaining: number;
  maxLamport: number;
  totalEventsCount: number;
  appliedEventsCount: number;
  logs: Array<{ text: string; wallTime: number }>;
}

/**
 * 将 1..15 号球数组编码为 16-bit 掩码
 */
export function ballsToMask(ballNumbers: number[]): number {
  let mask = 0;
  for (const num of ballNumbers) {
    if (num >= 1 && num <= 15) {
      mask |= 1 << num;
    }
  }
  return mask >>> 0;
}

/**
 * 纯函数：确定性回放演算游戏全局状态
 *
 * @param genesis 创世发牌快照
 * @param events 事件集合（允许任意乱序、包含重复或撤销）
 * @param viewUserId 若指定则按该玩家视角脱敏手牌；若未指定则返回完整视图
 */
export function reduceGameState(genesis: GenesisSnapshot, events: GameEvent[], viewUserId?: string): ComputedRoomState {
  // 1. 去重事件 (按 eventId 幂等保护)
  const uniqueEventsMap = new Map<string, GameEvent>();
  let maxLamport = 0;

  for (const evt of events) {
    if (evt.gameId !== genesis.gameId) continue;
    if (evt.lamportTime > maxLamport) {
      maxLamport = evt.lamportTime;
    }
    if (!uniqueEventsMap.has(evt.eventId)) {
      uniqueEventsMap.set(evt.eventId, evt);
    }
  }

  const allEvents = Array.from(uniqueEventsMap.values());

  // 2. 收集被 RETRACT_EVENT 撤销的事件 ID 集合
  const retractedEventIds = new Set<string>();
  for (const evt of allEvents) {
    if (evt.type === 'RETRACT_EVENT' && evt.retractTargetId) {
      retractedEventIds.add(evt.retractTargetId);
    }
  }

  // 3. 过滤并按全序排序有效事件
  const validEvents = allEvents
    .filter((e) => e.type !== 'RETRACT_EVENT' && !retractedEventIds.has(e.eventId))
    .sort(compareGameEvents);

  // 4. 从 Genesis 初始化牌局与手牌
  const { playerInitialHands, drawDeck } = deriveGenesisCards(genesis);

  const playersMap = new Map<
    string,
    {
      userId: string;
      name: string;
      seatIndex: number;
      cards: Card[];
      pocketedCards: Card[];
      isWinner: boolean;
    }
  >();

  for (const gp of genesis.players) {
    const initialHand = playerInitialHands.get(gp.userId) || [];
    playersMap.set(gp.userId, {
      userId: gp.userId,
      name: gp.name,
      seatIndex: gp.seatIndex,
      cards: initialHand.map((c) => ({ ...c })),
      pocketedCards: [],
      isWinner: false,
    });
  }

  const accidentalBallsSet = new Set<number>();
  const breakBallsSet = new Set<number>();
  const allPocketedBallsSet = new Set<number>();
  const logs: Array<{ text: string; wallTime: number }> = [];

  logs.push({
    text: `🎮 游戏正式开始！每人发牌 ${genesis.settings.cardsPerPlayer} 张`,
    wallTime: genesis.startedAt,
  });

  // 抽牌指针：按确定性序列发罚牌
  let deckPointer = 0;

  // 5. 顺序回放所有有效事件
  for (const evt of validEvents) {
    const actor = playersMap.get(evt.actorUserId);
    const actorName = actor?.name || `球友_${evt.actorUserId.slice(-4)}`;

    switch (evt.type) {
      case 'POCKET_BALL': {
        const ball = evt.ballNumber;
        if (!ball || allPocketedBallsSet.has(ball)) break;

        // 如果是指定玩家打进自己手牌中的球
        if (actor) {
          const cardIdx = actor.cards.findIndex((c) => c.ballNumber === ball);
          if (cardIdx !== -1) {
            const [pocketedCard] = actor.cards.splice(cardIdx, 1);
            actor.pocketedCards.push(pocketedCard);
            logs.push({
              text: `🎯 ${actorName} 打进 ${ball}号球，消去手牌 [${pocketedCard.suit}${pocketedCard.rank}]`,
              wallTime: evt.wallTime,
            });
          } else {
            // 该球号不在此人手中，但在台球规则中球已进袋
            logs.push({
              text: `🎱 ${actorName} 将 ${ball}号球打进落袋`,
              wallTime: evt.wallTime,
            });
          }
        }
        allPocketedBallsSet.add(ball);
        break;
      }

      case 'ACCIDENTAL_POCKET': {
        const ball = evt.ballNumber;
        if (ball && !allPocketedBallsSet.has(ball)) {
          accidentalBallsSet.add(ball);
          allPocketedBallsSet.add(ball);
          logs.push({
            text: `🎱 场上 ${ball}号球被判定为已进球`,
            wallTime: evt.wallTime,
          });
        }
        break;
      }

      case 'BREAK_POCKET': {
        const ball = evt.ballNumber;
        if (ball && !allPocketedBallsSet.has(ball)) {
          breakBallsSet.add(ball);
          allPocketedBallsSet.add(ball);
          logs.push({
            text: `🚀 开球进球：${ball}号球已落袋`,
            wallTime: evt.wallTime,
          });
        }
        break;
      }

      case 'DRAW_PENALTY': {
        const targetUserId = evt.targetUserId || evt.actorUserId;
        const targetPlayer = playersMap.get(targetUserId);
        if (targetPlayer && deckPointer < drawDeck.length) {
          const card = { ...drawDeck[deckPointer++] };
          targetPlayer.cards.push(card);
          logs.push({
            text: `⚠️ ${targetPlayer.name} 犯规，罚抽 1 张扑克牌`,
            wallTime: evt.wallTime,
          });
        }
        break;
      }
    }
  }

  // 6. 胜负判定 (当玩家所有未打出的手牌所对应的球号都已落袋，该玩家获胜)
  const winners: Array<{ userId: string; name: string }> = [];

  for (const player of playersMap.values()) {
    // 依然未落袋的有效活跃手牌
    const remainingActiveCards = player.cards.filter((c) => !allPocketedBallsSet.has(c.ballNumber));
    if (remainingActiveCards.length === 0) {
      player.isWinner = true;
      winners.push({ userId: player.userId, name: player.name });
    }
  }

  const isFinished = winners.length > 0;
  if (isFinished) {
    logs.push({
      text: `🏆 比赛结束！获胜者：${winners.map((w) => w.name).join('、')}`,
      wallTime: validEvents.length > 0 ? validEvents[validEvents.length - 1].wallTime : Date.now(),
    });
  }

  const pocketedBallNumbers = Array.from(allPocketedBallsSet).sort((a, b) => a - b);
  const pocketedBallsMask = ballsToMask(pocketedBallNumbers);

  const players: ComputedPlayerState[] = genesis.players.map((gp) => {
    const p = playersMap.get(gp.userId);
    const isSelf = viewUserId ? gp.userId === viewUserId : true;
    const showCards = isSelf || isFinished;

    return {
      userId: gp.userId,
      name: gp.name,
      seatIndex: gp.seatIndex,
      cardCount: p ? p.cards.length : 0,
      cards: showCards && p ? p.cards : [],
      pocketedCards: p ? p.pocketedCards : [],
      isWinner: p ? p.isWinner : false,
    };
  });

  return {
    gameId: genesis.gameId,
    roomCode: genesis.roomCode,
    status: isFinished ? 'finished' : 'playing',
    pocketedBallNumbers,
    pocketedBallsMask,
    accidentalBalls: Array.from(accidentalBallsSet),
    breakBalls: Array.from(breakBallsSet),
    players,
    winners,
    deckRemaining: Math.max(0, drawDeck.length - deckPointer),
    maxLamport,
    totalEventsCount: allEvents.length,
    appliedEventsCount: validEvents.length,
    logs: logs.slice(-15),
  };
}
