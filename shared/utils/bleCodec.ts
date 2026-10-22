/**
 * BLE Compact Binary Wire Protocol Codec & Translation Utilities
 *
 * Implements binary encoding, decoding, MTU chunking, reassembly,
 * card indexing, ball bitmask operations, and state translation.
 */

import {
  BLE_CHUNK_HEADER_SIZE,
  BLE_CHUNK_SIZE,
  BLE_PROTOCOL_VERSION,
  type BleActionType,
  type BleClientAction,
  type BleClientJoin,
  BleGameStatus,
  type BleHostEvent,
  type BleHostEventCode,
  BleMessageType,
  BlePlayerFlag,
  type BlePlayerSummary,
  type BleRoomState,
} from '../types/bleProtocol';
import type { Card, Room } from '../types/game';

const SCENE_EVENT_KINDS = [
  '',
  'start_game',
  'pocket_ball',
  'draw_penalty',
  'accidental_pocket',
  'break_pocket',
  'retract_ball',
  'referee_pocket_ball',
  'referee_draw_penalty',
  'restart_game',
  'update_settings',
  'kick_player',
  'request_restart',
] as const;

const BLE_TAIL_EXTENSION_MAGIC = 0xa5;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function utf8Encode(str: string): Uint8Array {
  return textEncoder.encode(str);
}

