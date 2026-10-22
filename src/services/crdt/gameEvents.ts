/**
 * CRDT Game Events & Genesis Specification for PoolPoker Offline Multiplayer
 *
 * Implements an event-sourced append-only log with Lamport total order.
 */

import { create54PokerDeck } from '../../../server/pokerDeck';
import type { Card } from '../../../shared/types/game';
import { getRandomInt, getRandomUUID } from '../../../shared/utils/crypto';

/**
 * 确定性 Mulberry32 伪随机数发生器
 * 给定相同的 32 位种子，跨浏览器和平台保证产生完全相同的浮点随机序列 [0, 1)
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 基于确定性 PRNG 的 Fisher-Yates 洗牌算法
 */
export function deterministicShuffle<T>(array: T[], seed: number): T[] {
  const rng = createMulberry32(seed);
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

export interface GenesisPlayer {
  userId: string;
  name: string;
  seatIndex: number;
}

export interface GenesisSnapshot {
  gameId: string;
  roomCode: string;
  startedAt: number;
  deckSeed: number;
  settings: {
    cardsPerPlayer: number;
    includeBlackEight: boolean;
  };
  players: GenesisPlayer[];
}

export type GameEventType =
  | 'POCKET_BALL' // 正常进球 (指定球号)
  | 'DRAW_PENALTY' // 抽罚牌 (从确定性牌堆抓取下一张)
  | 'ACCIDENTAL_POCKET' // 误进事故球
  | 'BREAK_POCKET' // 开球进球
  | 'RETRACT_EVENT'; // 悔球 (撤销特定前置 eventId)

export interface GameEvent {
  eventId: string;
  gameId: string;
  actorUserId: string;
  type: GameEventType;
  lamportTime: number;
  wallTime: number;
  ballNumber?: number;
  targetUserId?: string;
  retractTargetId?: string;
}

/**
 * 创建创世发牌基线
 */
export function createGenesisSnapshot(
  roomCode: string,
  players: Array<{ userId: string; name: string }>,
  cardsPerPlayer = 5,
  seed?: number
): GenesisSnapshot {
  const deckSeed = seed !== undefined ? seed : getRandomInt(1, 0x7fffffff);
  return {
    gameId: getRandomUUID(),
    roomCode,
    startedAt: Date.now(),
    deckSeed,
    settings: {
      cardsPerPlayer,
      includeBlackEight: true,
    },
    players: players.map((p, idx) => ({
      userId: p.userId,
      name: p.name,
      seatIndex: idx,
    })),
  };
}

/**
 * 依据 Genesis 中的确定性种子推导出完整 54 张洗牌序列及各玩家初始手牌
 */
export function deriveGenesisCards(genesis: GenesisSnapshot): {
  shuffledDeck: Card[];
  playerInitialHands: Map<string, Card[]>;
  drawDeck: Card[];
} {
  const standardDeck = create54PokerDeck();
  const shuffledDeck = deterministicShuffle(standardDeck, genesis.deckSeed);

  const playerInitialHands = new Map<string, Card[]>();
  let pointer = 0;
  const cardsPerPlayer = genesis.settings.cardsPerPlayer;

  for (const player of genesis.players) {
    const hand = shuffledDeck.slice(pointer, pointer + cardsPerPlayer);
    pointer += cardsPerPlayer;
    playerInitialHands.set(player.userId, hand);
  }

  const drawDeck = shuffledDeck.slice(pointer);
  return { shuffledDeck, playerInitialHands, drawDeck };
}

/**
 * 构造原子游戏操作事件
 */
export function createGameEvent(
  gameId: string,
  actorUserId: string,
  type: GameEventType,
  currentMaxLamport: number,
  options?: {
    ballNumber?: number;
    targetUserId?: string;
    retractTargetId?: string;
  }
): GameEvent {
  const lamportTime = currentMaxLamport + 1;
  const randomSuffix = getRandomInt(1000, 9999);
  return {
    eventId: `${actorUserId}_${lamportTime}_${randomSuffix}`,
    gameId,
    actorUserId,
    type,
    lamportTime,
    wallTime: Date.now(),
    ballNumber: options?.ballNumber,
    targetUserId: options?.targetUserId,
    retractTargetId: options?.retractTargetId,
  };
}

/**
 * 严格全序比较器：
 * 1. Lamport 逻辑时钟升序；
 * 2. 时钟相同时，以 actorUserId 字典序升序仲裁；
 * 3. 仍相同时，以 eventId 字典序仲裁。
 */
export function compareGameEvents(a: GameEvent, b: GameEvent): number {
  if (a.lamportTime !== b.lamportTime) {
    return a.lamportTime - b.lamportTime;
  }
  if (a.actorUserId !== b.actorUserId) {
    return a.actorUserId < b.actorUserId ? -1 : 1;
  }
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
}
