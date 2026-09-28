import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useNearbyRooms } from '@/composables/useNearbyRooms';
import type { RoomDiscoveryProvider } from '@/discovery/provider';

class LocalStorageMock {
  store: Record<string, string> = {};
  getItem(k: string) {
    return this.store[k] ?? null;
  }
  setItem(k: string, v: string) {
    this.store[k] = String(v);
  }
  clear() {
    this.store = {};
  }
}

describe('useNearbyRooms composable', () => {
  let mockProvider: RoomDiscoveryProvider;
  let providerStartMock: any;
  let mockSocket: any;
  let mockRoom: any;
  let isHost: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', new LocalStorageMock());
    mockSocket = ref({
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    });
    mockRoom = ref(null);
    isHost = ref(false);

    providerStartMock = vi.fn().mockReturnValue(vi.fn());
    mockProvider = {
      start: providerStartMock,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('manages retrying state with debounce/timeout', async () => {
    const composable = useNearbyRooms(mockSocket, mockRoom, isHost, () => mockProvider);
    await nextTick();

    expect(composable.retrying.value).toBe(false);

    composable.retry();
    expect(composable.retrying.value).toBe(true);

    vi.advanceTimersByTime(1300);
    expect(composable.retrying.value).toBe(false);
  });

  it('triggers auto-retry on onFocus when permission is denied', async () => {
    const composable = useNearbyRooms(mockSocket, mockRoom, isHost, (_s) => ({
      start(_mode, callbacks) {
        callbacks.status('未获定位权限，请在浏览器设置中允许位置后重试');
        return vi.fn();
      },
    }));
    await nextTick();

    expect(composable.status.value).toContain('未获定位权限');

    // Simulate focus event
    composable.onFocus();
    await nextTick();

    expect(composable.retrying.value).toBe(true);
  });

  it('triggers auto-retry when navigator.permissions changes to granted', async () => {
    let permChangeHandler: (() => void) | null = null;
    const mockPerm = {
      state: 'denied',
      set onchange(fn: (() => void) | null) {
        permChangeHandler = fn;
      },
      get onchange(): (() => void) | null {
        return permChangeHandler;
      },
    };

    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue(mockPerm),
      },
    });

    const composable = useNearbyRooms(mockSocket, mockRoom, isHost, () => mockProvider);
    await nextTick();
    await Promise.resolve(); // wait for microtask of permissions.query

    expect(composable.retrying.value).toBe(false);

    // Simulate permission change in browser
    mockPerm.state = 'granted';
    if (permChangeHandler) {
      (permChangeHandler as () => void)();
    }
    await nextTick();

    expect(composable.retrying.value).toBe(true);
  });

  it('updates localStorage and state when setEnabled is called', async () => {
    const composable = useNearbyRooms(mockSocket, mockRoom, isHost, () => mockProvider);
    await nextTick();

    composable.setEnabled(false);
    expect(composable.enabled.value).toBe(false);
    expect(localStorage.getItem('poolpoker_nearby_enabled')).toBe('false');

    composable.setEnabled(true);
    expect(composable.enabled.value).toBe(true);
    expect(localStorage.getItem('poolpoker_nearby_enabled')).toBe('true');
  });
});
