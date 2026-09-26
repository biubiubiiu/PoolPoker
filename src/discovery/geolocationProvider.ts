import {
  DISCOVERY,
  type DiscoveryMode,
  type DiscoveryPosition,
  discoveryPositionIssue,
  type NearbyRoom,
} from '@shared/types/discovery';
import { CLIENT_TO_SERVER_EVENTS, SERVER_TO_CLIENT_EVENTS } from '@shared/types/protocol';
import type { SocketCallbackResponse } from '@shared/types/socket';
import type { Socket } from 'socket.io-client';
import { normalizeGeolocationTimestamp } from './geolocationTimestamp';
import type { DiscoveryCallbacks, RoomDiscoveryProvider } from './provider';

// Memory only, shared across provider restarts and browse -> advertise transitions.
const fixes = new WeakMap<Socket, DiscoveryPosition>();
const STABLE_ACCURACY_METERS = 50;
const SETTLE_MS = 10_000;
const ACQUISITION_MS = 30_000;
const UPLOAD_MS = 1100;

export function createGeolocationProvider(socket: Socket): RoomDiscoveryProvider {
  return {
    start(mode: DiscoveryMode, callbacks: DiscoveryCallbacks, options) {
      if (options?.forceLocate && mode === 'browse') fixes.delete(socket);
      let active = true;
      let denied = false;
      let sequence = 0;
      let generation = 0;
      let watchId: number | undefined;
      let acquiring = false;
      let position: DiscoveryPosition | null = null;
      let lastSentAt = -Infinity;
      let nextAttemptAt = 0;
      let settle: ReturnType<typeof setTimeout> | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let upload: ReturnType<typeof setTimeout> | undefined;

      const stopLocation = () => {
        acquiring = false;
        ++generation;
        if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        watchId = undefined;
        clearTimeout(settle);
        clearTimeout(deadline);
      };
      const clear = (revoke = true) => {
        position = null;
        clearTimeout(upload);
        upload = undefined;
        callbacks.rooms([]);
        if (revoke && socket.connected) socket.emit(CLIENT_TO_SERVER_EVENTS.discoveryStop);
      };
      const send = () => {
        upload = undefined;
        if (!active || !socket.connected || !position || discoveryPositionIssue(position, Date.now())) return;
        const wait = UPLOAD_MS - (Date.now() - lastSentAt);
        if (wait > 0) {
          upload = setTimeout(send, wait);
          return;
        }
        lastSentAt = Date.now();
        const request = ++sequence;
        socket
          .timeout(5000)
          .emit(
            CLIENT_TO_SERVER_EVENTS.discoveryUpdate,
            position,
            (error: Error | null, result?: SocketCallbackResponse) => {
              if (!active || request !== sequence) return;
              if (error || !result?.success) {
                callbacks.rooms([]);
                callbacks.status(error ? '附近房间连接超时，正在重试…' : result?.message || '附近房间暂不可用');
                upload = setTimeout(send, DISCOVERY.refreshMs);
                return;
              }
              callbacks.status(mode === 'advertise' ? '附近玩家可发现此房间' : '正在自动发现附近房间');
            }
          );
      };
      const locate = () => {
        if (!active || mode !== 'browse' || acquiring || denied || !socket.connected || position) return;
        if (!window.isSecureContext || !navigator.geolocation) {
          denied = true;
          callbacks.status(!window.isSecureContext ? '定位需要 HTTPS，请使用安全网址打开' : '当前浏览器不支持定位');
          return;
        }
        acquiring = true;
        const current = ++generation;
        const accept = (value: GeolocationPosition) => {
          if (!active || !acquiring || current !== generation) return;
          const now = Date.now();
          const candidate: DiscoveryPosition = {
            latitude: value.coords.latitude,
            longitude: value.coords.longitude,
            accuracy: value.coords.accuracy,
            timestamp: normalizeGeolocationTimestamp(value.timestamp, now, navigator.vendor),
            mode,
          };
          const issue = discoveryPositionIssue(candidate, now);
          if (issue) {
            if (!position) callbacks.status(issue);
            return;
          }
          // Keep the best fresh fix during this acquisition; jitter must not extend it forever.
          if (position && candidate.accuracy >= position.accuracy) return;
          const improved = !position || candidate.accuracy < position.accuracy * 0.9;
          position = candidate;
          fixes.set(socket, candidate);
          if (!upload) send();
          if (candidate.accuracy <= STABLE_ACCURACY_METERS) stopLocation();
          else if (improved) {
            clearTimeout(settle);
            settle = setTimeout(stopLocation, SETTLE_MS);
          }
        };
        const failure = (error: GeolocationPositionError) => {
          if (!active || !acquiring || current !== generation) return;
          if (error.code === 1) {
            denied = true;
            stopLocation();
            fixes.delete(socket);
            ++sequence;
            clear();
            callbacks.status('未获定位权限，请在浏览器设置中允许位置后重试');
          } else if (!position) {
            callbacks.status(error.code === 3 ? '定位超时，正在重试…' : '暂时无法定位，正在重试…');
          }
        };
        callbacks.status('正在获取位置…');
        deadline = setTimeout(() => {
          stopLocation();
          nextAttemptAt = Date.now() + DISCOVERY.refreshMs;
          if (!position) callbacks.status('暂未取得有效位置，稍后重试');
        }, ACQUISITION_MS);
        // Quick cached/coarse fix first, then higher-accuracy updates. Late one-shot callbacks are ignored.
        navigator.geolocation.getCurrentPosition(accept, failure, {
          enableHighAccuracy: false,
          maximumAge: options?.forceLocate ? 0 : DISCOVERY.positionMaxAgeMs - 1,
          timeout: 4000,
        });
        if (acquiring) {
          const id = navigator.geolocation.watchPosition(accept, failure, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 12_000,
          });
          if (acquiring) watchId = id;
          else navigator.geolocation.clearWatch(id);
        }
      };
      const resume = () => {
        const cached = fixes.get(socket);
        if (cached && !discoveryPositionIssue(cached, Date.now())) {
          position = { ...cached, mode };
          send();
        } else {
          fixes.delete(socket);
          if (mode === 'browse') locate();
          else callbacks.status('未获取有效位置，房间未公开到附近');
        }
      };
      const onRooms = (rooms: NearbyRoom[]) => {
        if (
          active &&
          mode === 'browse' &&
          position &&
          socket.connected &&
          !discoveryPositionIssue(position, Date.now())
        )
          callbacks.rooms(rooms);
      };
      const onDisconnect = () => {
        ++sequence;
        stopLocation();
        clear();
        callbacks.status('连接已断开，恢复后自动发现');
      };
      const onConnect = () => {
        lastSentAt = -Infinity;
        resume();
      };
      socket.on(SERVER_TO_CLIENT_EVENTS.nearbyRooms, onRooms);
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      if (socket.connected) resume();
      else callbacks.status('连接后自动发现附近房间');
      const expiry = setInterval(() => {
        if (position && discoveryPositionIssue(position, Date.now())) {
          ++sequence;
          stopLocation();
          clear();
          fixes.delete(socket);
          callbacks.status(mode === 'browse' ? '位置已过期，正在重新定位…' : '位置已过期，已停止向附近公开');
        }
        if (Date.now() >= nextAttemptAt) locate();
      }, DISCOVERY.publishMs);
      return (stopOptions) => {
        active = false;
        ++sequence;
        stopLocation();
        clearInterval(expiry);
        socket.off(SERVER_TO_CLIENT_EVENTS.nearbyRooms, onRooms);
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        clear(!(stopOptions?.retainAdvertisement && mode === 'advertise'));
      };
    },
  };
}
