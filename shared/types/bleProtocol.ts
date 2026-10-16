/**
 * BLE Compact Binary Wire Protocol for PoolPoker (球霸扑克)
 *
 * Designed for low BLE MTU transmission (< 150 bytes payload).
 * Replaces heavy JSON over Bluetooth LE GATT characteristics.
 */

import type { Card, Room } from './game';

export const BLE_PROTOCOL_VERSION = 0x01;

export enum BleMessageType {
  CLIENT_JOIN = 0x01,
  CLIENT_ACTION = 0x02,
  HOST_STATE_SYNC = 0x10,
  HOST_EVENT_NOTIFY = 0x11,
}

export enum BleActionType {
  START_GAME = 0x01,
  POCKET_BALL = 0x02,
  DRAW_PENALTY = 0x03,
  ACCIDENTAL_POCKET = 0x04,
  BREAK_POCKET = 0x05,
  RETRACT_BALL = 0x06,
  RESTART_GAME = 0x07,
  REFEREE_POCKET = 0x08,
  REFEREE_PENALTY = 0x09,
  UPDATE_SETTINGS = 0x0a,
  KICK_PLAYER = 0x0b,
}

export enum BleGameStatus {
  WAITING = 0x00,
  PLAYING = 0x01,
  FINISHED = 0x02,
}

export enum BlePlayerFlag {
  IS_HOST = 1 << 0,
  ONLINE = 1 << 1,
  IS_WINNER = 1 << 2,
}

export interface BleFrameHeader {
  version: number; // 协议版本号 (目前 0x01)
  msgType: BleMessageType;
  revision: number; // 房间修订版本号 / 请求序列号 (0-255 回绕)
  flags: number; // 保留标志位，供后续扩展使用 (如加密、压缩等)
}

export interface BlePlayerSummary {
  userIdHash: number; // 玩家 userId 的 8 位短哈希或席位编号
  userId: string; // 对应的真实或恢复 userId
  name?: string; // 玩家昵称
  cardCount: number;
  isHost: boolean;
  online: boolean;
  isWinner: boolean;
  totalScore: number;
  pocketedCards?: number[]; // 0..53 编码的已落袋卡牌
  roundScoreDelta?: number; // 当局结算得分变化
}

export interface BleRoomState {
  version: number;
  revision: number;
  status: BleGameStatus;
  pocketedBallsMask: number; // 16-bit mask, bit 1..15 对应 1..15 号球
  roundCount: number;
  deckRemaining: number;
  cardsPerPlayer?: number; // 每人手牌数 (1..10)
  selfSeatIndex?: number; // 当前接收者在 players 中的席位下标 (0..7)
  hostSeatIndex?: number; // 房主在 players 中的席位下标 (0..7)
  selfHandCards: number[]; // 0..53 编码的当前玩家手牌
  players: BlePlayerSummary[];
  lastActionText?: string; // 最近一步操作日志描述 (用于撤回展示与判定)
}

/**
 * 纯 JS 实现的 UTF-8 编码器，兼容 QuickJS / 嵌入式 JS 引擎（无原生 TextEncoder 环境）
 */
export function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      if (i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          c = ((c - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
          i++;
        }
      }
    }
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

/**
 * 纯 JS 实现的 UTF-8 解码器，兼容 QuickJS / 嵌入式 JS 引擎（无原生 TextDecoder 环境）
 */
export function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let str = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      str += String.fromCharCode(b1);
    } else if (b1 >= 0xc0 && b1 < 0xe0) {
      const b2 = bytes[i++];
      str += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
    } else if (b1 >= 0xe0 && b1 < 0xf0) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      str += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
    } else if (b1 >= 0xf0) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      let cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      cp -= 0x10000;
      str += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return str;
}

export interface BleClientAction {
  version: number;
  revision: number;
  actionType: BleActionType;
  ballNumber?: number;
  cardIndex?: number;
  cardId?: string;
  targetUserId?: string;
  cardsPerPlayer?: number;
}

export interface BleClientJoin {
  version: number;
  revision: number;
  roomCode: number; // 4位数字 (1000..9999)
  userId: string;
  name: string;
}

// -------------------------------------------------------------
// 卡牌 0..53 紧凑映射工具 (Card <-> CardIndex)
// 0..12:   ♠ A..K (ball 1..13)
// 13..25:  ♥ A..K (ball 1..13)
// 26..38:  ♣ A..K (ball 1..13)
// 39..51:  ♦ A..K (ball 1..13)
// 52:      小王 (ball 14)
// 53:      大王 (ball 15)
// -------------------------------------------------------------
const SUIT_ORDER: Array<'spade' | 'heart' | 'club' | 'diamond'> = ['spade', 'heart', 'club', 'diamond'];
const SUIT_SYMBOLS = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' };
const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function cardToIndex(card: Pick<Card, 'suitType' | 'rank'>): number {
  if (card.suitType === 'joker-small') return 52;
  if (card.suitType === 'joker-big') return 53;
  const suitIdx = SUIT_ORDER.indexOf(card.suitType as any);
  const rankIdx = RANK_ORDER.indexOf(card.rank);
  if (suitIdx === -1 || rankIdx === -1) return 0;
  return suitIdx * 13 + rankIdx;
}

