/**
 * BLE Compact Binary Wire Protocol Types & Enums for PoolPoker (球霸扑克)
 *
 * Defines protocol version, message types, action types, player flags,
 * event codes, GATT UUIDs, and wire payload interfaces.
 * Binary encoding, decoding, and chunking logic reside in @shared/utils/bleCodec.
 */

export const BLE_PROTOCOL_VERSION = 0x01;
export const BLE_CHUNK_SIZE = 140;
export const BLE_CHUNK_HEADER_SIZE = 5;

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

export enum BleMessageType {
  CLIENT_JOIN = 0x01,
  CLIENT_ACTION = 0x02,
  CLIENT_COMMAND_CHUNK = 0x03,
  HOST_STATE_SYNC = 0x10,
  HOST_EVENT_NOTIFY = 0x11,
  HOST_STATE_CHUNK = 0x12,
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
  LEAVE_ROOM = 0x0c,
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

export enum BleHostEventCode {
  KICKED = 0x01,
  JOIN_REJECTED_PLAYING = 0x02,
  JOIN_REJECTED_FULL = 0x03,
  LEAVE_ACK = 0x04,
}

export interface BleHostEvent {
  version: number;
  code: BleHostEventCode;
  roomCode?: number;
}

export interface BleFrameHeader {
  version: number; // 协议版本号 (目前 0x01)
  msgType: BleMessageType;
  revision: number; // 房间修订版本号 / 请求序列号
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
  wins?: number; // 累计胜场数
  totalScore: number;
  pocketedCards?: number[]; // 0..53 编码的已落袋卡牌
  revealedCards?: number[]; // 0..53 编码的局末结算亮牌手牌 (仅 FINISHED 状态携带)
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
  turnOrderSeats?: number[]; // 按击球顺序排列的席位下标 (0..7)
  sceneEventKind?: string; // 最近一步场景动画事件类型
  sceneEventTargetSeat?: number; // 最近一步场景动画关联席位下标
  sceneEventBallNumber?: number; // 最近一步场景动画关联球号
  players: BlePlayerSummary[];
  lastActionText?: string; // 最近一步操作日志描述 (用于撤回展示与判定)
}

export interface BleClientAction {
  version: number;
  revision: number;
  actionType: BleActionType;
  ballNumber?: number;
  cardIndex?: number;
  cardId?: string;
  targetUserId?: string;
  targetSeatIndex?: number;
  cardsPerPlayer?: number;
}

export interface BleClientJoin {
  version: number;
  revision?: number;
  roomCode?: number; // 4位数字 (1000..9999)
  userId: string;
  name: string;
}
