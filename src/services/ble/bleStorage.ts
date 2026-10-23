/**
 * BLE Transport Offline Storage Module
 *
 * Provides dual-layer persistence (localStorage + memory fallback) for:
 * 1. Target Peripheral Device ID (for fast auto-reconnect)
 * 2. Room State Snapshots (for offline viewing and app re-entry)
 * 3. Pending Actions Queue (for offline optimistic action recording and replay)
 */

import type { BleClientAction } from '@shared/types/bleProtocol';
import type { Room } from '@shared/types/game';

let memoryDeviceIdStorage: string | null = null;
const memoryRoomStorage = new Map<string, string>();
const memoryPendingActionsStorage = new Map<string, string>();

function getStorageKey(roomCode: string, suffix: string): string {
  return `poolpoker_ble_${roomCode}_${suffix}`;
}

export function getStoredDeviceId(): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('poolpoker_ble_device_id');
    }
  } catch (_) {}
  return memoryDeviceIdStorage;
}

export function setStoredDeviceId(deviceId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('poolpoker_ble_device_id', deviceId);
    }
  } catch (_) {}
  memoryDeviceIdStorage = deviceId;
}

export function clearStoredDeviceId(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('poolpoker_ble_device_id');
    }
  } catch (_) {}
  memoryDeviceIdStorage = null;
}

export function saveCachedRoom(roomCode: string, room: Room | null): void {
  if (!roomCode || !room) return;
  const key = getStorageKey(roomCode, 'cached_room');
  try {
    const data = JSON.stringify(room);
    memoryRoomStorage.set(key, data);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, data);
    }
  } catch (e) {
    console.warn('[BleStorage] Failed to cache room to localStorage:', e);
  }
}

export function loadCachedRoom(roomCode: string): Room | null {
  if (!roomCode) return null;
  const key = getStorageKey(roomCode, 'cached_room');
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as Room;
    }
  } catch (_) {}
  const mem = memoryRoomStorage.get(key);
  if (mem) {
    try {
      return JSON.parse(mem) as Room;
    } catch (_) {}
  }
  return null;
}

export function clearCachedRoom(roomCode: string): void {
  if (!roomCode) return;
  const key = getStorageKey(roomCode, 'cached_room');
  memoryRoomStorage.delete(key);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (_) {}
}

export function savePendingActions(roomCode: string, actions: BleClientAction[]): void {
  if (!roomCode) return;
  const key = getStorageKey(roomCode, 'pending_actions');
  try {
    const data = JSON.stringify(actions);
    memoryPendingActionsStorage.set(key, data);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, data);
    }
  } catch (e) {
    console.warn('[BleStorage] Failed to save pending actions:', e);
  }
}

export function loadPendingActions(roomCode: string): BleClientAction[] {
  if (!roomCode) return [];
  const key = getStorageKey(roomCode, 'pending_actions');
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as BleClientAction[];
    }
  } catch (_) {}
  const mem = memoryPendingActionsStorage.get(key);
  if (mem) {
    try {
      return JSON.parse(mem) as BleClientAction[];
    } catch (_) {}
  }
  return [];
}

export function clearPendingActions(roomCode: string): void {
  if (!roomCode) return;
  const key = getStorageKey(roomCode, 'pending_actions');
  memoryPendingActionsStorage.delete(key);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (_) {}
}

export function resetAllBleStorage(): void {
  clearStoredDeviceId();
  memoryRoomStorage.clear();
  memoryPendingActionsStorage.clear();
}

export const BleStorage = {
  getStoredDeviceId,
  setStoredDeviceId,
  clearStoredDeviceId,
  saveCachedRoom,
  loadCachedRoom,
  clearCachedRoom,
  savePendingActions,
  loadPendingActions,
  clearPendingActions,
  resetAll: resetAllBleStorage,
};
