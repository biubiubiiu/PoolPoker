import type { DiscoveryMode, NearbyRoom } from '@shared/types/discovery';
import type { Room } from '@shared/types/game';
import type { Socket } from 'socket.io-client';
import { computed, onMounted, onUnmounted, type Ref, ref, watch } from 'vue';
import { createGeolocationProvider } from '@/discovery/geolocationProvider';
import type { RoomDiscoveryProvider } from '@/discovery/provider';

export function useNearbyRooms(
  socket: Ref<Socket | null>,
  room: Ref<Room | null>,
  isHost: Ref<boolean>,
  providerFactory: (socket: Socket) => RoomDiscoveryProvider = createGeolocationProvider
) {
  const enabled = ref(localStorage.getItem('poolpoker_nearby_enabled') !== 'false');
  const nearbyRooms = ref<NearbyRoom[]>([]);
  const status = ref('正在准备附近房间…');
  let appliedRetryVersion = 0;
  let lastProviderStatus = '';
  const visible = ref(!document.hidden);
  const mounted = ref(false);
  const retryVersion = ref(0);
  const mode = computed<DiscoveryMode | null>(() => {
    if (!room.value) return 'browse';
    return isHost.value && (room.value.status === 'waiting' || room.value.status === 'lobby') ? 'advertise' : null;
  });
  let stop: ReturnType<RoomDiscoveryProvider['start']> | undefined;
  let ownerSocket: Socket | null = null;
  let ownerRoomCode: string | undefined;
  const cleanup = (retainAdvertisement = false) => {
    stop?.({ retainAdvertisement });
    // Retain the cleanup handle so disabling/unmounting while hidden can still revoke it.
    if (!retainAdvertisement) stop = undefined;
    nearbyRooms.value = [];
  };
  const visibilityChanged = () => {
    visible.value = !document.hidden;
  };
  const pageHide = () => {
    cleanup();
    visible.value = false;
  };
  const pageShow = () => {
    visible.value = !document.hidden;
  };

  watch([socket, enabled, visible, mounted, mode, retryVersion, () => room.value?.code], () => {
    const retainAdvertisement =
      enabled.value &&
      !visible.value &&
      mode.value === 'advertise' &&
      ownerSocket === socket.value &&
      ownerRoomCode === room.value?.code;
    cleanup(retainAdvertisement);
    if (!enabled.value) {
      status.value = '已关闭附近发现';
      return;
    }
    if (!visible.value) {
      const paused = retainAdvertisement ? '已暂停定位，房间在最近位置过期前仍可被发现' : '回到页面后自动恢复';
      status.value = lastProviderStatus ? `${lastProviderStatus}；${paused}` : paused;
      return;
    }
    if (!mounted.value || !socket.value || !mode.value) return;
    ownerSocket = socket.value;
    ownerRoomCode = room.value?.code;
    const forceLocate = retryVersion.value !== appliedRetryVersion;
    appliedRetryVersion = retryVersion.value;
    stop = providerFactory(socket.value).start(
      mode.value,
      {
        rooms: (rooms) => {
          nearbyRooms.value = rooms;
        },
        status: (message) => {
          lastProviderStatus = message;
          status.value = message;
        },
      },
      { forceLocate }
    );
  });

  const setEnabled = (value: boolean) => {
    enabled.value = value;
    localStorage.setItem('poolpoker_nearby_enabled', String(value));
  };
  const retry = () => {
    retryVersion.value++;
  };
  onMounted(() => {
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    mounted.value = true;
  });
  onUnmounted(() => {
    cleanup();
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
  });
  return { enabled, nearbyRooms, status, setEnabled, retry };
}
