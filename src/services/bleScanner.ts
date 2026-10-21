/**
 * BleScanner - 离线面对面近场蓝牙雷达扫描服务
 *
 * 监听附近通过 BLE 广播的 PoolPoker 房间，实时更新桌台列表及信号强度 (RSSI)
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ref } from 'vue';

export interface DiscoveredBleRoom {
  deviceId: string;
  roomCode: string;
  name: string;
  rssi: number;
  lastSeen: number;
}

export const BLE_ROOM_STALE_TTL_MS = 12_000;
const BLE_EVICT_INTERVAL_MS = 3_000;

export class BleScanner {
  private static instance: BleScanner | null = null;
  public discoveredRooms = ref<DiscoveredBleRoom[]>([]);
  public isScanning = ref<boolean>(false);
  private unlistenDiscovered: UnlistenFn | null = null;
  private evictTimer: ReturnType<typeof setInterval> | null = null;

  public static getInstance(): BleScanner {
    if (!BleScanner.instance) {
      BleScanner.instance = new BleScanner();
    }
    return BleScanner.instance;
  }

  public evictStaleRooms(now = Date.now(), ttlMs = BLE_ROOM_STALE_TTL_MS): void {
    const before = this.discoveredRooms.value.length;
    if (before === 0) return;
    const filtered = this.discoveredRooms.value.filter((r) => now - r.lastSeen <= ttlMs);
    if (filtered.length !== before) {
      this.discoveredRooms.value = filtered;
    }
  }

  public async start(): Promise<void> {
    if (this.isScanning.value) return;

    this.isScanning.value = true;
    this.discoveredRooms.value = [];

    if (this.evictTimer) {
      clearInterval(this.evictTimer);
    }
    this.evictTimer = setInterval(() => {
      this.evictStaleRooms();
    }, BLE_EVICT_INTERVAL_MS);

    try {
      this.unlistenDiscovered = await listen<{
        device_id: string;
        room_code: string;
        name: string;
        rssi: number;
      }>('ble://discovered_room', (event) => {
        const { device_id, room_code, name, rssi } = event.payload;
        const now = Date.now();

        this.evictStaleRooms(now);

        const existingIdx = this.discoveredRooms.value.findIndex((r) => r.deviceId === device_id);

        if (existingIdx !== -1) {
          const room = this.discoveredRooms.value[existingIdx];
          if (room_code) room.roomCode = room_code;
          room.rssi = rssi;
          room.lastSeen = now;
          if (name) room.name = name;
        } else {
          this.discoveredRooms.value.push({
            deviceId: device_id,
            roomCode: room_code,
            name: name || '台球桌台',
            rssi,
            lastSeen: now,
          });
        }

        // 按信号强度从高到低排序
        this.discoveredRooms.value.sort((a, b) => b.rssi - a.rssi);
      });

      await invoke('ble_start_scanning');
    } catch (err) {
      console.warn('[BleScanner] start scanning failed or not in mobile env:', err);
    }
  }

  public findByRoomCode(roomCode: string): DiscoveredBleRoom | undefined {
    const normalized = roomCode.trim();
    if (!normalized) return undefined;
    this.evictStaleRooms();
    return this.discoveredRooms.value.find((r) => r.roomCode === normalized);
  }

  public async stop(): Promise<void> {
    if (!this.isScanning.value) return;

    this.isScanning.value = false;
    if (this.evictTimer) {
      clearInterval(this.evictTimer);
      this.evictTimer = null;
    }
    if (this.unlistenDiscovered) {
      this.unlistenDiscovered();
      this.unlistenDiscovered = null;
    }

    try {
      await invoke('ble_stop_scanning');
    } catch (err) {
      console.warn('[BleScanner] stop scanning failed:', err);
    }
  }
}
