import type { Player, Room } from '@shared/types/game';
import { CLIENT_TO_SERVER_EVENTS } from '@shared/types/protocol';
import type { Socket } from 'socket.io-client';
import { isTauriEnvironment } from '@/composables/useUiPreferences';
import type { GameRoomStrategyContext, GameRoomSyncStrategy, StrategyActionCheck } from './types';

const isNativeRuntime = () =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

/** 懒取当前站点源；非浏览器宿主（如单测 node 环境）下 window.location 可能不存在 */
const getOriginUrl = () => (typeof window !== 'undefined' ? (window.location?.origin ?? '') : '');

const smartFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (isNativeRuntime()) {
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      return await tauriFetch(input, init);
    } catch (err) {
      console.warn('[smartFetch] @tauri-apps/plugin-http fetch failed, falling back to browser fetch:', err);
    }
  }
  return await fetch(input, init);
};

const getApiUrl = (serverUrl: string | undefined, endpointPath: string) => {
  const base = serverUrl ? serverUrl.trim().replace(/\/+$/, '') : '';
  return `${base}${endpointPath}`;
};

export class OnlineSyncStrategy implements GameRoomSyncStrategy {
  readonly name = 'online' as const;

  canSendAction(socket: Socket | null): StrategyActionCheck {
    if (!socket?.connected) {
      socket?.connect();
      return {
        allowed: false,
        feedback: '正在恢复连接，请稍候...',
      };
    }
    return { allowed: true };
  }

  onActionTimeout(ctx: GameRoomStrategyContext): void {
    ctx.setFeedback('网络稍有延迟，已为您同步最新牌局');
    void this.fetchLatestRoomState(ctx);
  }

  async fetchLatestRoomState(ctx: GameRoomStrategyContext): Promise<Room | null> {
    const savedRoomCode = ctx.getSavedRoomCode();
    if (!savedRoomCode) return null;
    const savedToken = ctx.getSavedSessionToken();

    try {
      const tokenQuery = savedToken ? `&sessionToken=${encodeURIComponent(savedToken)}` : '';
      const endpoint = getApiUrl(
        ctx.serverUrl,
        `/api/rooms/${savedRoomCode}?userId=${encodeURIComponent(ctx.userId)}${tokenQuery}`
      );
      const res = await smartFetch(endpoint, {
        headers: savedToken ? { 'x-session-token': savedToken } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        // 请求期间用户已退房或切换房间，丢弃这次过期响应
        if (ctx.getSavedRoomCode() !== savedRoomCode || ctx.getSavedSessionToken() !== savedToken) {
          return null;
        }

        if (data.success && data.room?.players.some((p: Player) => p.userId === ctx.userId)) {
          console.log('[HTTP] 极速同步房间状态成功');
          const prevWinnersCount = ctx.room.value?.winners?.length ?? 0;
          ctx.acceptRoom(data.room);
          if (prevWinnersCount === 0 && data.room.winners && data.room.winners.length > 0) {
            ctx.triggerConfetti();
          }
          return data.room;
        }
      } else if (res.status === 401) {
        console.warn('[HTTP Sync] 凭证校验未通过');
      } else if (res.status === 404) {
        console.warn('[HTTP Sync] 房间不存在或已解散');
        ctx.clearSavedSession();
        ctx.clearRoom();
      }
    } catch (err) {
      console.error('[HTTP Sync Error]', err);
    }
    return null;
  }

  onRejoinFailed(ctx: GameRoomStrategyContext, message?: string): void {
    console.warn('[Rejoin Failed]', message);
    ctx.clearSavedSession();
    ctx.clearRoom();
  }

  getDisconnectFeedback(): string {
    return '连接已断开，正在尝试自动重连...';
  }

  async syncNativeSession(ctx: GameRoomStrategyContext, roomCode: string | null): Promise<void> {
    if (!isNativeRuntime()) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const payload = roomCode
        ? JSON.stringify({
            event: 'room_credentials',
            sessionToken: ctx.getSavedSessionToken(),
            roomCode,
            userId: ctx.userId,
            myUserId: ctx.userId,
            serverUrl: ctx.serverUrl || (isTauriEnvironment() ? '' : getOriginUrl()),
          })
        : JSON.stringify({ event: CLIENT_TO_SERVER_EVENTS.leaveRoom });
      await invoke('sync_wear_state', { payload });
    } catch (err) {
      console.warn('[NativeSync] Failed to sync room session:', err);
    }
  }

  async leaveRoom(socket: Socket | null, roomCode: string): Promise<void> {
    socket?.emit(CLIENT_TO_SERVER_EVENTS.leaveRoom, { roomCode });
  }
}
