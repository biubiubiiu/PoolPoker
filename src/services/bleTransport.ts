/**
 * Virtual BLE Transport Layer for PoolPoker
 *
 * Implements the unified GameTransport interface over Bluetooth Low Energy and Local In-Memory Engine.
 *
 * Modular Architecture:
 * - BleConnectionManager: Central & Peripheral connection lifecycle, Tauri events, auto-reconnect backoff
 * - BleHandshakeManager: Join handshake, MTU-safe chunking, peer-to-user identity mapping, leave ACK
 * - BleCommandQueue: Offline pending actions queue, idempotent retry scheduling, flush on reconnect
 * - BleStateSync: State chunk reassembly, local optimistic execution (0ms), desensitized host broadcast
 * - BleStorage: Dual-layer persistence (localStorage + memory fallback) for deviceId, room, and actions
 */

import {
  BLE_PROTOCOL_VERSION,
  BleActionType,
  type BleClientAction,
  BleHostEventCode,
  BleMessageType,
} from '@shared/types/bleProtocol';
import type { Room } from '@shared/types/game';
import { cardToIndex, decodeBleAction, decodeBleHostEvent, encodeBleAction } from '@shared/utils/bleCodec';
import { getRandomInt } from '@shared/utils/crypto';
import type { GameTransport, TransportEventCallback } from '../types/transport';
import {
  BleCommandQueue,
  BleConnectionManager,
  BleHandshakeManager,
  BleStateSync,
  BleStorage,
  safeInvoke,
} from './ble';
import { BleScanner } from './bleScanner';
import { LocalHostEngine } from './localHostEngine';

let sharedHostEngine: LocalHostEngine | null = null;
const sharedPeerIdToUserId = new Map<string, string>();
const sharedUserIdToPeerId = new Map<string, string>();

export function getSharedHostEngine(): LocalHostEngine {
  if (!sharedHostEngine) {
    sharedHostEngine = new LocalHostEngine();
  }
  return sharedHostEngine;
}

export function resetSharedHostEngine(): void {
  if (sharedHostEngine) {
    sharedHostEngine.destroy();
    sharedHostEngine = null;
  }
  sharedPeerIdToUserId.clear();
  sharedUserIdToPeerId.clear();
  BleStorage.resetAll();
}

export class BleTransport implements GameTransport {
  private listeners = new Map<string, Set<TransportEventCallback>>();
  public currentRoomCode = '8848';
  private selfUserId = '';
  private playerName = '我';
  public connected = false;
  public isHost = false;
  public hostEngine: LocalHostEngine | null = null;
  public cachedRoom: Room | null = null;
  private leaving = false;
  private initialized = false;

  // Submodules
  private conn = new BleConnectionManager();
  private handshake = new BleHandshakeManager(sharedPeerIdToUserId, sharedUserIdToPeerId);
  private queue = new BleCommandQueue();
  private sync = new BleStateSync();

  // Backward-compatible property references for tests and peers
  public peerIdToUserId = sharedPeerIdToUserId;
  public userIdToPeerId = sharedUserIdToPeerId;

  constructor(userId: string, playerName = '我') {
    this.selfUserId = userId;
    this.playerName = playerName;
  }

  public get id(): string {
    return `ble_${this.selfUserId}`;
  }

  public get connectedDeviceId(): string | null {
    return this.conn.connectedDeviceId;
  }

  public set connectedDeviceId(deviceId: string | null) {
    this.conn.connectedDeviceId = deviceId;
  }

  public get stateReassembler() {
    return this.sync.stateReassembler;
  }

  public get commandReassemblers() {
    return this.sync.commandReassemblers;
  }

  public get joinSendQueue(): Promise<void> {
    return this.handshake.joinSendQueue;
  }

  public set joinSendQueue(p: Promise<void>) {
    this.handshake.joinSendQueue = p;
  }

