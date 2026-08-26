import { io, type Socket } from 'socket.io-client';
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';

export interface ServerUrlConfig {
  id: string;
  name: string;
  url: string;
}

export function useSocket() {
  const socket = shallowRef<Socket | null>(null);
  const socketId = ref<string>('');
  const serverUrl = ref<string>(localStorage.getItem('poolpoker_server_url') || '');

  const loadSavedServerUrls = (): ServerUrlConfig[] => {
    try {
      const raw = localStorage.getItem('poolpoker_server_urls');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[Socket] Failed to parse saved server URLs:', e);
    }
    return [];
  };

  const savedServerUrls = ref<ServerUrlConfig[]>(loadSavedServerUrls());

  const saveServerUrlsToStorage = () => {
    localStorage.setItem('poolpoker_server_urls', JSON.stringify(savedServerUrls.value));
  };

  const normalizeUrl = (rawUrl: string): string => {
    let url = rawUrl.trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }
    return url;
  };

  // Migration: If poolpoker_server_url exists but is not in savedServerUrls, add it automatically
  if (serverUrl.value) {
    const norm = normalizeUrl(serverUrl.value);
    if (norm && !savedServerUrls.value.some((item) => item.url === norm)) {
      savedServerUrls.value.push({
        id: Date.now().toString(),
        name: norm,
        url: norm,
      });
      saveServerUrlsToStorage();
    }
  }

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

  const addServerUrl = (urlOrPayload: string | { url: string; name?: string }, nameStr?: string) => {
    const rawUrl = typeof urlOrPayload === 'string' ? urlOrPayload : urlOrPayload?.url || '';
    const nameVal = typeof urlOrPayload === 'string' ? nameStr : urlOrPayload?.name;
    const url = normalizeUrl(rawUrl);
    if (!url) return;

    const existingIndex = savedServerUrls.value.findIndex((item) => item.url === url);
    if (existingIndex >= 0) {
      if (nameVal?.trim()) {
        savedServerUrls.value[existingIndex].name = nameVal.trim();
      }
    } else {
      savedServerUrls.value.push({
        id: Date.now().toString(),
        name: nameVal?.trim() || url,
        url,
      });
    }
    saveServerUrlsToStorage();
    updateServerUrl(url);
  };

  const removeServerUrl = (id: string) => {
    const itemToRemove = savedServerUrls.value.find((item) => item.id === id);
    savedServerUrls.value = savedServerUrls.value.filter((item) => item.id !== id);
    saveServerUrlsToStorage();

    if (itemToRemove && itemToRemove.url === serverUrl.value) {
      updateServerUrl('');
    }
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
    savedServerUrls,
    updateServerUrl,
    addServerUrl,
    removeServerUrl,
    on,
    off,
    emit,
  };
}
