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

export class BleScanner {
  private static instance: BleScanner | null = null;
  public discoveredRooms = ref<DiscoveredBleRoom[]>([]);
  public isScanning = ref<boolean>(false);
  private unlistenDiscovered: UnlistenFn | null = null;

  public static getInstance(): BleScanner {
    if (!BleScanner.instance) {
      BleScanner.instance = new BleScanner();
    }
    return BleScanner.instance;
  }

  public async start(): Promise<void> {
    if (this.isScanning.value) return;

    this.isScanning.value = true;
    this.discoveredRooms.value = [];

    try {
      this.unlistenDiscovered = await listen<{
        device_id: string;
        room_code: string;
        name: string;
        rssi: number;
      }>('ble://discovered_room', (event) => {
        const { device_id, room_code, name, rssi } = event.payload;
        const now = Date.now();

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
    return this.discoveredRooms.value.find((r) => r.roomCode === normalized);
  }

  public async stop(): Promise<void> {
    if (!this.isScanning.value) return;

    this.isScanning.value = false;
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