  public get isFlushingActions(): boolean {
    return this.queue.isFlushingActions;
  }

  public get pendingOfflineActions(): BleClientAction[] {
    return this.queue.getPendingActions(this.currentRoomCode);
  }

  public set pendingOfflineActions(actions: BleClientAction[]) {
    this.queue.pendingOfflineActions = actions;
    if (this.currentRoomCode) {
      BleStorage.savePendingActions(this.currentRoomCode, actions);
    }
  }

  private saveCachedRoom(): void {
    if (!this.cachedRoom || !this.currentRoomCode) return;
    BleStorage.saveCachedRoom(this.currentRoomCode, this.cachedRoom);
  }

  private loadCachedRoom(): Room | null {
    if (!this.currentRoomCode) return null;
    return BleStorage.loadCachedRoom(this.currentRoomCode);
  }

  private clearCachedRoom(): void {
    if (this.currentRoomCode) {
      BleStorage.clearCachedRoom(this.currentRoomCode);
    }
    this.cachedRoom = null;
  }

  private savePendingActions(): void {
    if (this.currentRoomCode) {
      BleStorage.savePendingActions(this.currentRoomCode, this.queue.pendingOfflineActions);
    }
  }

  private loadPendingActions(): BleClientAction[] {
    if (!this.currentRoomCode) return [];
    return BleStorage.loadPendingActions(this.currentRoomCode);
  }

  private clearPendingActions(): void {
    if (this.currentRoomCode) {
      this.queue.clearActions(this.currentRoomCode);
    } else {
      this.queue.reset();
    }
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible' || this.leaving || !this.currentRoomCode) return;
    if (this.isHost) {
      // Refresh every subscribed guest, even when lock/unlock never disconnected GATT.
      this.hostEngine?.broadcastAll();
    } else if (this.connected) {
      this.sendJoinHandshake();
      void this.handshake.joinSendQueue.then(() => this.flushPendingOfflineActions(true));
    }
  };

  public sendJoinHandshake(): void {
    void this.handshake.sendJoinHandshake(
      this.selfUserId,
      this.playerName,
      {
        isHost: () => this.isHost,
        isConnected: () => this.connected,
        isLeaving: () => this.leaving,
        getRoomCode: () => this.currentRoomCode,
      },
      async (chunk) => {
        await safeInvoke('ble_send_command_to_host', { payload: Array.from(chunk) });
      }
    );
  }

  private scheduleAutoReconnect(): void {
    this.conn.scheduleAutoReconnect(this.currentRoomCode, this.isHost, this.leaving, async () => {
      await this.conn.attemptReconnect(this.currentRoomCode, this.isHost, this.leaving, () => {
        this.scheduleAutoReconnect();
      });
    });
  }

  public async flushPendingOfflineActions(retryOnly = false): Promise<void> {
    await this.queue.flushPendingOfflineActions({
      retryOnly,
      checkers: {
        isHost: () => this.isHost,
        isConnected: () => this.connected,
        isLeaving: () => this.leaving,
        getRoomCode: () => this.currentRoomCode,
      },
      waitHandshake: this.handshake.joinSendQueue,
      sendActionFn: async (action) => {
        const bytes = encodeBleAction(action);
        await safeInvoke('ble_send_command_to_host', {
          payload: Array.from(bytes),
        });
      },
      onRescheduleRetry: () => {
        this.queue.schedulePendingRetry(this.isHost, this.leaving, this.initialized, this.connected, () => {
          this.sendJoinHandshake();
          void this.flushPendingOfflineActions(true);
        });
      },
    });
  }

  /**
   * Guest local optimistic state execution (0ms card elimination and ball pocketing)
   */
  public applyLocalOptimisticAction(action: BleClientAction, targetRoom?: Room): Room | null {
    if (!targetRoom && !this.cachedRoom) {
      this.cachedRoom = this.loadCachedRoom();
    }
    return this.sync.applyLocalOptimisticAction(action, targetRoom || null, this.selfUserId, this.cachedRoom);
  }

