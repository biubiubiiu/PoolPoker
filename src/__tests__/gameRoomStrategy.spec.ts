import type { Room } from '@shared/types/game';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  BleOfflineSyncStrategy,
  type GameRoomStrategyContext,
  OnlineSyncStrategy,
  SAVED_ROOM_CODE_KEY,
  SAVED_SESSION_TOKEN_KEY,
} from '@/composables/sync';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }

  getItem(key: string) {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }

  removeItem(key: string) {
    delete this.store[key];
  }
}

const mockStorage = new LocalStorageMock();
let originalWindow: any;
let originalLocalStorage: any;

/** 构造策略 context，默认实现委托给 mockStorage，便于单测覆盖键名读写 */
const makeCtx = (overrides: Partial<GameRoomStrategyContext> = {}): GameRoomStrategyContext => ({
  userId: 'u1',
  room: ref<Room | null>(null),
  getSavedRoomCode: () => mockStorage.getItem(SAVED_ROOM_CODE_KEY),
  getSavedSessionToken: () => mockStorage.getItem(SAVED_SESSION_TOKEN_KEY),
  setFeedback: vi.fn(),
  acceptRoom: vi.fn(),
  triggerConfetti: vi.fn(),
  clearRoom: vi.fn(),
  clearSavedSession: vi.fn(),
  ...overrides,
});

/** 模拟 Tauri 原生运行时，返回还原函数 */
const withNativeRuntime = () => {
  (globalThis as any).__TAURI_INTERNALS__ = {};
  return () => {
    delete (globalThis as any).__TAURI_INTERNALS__;
  };
};