export function indexToCard(index: number, idPrefix = 'ble'): Card {
  if (index === 52) {
    return {
      id: `${idPrefix}_52`,
      suit: '🃏',
      suitType: 'joker-small',
      color: 'black',
      rank: '小王',
      ballNumber: 14,
    };
  }
  if (index === 53) {
    return {
      id: `${idPrefix}_53`,
      suit: '🃏',
      suitType: 'joker-big',
      color: 'red',
      rank: '大王',
      ballNumber: 15,
    };
  }
  const suitIdx = Math.floor(index / 13) % 4;
  const rankIdx = index % 13;
  const suitType = SUIT_ORDER[suitIdx];
  const rank = RANK_ORDER[rankIdx];
  return {
    id: `${idPrefix}_${index}`,
    suit: SUIT_SYMBOLS[suitType],
    suitType,
    color: suitType === 'heart' || suitType === 'diamond' ? 'red' : 'black',
    rank,
    ballNumber: rankIdx + 1,
  };
}

export function ballsToMask(ballNumbers: number[]): number {
  let mask = 0;
  for (const b of ballNumbers) {
    if (b >= 1 && b <= 15) {
      mask |= 1 << b;
    }
  }
  return mask;
}

export function maskToBalls(mask: number): number[] {
  const balls: number[] = [];
  for (let b = 1; b <= 15; b++) {
    if ((mask & (1 << b)) !== 0) {
      balls.push(b);
    }
  }
  return balls;
}

// 简单 8-bit DJB2 哈希
export function simpleHash8(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xff;
  }
  return hash;
}

// -------------------------------------------------------------
// 二进制编解码 (Encode / Decode)
// -------------------------------------------------------------

/**
 * 编码 HOST_STATE_SYNC 下行状态帧
 */
export function encodeBleRoomState(state: BleRoomState): Uint8Array {
  const headerSize = 4; // version, msgType, revision, flags
  const fixedStateSize = 7; // status (1), pocketedMask (2), roundCount (1), deckRemaining (1), selfSeat (1), hostSeat (1)
  const selfCardsSize = 1 + state.selfHandCards.length; // length (1) + cards (N)

  // 预估大小
  let dynamicSize = 1; // playerCount (1)
  for (const p of state.players) {
    // userIdHash (1), cardCount (1), flags (1), totalScore (2), roundScoreDelta (2), pocketedCount (1) + pocketedCards (M)
    dynamicSize += 8 + (p.pocketedCards?.length || 0);
  }

  const actionTextBytes = state.lastActionText ? utf8Encode(state.lastActionText) : new Uint8Array(0);
  dynamicSize += 1 + actionTextBytes.length; // actionTextLen (1) + textBytes

  const totalSize = headerSize + fixedStateSize + selfCardsSize + dynamicSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // 1. Header (版本号 + 状态同步指令 + 修订号 + cardsPerPlayer)
  view.setUint8(0, state.version ?? BLE_PROTOCOL_VERSION);
  view.setUint8(1, BleMessageType.HOST_STATE_SYNC);
  view.setUint8(2, state.revision & 0xff);
  view.setUint8(3, (state.cardsPerPlayer ?? 5) & 0xff);

  // 2. Fixed State
  view.setUint8(4, state.status);
  view.setUint16(5, state.pocketedBallsMask, true); // Little-Endian
  view.setUint8(7, state.roundCount & 0xff);
  view.setUint8(8, state.deckRemaining & 0xff);
  view.setUint8(9, (state.selfSeatIndex ?? 0) & 0xff);
  view.setUint8(10, (state.hostSeatIndex ?? 0) & 0xff);

  // 3. Self Cards
  let offset = 11;
  view.setUint8(offset++, state.selfHandCards.length);
  for (const c of state.selfHandCards) {
    view.setUint8(offset++, c & 0x3f);
  }

  // 4. Players Summary
  view.setUint8(offset++, state.players.length);
  for (const p of state.players) {
    view.setUint8(offset++, p.userIdHash & 0xff);
    view.setUint8(offset++, p.cardCount & 0xff);
    let flags = 0;
    if (p.isHost) flags |= BlePlayerFlag.IS_HOST;
    if (p.online) flags |= BlePlayerFlag.ONLINE;
    if (p.isWinner) flags |= BlePlayerFlag.IS_WINNER;
    view.setUint8(offset++, flags);
    view.setInt16(offset, p.totalScore, true);
    offset += 2;
    view.setInt16(offset, p.roundScoreDelta ?? 0, true);
    offset += 2;

    const pocketed = p.pocketedCards || [];
    view.setUint8(offset++, pocketed.length);
    for (const pc of pocketed) {
      view.setUint8(offset++, pc & 0x3f);
    }
  }

  // 5. Last Action Text
  view.setUint8(offset++, actionTextBytes.length);
  if (actionTextBytes.length > 0) {
    bytes.set(actionTextBytes, offset);
    offset += actionTextBytes.length;
  }

  return bytes.subarray(0, offset);
}

