/**
 * Virtual BLE Transport Layer for PoolPoker
 * Emulates the Socket.IO client interface over Bluetooth Low Energy and Local In-Memory Engine.
 *
 * Architecture:
 * - When hosting: LocalHostEngine (pure TypeScript isomorphic engine) runs directly in front-end.
 *   Simultaneously broadcasts as a BLE Peripheral (GATT Server) to accept connections from other phones.
 * - When acting as guest: connects to the host peripheral via native BLE Central stack and exchanges compact frames.
 * - Encodes/decodes ultra-compact binary BLE frames (30-80 bytes) without QuickJS or C runtime overhead.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  BLE_PROTOCOL_VERSION,
  BleActionType,
  BleChunkReassembler,
  type BleClientAction,
  BleHostEventCode,
  BleMessageType,
  bleStateToClientRoom,
  cardToIndex,
  decodeBleAction,
  decodeBleHostEvent,
  decodeBleJoin,
  decodeBleRoomState,
  encodeBleAction,
  encodeBleHostEvent,
  encodeBleJoin,
  splitIntoBleChunks,
} from '../../shared/types/bleProtocol';
import type { Room } from '../../shared/types/game';
import { getRandomInt } from '../../shared/utils/crypto';
import { BleScanner } from './bleScanner';
import { LocalHostEngine } from './localHostEngine';

type EventCallback = (...args: any[]) => void;

async function safeInvoke(cmd: string, args?: any): Promise<any> {
  try {
    return await invoke(cmd, args);
  } catch (_e) {
    // 非原生或纯网页环境安全静默
  }
}

let sharedHostEngine: LocalHostEngine | null = null;
const sharedPeerIdToUserId = new Map<string, string>();
const sharedUserIdToPeerId = new Map<string, string>();
let memoryDeviceIdStorage: string | null = null;

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
  clearStoredDeviceId();
}

export class BleTransport {
  private listeners = new Map<string, Set<EventCallback>>();
  private currentRoomCode = '8848';
  private selfUserId = '';
  private playerName = '我';
  private revision = 0;
  public connected = false;
  private connectedDeviceId: string | null = null;
  private isHost = false;
  private hostEngine: LocalHostEngine | null = null;
  private cachedRoom: Room | null = null;
  private leaving = false;
  private commandReassemblers = new Map<string, BleChunkReassembler>();
  private joinSendQueue: Promise<void> = Promise.resolve();

  // 物理连接与玩家映射 (Host 维护，与模块级共享表同步，支持重连恢复)
  private peerIdToUserId = sharedPeerIdToUserId;
  private userIdToPeerId = sharedUserIdToPeerId;

  // 原生 BLE 监听销毁句柄
  private unlistenCommand: UnlistenFn | null = null;
  private unlistenState: UnlistenFn | null = null;
  private unlistenClientConn: UnlistenFn | null = null;
  private unlistenClientDisconn: UnlistenFn | null = null;
  private unlistenPeripheralConn: UnlistenFn | null = null;
  private unlistenPeripheralDisconn: UnlistenFn | null = null;
  private initialized = false;

  // 下行分包重组器与批次计数器
  private stateReassembler = new BleChunkReassembler();
  private nextTransferId = 0;

  // 自动重连控制
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isReconnecting = false;

  constructor(userId: string, playerName = '我') {
    this.selfUserId = userId;
    this.playerName = playerName;
  }

  private sendJoinHandshake(): void {
    if (this.isHost || this.leaving || !this.connected || !this.currentRoomCode) return;
    const joinBytes = encodeBleJoin({
      version: BLE_PROTOCOL_VERSION,
      revision: ++this.revision & 0xffff,
      roomCode: Number(this.currentRoomCode) || 8848,
      userId: this.selfUserId,
      name: this.playerName || '球友',
    });
    // 上行握手使用默认 ATT MTU 23 的 20 字节载荷，兼容未协商大 MTU 的连接。
    const chunks = splitIntoBleChunks(joinBytes, this.nextTransferId++ & 0xff, 20, BleMessageType.CLIENT_COMMAND_CHUNK);
    this.joinSendQueue = this.joinSendQueue
      .catch(() => {})
      .then(async () => {
        for (const chunk of chunks) {
          if (this.leaving || !this.connected || !this.currentRoomCode) return;
          await safeInvoke('ble_send_command_to_host', { payload: Array.from(chunk) });
        }
      });
  }

  private bindHostEngineCallback(engine: LocalHostEngine): void {
    engine.setStateUpdateCallback((targetUserId, stateBytes, clientRoom) => {
      if (targetUserId === this.selfUserId) {
        // 房主本人只更新本地视图，严禁下发给客机
        this.handleIncomingState(clientRoom);
        return;
      }

      // 物理客机：定向查找对应的蓝牙 peerId 并精准 Notify，避免混淆手牌
      const targetPeerId = this.userIdToPeerId.get(targetUserId) || targetUserId;
      // 下发原生层，由 iOS/Android 原生层依据该连接实际 MTU / maximumUpdateValueLength 动态安全分包
      safeInvoke('ble_notify_state_to_clients', {
        payload: Array.from(stateBytes),
        targetPeerId,
      });
    });
  }

  private scheduleAutoReconnect(): void {
    if (this.isHost || this.leaving || !this.currentRoomCode || this.connected) {
      return;
    }
    const deviceId = getStoredDeviceId();
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
      void this.attemptReconnect();
    }, delay);
  }

  private clearAutoReconnect(): void {
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

  private async attemptReconnect(): Promise<void> {
    if (this.isHost || this.leaving || !this.currentRoomCode || this.connected || this.isReconnecting) {
      return;
    }
    const deviceId = getStoredDeviceId();
    if (!deviceId) {
      this.clearAutoReconnect();
      return;
    }

    this.isReconnecting = true;
    try {
      await safeInvoke('ble_connect_peripheral', { deviceId });
    } catch (err) {
      console.warn('[BleTransport] Auto-reconnect failed to invoke ble_connect_peripheral:', err);
      this.isReconnecting = false;
      if (!this.leaving && this.currentRoomCode && !this.connected) {
        this.reconnectAttempts++;
        this.scheduleAutoReconnect();
      }
      return;
    }

    const guardTimeout = typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 200 : 10000;
    setTimeout(() => {
      if (this.isReconnecting && !this.connected && !this.leaving && this.currentRoomCode) {
        this.isReconnecting = false;
        this.reconnectAttempts++;
        this.scheduleAutoReconnect();
      }
    }, guardTimeout);
  }

  public async init(): Promise<this> {
    this.connected = true;
    if (this.initialized) return this;
    this.initialized = true;

    // 1. 监听来自物理蓝牙从机发来的指令包或入房握手包 (房主模式接收)
    try {
      this.unlistenCommand = await listen<{ peer_id: string; payload: number[] }>('ble://command_received', (event) => {
        const { peer_id, payload } = event.payload;
        if (this.isHost && this.hostEngine && payload?.length > 1) {
          let reassembler = this.commandReassemblers.get(peer_id);
          if (!reassembler) {
            reassembler = new BleChunkReassembler();
            this.commandReassemblers.set(peer_id, reassembler);
          }
          const rawBytes = reassembler.processPacket(new Uint8Array(payload));
          if (!rawBytes) return;
          const msgType = rawBytes[1];

          if (msgType === BleMessageType.CLIENT_JOIN) {
            try {
              const join = decodeBleJoin(rawBytes);
              const oldUserId = this.peerIdToUserId.get(peer_id);
              if (oldUserId && oldUserId !== join.userId) {
                this.userIdToPeerId.delete(oldUserId);
              }
              this.peerIdToUserId.set(peer_id, join.userId);
              this.userIdToPeerId.set(join.userId, peer_id);

              const bindRes = this.hostEngine.bindPeerPlayer(peer_id, join.userId, join.name);
              if (!bindRes.ok) {
                this.peerIdToUserId.delete(peer_id);
                this.userIdToPeerId.delete(join.userId);
                const evtBytes = encodeBleHostEvent({
                  version: BLE_PROTOCOL_VERSION,
                  code:
                    bindRes.reason === 'full'
                      ? BleHostEventCode.JOIN_REJECTED_FULL
                      : BleHostEventCode.JOIN_REJECTED_PLAYING,
                  roomCode: Number(this.currentRoomCode) || 8848,
                });
                safeInvoke('ble_notify_state_to_clients', {
                  payload: Array.from(evtBytes),
                  targetPeerId: peer_id,
                });
              }
            } catch (err) {
              console.error('[BleTransport] Failed to decode CLIENT_JOIN:', err);
            }
            return;
          }

          const mappedSender = this.peerIdToUserId.get(peer_id) || peer_id;
          try {
            const action = decodeBleAction(rawBytes);
            this.hostEngine.executeBinaryAction(rawBytes, mappedSender);
            if (action.actionType === BleActionType.LEAVE_ROOM) {
              // 房主处理完退房与席位释放后，立即向客机单播 LEAVE_ACK 确认帧
              const ackBytes = encodeBleHostEvent({
                version: BLE_PROTOCOL_VERSION,
                code: BleHostEventCode.LEAVE_ACK,
                roomCode: Number(this.currentRoomCode) || 8848,
              });
              safeInvoke('ble_notify_state_to_clients', {
                payload: Array.from(ackBytes),
                targetPeerId: peer_id,
              });
              this.peerIdToUserId.delete(peer_id);
              this.userIdToPeerId.delete(mappedSender);
            }
          } catch (e) {
            console.error('[BleTransport] Failed to handle client action:', e);
          }
        }
      });

      // 2. 监听来自房主外设推送的下行状态包或控制帧 (客端模式接收)
      // 必须严格校验处于连接状态且有有效房间码，防止断开或退出后在途包拉回房间
      this.unlistenState = await listen<number[]>('ble://state_received', (event) => {
        if (!this.isHost && this.connected && this.currentRoomCode && event.payload?.length > 1) {
          try {
            const rawBytes = new Uint8Array(event.payload);
            const msgType = rawBytes[1];

            if (msgType === BleMessageType.HOST_EVENT_NOTIFY) {
              const hostEvt = decodeBleHostEvent(rawBytes);
              if (hostEvt.code === BleHostEventCode.LEAVE_ACK) {
                // 收到房主对退房指令的明确确认
                this.emitLocal('leave_ack', {});
                return;
              }
              const roomCodeStr = this.currentRoomCode || String(hostEvt.roomCode || '8848');
              this.clearAutoReconnect();
              this.stateReassembler.reset();
              clearStoredDeviceId();
              this.cachedRoom = null;
              this.currentRoomCode = '';
              this.connectedDeviceId = null;
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

            // 处理分包与单包重组
            const fullBytes = this.stateReassembler.processPacket(rawBytes);
            if (!fullBytes) {
              // 尚在等待其余分包，暂不解码
              return;
            }

            if (this.leaving) return;
            const bleState = decodeBleRoomState(fullBytes);
            // 若房主侧当前席位仍为默认占位昵称，主动补发一次 CLIENT_JOIN 同步真实 userId/昵称
            if (
              bleState.selfSeatIndex !== undefined &&
              bleState.selfSeatIndex < bleState.players.length &&
              bleState.players[bleState.selfSeatIndex]?.name === '蓝牙球友' &&
              this.playerName !== '蓝牙球友'
            ) {
              this.sendJoinHandshake();
            }

            const clientRoom = bleStateToClientRoom(bleState, this.selfUserId, this.currentRoomCode, this.playerName);
            this.handleIncomingState(clientRoom);
          } catch (err) {
            console.error('[BleTransport] Failed to decode incoming BLE state:', err);
          }
        }
      });

      // 3. 监听从机物理连接与断开事件 (房主模式)
      this.unlistenClientConn = await listen<{ peer_id: string }>('ble://client_connected', (event) => {
        if (this.isHost && this.hostEngine) {
          const peerId = event.payload.peer_id;
          const existingUserId = this.peerIdToUserId.get(peerId);
          if (existingUserId) {
            this.hostEngine.bindPeerPlayer(peerId, existingUserId, '');
          } else {
            // 向刚建立物理链路的客机单播当前房间公有状态（脱敏视界，绝不泄露房主私牌）
            const { bytes } = this.hostEngine.getStateForUser(peerId);
            safeInvoke('ble_notify_state_to_clients', {
              payload: Array.from(bytes),
              targetPeerId: peerId,
            });
          }
          // 统一等待客机发送 CLIENT_JOIN 握手报文识别真实 identity 后执行席位绑定与满员判定，
          // 严禁在此处根据临时 peerId 提前误发拒连通知，保证满员时老玩家重连能顺利恢复
        }
      });

      this.unlistenClientDisconn = await listen<{ peer_id: string }>('ble://client_disconnected', (event) => {
        if (this.isHost && this.hostEngine) {
          const peerId = event.payload.peer_id;
          this.commandReassemblers.delete(peerId);
          const mappedUserId = this.peerIdToUserId.get(peerId) || peerId;
          this.hostEngine.setPlayerOffline(mappedUserId);
          this.peerIdToUserId.delete(peerId);
          this.userIdToPeerId.delete(mappedUserId);
        }
      });

      // 4. 监听与房主物理断线与重连事件 (客端模式)
      this.unlistenPeripheralConn = await listen<{ peer_id: string }>('ble://peripheral_connected', (event) => {
        if (!this.isHost) {
          this.connected = true;
          this.connectedDeviceId = event.payload.peer_id;
          this.clearAutoReconnect();
          // 物理链路与特征值就绪后，向房主发送 CLIENT_JOIN 握手同步真实 userId 与昵称
          this.sendJoinHandshake();
          // 注意：物理连接就绪事件只更新底层链路状态，严禁在此发射 'connect' 事件，
          // 否则会触发 useGameRoom 的 handleConnect 重复发起 rejoin_room -> ble_connect_peripheral 循环
        }
      });

      this.unlistenPeripheralDisconn = await listen<{ peer_id: string }>('ble://peripheral_disconnected', (_event) => {
        if (!this.isHost) {
          this.connected = false;
          this.connectedDeviceId = null;
          this.isReconnecting = false;
          this.stateReassembler.reset();
          this.emitLocal('disconnect', 'transport close');
          if (!this.leaving && this.currentRoomCode && getStoredDeviceId()) {
            this.reconnectAttempts++;
            this.scheduleAutoReconnect();
          }
        }
      });
    } catch (_err) {
      // 桌面或非 Tauri 环境安全忽略
    }

    this.emitLocal('connect');
    return this;
  }

  public connect(): this {
    const wasConnected = this.connected;
    this.connected = true;
    if (!this.initialized) {
      this.init();
    } else if (!wasConnected) {
      this.emitLocal('connect');
    }
    return this;
  }

  public disconnect(): this {
    this.clearAutoReconnect();
    if (this.isHost) {
      safeInvoke('ble_stop_advertising');
    } else {
      safeInvoke('ble_disconnect_peripheral');
    }

    if (this.unlistenCommand) {
      this.unlistenCommand();
      this.unlistenCommand = null;
    }
    if (this.unlistenState) {
      this.unlistenState();
      this.unlistenState = null;
    }
    if (this.unlistenClientConn) {
      this.unlistenClientConn();
      this.unlistenClientConn = null;
    }
    if (this.unlistenClientDisconn) {
      this.unlistenClientDisconn();
      this.unlistenClientDisconn = null;
    }
    if (this.unlistenPeripheralConn) {
      this.unlistenPeripheralConn();
      this.unlistenPeripheralConn = null;
    }
    if (this.unlistenPeripheralDisconn) {
      this.unlistenPeripheralDisconn();
      this.unlistenPeripheralDisconn = null;
    }

    this.peerIdToUserId.clear();
    this.userIdToPeerId.clear();

    this.commandReassemblers.clear();
    this.initialized = false;
    this.connectedDeviceId = null;
    this.connected = false;
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

  public on(event: string, callback: EventCallback): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    return this;
  }

  public once(event: string, callback: EventCallback): this {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      callback(...args);
    };
    return this.on(event, wrapper);
  }

  public off(event: string, callback?: EventCallback): this {
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

  public handleIncomingState(room: Room): void {
    if (this.leaving || !this.connected || !this.currentRoomCode) {
      return;
    }
    this.cachedRoom = room;
    this.emitLocal('room_updated', room);
  }

  /**
   * 拦截上层组件的业务事件并派发给本地权威引擎或 BLE 原生层
   */
  public async emit(event: string, payload?: any, callback?: EventCallback): Promise<void> {
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
        this.hostEngine = getSharedHostEngine();

        // 绑定状态机更新 -> 区分房主与客机定向推送
        this.bindHostEngineCallback(this.hostEngine);

        const initialRoom = this.hostEngine.initRoom(this.selfUserId, this.playerName, roomCode);
        this.emitLocal('room_created', { roomCode });
        this.handleIncomingState(initialRoom);

        // 开启物理 BLE 广播与 GATT 服务
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
        this.clearAutoReconnect();
        const roomCode = payload?.roomCode || '8848';
        const scannedDevice = BleScanner.getInstance().findByRoomCode(roomCode)?.deviceId;
        const deviceId = payload?.deviceId || payload?.discoverySource?.deviceId || scannedDevice;
        this.currentRoomCode = roomCode;
        if (payload?.name) this.playerName = payload.name;
        this.isHost = false;

        // 仅在未指定物理外设且同进程沙盒内已有同房间号 Host 运行时直接内存加入
        const localHost = sharedHostEngine;
        if (!deviceId && localHost && localHost.getRawRoom()?.code === roomCode) {
          this.hostEngine = localHost;
          this.connected = true;
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

        // 否则通过物理蓝牙连入指定外设
        if (deviceId) {
          // 如果当前物理链路已连接该外设，直接使用当前连接，避免重复建连
          if (this.connected && this.connectedDeviceId === deviceId) {
            setStoredDeviceId(deviceId);
            this.sendJoinHandshake();
            if (callback) {
              callback(null, { success: true, roomCode, sessionToken: `ble_token_${this.selfUserId}` });
            }
            return;
          }

          try {
            await invoke('ble_connect_peripheral', { deviceId });
            this.connectedDeviceId = deviceId;
            setStoredDeviceId(deviceId);
            this.connected = true;
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
        this.clearAutoReconnect();
        const roomCode = payload?.roomCode || this.currentRoomCode;
        const targetUserId = payload?.userId || this.selfUserId;

        const engine = sharedHostEngine;
        if (engine && engine.getRawRoom()?.code === roomCode && engine.getRawRoom()?.hostUserId === targetUserId) {
          this.hostEngine = engine;
          this.isHost = true;
          this.connected = true;
          this.currentRoomCode = roomCode;

          // 重新绑定本地权威引擎状态回调，确保后续房主操作继续定向推送客机并更新自身
          this.bindHostEngineCallback(this.hostEngine);

          // 恢复房主广播
          safeInvoke('ble_start_advertising', {
            roomCode,
            hostName: this.playerName,
          });

          const clientRoom = engine.getDirectClientRoom(targetUserId);
          this.handleIncomingState(clientRoom);
          if (callback) {
            callback({
              success: true,
              roomCode,
              sessionToken: `ble_token_${this.selfUserId}`,
            });
          }
          return;
        }

        // 跨设备真实客机：从缓存或 payload 中提取上次连接的桌台 deviceId 重连物理蓝牙
        const lastDeviceId = payload?.deviceId || getStoredDeviceId();
        if (lastDeviceId) {
          this.currentRoomCode = roomCode;
          this.isHost = false;

          // 如果物理链路已连接到该外设，直接恢复房间会话，无需重复调用底层 GATT 连接
          if (this.connected && this.connectedDeviceId === lastDeviceId) {
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
            await invoke('ble_connect_peripheral', { deviceId: lastDeviceId });
            this.connectedDeviceId = lastDeviceId;
            this.connected = true;
            if (callback) {
              callback({
                success: true,
                roomCode,
                sessionToken: `ble_token_${this.selfUserId}`,
              });
            }
            return;
          } catch (err: any) {
            if (callback) {
              callback({
                success: false,
                message: `蓝牙重连失败: ${err?.message || String(err)}`,
              });
            }
            return;
          }
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
        this.clearAutoReconnect();
        this.leaving = true;
        this.cachedRoom = null;
        if (this.isHost) {
          safeInvoke('ble_stop_advertising');
          resetSharedHostEngine();
          this.hostEngine = null;
        } else if (this.currentRoomCode) {
          // 向房主发送主动退房指令，并等待房主确认 (LEAVE_ACK) 或超时，彻底杜绝指令丢弃竞态
          const leaveAction = encodeBleAction({
            version: BLE_PROTOCOL_VERSION,
            revision: ++this.revision & 0xffff,
            actionType: BleActionType.LEAVE_ROOM,
          });

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

          // 无论是否确认，最终都断开蓝牙外设
          safeInvoke('ble_disconnect_peripheral');

          if (!confirmed && callback) {
            callback({
              success: false,
              message: '退房超时，房主可能未确认席位释放',
            });
            this.stateReassembler.reset();
            this.commandReassemblers.clear();
            clearStoredDeviceId();
            this.cachedRoom = null;
            this.currentRoomCode = '';
            this.leaving = false;
            this.isHost = false;
            this.connectedDeviceId = null;
            this.connected = true;
            this.peerIdToUserId.clear();
            this.userIdToPeerId.clear();
            return;
          }
        }
        this.stateReassembler.reset();
        this.commandReassemblers.clear();
        clearStoredDeviceId();
        this.cachedRoom = null;
        this.currentRoomCode = '';
        this.leaving = false;
        this.isHost = false;
        this.connectedDeviceId = null;
        this.connected = true;
        this.peerIdToUserId.clear();
        this.userIdToPeerId.clear();
        if (callback) {
          callback({ success: true });
        }
        return;
      }

      // 游戏内具体交互指令
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
          revision: ++this.revision & 0xff,
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
              ? this.userIdToPeerId.get(targetUserId) || targetUserId
              : null;

          // 房主直接调用本地权威状态机处理，无需二进制编解码自环
          const executed = this.hostEngine.executeAction(action, this.selfUserId, cardId, targetUserId);

          if (executed && kickedPeerId && targetUserId) {
            this.userIdToPeerId.delete(targetUserId);
            this.peerIdToUserId.delete(kickedPeerId);
            const kickEvtBytes = encodeBleHostEvent({
              version: BLE_PROTOCOL_VERSION,
              code: BleHostEventCode.KICKED,
              roomCode: Number(this.currentRoomCode) || 8848,
            });
            safeInvoke('ble_notify_state_to_clients', {
              payload: Array.from(kickEvtBytes),
              targetPeerId: kickedPeerId,
            });
          }
        } else {
          if (!this.connected) {
            if (callback) {
              callback({ success: false, message: '与房主蓝牙连接已断开，请重新连接' });
            }
            return;
          }
          // 客端通过物理蓝牙写入房主外设
          const bytes = encodeBleAction(action);
          safeInvoke('ble_send_command_to_host', {
            payload: Array.from(bytes),
          });
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
}
