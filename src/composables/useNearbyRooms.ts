import type { DiscoveryMode, NearbyRoom } from '@shared/types/discovery';
import type { Room } from '@shared/types/game';
import type { Socket } from 'socket.io-client';
import { computed, getCurrentInstance, onMounted, onUnmounted, type Ref, ref, watch } from 'vue';
import { createGeolocationProvider } from '@/discovery/geolocationProvider';
import type { RoomDiscoveryProvider } from '@/discovery/provider';

export function useNearbyRooms(
  socket: Ref<Socket | null>,
  room: Ref<Room | null>,
  isHost: Ref<boolean>,
  providerFactory: (socket: Socket) => RoomDiscoveryProvider = createGeolocationProvider
) {
  const enabled = ref(
    typeof localStorage !== 'undefined' ? localStorage.getItem('poolpoker_nearby_enabled') !== 'false' : true
  );
  const nearbyRooms = ref<NearbyRoom[]>([]);
  const status = ref('正在获取位置…');
  const retrying = ref(false);
  let appliedRetryVersion = 0;
  let lastProviderStatus = '';
  const visible = ref(typeof document !== 'undefined' ? !document.hidden : true);
  const hasInstance = !!getCurrentInstance();
  const mounted = ref(!hasInstance);
  const retryVersion = ref(0);
  let retryResetTimer: ReturnType<typeof setTimeout> | undefined;
  let permStatus: PermissionStatus | null = null;

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
    visible.value = typeof document !== 'undefined' ? !document.hidden : true;
  };
  const pageHide = () => {
    cleanup();
    visible.value = false;
  };
  const pageShow = () => {
    visible.value = typeof document !== 'undefined' ? !document.hidden : true;
  };

  const onFocus = () => {
    if (
      enabled.value &&
      mode.value &&
      (status.value.includes('未获定位权限') || status.value.includes('暂时无法定位'))
    ) {
      retry();
    }
  };

  const setupPermissionListener = async () => {
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        permStatus = perm;
        perm.onchange = () => {
          if (perm.state === 'granted' || perm.state === 'prompt') {
            retry();
          }
        };
      } catch {
        // Permissions query for geolocation not supported or not allowed
      }
    }
  };

  watch(
    [socket, enabled, visible, mounted, mode, retryVersion, () => room.value?.code],
    () => {
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
        status.value = '已暂停定位';
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
    },
    { immediate: true }
  );

  const setEnabled = (value: boolean) => {
    enabled.value = value;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('poolpoker_nearby_enabled', String(value));
    }
  };
  const retry = () => {
    retrying.value = true;
    retryVersion.value++;
    clearTimeout(retryResetTimer);
    retryResetTimer = setTimeout(() => {
      retrying.value = false;
    }, 1200);
  };

  if (hasInstance) {
    onMounted(() => {
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityChanged);
      if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', pageHide);
        window.addEventListener('pageshow', pageShow);
        window.addEventListener('focus', onFocus);
      }
      setupPermissionListener();
      mounted.value = true;
    });
    onUnmounted(() => {
      cleanup();
      clearTimeout(retryResetTimer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityChanged);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', pageHide);
        window.removeEventListener('pageshow', pageShow);
        window.removeEventListener('focus', onFocus);
      }
      if (permStatus) {
        permStatus.onchange = null;
        permStatus = null;
      }
    });
  } else {
    setupPermissionListener();
  }

  return { enabled, nearbyRooms, status, retrying, setEnabled, retry, onFocus };
}