export function utf8Decode(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/**
 * 按 UTF-8 字节上限安全截断字符串并编码，避免截断多字节字符或超出单字节长度字段 (<= 255)
 */
export function truncateUtf8Bytes(str: string, maxBytes: number): Uint8Array {
  const full = utf8Encode(str);
  if (full.length <= maxBytes) return full;
  let end = maxBytes;
  while (end > 0 && (full[end] & 0xc0) === 0x80) {
    end--;
  }
  return full.subarray(0, end);
}

// -------------------------------------------------------------
// 卡牌 0..53 紧凑映射工具 (Card <-> CardIndex)
// 与 server/pokerDeck.ts 的 create54PokerDeck() 严格对齐：
// 0..12:   ♠ A..K (ball 1..13, id c_1..c_13)
// 13..25:  ♥ A..K (ball 1..13, id c_14..c_26)
// 26..38:  ♣ A..K (ball 1..13, id c_27..c_39)
// 39..51:  ♦ A..K (ball 1..13, id c_40..c_52)
// 52:      小王 (ball 14, id c_53)
// 53:      大王 (ball 15, id c_54)
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

export function indexToCard(index: number, idPrefix = 'c'): Card {
  const cardId = idPrefix === 'c' ? `c_${index + 1}` : `${idPrefix}_${index}`;
  if (index === 52) {
    return {
      id: cardId,
      suit: '🃏',
      suitType: 'joker-small',
      color: 'gray',
      rank: '小王',
      ballNumber: 14,
    };
  }
  if (index === 53) {
    return {
      id: cardId,
      suit: '👑',
      suitType: 'joker-big',
      color: 'gold',
      rank: '大王',
      ballNumber: 15,
    };
  }
  const suitIdx = Math.floor(index / 13) % 4;
  const rankIdx = index % 13;
  const suitType = SUIT_ORDER[suitIdx];
  const rank = RANK_ORDER[rankIdx];
  return {
    id: cardId,
    suit: SUIT_SYMBOLS[suitType],
    suitType,
    color: suitType === 'heart' || suitType === 'diamond' ? 'red' : 'black',
    rank,
    ballNumber: rankIdx + 1,
  };
}

function mapCardIndicesToCards(indices: number[], basePrefix = 'c'): Card[] {
  const counts = new Map<number, number>();
  return indices.map((cIdx) => {
    const seen = counts.get(cIdx) || 0;
    counts.set(cIdx, seen + 1);
    const prefix = seen === 0 ? basePrefix : `${basePrefix}_dup${seen}`;
    return indexToCard(cIdx, prefix);
  });
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
  const headerSize = 4; // version, msgType, revisionLow, cardsPerPlayer
  const fixedStateSize = 7; // status (1), pocketedMask (2), roundCount (1), deckRemaining (1), selfSeat (1), hostSeat (1)
  const selfCardsSize = 1 + state.selfHandCards.length; // length (1) + cards (N)

  let dynamicSize = 1; // playerCount (1)
  for (const p of state.players) {
    // userIdHash (1), cardCount (1), flags+wins (1), totalScore (2), roundScoreDelta (2), pocketedCount (1) + pocketedCards (M)
    dynamicSize += 8 + (p.pocketedCards?.length || 0);
  }

  const actionTextBytes = state.lastActionText ? truncateUtf8Bytes(state.lastActionText, 180) : new Uint8Array(0);
  dynamicSize += 1 + actionTextBytes.length; // actionTextLen (1) + textBytes

  // 检查是否需要附加尾部扩展块 (16-bit revision 高位、玩家昵称、局末亮牌、击球顺序、3D 动画事件)
  const hasRevisionHigh = (state.revision & 0xff00) !== 0;
  const hasTurnOrder = !!(state.turnOrderSeats && state.turnOrderSeats.length > 0);
  const sceneEventKindIdx = state.sceneEventKind
    ? Math.max(0, SCENE_EVENT_KINDS.indexOf(state.sceneEventKind as any))
    : 0;
  const hasPlayerMeta = state.players.some(
    (p) =>
      (p.name && p.name !== `球友_${p.userIdHash}`) ||
      (state.status === BleGameStatus.FINISHED && p.revealedCards && p.revealedCards.length > 0)
  );
  const includeTail = hasRevisionHigh || hasTurnOrder || sceneEventKindIdx > 0 || hasPlayerMeta;

  const encodedPlayerNames: Uint8Array[] = [];
  if (includeTail) {
    // magic (1) + revisionHigh (1) + turnOrderLen (1) + turnOrder (T) + sceneEventKind (1) + [targetSeat (1) + ballNum (1)]
    dynamicSize += 3 + (state.turnOrderSeats?.length || 0) + (sceneEventKindIdx > 0 ? 3 : 1);
    for (const p of state.players) {
      const nameStr = p.name && p.name !== `球友_${p.userIdHash}` ? p.name.slice(0, 16) : '';
      const nameBytes = nameStr ? truncateUtf8Bytes(nameStr, 48) : new Uint8Array(0);
      encodedPlayerNames.push(nameBytes);

      dynamicSize += 1 + nameBytes.length;
      if (state.status === BleGameStatus.FINISHED) {
        dynamicSize += 1 + (p.revealedCards?.length || 0);
      }
    }
  }

  const totalSize = headerSize + fixedStateSize + selfCardsSize + dynamicSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // 1. Header (版本号 + 状态同步指令 + 修订号低8位 + cardsPerPlayer)
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
    const winsClamped = Math.min(31, Math.max(0, p.wins ?? (p.isWinner ? 1 : 0)));
    flags |= (winsClamped & 0x1f) << 3;
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

  // 6. Optional Tail Extension Block
  if (includeTail) {
    view.setUint8(offset++, BLE_TAIL_EXTENSION_MAGIC);
    view.setUint8(offset++, (state.revision >> 8) & 0xff);

    const turnSeats = state.turnOrderSeats || [];
    view.setUint8(offset++, turnSeats.length);
    for (const seat of turnSeats) {
      view.setUint8(offset++, seat & 0xff);
    }

    view.setUint8(offset++, sceneEventKindIdx & 0xff);
    if (sceneEventKindIdx > 0) {
      view.setUint8(offset++, (state.sceneEventTargetSeat ?? 0xff) & 0xff);
      view.setUint8(offset++, (state.sceneEventBallNumber ?? 0) & 0xff);
    }

    for (let i = 0; i < state.players.length; i++) {
      const nameBytes = encodedPlayerNames[i];
      view.setUint8(offset++, nameBytes.length);
      if (nameBytes.length > 0) {
        bytes.set(nameBytes, offset);
        offset += nameBytes.length;
      }

      if (state.status === BleGameStatus.FINISHED) {
        const revealed = state.players[i].revealedCards || [];
        view.setUint8(offset++, revealed.length);
        for (const rc of revealed) {
          view.setUint8(offset++, rc & 0x3f);
        }
      }
    }
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
  let revision = view.getUint8(2);
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
  const usedHashes = new Set<number>();
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

    const isWinner = (flags & BlePlayerFlag.IS_WINNER) !== 0;
    const winsRaw = (flags >> 3) & 0x1f;
    const wins = winsRaw > 0 ? winsRaw : isWinner ? 1 : 0;

    // 防止不同席位 8-bit 哈希碰撞导致 userId 重复
    const fallbackUserId = usedHashes.has(userIdHash) ? `user_${userIdHash}_${i}` : `user_${userIdHash}`;
    usedHashes.add(userIdHash);

    players.push({
      userIdHash,
      userId: fallbackUserId,
      name: `球友_${userIdHash}`,
      cardCount,
      isHost: (flags & BlePlayerFlag.IS_HOST) !== 0,
      online: (flags & BlePlayerFlag.ONLINE) !== 0,
      isWinner,
      wins,
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

  let turnOrderSeats: number[] | undefined;
  let sceneEventKind: string | undefined;
  let sceneEventTargetSeat: number | undefined;
  let sceneEventBallNumber: number | undefined;

  if (offset < bytes.length && view.getUint8(offset) === BLE_TAIL_EXTENSION_MAGIC) {
    offset++;
    if (offset < bytes.length) {
      const revisionHigh = view.getUint8(offset++);
      revision = revision | (revisionHigh << 8);
    }
    if (offset < bytes.length) {
      const turnLen = view.getUint8(offset++);
      turnOrderSeats = [];
      for (let i = 0; i < turnLen && offset < bytes.length; i++) {
        turnOrderSeats.push(view.getUint8(offset++));
      }
    }
    if (offset < bytes.length) {
      const kindIdx = view.getUint8(offset++);
      if (kindIdx > 0 && kindIdx < SCENE_EVENT_KINDS.length) {
        sceneEventKind = SCENE_EVENT_KINDS[kindIdx];
        if (offset < bytes.length) {
          const targetSeatRaw = view.getUint8(offset++);
          sceneEventTargetSeat = targetSeatRaw === 0xff ? undefined : targetSeatRaw;
        }
        if (offset < bytes.length) {
          const ballRaw = view.getUint8(offset++);
          sceneEventBallNumber = ballRaw === 0 ? undefined : ballRaw;
        }
      }
    }
    for (let i = 0; i < players.length && offset < bytes.length; i++) {
      const nameLen = view.getUint8(offset++);
      if (nameLen > 0 && offset + nameLen <= bytes.length) {
        players[i].name = utf8Decode(bytes.subarray(offset, offset + nameLen));
        offset += nameLen;
      }
      if (status === BleGameStatus.FINISHED && offset < bytes.length) {
        const revLen = view.getUint8(offset++);
        const revealedCards: number[] = [];
        for (let j = 0; j < revLen && offset < bytes.length; j++) {
          revealedCards.push(view.getUint8(offset++));
        }
        players[i].revealedCards = revealedCards;
      }
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
    turnOrderSeats,
    sceneEventKind,
    sceneEventTargetSeat,
    sceneEventBallNumber,
    players,
    lastActionText,
  };
}

/**
 * 编码 CLIENT_JOIN 上行入房握手帧
 */
export function encodeBleJoin(join: BleClientJoin): Uint8Array {
  const userIdBytes = utf8Encode(join.userId.slice(0, 48));
  const nameBytes = utf8Encode((join.name || '球友').slice(0, 16));

  const totalSize = 6 + 1 + userIdBytes.length + 1 + nameBytes.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint8(0, join.version ?? BLE_PROTOCOL_VERSION);
  view.setUint8(1, BleMessageType.CLIENT_JOIN);
  view.setUint16(2, (join.revision ?? 0) & 0xffff, true);
  view.setUint16(4, (join.roomCode ?? 0) & 0xffff, true);

  let offset = 6;
  view.setUint8(offset++, userIdBytes.length);
  bytes.set(userIdBytes, offset);
  offset += userIdBytes.length;

  view.setUint8(offset++, nameBytes.length);
  bytes.set(nameBytes, offset);
  offset += nameBytes.length;

  return bytes;
}

/**
 * 解码 CLIENT_JOIN 上行入房握手帧
 */
export function decodeBleJoin(bytes: Uint8Array): BleClientJoin {
  if (bytes.length < 8) {
    throw new Error(`BLE packet too small for CLIENT_JOIN: ${bytes.length} bytes`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  const msgType = view.getUint8(1);
  if (msgType !== BleMessageType.CLIENT_JOIN) {
    throw new Error(`Unexpected message type for CLIENT_JOIN: 0x${msgType.toString(16)}`);
  }
  const revision = view.getUint16(2, true);
  const roomCode = view.getUint16(4, true);

  let offset = 6;
  const userIdLen = view.getUint8(offset++);
  const userId = utf8Decode(bytes.subarray(offset, offset + userIdLen));
  offset += userIdLen;

  const nameLen = offset < bytes.length ? view.getUint8(offset++) : 0;
  const name = nameLen > 0 ? utf8Decode(bytes.subarray(offset, offset + nameLen)) : '球友';

  return {
    version,
    revision,
    roomCode,
    userId,
    name,
  };
}

/**
 * 编码 HOST_EVENT_NOTIFY 下行控制帧 (如踢人、拒绝加入)
 */
export function encodeBleHostEvent(event: BleHostEvent): Uint8Array {
  const buffer = new ArrayBuffer(5);
  const view = new DataView(buffer);
  view.setUint8(0, event.version ?? BLE_PROTOCOL_VERSION);
  view.setUint8(1, BleMessageType.HOST_EVENT_NOTIFY);
  view.setUint8(2, event.code);
  view.setUint16(3, (event.roomCode ?? 0) & 0xffff, true);
  return new Uint8Array(buffer);
}

/**
 * 解码 HOST_EVENT_NOTIFY 下行控制帧
 */
export function decodeBleHostEvent(bytes: Uint8Array): BleHostEvent {
  if (bytes.length < 5) {
    throw new Error(`BLE packet too small for HOST_EVENT_NOTIFY: ${bytes.length} bytes`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  const msgType = view.getUint8(1);
  if (msgType !== BleMessageType.HOST_EVENT_NOTIFY) {
    throw new Error(`Unexpected message type for HOST_EVENT_NOTIFY: 0x${msgType.toString(16)}`);
  }
  const code = view.getUint8(2) as BleHostEventCode;
  const roomCode = view.getUint16(3, true);
  return { version, code, roomCode };
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
  view.setUint8(7, action.targetSeatIndex !== undefined ? action.targetSeatIndex : 0xff);

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
  const targetSeatIndexRaw = bytes.length > 7 ? view.getUint8(7) : 0xff;

  return {
    version,
    revision,
    actionType,
    ballNumber: ballNumberRaw === 0 ? undefined : ballNumberRaw,
    cardIndex: cardIndexRaw === 0xff ? undefined : cardIndexRaw,
    cardsPerPlayer: cardsPerPlayerRaw === 0 ? undefined : cardsPerPlayerRaw,
    targetSeatIndex: targetSeatIndexRaw === 0xff ? undefined : targetSeatIndexRaw,
  };
}

// -------------------------------------------------------------
// BLE 下行分包与重组 (Chunking & Reassembly)
// 保证单包在 BLE ATT MTU / maximumUpdateValueLength 内安全传输
// -------------------------------------------------------------

/**
 * 将可能超过 BLE ATT MTU / maximumUpdateValueLength 的原始帧拆解为带序号的小分包。
 * 严格依据连接允许的单包上限（计入 5 字节分包头）切片，确保每包都不超过限制。
 *
 * @param payload 原始二进制数据
 * @param transferId 传输批次序号 (0..255)
 * @param maxPacketLimit 针对该连接允许的单包上限（含 5 字节协议头，默认 145 字节）
 */
export function splitIntoBleChunks(
  payload: Uint8Array,
  transferId: number,
  maxPacketLimit = BLE_CHUNK_SIZE + BLE_CHUNK_HEADER_SIZE,
  messageType = BleMessageType.HOST_STATE_CHUNK
): Uint8Array[] {
  if (payload.length <= maxPacketLimit) {
    return [payload];
  }

  const sliceSize = Math.max(1, maxPacketLimit - BLE_CHUNK_HEADER_SIZE);
  const totalChunks = Math.ceil(payload.length / sliceSize);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * sliceSize;
    const end = Math.min(start + sliceSize, payload.length);
    const slice = payload.subarray(start, end);

    // 分包头部:
    // [0]: version (1B)
    // [1]: msgType = HOST_STATE_CHUNK (1B)
    // [2]: transferId (1B, 0..255)
    // [3]: chunkIndex (1B, 0..totalChunks-1)
    // [4]: totalChunks (1B, 2..255)
    // [5..]: 负载切片
    const chunk = new Uint8Array(BLE_CHUNK_HEADER_SIZE + slice.length);
    chunk[0] = BLE_PROTOCOL_VERSION;
    chunk[1] = messageType;
    chunk[2] = transferId & 0xff;
    chunk[3] = i & 0xff;
    chunk[4] = totalChunks & 0xff;
    chunk.set(slice, BLE_CHUNK_HEADER_SIZE);
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * BLE 状态帧分包接收与重组器
 */
export class BleChunkReassembler {
  private currentTransferId = -1;
  private totalChunks = 0;
  private chunks = new Map<number, Uint8Array>();

  /**
   * 处理接收到的 BLE 原始字节包：
   * - 如果为非分包帧（如单帧 HOST_STATE_SYNC 或 HOST_EVENT_NOTIFY），直接原样返回
   * - 如果为 HOST_STATE_CHUNK，收集该分包。未收齐时返回 null，收齐后返回拼合后的原始字节流
   */
  public processPacket(raw: Uint8Array): Uint8Array | null {
    if (raw.length < 2) return null;
    const msgType = raw[1];

    if (msgType !== BleMessageType.HOST_STATE_CHUNK && msgType !== BleMessageType.CLIENT_COMMAND_CHUNK) {
      // 独立完整包，直接返回
      return raw;
    }

    if (raw.length < 5) return null;
    const transferId = raw[2];
    const chunkIndex = raw[3];
    const totalChunks = raw[4];
    const chunkData = raw.subarray(5);

    // 收到新的传输批次，废弃之前未收全的旧分包
    if (transferId !== this.currentTransferId) {
      this.currentTransferId = transferId;
      this.totalChunks = totalChunks;
      this.chunks.clear();
    }

    this.chunks.set(chunkIndex, chunkData);

    if (this.chunks.size === this.totalChunks) {
      let totalLength = 0;
      for (let i = 0; i < this.totalChunks; i++) {
        const piece = this.chunks.get(i);
        if (!piece) return null;
        totalLength += piece.length;
      }

      const full = new Uint8Array(totalLength);
      let offset = 0;
      for (let i = 0; i < this.totalChunks; i++) {
        const piece = this.chunks.get(i);
        if (!piece) {
          return null;
        }
        full.set(piece, offset);
        offset += piece.length;
      }

      this.chunks.clear();
      this.currentTransferId = -1;
      return full;
    }

    return null;
  }

  public reset(): void {
    this.currentTransferId = -1;
    this.totalChunks = 0;
    this.chunks.clear();
  }
}

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
    const effectiveName =
      p.name && p.name !== `球友_${p.userIdHash}` ? p.name : isSelf ? selfPlayerName : p.name || `球友_${p.userIdHash}`;
    const pIsHost = idx === hostSeatIndex;
    const handCards = isSelf
      ? mapCardIndicesToCards(state.selfHandCards)
      : state.status === BleGameStatus.FINISHED && p.revealedCards
        ? mapCardIndicesToCards(p.revealedCards)
        : [];

    return {
      id: `ble_${effectiveUserId}`,
      userId: effectiveUserId,
      name: effectiveName,
      isHost: pIsHost,
      online: p.online,
      cardCount: isSelf ? state.selfHandCards.length : p.cardCount,
      cards: handCards,
      pocketedCards: mapCardIndicesToCards(p.pocketedCards || []),
      wins: p.wins !== undefined ? p.wins : p.isWinner ? 1 : 0,
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
      wins: p.wins,
    }));

  const lastRoundScores = state.players.map((p, idx) => ({
    userId: idx === selfSeatIndex ? selfUserId : p.userId,
    delta: p.roundScoreDelta ?? 0,
  }));

  const turnOrder =
    state.turnOrderSeats && state.turnOrderSeats.length > 0
      ? state.turnOrderSeats.map((seatIdx) => players[seatIdx]?.userId).filter((uid): uid is string => !!uid)
      : players.map((p) => p.userId);

  const sceneEvent = state.sceneEventKind
    ? {
        id: `ble_evt_${state.roundCount}_${state.revision}_${state.sceneEventKind}`,
        kind: state.sceneEventKind,
        revision: state.revision,
        targetUserId:
          state.sceneEventTargetSeat !== undefined && players[state.sceneEventTargetSeat]
            ? players[state.sceneEventTargetSeat].userId
            : undefined,
        ballNumber: state.sceneEventBallNumber,
      }
    : undefined;

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
    turnOrder,
    players,
    lastRoundScores,
    lastActionText: state.lastActionText || null,
    sceneEvent,
  };
}