/**
 * 解码 HOST_STATE_SYNC 下行状态帧
 */
export function decodeBleRoomState(bytes: Uint8Array): BleRoomState {
  if (bytes.length < 12) {
    throw new Error(`BLE packet too small for HOST_STATE_SYNC: ${bytes.length} bytes`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const version = view.getUint8(0);
  const msgType = view.getUint8(1);
  if (msgType !== BleMessageType.HOST_STATE_SYNC) {
    throw new Error(`Unexpected message type: 0x${msgType.toString(16)}`);
  }
  const revision = view.getUint8(2);
  const cardsPerPlayerRaw = view.getUint8(3);
  const cardsPerPlayer = cardsPerPlayerRaw > 0 ? cardsPerPlayerRaw : 5;

  const status = view.getUint8(4) as BleGameStatus;
  const pocketedBallsMask = view.getUint16(5, true);
  const roundCount = view.getUint8(7);
  const deckRemaining = view.getUint8(8);
  const selfSeatIndex = view.getUint8(9);
  const hostSeatIndex = view.getUint8(10);

  let offset = 11;
  const selfCardLen = view.getUint8(offset++);
  const selfHandCards: number[] = [];
  for (let i = 0; i < selfCardLen; i++) {
    selfHandCards.push(view.getUint8(offset++));
  }

  const playerCount = view.getUint8(offset++);
  const players: BlePlayerSummary[] = [];
  for (let i = 0; i < playerCount; i++) {
    const userIdHash = view.getUint8(offset++);
    const cardCount = view.getUint8(offset++);
    const flags = view.getUint8(offset++);
    const totalScore = view.getInt16(offset, true);
    offset += 2;
    const roundScoreDelta = view.getInt16(offset, true);
    offset += 2;

    const pocketedLen = view.getUint8(offset++);
    const pocketedCards: number[] = [];
    for (let j = 0; j < pocketedLen; j++) {
      pocketedCards.push(view.getUint8(offset++));
    }

    players.push({
      userIdHash,
      userId: `user_${userIdHash}`,
      name: `球友_${userIdHash}`,
      cardCount,
      isHost: (flags & BlePlayerFlag.IS_HOST) !== 0,
      online: (flags & BlePlayerFlag.ONLINE) !== 0,
      isWinner: (flags & BlePlayerFlag.IS_WINNER) !== 0,
      totalScore,
      pocketedCards,
      roundScoreDelta,
    });
  }

  let lastActionText: string | undefined;
  if (offset < bytes.length) {
    const textLen = view.getUint8(offset++);
    if (textLen > 0 && offset + textLen <= bytes.length) {
      lastActionText = utf8Decode(bytes.subarray(offset, offset + textLen));
      offset += textLen;
    }
  }

  return {
    version,
    revision,
    status,
    pocketedBallsMask,
    roundCount,
    deckRemaining,
    cardsPerPlayer,
    selfSeatIndex,
    hostSeatIndex,
    selfHandCards,
    players,
    lastActionText,
  };
}

/**
 * 编码 CLIENT_ACTION 上行指令帧
 */
export function encodeBleAction(action: BleClientAction): Uint8Array {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);

  view.setUint8(0, action.version ?? BLE_PROTOCOL_VERSION);
  view.setUint8(1, BleMessageType.CLIENT_ACTION);
  view.setUint8(2, action.revision & 0xff);
  view.setUint8(3, action.actionType);
  view.setUint8(4, action.ballNumber ?? 0);
  view.setUint8(5, action.cardIndex !== undefined ? action.cardIndex : 0xff);
  view.setUint8(6, action.cardsPerPlayer ?? 0);
  view.setUint8(7, 0); // reserved

  return new Uint8Array(buffer);
}

/**
 * 解码 CLIENT_ACTION 上行指令帧
 */
export function decodeBleAction(bytes: Uint8Array): BleClientAction {
  if (bytes.length < 4) {
    throw new Error(`BLE packet too small for CLIENT_ACTION: ${bytes.length} bytes`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  const msgType = view.getUint8(1);
  if (msgType !== BleMessageType.CLIENT_ACTION) {
    throw new Error(`Unexpected message type: 0x${msgType.toString(16)}`);
  }
  const revision = view.getUint8(2);
  const actionType = view.getUint8(3) as BleActionType;
  const ballNumberRaw = bytes.length > 4 ? view.getUint8(4) : 0;
  const cardIndexRaw = bytes.length > 5 ? view.getUint8(5) : 0xff;
  const cardsPerPlayerRaw = bytes.length > 6 ? view.getUint8(6) : 0;

  return {
    version,
    revision,
    actionType,
    ballNumber: ballNumberRaw === 0 ? undefined : ballNumberRaw,
    cardIndex: cardIndexRaw === 0xff ? undefined : cardIndexRaw,
    cardsPerPlayer: cardsPerPlayerRaw === 0 ? undefined : cardsPerPlayerRaw,
  };
}

// -------------------------------------------------------------
// BLE GATT 标准 UUID 常量
// -------------------------------------------------------------
export const BLE_UUIDS = {
  // PoolPoker 专用 Service UUID
  SERVICE: '0000a848-0000-1000-8000-00805f9b34fb',
  // 客户端写入指令 (WriteWithoutResponse)
  CHAR_COMMAND: '0000a849-0000-1000-8000-00805f9b34fb',
  // 房主推送状态 (Notify)
  CHAR_STATE: '0000a84a-0000-1000-8000-00805f9b34fb',
} as const;

/**
 * 将从 BLE 接收到的紧凑 BleRoomState 还原为前端 Vue 视图所需的标准 Room 对象
 */
export function bleStateToClientRoom(
  state: BleRoomState,
  selfUserId: string,
  roomCode = '8848',
  selfPlayerName = '我'
): Room {
  const pocketedBalls = maskToBalls(state.pocketedBallsMask);

  let status: 'waiting' | 'playing' | 'finished' = 'waiting';
  if (state.status === BleGameStatus.PLAYING) status = 'playing';
  else if (state.status === BleGameStatus.FINISHED) status = 'finished';

  const selfSeatIndex =
    state.selfSeatIndex !== undefined
      ? state.selfSeatIndex
      : (() => {
          const found = state.players.findIndex((p) => p.userId === selfUserId);
          return found !== -1 ? found : 0;
        })();

  const hostSeatIndex =
    state.hostSeatIndex !== undefined
      ? state.hostSeatIndex
      : (() => {
          const found = state.players.findIndex((p) => p.isHost);
          return found !== -1 ? found : 0;
        })();

  const isSelfHost = selfSeatIndex === hostSeatIndex;
  const hostPlayer = state.players[hostSeatIndex];
  const hostUserId = isSelfHost ? selfUserId : hostPlayer?.userId || (state.players[0]?.userId ?? selfUserId);

  const players = state.players.map((p, idx) => {
    const isSelf = idx === selfSeatIndex;
    const effectiveUserId = isSelf ? selfUserId : p.userId;
    const effectiveName = isSelf ? selfPlayerName : p.name || `球友_${p.userIdHash}`;
    const pIsHost = idx === hostSeatIndex;

    return {
      id: `ble_${effectiveUserId}`,
      userId: effectiveUserId,
      name: effectiveName,
      avatar: '🎱',
      isHost: pIsHost,
      online: p.online,
      cardCount: isSelf ? state.selfHandCards.length : p.cardCount,
      cards: isSelf ? state.selfHandCards.map((cIdx) => indexToCard(cIdx)) : [],
      pocketedCards: (p.pocketedCards || []).map((cIdx) => indexToCard(cIdx)),
      wins: p.isWinner ? 1 : 0,
      isWinner: p.isWinner,
      totalScore: p.totalScore,
    };
  });

  const winners = players
    .filter((p) => p.isWinner)
    .map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      avatar: '🎱',
      wins: 1,
    }));

  const lastRoundScores = state.players.map((p, idx) => ({
    userId: idx === state.selfSeatIndex ? selfUserId : p.userId,
    delta: p.roundScoreDelta ?? 0,
  }));

  return {
    code: roomCode,
    revision: state.revision,
    hostUserId,
    hostSocketId: `ble_${hostUserId}`,
    settings: {
      cardsPerPlayer: state.cardsPerPlayer ?? 5,
      includeBlackEight: true,
      maxPlayers: 8,
    },
    status,
    roundCount: state.roundCount,
    deckCount: state.deckRemaining,
    logs: state.lastActionText ? [{ id: `ble_log_${state.revision}`, time: '', text: state.lastActionText }] : [],
    winners,
    pocketedBallNumbers: pocketedBalls,
    turnOrder: players.map((p) => p.userId),
    players,
    lastRoundScores,
    lastActionText: state.lastActionText || null,
  };
}