describe('GameRoomSyncStrategy', () => {
  beforeAll(() => {
    originalWindow = (globalThis as any).window;
    originalLocalStorage = (globalThis as any).localStorage;
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;
  });

  afterAll(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  beforeEach(() => {
    mockStorage.clear();
    mockInvoke.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (globalThis as any).__TAURI_INTERNALS__;
  });

  describe('OnlineSyncStrategy', () => {
    const strategy = new OnlineSyncStrategy();

    it('should block actions and call connect when socket is not connected', () => {
      const mockConnect = vi.fn();
      const mockSocket = {
        connected: false,
        connect: mockConnect,
      } as any;

      const result = strategy.canSendAction(mockSocket);
      expect(result.allowed).toBe(false);
      expect(result.feedback).toBe('正在恢复连接，请稍候...');
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('should allow actions when socket is connected', () => {
      const mockSocket = {
        connected: true,
      } as any;

      const result = strategy.canSendAction(mockSocket);
      expect(result.allowed).toBe(true);
      expect(result.feedback).toBeUndefined();
    });

    it('should set delay feedback and re-sync snapshot on action timeout', () => {
      const setFeedback = vi.fn();
      const fetchSpy = vi.spyOn(strategy, 'fetchLatestRoomState').mockResolvedValue(null);

      strategy.onActionTimeout(makeCtx({ setFeedback }));
      expect(setFeedback).toHaveBeenCalledWith('网络稍有延迟，已为您同步最新牌局');
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('should clear session and room on rejoin failure', () => {
      const clearSavedSession = vi.fn();
      const clearRoom = vi.fn();

      strategy.onRejoinFailed(makeCtx({ clearSavedSession, clearRoom }), 'Session expired');
      expect(clearSavedSession).toHaveBeenCalledOnce();
      expect(clearRoom).toHaveBeenCalledOnce();
    });

    it('should skip HTTP snapshot when no room code is persisted', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await strategy.fetchLatestRoomState(makeCtx());
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should clear room and session if HTTP snapshot returns 404', async () => {
      mockStorage.setItem(SAVED_ROOM_CODE_KEY, '1234');
      const clearSavedSession = vi.fn();
      const clearRoom = vi.fn();

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as any);

      const result = await strategy.fetchLatestRoomState(makeCtx({ clearSavedSession, clearRoom }));
      expect(result).toBeNull();
      expect(clearSavedSession).toHaveBeenCalledOnce();
      expect(clearRoom).toHaveBeenCalledOnce();
    });

    it('should discard a stale snapshot when the session changed mid-flight', async () => {
      mockStorage.setItem(SAVED_ROOM_CODE_KEY, '1234');
      mockStorage.setItem(SAVED_SESSION_TOKEN_KEY, 'token1');
      const acceptRoom = vi.fn();

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        // 请求在途期间用户换房，房间码与凭证均已变化
        mockStorage.setItem(SAVED_ROOM_CODE_KEY, '5678');
        mockStorage.setItem(SAVED_SESSION_TOKEN_KEY, 'token2');
        return {
          ok: true,
          json: async () => ({ success: true, room: { code: '1234', players: [{ userId: 'u1' }] } }),
        } as any;
      });

      const result = await strategy.fetchLatestRoomState(makeCtx({ acceptRoom }));
      expect(result).toBeNull();
      expect(acceptRoom).not.toHaveBeenCalled();
    });

    it('should accept room and trigger confetti when snapshot contains winners', async () => {
      mockStorage.setItem(SAVED_ROOM_CODE_KEY, '1234');
      mockStorage.setItem(SAVED_SESSION_TOKEN_KEY, 'token1');
      const room = ref<Room | null>({ code: '1234', winners: [] } as any);
      const acceptRoom = vi.fn();
      const triggerConfetti = vi.fn();

      const serverRoom: Room = {
        code: '1234',
        status: 'finished',
        winners: ['u1'],
        players: [{ userId: 'u1', name: 'Alice', cards: [], pocketedCards: [] }],
        pocketedBallNumbers: [],
      } as any;

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, room: serverRoom }),
      } as any);

      const result = await strategy.fetchLatestRoomState(makeCtx({ room, acceptRoom, triggerConfetti }));
      expect(result).toEqual(serverRoom);
      expect(acceptRoom).toHaveBeenCalledWith(serverRoom);
      expect(triggerConfetti).toHaveBeenCalledOnce();
    });

    it('should push room credentials to the watch when joining a room', async () => {
      const restore = withNativeRuntime();
      mockStorage.setItem(SAVED_SESSION_TOKEN_KEY, 'token1');

      await strategy.syncNativeSession(makeCtx({ serverUrl: 'http://10.0.0.2:3000' }), '1234');

      expect(mockInvoke).toHaveBeenCalledOnce();
      const payload = JSON.parse(mockInvoke.mock.calls[0][1].payload);
      expect(payload).toMatchObject({
        event: 'room_credentials',
        roomCode: '1234',
        userId: 'u1',
        myUserId: 'u1',
        sessionToken: 'token1',
        serverUrl: 'http://10.0.0.2:3000',
      });
      restore();
    });

    it('should push a leave event to the watch when the room code becomes null', async () => {
      const restore = withNativeRuntime();

      await strategy.syncNativeSession(makeCtx(), null);

      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(JSON.parse(mockInvoke.mock.calls[0][1].payload)).toEqual({ event: 'leave_room' });
      restore();
    });

    it('should skip native sync entirely outside the Tauri runtime', async () => {
      await strategy.syncNativeSession(makeCtx(), '1234');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('should emit leave_room without callback', async () => {
      const mockEmit = vi.fn();
      const mockSocket = { emit: mockEmit } as any;

      await strategy.leaveRoom(mockSocket, '1234');
      expect(mockEmit).toHaveBeenCalledWith('leave_room', { roomCode: '1234' });
    });
  });

  describe('BleOfflineSyncStrategy', () => {
    const strategy = new BleOfflineSyncStrategy();
    const OFFLINE_FEEDBACK = '房主锁屏离线中，已开启离线记牌（随时打出，碰面自动对齐）';

    it('should always allow actions even when disconnected', () => {
      const result = strategy.canSendAction(null);
      expect(result.allowed).toBe(true);
    });

    it('should not touch feedback or network on action timeout', () => {
      const setFeedback = vi.fn();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      strategy.onActionTimeout(makeCtx({ setFeedback }));
      expect(setFeedback).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should never make HTTP snapshot requests and return null', async () => {
      mockStorage.setItem(SAVED_ROOM_CODE_KEY, '1234');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await strategy.fetchLatestRoomState(makeCtx());
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should preserve local room and update feedback on rejoin failure', () => {
      const setFeedback = vi.fn();
      const clearSavedSession = vi.fn();
      const clearRoom = vi.fn();

      strategy.onRejoinFailed(makeCtx({ setFeedback, clearSavedSession, clearRoom }), 'GATT not reachable');
      expect(clearRoom).not.toHaveBeenCalled();
      expect(clearSavedSession).not.toHaveBeenCalled();
      expect(setFeedback).toHaveBeenCalledWith(OFFLINE_FEEDBACK);
    });

    it('should clear room and session on rejoin failure when game has finished or room disbanded', () => {
      const setFeedback = vi.fn();
      const clearSavedSession = vi.fn();
      const clearRoom = vi.fn();

      strategy.onRejoinFailed(makeCtx({ setFeedback, clearSavedSession, clearRoom }), '上局对战已完结');
      expect(clearRoom).toHaveBeenCalledOnce();
      expect(clearSavedSession).toHaveBeenCalledOnce();
      expect(setFeedback).not.toHaveBeenCalled();
    });

    it('should return offline feedback on disconnect', () => {
      expect(strategy.getDisconnectFeedback()).toBe(OFFLINE_FEEDBACK);
    });

    it('should never push room credentials to the watch in BLE mode', async () => {
      const restore = withNativeRuntime();

      await strategy.syncNativeSession(makeCtx(), '1234');
      expect(mockInvoke).not.toHaveBeenCalled();
      restore();
    });

    it('should still push a leave event to the watch when exiting a room', async () => {
      const restore = withNativeRuntime();

      await strategy.syncNativeSession(makeCtx(), null);
      expect(mockInvoke).toHaveBeenCalledOnce();
      expect(JSON.parse(mockInvoke.mock.calls[0][1].payload)).toEqual({ event: 'leave_room' });
      restore();
    });

    it('should emit leave_room with callback in BLE mode', async () => {
      const mockEmit = vi.fn();
      const mockSocket = { emit: mockEmit } as any;

      await strategy.leaveRoom(mockSocket, '1234');
      expect(mockEmit).toHaveBeenCalledWith('leave_room', { roomCode: '1234' }, expect.any(Function));
    });
  });
});