  public async init(): Promise<this> {
    this.connected = true;
    this.conn.connected = true;
    if (this.initialized) return this;
    this.initialized = true;

    this.conn.registerVisibilityHandler(this.handleVisibilityChange);

    await this.conn.initListeners({
      // 1. Host receives command or join packets from peripheral clients
      onCommandReceived: (peerId, payload) => {
        if (this.isHost && this.hostEngine && payload?.length > 1) {
          const rawBytes = this.sync.processIncomingCommand(peerId, new Uint8Array(payload));
          if (!rawBytes) return;
          const msgType = rawBytes[1];

          if (msgType === BleMessageType.CLIENT_JOIN) {
            this.handshake.handleClientJoin(peerId, rawBytes, this.hostEngine, this.currentRoomCode, (bytes, pid) => {
              safeInvoke('ble_notify_state_to_clients', {
                payload: Array.from(bytes),
                targetPeerId: pid,
              });
            });
            return;
          }

          const mappedSender = this.handshake.getMappedUserId(peerId);
          try {
            const action = decodeBleAction(rawBytes);
            this.hostEngine.executeBinaryAction(rawBytes, mappedSender);
            if (action.actionType === BleActionType.LEAVE_ROOM) {
              const ackBytes = this.handshake.createLeaveAckBytes(this.currentRoomCode);
              safeInvoke('ble_notify_state_to_clients', {
                payload: Array.from(ackBytes),
                targetPeerId: peerId,
              });
              this.handshake.removePeer(peerId);
            }
          } catch (e) {
            console.error('[BleTransport] Failed to handle client action:', e);
          }
        }
      },

      // 2. Guest receives state update or host events from peripheral host
      onStateReceived: (payload) => {
        if (!this.isHost && this.connected && this.currentRoomCode && payload?.length > 1) {
          try {
            const rawBytes = new Uint8Array(payload);
            const msgType = rawBytes[1];

            if (msgType === BleMessageType.HOST_EVENT_NOTIFY) {
              const hostEvt = decodeBleHostEvent(rawBytes);
              if (hostEvt.code === BleHostEventCode.LEAVE_ACK) {
                this.emitLocal('leave_ack', {});
                return;
              }
              const roomCodeStr = this.currentRoomCode || String(hostEvt.roomCode || '8848');
              this.conn.clearAutoReconnect();
              this.sync.stateReassembler.reset();
              BleStorage.clearStoredDeviceId();
              this.cachedRoom = null;
              this.currentRoomCode = '';
              this.conn.connectedDeviceId = null;
              safeInvoke('ble_disconnect_peripheral');

              if (hostEvt.code === BleHostEventCode.KICKED) {
                this.emitLocal('room_kicked', { roomCode: roomCodeStr });
              } else {
                const msg =
                  hostEvt.code === BleHostEventCode.JOIN_REJECTED_FULL
                    ? '该房间人数已满（最多 8 人），无法加入'
                    : '该房间牌局已开始，无法中途加入';
                this.emitLocal('room_kicked', { roomCode: roomCodeStr, reason: msg });
              }
              return;
            }

            const fullBytes = this.sync.processIncomingState(rawBytes);
            if (!fullBytes) return;
            if (this.leaving) return;

            const { clientRoom, selfSeatNeedsSync } = this.sync.decodeAndConvertRoomState(
              fullBytes,
              this.selfUserId,
              this.currentRoomCode,
              this.playerName
            );

            if (selfSeatNeedsSync) {
              this.sendJoinHandshake();
            }

            // Never replay previous-round recordings into a new deal
            if (this.cachedRoom && this.cachedRoom.roundCount !== clientRoom.roundCount) {
              this.clearPendingActions();
              this.queue.clearPendingRetry();
            }

            // Prune pocketed balls and overlay remaining pending actions
            this.queue.prunePocketedBalls(clientRoom.pocketedBallNumbers, this.currentRoomCode);
            const pending = this.queue.getPendingActions(this.currentRoomCode);
            for (const act of pending) {
              this.sync.applyLocalOptimisticAction(act, clientRoom, this.selfUserId);
            }

            this.handleIncomingState(clientRoom);
            this.queue.schedulePendingRetry(this.isHost, this.leaving, this.initialized, this.connected, () => {
              this.sendJoinHandshake();
              void this.flushPendingOfflineActions(true);
            });
          } catch (err) {
            console.error('[BleTransport] Failed to decode incoming BLE state:', err);
          }
        }
      },

      // 3. Host receives physical client connection/disconnection
      onClientConnected: (peerId) => {
        if (this.isHost && this.hostEngine) {
          const existingUserId = this.handshake.peerIdToUserId.get(peerId);
          if (existingUserId) {
            this.hostEngine.bindPeerPlayer(peerId, existingUserId, '');
          } else {
            const { bytes } = this.hostEngine.getStateForUser(peerId);
            safeInvoke('ble_notify_state_to_clients', {
              payload: Array.from(bytes),
              targetPeerId: peerId,
            });
          }
        }
      },

      onClientDisconnected: (peerId) => {
        if (this.isHost && this.hostEngine) {
          this.sync.removePeerReassembler(peerId);
          const mappedUserId = this.handshake.removePeer(peerId) || peerId;
          this.hostEngine.setPlayerOffline(mappedUserId);
        }
      },

      // 4. Guest receives physical peripheral connection/disconnection with host
      onPeripheralConnected: async (peerId) => {
        if (!this.isHost) {
          this.connected = true;
          this.conn.connected = true;
          this.conn.connectedDeviceId = peerId;
          this.conn.clearAutoReconnect();
          this.sendJoinHandshake();
          await this.flushPendingOfflineActions();
        }
      },

      onPeripheralDisconnected: (_peerId) => {
        if (!this.isHost) {
          this.connected = false;
          this.conn.connected = false;
          this.conn.connectedDeviceId = null;
          this.conn.isReconnecting = false;
          this.sync.stateReassembler.reset();
          this.queue.clearPendingRetry();
          this.queue.cancelFlushing();
          this.handshake.cancelPendingHandshakes();
          this.emitLocal('disconnect', 'transport close');
          if (!this.leaving && this.currentRoomCode && BleStorage.getStoredDeviceId()) {
            this.conn.reconnectAttempts++;
            this.scheduleAutoReconnect();
          }
        }
      },
    });

    this.emitLocal('connect');
    return this;
  }

