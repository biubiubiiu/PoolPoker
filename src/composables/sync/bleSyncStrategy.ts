import { CLIENT_TO_SERVER_EVENTS } from '@shared/types/protocol';
import type { SocketCallbackResponse } from '@shared/types/socket';
import type { Socket } from 'socket.io-client';
import { showAlert } from '@/utils/dialog';
import type { GameRoomStrategyContext, GameRoomSyncStrategy, StrategyActionCheck } from './types';

const OFFLINE_FEEDBACK = '房主锁屏离线中，已开启离线记牌（随时打出，碰面自动对齐）';

export class BleOfflineSyncStrategy implements GameRoomSyncStrategy {
  readonly name = 'ble' as const;

  canSendAction(_socket: Socket | null): StrategyActionCheck {
    // 离线面对面模式支持在断开/锁屏状态下乐观记牌，碰面后自动对齐
    return { allowed: true };
  }

  onActionTimeout(_ctx: GameRoomStrategyContext): void {
    // 离线模式下不发起远端 HTTP 同步
  }

  async fetchLatestRoomState(_ctx: GameRoomStrategyContext) {
    // 离线蓝牙面对面模式下，房间状态完全由本地/蓝牙维护，严禁请求远端 HTTP 快照（防止 404 误删本地房间）
    return null;
  }

  onRejoinFailed(ctx: GameRoomStrategyContext, message?: string): void {
    console.warn('[BLE Rejoin Notice]', message);
    if (message?.includes('完结') || message?.includes('已解散') || message?.includes('不存在')) {
      ctx.clearSavedSession();
      ctx.clearRoom();
      return;
    }
    ctx.setFeedback(OFFLINE_FEEDBACK);
  }

  getDisconnectFeedback(): string {
    return OFFLINE_FEEDBACK;
  }

  async syncNativeSession(_ctx: GameRoomStrategyContext, roomCode: string | null): Promise<void> {
    // 离线蓝牙面对面模式下无远端 HTTP/Socket.IO 房间会话，不向手表下发在线房间凭证
    if (roomCode) return;
    if (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const payload = JSON.stringify({ event: CLIENT_TO_SERVER_EVENTS.leaveRoom });
        await invoke('sync_wear_state', { payload });
      } catch (err) {
        console.warn('[NativeSync] Failed to sync leave event:', err);
      }
    }
  }

  async leaveRoom(socket: Socket | null, roomCode: string): Promise<void> {
    const payload = { roomCode };
    if (socket) {
      socket.emit(CLIENT_TO_SERVER_EVENTS.leaveRoom, payload, (res: SocketCallbackResponse) => {
        if (!res?.success) {
          showAlert(res?.message || '退房未获房主确认，请让房主检查席位');
        }
      });
    }
  }
}
