/**
 * BLE Transport Connection Module
 *
 * Manages Central & Peripheral lifecycle, Tauri native BLE mesh events,
 * safe native command invocations, and automatic reconnection backoff logic.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { BleStorage } from './bleStorage';
import type { BleConnectionEvents } from './types';

export async function safeInvoke(cmd: string, args?: any): Promise<any> {
  try {
    return await invoke(cmd, args);
  } catch (_e) {
    // Non-native or pure web browser fallback silent ignore
  }
}

export class BleConnectionManager {
  public connected = false;
  public connectedDeviceId: string | null = null;
  public isReconnecting = false;
  public reconnectAttempts = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private unlisteners: UnlistenFn[] = [];
  private visibilityHandler: (() => void) | null = null;

  public async initListeners(events: BleConnectionEvents): Promise<void> {
    this.cleanupUnlisteners();

    try {
      if (events.onCommandReceived) {
        const unlistenCmd = await listen<{ peer_id: string; payload: number[] }>(
          'ble://command_received',
          async (event) => {
            await events.onCommandReceived?.(event.payload.peer_id, event.payload.payload);
          }
        );
        this.unlisteners.push(unlistenCmd);
      }

      if (events.onStateReceived) {
        const unlistenState = await listen<number[]>('ble://state_received', async (event) => {
          await events.onStateReceived?.(event.payload);
        });
        this.unlisteners.push(unlistenState);
      }

      if (events.onClientConnected) {
        const unlistenClientConn = await listen<{ peer_id: string }>('ble://client_connected', async (event) => {
          await events.onClientConnected?.(event.payload.peer_id);
        });
        this.unlisteners.push(unlistenClientConn);
      }

      if (events.onClientDisconnected) {
        const unlistenClientDisconn = await listen<{ peer_id: string }>('ble://client_disconnected', async (event) => {
          await events.onClientDisconnected?.(event.payload.peer_id);
        });
        this.unlisteners.push(unlistenClientDisconn);
      }

      if (events.onPeripheralConnected) {
        const unlistenPeripConn = await listen<{ peer_id: string }>('ble://peripheral_connected', async (event) => {
          await events.onPeripheralConnected?.(event.payload.peer_id);
        });
        this.unlisteners.push(unlistenPeripConn);
      }

      if (events.onPeripheralDisconnected) {
        const unlistenPeripDisconn = await listen<{ peer_id: string }>(
          'ble://peripheral_disconnected',
          async (event) => {
            await events.onPeripheralDisconnected?.(event.payload.peer_id);
          }
        );
        this.unlisteners.push(unlistenPeripDisconn);
      }
    } catch (_err) {
      // Desktop or non-Tauri browser environment safely ignored
    }
  }

  public registerVisibilityHandler(handler: () => void): void {
    if (typeof document !== 'undefined') {
      if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
      }
      this.visibilityHandler = handler;
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  public cleanupVisibilityHandler(): void {
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  public cleanupUnlisteners(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
  }

  public cleanupListeners(): void {
    this.cleanupUnlisteners();
    this.cleanupVisibilityHandler();
  }

  public scheduleAutoReconnect(
    roomCode: string,
    isHost: boolean,
    leaving: boolean,
    onAttempt: () => Promise<void>
  ): void {
    if (isHost || leaving || !roomCode || this.connected) {
      return;
    }
    const deviceId = BleStorage.getStoredDeviceId();
    if (!deviceId) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const delay = this.getReconnectDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void onAttempt();
    }, delay);
  }

  public clearAutoReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
  }

  private getReconnectDelay(): number {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return 50;
    }
    const delays = [1000, 2000, 3000, 5000];
    const idx = Math.min(Math.max(0, this.reconnectAttempts - 1), delays.length - 1);
    return delays[idx];
  }

  public async attemptReconnect(
    roomCode: string,
    isHost: boolean,
    leaving: boolean,
    onScheduleNext: () => void
  ): Promise<void> {
    if (isHost || leaving || !roomCode || this.connected || this.isReconnecting) {
      return;
    }
    const deviceId = BleStorage.getStoredDeviceId();
    if (!deviceId) {
      this.clearAutoReconnect();
      return;
    }

    this.isReconnecting = true;
    try {
      await safeInvoke('ble_connect_peripheral', { deviceId });
    } catch (err) {
      console.warn('[BleConnection] Auto-reconnect failed to invoke ble_connect_peripheral:', err);
      this.isReconnecting = false;
      if (!leaving && roomCode && !this.connected) {
        this.reconnectAttempts++;
        onScheduleNext();
      }
      return;
    }

    const guardTimeout = typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 200 : 10000;
    setTimeout(() => {
      if (this.isReconnecting && !this.connected && !leaving && roomCode) {
        this.isReconnecting = false;
        this.reconnectAttempts++;
        onScheduleNext();
      }
    }, guardTimeout);
  }

  public async startAdvertising(roomCode: string, hostName: string): Promise<void> {
    await safeInvoke('ble_start_advertising', { roomCode, hostName });
  }

  public async stopAdvertising(): Promise<void> {
    await safeInvoke('ble_stop_advertising');
  }

  public async connectPeripheral(deviceId: string): Promise<void> {
    await invoke('ble_connect_peripheral', { deviceId });
  }

  public async disconnectPeripheral(): Promise<void> {
    await safeInvoke('ble_disconnect_peripheral');
  }

  public async sendCommandToHost(payload: Uint8Array | number[]): Promise<void> {
    await safeInvoke('ble_send_command_to_host', {
      payload: Array.from(payload),
    });
  }

  public async notifyStateToClients(payload: Uint8Array | number[], targetPeerId?: string): Promise<void> {
    await safeInvoke('ble_notify_state_to_clients', {
      payload: Array.from(payload),
      targetPeerId,
    });
  }

  public reset(): void {
    this.clearAutoReconnect();
    this.cleanupListeners();
    this.connected = false;
    this.connectedDeviceId = null;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
  }
}