  public connect(): this {
    const wasConnected = this.connected;
    this.connected = true;
    this.conn.connected = true;
    if (!this.initialized) {
      this.init();
    } else if (!wasConnected) {
      this.emitLocal('connect');
    }
    return this;
  }

  public disconnect(): this {
    this.conn.clearAutoReconnect();
    this.queue.clearPendingRetry();
    this.handshake.cancelPendingHandshakes();
    this.queue.cancelFlushing();
    this.conn.cleanupListeners();

    if (this.isHost) {
      safeInvoke('ble_stop_advertising');
    } else {
      safeInvoke('ble_disconnect_peripheral');
    }

    this.handshake.clearMappings();
    this.sync.resetReassemblers();
    this.initialized = false;
    this.conn.connectedDeviceId = null;
    this.connected = false;
    this.conn.connected = false;
    this.emitLocal('disconnect');
    return this;
  }

  public timeout(_ms: number): this {
    return this;
  }

  public destroy(): void {
    this.disconnect();
    this.listeners.clear();
    this.hostEngine = null;
  }

  public on(event: string, callback: TransportEventCallback): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    return this;
  }

  public once(event: string, callback: TransportEventCallback): this {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      callback(...args);
    };
    return this.on(event, wrapper);
  }

  public off(event: string, callback?: TransportEventCallback): this {
    if (!callback) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(callback);
    }
    return this;
  }

  private emitLocal(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of Array.from(handlers)) {
        handler(...args);
      }
    }
  }

  public handleIncomingState(room: Room, force = false): void {
    if (this.leaving || (!this.connected && !force) || !this.currentRoomCode) {
      return;
    }
    this.cachedRoom = room;
    this.saveCachedRoom();
    this.emitLocal('room_updated', room);
  }

  /**
   * Intercept upper-layer composables events and route to LocalHostEngine or BLE native layer
   */
  public async emit(event: string, payload?: any, callback?: TransportEventCallback): Promise<void> {
    try {
      if (this.leaving) {
        callback?.({ success: false, message: '正在退出房间，请稍候' });
        return;
      }

      if (event === 'create_room') {
        const roomCode = payload?.roomCode || String(getRandomInt(1000, 10000));
        this.currentRoomCode = roomCode;
        if (payload?.name) this.playerName = payload.name;

        this.isHost = true;
        this.connected = true;
        this.conn.connected = true;
        this.hostEngine = getSharedHostEngine();

        this.sync.bindHostEngineCallback(
          this.hostEngine,
          this.selfUserId,
          this.handshake.userIdToPeerId,
          (clientRoom) => this.handleIncomingState(clientRoom),
          (stateBytes, targetPeerId) => {
            safeInvoke('ble_notify_state_to_clients', {
              payload: Array.from(stateBytes),
              targetPeerId,
            });
          }
        );

        const initialRoom = this.hostEngine.initRoom(this.selfUserId, this.playerName, roomCode);
        this.emitLocal('room_created', { roomCode });
        this.handleIncomingState(initialRoom);

        safeInvoke('ble_start_advertising', {
          roomCode,
          hostName: this.playerName,
        });

        if (callback) {
          callback({ success: true, roomCode, sessionToken: `ble_token_${this.selfUserId}` });
        }
        return;
      }

      if (event === 'join_room') {
        this.conn.clearAutoReconnect();
        const roomCode = payload?.roomCode || '8848';
        const scannedDevice = BleScanner.getInstance().findByRoomCode(roomCode)?.deviceId;
        const deviceId = payload?.deviceId || payload?.discoverySource?.deviceId || scannedDevice;
        this.currentRoomCode = roomCode;
        if (payload?.name) this.playerName = payload.name;
        this.isHost = false;

        // In-memory join if in the same process sandbox without deviceId
        const localHost = sharedHostEngine;
        if (!deviceId && localHost && localHost.getRawRoom()?.code === roomCode) {
          this.hostEngine = localHost;
          this.connected = true;
          this.conn.connected = true;
          const updatedRoom = this.hostEngine.addPlayer(this.selfUserId, this.playerName);
          if (!updatedRoom) {
            const errorMsg = '加入失败：房间对局已开始或人数已满';
            if (callback) {
              callback(null, { success: false, message: errorMsg });
            }
            return;
          }
          this.handleIncomingState(updatedRoom);
          if (callback) {
            callback(null, { success: true, roomCode, sessionToken: `ble_token_${this.selfUserId}` });
          }
          return;
        }

        if (deviceId) {
          if (this.connected && this.conn.connectedDeviceId === deviceId) {
            BleStorage.setStoredDeviceId(deviceId);
            this.sendJoinHandshake();
            if (callback) {
              callback(null, { success: true, roomCode, sessionToken: `ble_token_${this.selfUserId}` });
            }
            return;
          }

          try {
            await this.conn.connectPeripheral(deviceId);
            this.conn.connectedDeviceId = deviceId;
            BleStorage.setStoredDeviceId(deviceId);
            this.connected = true;
            this.conn.connected = true;
            if (callback) {
              callback(null, { success: true, roomCode, sessionToken: `ble_token_${this.selfUserId}` });
            }
            return;
          } catch (err: any) {
            if (callback) {
              callback(new Error(err?.message || String(err)), { success: false, message: String(err) });
            }
            return;
          }
        }

        const errorMsg = '未检测到目标蓝牙桌台。请开启附近蓝牙扫描并选择桌台加入。';
        if (callback) {
          callback(new Error(errorMsg), { success: false, message: errorMsg });
        }
        return;
      }

      if (event === 'rejoin_room') {
        this.conn.clearAutoReconnect();
        const roomCode = payload?.roomCode || this.currentRoomCode;
        const targetUserId = payload?.userId || this.selfUserId;

        const engine = sharedHostEngine || getSharedHostEngine();
        if (engine && !engine.getRawRoom() && roomCode) {
          engine.restoreFromStorage(roomCode);
        }
        if (engine && engine.getRawRoom()?.code === roomCode && engine.getRawRoom()?.hostUserId === targetUserId) {
          if (engine.getRawRoom()?.status === 'finished') {
            LocalHostEngine.clearStorage(roomCode);
            resetSharedHostEngine();
            this.hostEngine = null;
            this.isHost = false;
            this.currentRoomCode = '';
            if (callback) {
              callback({
                success: false,
                message: '上局对战已完结',
              });
            }
            return;
          }

          this.hostEngine = engine;
          this.isHost = true;
          this.connected = true;
          this.conn.connected = true;
          this.currentRoomCode = roomCode;

          this.sync.bindHostEngineCallback(
            this.hostEngine,
            this.selfUserId,
            this.handshake.userIdToPeerId,
            (r) => this.handleIncomingState(r),
            (bytes, pid) => safeInvoke('ble_notify_state_to_clients', { payload: Array.from(bytes), targetPeerId: pid })
          );

          safeInvoke('ble_start_advertising', {
            roomCode,
            hostName: this.playerName,
          });

          const clientRoom = engine.getDirectClientRoom(targetUserId);
          this.handleIncomingState(clientRoom);
          engine.broadcastAll();
          if (callback) {
            callback({
              success: true,
              roomCode,
              sessionToken: `ble_token_${this.selfUserId}`,
            });
          }
          return;
        }

        // Guest rejoin
        const lastDeviceId = payload?.deviceId || BleStorage.getStoredDeviceId();
        this.currentRoomCode = roomCode;
        this.isHost = false;

        if (!this.cachedRoom) {
          this.cachedRoom = this.loadCachedRoom();
        }
        if (this.cachedRoom && this.cachedRoom.code === roomCode) {
          if (this.cachedRoom.status === 'finished') {
            this.clearCachedRoom();
            this.cachedRoom = null;
            BleStorage.clearStoredDeviceId();
            this.currentRoomCode = '';
            if (callback) {
              callback({
                success: false,
                message: '上局对战已完结',
              });
            }
            return;
          }
          this.handleIncomingState(this.cachedRoom, true);
        }

        if (lastDeviceId) {
          if (this.connected && this.conn.connectedDeviceId === lastDeviceId) {
            this.sendJoinHandshake();
            await this.flushPendingOfflineActions(true);
            if (callback) {
              callback({
                success: true,
                roomCode,
                sessionToken: `ble_token_${this.selfUserId}`,
              });
            }
            return;
          }

          try {
            await this.conn.connectPeripheral(lastDeviceId);
            this.conn.connectedDeviceId = lastDeviceId;
            this.connected = true;
            this.conn.connected = true;
            await this.flushPendingOfflineActions();
            if (callback) {
              callback({
                success: true,
                roomCode,
                sessionToken: `ble_token_${this.selfUserId}`,
              });
            }
            return;
          } catch (err: any) {
            if (this.cachedRoom && this.cachedRoom.code === roomCode) {
              this.connected = false;
              this.conn.connected = false;
              this.scheduleAutoReconnect();
              if (callback) {
                callback({
                  success: true,
                  roomCode,
                  sessionToken: `ble_token_${this.selfUserId}`,
                });
              }
              return;
            }
            if (callback) {
              callback({
                success: false,
                message: `蓝牙重连失败: ${err?.message || String(err)}`,
              });
            }
            return;
          }
        }

        if (this.cachedRoom && this.cachedRoom.code === roomCode) {
          if (callback) {
            callback({
              success: true,
              roomCode,
              sessionToken: `ble_token_${this.selfUserId}`,
            });
          }
          return;
        }

        if (callback) {
          callback({
            success: false,
            message: '本地房间已解散或未连接到目标蓝牙桌台',
          });
        }
        return;
      }

      if (event === 'leave_room') {
        this.conn.clearAutoReconnect();
        this.leaving = true;
        this.handshake.cancelPendingHandshakes();
        this.queue.cancelFlushing();
        const isAlreadyFinished = this.cachedRoom?.status === 'finished';
        this.cachedRoom = null;

        if (this.isHost) {
          safeInvoke('ble_stop_advertising');
          if (this.currentRoomCode) {
            LocalHostEngine.clearStorage(this.currentRoomCode);
          }
          resetSharedHostEngine();
          this.hostEngine = null;
        } else if (this.currentRoomCode) {
          if (isAlreadyFinished || !this.connected) {
            safeInvoke('ble_disconnect_peripheral');
            this.cleanupOnLeave();
            if (callback) {
              callback({ success: true });
            }
            return;
          }

          const leaveAction = this.handshake.createLeaveActionBytes();
          let confirmed = false;
          try {
            const ackTimeout = typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 100 : 1500;
            const ackPromise = new Promise<boolean>((resolve) => {
              let timer: ReturnType<typeof setTimeout> | null = null;
              const onAck = () => {
                if (timer) clearTimeout(timer);
                this.off('leave_ack', onAck);
                resolve(true);
              };
              this.on('leave_ack', onAck);
              timer = setTimeout(() => {
                this.off('leave_ack', onAck);
                resolve(false);
              }, ackTimeout);
            });

            safeInvoke('ble_send_command_to_host', {
              payload: Array.from(leaveAction),
            });

            confirmed = await ackPromise;
          } catch (e) {
            console.warn('[BleTransport] Error sending leave action:', e);
          }

          safeInvoke('ble_disconnect_peripheral');

          if (!confirmed && callback) {
            callback({
              success: false,
              message: '退房超时，房主可能未确认席位释放',
            });
            this.cleanupOnLeave();
            return;
          }
        }

        this.cleanupOnLeave();
        if (callback) {
          callback({ success: true });
        }
        return;
      }

      // Game actions
      let actionType: BleActionType | null = null;
      let ballNumber: number | undefined;
      let cardIndex: number | undefined;
      let cardId: string | undefined;
      let targetUserId: string | undefined;
      let cardsPerPlayer: number | undefined;

      switch (event) {
        case 'start_game':
          actionType = BleActionType.START_GAME;
          break;
        case 'pocket_ball':
          actionType = BleActionType.POCKET_BALL;
          cardId = payload?.cardId;
          ballNumber = payload?.ballNumber;
          if (cardId && this.cachedRoom) {
            const selfPlayer = this.cachedRoom.players.find((p) => p.userId === this.selfUserId);
            const foundCard = selfPlayer?.cards.find((c) => c.id === cardId);
            if (foundCard) {
              if (ballNumber === undefined) {
                ballNumber = foundCard.ballNumber;
              }
              cardIndex = cardToIndex(foundCard);
            }
          }
          break;
        case 'draw_penalty':
          actionType = BleActionType.DRAW_PENALTY;
          break;
        case 'accidental_pocket':
          actionType = BleActionType.ACCIDENTAL_POCKET;
          ballNumber = payload?.ballNumber;
          break;
        case 'break_pocket':
          actionType = BleActionType.BREAK_POCKET;
          ballNumber = payload?.ballNumber;
          break;
        case 'retract_ball':
          actionType = BleActionType.RETRACT_BALL;
          break;
        case 'referee_pocket_ball':
          actionType = BleActionType.REFEREE_POCKET;
          ballNumber = payload?.ballNumber;
          targetUserId = payload?.targetUserId;
          break;
        case 'referee_draw_penalty':
          actionType = BleActionType.REFEREE_PENALTY;
          targetUserId = payload?.targetUserId;
          break;
        case 'update_settings':
          actionType = BleActionType.UPDATE_SETTINGS;
          cardsPerPlayer = payload?.settings?.cardsPerPlayer ?? payload?.cardsPerPlayer;
          break;
        case 'kick_player':
          actionType = BleActionType.KICK_PLAYER;
          targetUserId = payload?.targetUserId;
          break;
        case 'restart_game':
          actionType = BleActionType.RESTART_GAME;
          break;
      }

      let targetSeatIndex: number | undefined;
      if (targetUserId && this.cachedRoom) {
        const foundIdx = this.cachedRoom.players.findIndex((p) => p.userId === targetUserId);
        if (foundIdx !== -1) {
          targetSeatIndex = foundIdx;
        }
      }

      if (actionType !== null) {
        const action: BleClientAction = {
          version: BLE_PROTOCOL_VERSION,
          revision: this.handshake.nextRevision() & 0xff,
          actionType,
          ballNumber,
          cardIndex,
          cardId,
          targetUserId,
          targetSeatIndex,
          cardsPerPlayer,
        };

        if (this.isHost && this.hostEngine) {
          const kickedPeerId =
            actionType === BleActionType.KICK_PLAYER && targetUserId
              ? this.handshake.userIdToPeerId.get(targetUserId) || targetUserId
              : null;

          const executed = this.hostEngine.executeAction(action, this.selfUserId, cardId, targetUserId);

          if (executed && kickedPeerId && targetUserId) {
            this.handshake.removeUser(targetUserId);
            const kickEvtBytes = this.sync.createKickEventBytes(this.currentRoomCode);
            safeInvoke('ble_notify_state_to_clients', {
              payload: Array.from(kickEvtBytes),
              targetPeerId: kickedPeerId,
            });
          }
        } else {
          const optimisticRoom = this.applyLocalOptimisticAction(action);
          if (optimisticRoom) {
            this.handleIncomingState(optimisticRoom, true);
          }
          this.queue.enqueueAction(action, this.currentRoomCode);
          this.queue.schedulePendingRetry(this.isHost, this.leaving, this.initialized, this.connected, () => {
            this.sendJoinHandshake();
            void this.flushPendingOfflineActions(true);
          });

          if (this.connected) {
            const bytes = encodeBleAction(action);
            safeInvoke('ble_send_command_to_host', {
              payload: Array.from(bytes),
            }).catch((err) => {
              console.warn('[BleTransport] Failed to send action to host:', err);
            });
          }
        }

        if (callback) {
          callback({ success: true });
        }
      } else if (callback) {
        callback({ success: true });
      }
    } catch (err: any) {
      console.error('[BleTransport] emit error:', err);
      if (callback) {
        callback({ success: false, message: err?.message || '操作失败' });
      }
    }
  }

  private cleanupOnLeave(): void {
    this.handshake.cancelPendingHandshakes();
    this.queue.cancelFlushing();
    this.sync.resetReassemblers();
    BleStorage.clearStoredDeviceId();
    this.clearCachedRoom();
    this.clearPendingActions();
    this.cachedRoom = null;
    this.currentRoomCode = '';
    this.leaving = false;
    this.isHost = false;
    this.conn.connectedDeviceId = null;
    this.connected = true;
    this.conn.connected = true;
    this.handshake.clearMappings();
  }
}
