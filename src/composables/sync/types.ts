import type { Room } from '@shared/types/game';
import type { Ref } from 'vue';
import type { GameTransport } from '@/types/transport';

/** 房间码在 localStorage 中的持久化键名（唯一定义处） */
export const SAVED_ROOM_CODE_KEY = 'billiards_room_code';
/** 会话凭证在 localStorage 中的持久化键名（唯一定义处） */
export const SAVED_SESSION_TOKEN_KEY = 'billiards_session_token';

export interface StrategyActionCheck {
  allowed: boolean;
  feedback?: string;
}

export interface GameRoomStrategyContext {
  userId: string;
  serverUrl?: string;
  /** 只读当前房间快照；策略不得直接写入，变更一律走 acceptRoom / clearRoom */
  readonly room: Readonly<Ref<Room | null>>;
  getSavedRoomCode: () => string | null;
  getSavedSessionToken: () => string | null;
  setFeedback: (msg: string) => void;
  acceptRoom: (room: Room, live?: boolean) => void;
  triggerConfetti: () => void;
  /** 清空内存中的房间状态 */
  clearRoom: () => void;
  /** 清除 localStorage 中的房间码与会话凭证 */
  clearSavedSession: () => void;
}

export interface GameRoomSyncStrategy {
  /** 策略名称标识 */
  readonly name: 'online' | 'ble';

  /** 发起出牌动作前的可用性校验与网络连接恢复提示 */
  canSendAction(transport: GameTransport | null): StrategyActionCheck;

  /** 发起操作超时（如 2000ms）时的补救处理 */
  onActionTimeout(ctx: GameRoomStrategyContext): void;

  /** 前台切回 / 网络恢复 / 初始化时的快照极速同步 */
  fetchLatestRoomState(ctx: GameRoomStrategyContext): Promise<Room | null>;

  /** 重新进入房间 (rejoinRoom) 失败时的容灾处理 */
  onRejoinFailed(ctx: GameRoomStrategyContext, message?: string): void;

  /** 物理连接断开时的用户提示文案 */
  getDisconnectFeedback(): string;

  /** 原生智能手表 (Apple Watch / Wear OS) 房间凭证同步；roomCode 为 null 表示下发退房事件 */
  syncNativeSession(ctx: GameRoomStrategyContext, roomCode: string | null): Promise<void>;

  /** 主动退出房间的发送契约 */
  leaveRoom(transport: GameTransport | null, roomCode: string): Promise<void>;
}
