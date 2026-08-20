import { io, type Socket } from 'socket.io-client';
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';

export function useSocket() {
  const socket = shallowRef<Socket | null>(null);
  const socketId = ref<string>('');

  onMounted(() => {
    socket.value = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 300,
      reconnectionDelayMax: 1000,
      timeout: 5000,
    });

    socket.value.on('connect', () => {
      socketId.value = socket.value?.id || '';
      console.log('[Socket] Connected, ID:', socketId.value);
    });
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
    on,
    off,
    emit,
  };
}
