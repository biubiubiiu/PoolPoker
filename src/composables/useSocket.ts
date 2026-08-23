import { io, type Socket } from 'socket.io-client';
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';

export function useSocket() {
  const socket = shallowRef<Socket | null>(null);
  const socketId = ref<string>('');
  const serverUrl = ref<string>(localStorage.getItem('poolpoker_server_url') || '');

  const normalizeUrl = (rawUrl: string): string => {
    let url = rawUrl.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }
    return url;
  };

  const connectSocket = () => {
    if (socket.value) {
      socket.value.disconnect();
      socket.value = null;
    }

    const savedName = localStorage.getItem('billiards_player_name') || '';
    const savedUserId = localStorage.getItem('billiards_user_id') || '';
    const url = normalizeUrl(serverUrl.value);

    const options = {
      auth: {
        name: savedName,
        userId: savedUserId,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 300,
      reconnectionDelayMax: 1000,
      timeout: 5000,
    };

    socket.value = url ? io(url, options) : io(options);

    socket.value.on('connect', () => {
      socketId.value = socket.value?.id || '';
      console.log('[Socket] Connected to', url || 'same-origin', 'ID:', socketId.value);
    });
  };

  const updateServerUrl = (newUrl: string) => {
    serverUrl.value = normalizeUrl(newUrl);
    if (serverUrl.value) {
      localStorage.setItem('poolpoker_server_url', serverUrl.value);
    } else {
      localStorage.removeItem('poolpoker_server_url');
    }
    connectSocket();
  };

  onMounted(() => {
    connectSocket();
  });

  onUnmounted(() => {
    if (socket.value) {
      socket.value.disconnect();
      socket.value = null;
    }
  });

  const on = (event: string, callback: (...args: any[]) => void) => {
    socket.value?.on(event, callback);
  };

  const off = (event: string, callback?: (...args: any[]) => void) => {
    socket.value?.off(event, callback);
  };

  const emit = (event: string, payload?: any, callback?: (...args: any[]) => void) => {
    if (callback) {
      socket.value?.emit(event, payload, callback);
    } else if (payload !== undefined) {
      socket.value?.emit(event, payload);
    } else {
      socket.value?.emit(event);
    }
  };

  return {
    socket,
    socketId,
    serverUrl,
    updateServerUrl,
    on,
    off,
    emit,
  };
}
