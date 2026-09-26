import type { NearbyRoom } from '@shared/types/discovery';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { createGeolocationProvider } from '../discovery/geolocationProvider';

class FakeSocket {
  connected = true;
  handlers = new Map<string, Set<(...args: any[]) => void>>();
  sent: Array<{ event: string; payload: unknown }> = [];
  on(event: string, fn: (...args: any[]) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(fn);
  }
  off(event: string, fn: (...args: any[]) => void) {
    this.handlers.get(event)?.delete(fn);
  }
  receive(event: string, ...args: unknown[]) {
    for (const fn of this.handlers.get(event) ?? []) fn(...args);
  }
  timeout() {
    return this;
  }
  emit(event: string, payload?: unknown, callback?: (...args: any[]) => void) {
    this.sent.push({ event, payload });
    callback?.(null, { success: true });
  }
}

describe('geolocation discovery provider lifecycle', () => {
  let socket: FakeSocket;
  let success: PositionCallback;
  let error: PositionErrorCallback;
  let locate: ReturnType<typeof vi.fn>;
  let watchLocation: ReturnType<typeof vi.fn>;
  let clearWatch: ReturnType<typeof vi.fn>;
  let stop: (() => void) | undefined;
  let callbacks: { rooms: Mock<(rooms: NearbyRoom[]) => void>; status: Mock<(message: string) => void> };
  const fix = (accuracy = 10) =>
    success({
      coords: { latitude: 31, longitude: 121, accuracy },
      timestamp: Date.now(),
    } as GeolocationPosition);

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    callbacks = { rooms: vi.fn(), status: vi.fn() };
    locate = vi.fn((onSuccess, onError) => {
      success = onSuccess;
      error = onError;
    });
    watchLocation = vi.fn((onSuccess, onError) => {
      success = onSuccess;
      error = onError;
      return 42;
    });
    clearWatch = vi.fn();
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: locate, watchPosition: watchLocation, clearWatch },
    });
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const start = () => {
    stop = createGeolocationProvider(socket as unknown as Socket).start('browse', callbacks);
  };

  it('uploads coarse then better fixes with throttling and stops when accurate', () => {
    start();
    fix(250);
    fix(100);
    fix(25);
    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(socket.sent.filter((s) => s.event === 'discovery_update')).toHaveLength(1);
    vi.advanceTimersByTime(1100);
    const updates = socket.sent.filter((s) => s.event === 'discovery_update');
    expect(updates).toHaveLength(2);
    expect(updates[1].payload).toMatchObject({ accuracy: 25 });
    vi.advanceTimersByTime(20_000);
    expect(watchLocation).toHaveBeenCalledTimes(1);
  });

  it('stops after a valid fix stops improving, even without further callbacks', () => {
    start();
    fix(100);
    vi.advanceTimersByTime(9000);
    fix(200);
    vi.advanceTimersByTime(1000);
    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(socket.sent.filter((s) => s.event === 'discovery_update')).toHaveLength(1);
  });

  it('reacquires only when the homepage fix expires', () => {
    start();
    fix();
    vi.advanceTimersByTime(59_000);
    expect(watchLocation).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(watchLocation).toHaveBeenCalledTimes(2);
  });

  it('uses the homepage fix in a room without requesting any more location', () => {
    start();
    fix(100);
    stop?.();
    const stopHost = createGeolocationProvider(socket as unknown as Socket).start('advertise', callbacks);
    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(socket.sent.filter((s) => s.event === 'discovery_update').slice(-1)[0]?.payload).toMatchObject({
      mode: 'advertise',
    });
    stopHost({ retainAdvertisement: true });
    const count = socket.sent.length;
    vi.advanceTimersByTime(60_000);
    expect(watchLocation).toHaveBeenCalledTimes(1);
    expect(socket.sent).toHaveLength(count);
    stopHost();
    expect(socket.sent[socket.sent.length - 1]?.event).toBe('discovery_stop');
  });

  it('does not locate in a room without a homepage fix', () => {
    stop = createGeolocationProvider(socket as unknown as Socket).start('advertise', callbacks);
    vi.advanceTimersByTime(120_000);
    expect(locate).not.toHaveBeenCalled();
    expect(watchLocation).not.toHaveBeenCalled();
  });

  it('never renews a room location after its original expiry', () => {
    start();
    fix();
    stop?.();
    stop = createGeolocationProvider(socket as unknown as Socket).start('advertise', callbacks);
    vi.advanceTimersByTime(62_000);
    expect(watchLocation).toHaveBeenCalledTimes(1);
    expect(callbacks.status).toHaveBeenLastCalledWith('首页位置已过期，房间不再向附近公开；可使用房间码加入');
  });

  it('bounds an unsuccessful acquisition and retries after a cooldown', () => {
    start();
    fix(2000);
    vi.advanceTimersByTime(30_000);
    expect(clearWatch).toHaveBeenCalledWith(42);
    vi.advanceTimersByTime(19_000);
    expect(watchLocation).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(watchLocation).toHaveBeenCalledTimes(2);
  });

  it('reuses a valid fix on restart but permits an explicit homepage retry', () => {
    start();
    fix();
    stop?.();
    start();
    expect(watchLocation).toHaveBeenCalledTimes(1);
    stop?.();
    stop = createGeolocationProvider(socket as unknown as Socket).start('browse', callbacks, { forceLocate: true });
    expect(watchLocation).toHaveBeenCalledTimes(2);
    expect(locate.mock.calls[locate.mock.calls.length - 1][2]).toMatchObject({ maximumAge: 0 });
  });

  it('ignores late position callbacks after stopping and removes listeners', () => {
    start();
    stop?.();
    fix();
    vi.advanceTimersByTime(60_000);
    expect(socket.sent.filter((s) => s.event === 'discovery_update')).toHaveLength(0);
    expect(locate).toHaveBeenCalledTimes(1);
    expect(socket.handlers.get('nearby_rooms')?.size).toBe(0);
  });

  it('clears old results on a permission error and does not repeat prompts', () => {
    start();
    fix(100);
    error({ code: 1 } as GeolocationPositionError);
    vi.advanceTimersByTime(60_000);
    expect(locate).toHaveBeenCalledTimes(1);
    expect(callbacks.rooms).toHaveBeenLastCalledWith([]);
    expect(callbacks.status).toHaveBeenLastCalledWith('未获定位权限，请在浏览器设置中允许位置后重试');
  });

  it('does not publish inaccurate positions', () => {
    start();
    fix(2000);
    expect(socket.sent.some((s) => s.event === 'discovery_update')).toBe(false);
    expect(callbacks.status).toHaveBeenLastCalledWith('定位精度约 2000 米，需 300 米以内；正在重试');
  });

  it('explains and rejects an old browser fix rather than reporting an accuracy error', () => {
    start();
    success({
      coords: { latitude: 31, longitude: 121, accuracy: 10 },
      timestamp: Date.now() - 120_000,
    } as GeolocationPosition);
    expect(socket.sent.some((s) => s.event === 'discovery_update')).toBe(false);
    expect(callbacks.status).toHaveBeenLastCalledWith('定位结果已过期（120 秒前），正在重新定位');
  });

  it('clears results on disconnect and reuses a fresh fix on reconnect', () => {
    start();
    fix();
    socket.connected = false;
    socket.receive('disconnect');
    expect(callbacks.rooms).toHaveBeenLastCalledWith([]);
    socket.connected = true;
    socket.receive('connect');
    expect(locate).toHaveBeenCalledTimes(1);
    expect(socket.sent.filter((s) => s.event === 'discovery_update')).toHaveLength(2);
  });

  it('expires results even if a subsequent location acquisition never completes', () => {
    start();
    fix();
    vi.advanceTimersByTime(62_000);
    expect(callbacks.rooms).toHaveBeenLastCalledWith([]);
    expect(watchLocation).toHaveBeenCalledTimes(2);
  });

  it('explains insecure origins without requesting geolocation', () => {
    vi.stubGlobal('window', { isSecureContext: false });
    start();
    expect(locate).not.toHaveBeenCalled();
    expect(callbacks.status).toHaveBeenLastCalledWith('定位需要 HTTPS，请使用安全网址打开');
  });
});
