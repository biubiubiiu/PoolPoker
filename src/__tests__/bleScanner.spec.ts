import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BleScanner } from '../services/bleScanner';

const mockInvokes: Array<{ cmd: string; args?: any }> = [];
let eventListeners: Record<string, (event: any) => void> = {};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    mockInvokes.push({ cmd, args });
    return {};
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, callback: any) => {
    eventListeners[event] = callback;
    return () => {
      delete eventListeners[event];
    };
  }),
}));

describe('BleScanner radar discovery', () => {
  beforeEach(() => {
    mockInvokes.length = 0;
    eventListeners = {};
  });

  it('should start scanning and update discovered rooms sorted by RSSI', async () => {
    const scanner = BleScanner.getInstance();
    await scanner.start();

    expect(scanner.isScanning.value).toBe(true);
    expect(mockInvokes.some((i) => i.cmd === 'ble_start_scanning')).toBe(true);
    expect(eventListeners['ble://discovered_room']).toBeDefined();

    // 模拟原生蓝牙发现 2 个房间
    eventListeners['ble://discovered_room']({
      payload: {
        device_id: 'dev_1',
        room_code: '8848',
        name: '老球霸桌',
        rssi: -70,
      },
    });

    eventListeners['ble://discovered_room']({
      payload: {
        device_id: 'dev_2',
        room_code: '6666',
        name: '强信号桌',
        rssi: -45,
      },
    });

    expect(scanner.discoveredRooms.value).toHaveLength(2);
    // 强信号排在前面
    expect(scanner.discoveredRooms.value[0].roomCode).toBe('6666');
    expect(scanner.discoveredRooms.value[1].roomCode).toBe('8848');

    await scanner.stop();
    expect(scanner.isScanning.value).toBe(false);
    expect(mockInvokes.some((i) => i.cmd === 'ble_stop_scanning')).toBe(true);
  });
});
