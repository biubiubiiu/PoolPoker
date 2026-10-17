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
  type BleClientAction,
  BleHostEventCode,
  BleMessageType,
  bleStateToClientRoom,
  cardToIndex,
  decodeBleHostEvent,
  decodeBleJoin,
  decodeBleRoomState,
  encodeBleAction,
  encodeBleHostEvent,
  encodeBleJoin,
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
  private playerAvatar = '🎱';
  private revision = 0;
  public connected = false;
  private connectedDeviceId: string | null = null;
  private isHost = false;
  private hostEngine: LocalHostEngine | null = null;
  private cachedRoom: Room | null = null;

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

  constructor(userId: string, playerName = '我', playerAvatar = '🎱') {
    this.selfUserId = userId;
    this.playerName = playerName;
    this.playerAvatar = playerAvatar;
  }

  private sendJoinHandshake(): void {
    if (this.isHost || !this.connected || !this.currentRoomCode) return;
    const joinBytes = encodeBleJoin({
      version: BLE_PROTOCOL_VERSION,
      revision: ++this.revision & 0xffff,
      roomCode: Number(this.currentRoomCode) || 8848,
      userId: this.selfUserId,
      name: this.playerName || '球友',
      avatar: this.playerAvatar || '🎱',
    });
    safeInvoke('ble_send_command_to_host', {
      payload: Array.from(joinBytes),
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
      safeInvoke('ble_notify_state_to_clients', {
        payload: Array.from(stateBytes),
        targetPeerId,
      });
    });
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
          const rawBytes = new Uint8Array(payload);
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

              const bindRes = this.hostEngine.bindPeerPlayer(peer_id, join.userId, join.name, join.avatar || '🎱');
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
          this.hostEngine.executeBinaryAction(rawBytes, mappedSender);
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
              const roomCodeStr = this.currentRoomCode || String(hostEvt.roomCode || '8848');
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
                this.emitLocal('error_message', msg);
                this.emitLocal('room_kicked', { roomCode: roomCodeStr });
              }
              return;
            }

            const bleState = decodeBleRoomState(rawBytes);
            // 若房主侧当前席位仍为默认占位昵称，主动补发一次 CLIENT_JOIN 同步真实 userId/昵称/头像
            if (
              bleState.selfSeatIndex !== undefined &&
              bleState.selfSeatIndex < bleState.players.length &&
              bleState.players[bleState.selfSeatIndex]?.name === '蓝牙球友' &&
              this.playerName !== '蓝牙球友'
            ) {
              this.sendJoinHandshake();
            }

            const clientRoom = bleStateToClientRoom(
              bleState,
              this.selfUserId,
              this.currentRoomCode,
              this.playerName,
              this.playerAvatar
            );
            this.handleIncomingState(clientRoom);
          } catch (err) {
            console.error('[BleTransport] Failed to decode incoming BLE state:', err);
          }
        }
      });

      // 3. 监听从机连接与断开事件 (房主模式)
      this.unlistenClientConn = await listen<{ peer_id: string }>('ble://client_connected', (event) => {
        if (this.isHost && this.hostEngine) {
          const peerId = event.payload.peer_id;
          const existingUserId = this.peerIdToUserId.get(peerId) || peerId;
          this.peerIdToUserId.set(peerId, existingUserId);
          this.userIdToPeerId.set(existingUserId, peerId);
          const added = this.hostEngine.addPlayer(existingUserId, '蓝牙球友');
          if (!added) {
            // 若对局已开始且为未知设备，等待其发送 CLIENT_JOIN 验证是否为掉线重连老玩家
            const rawRoom = this.hostEngine.getRawRoom();
            if (
              rawRoom &&
              rawRoom.players.length >= (rawRoom.settings?.maxPlayers || 8) &&
              rawRoom.status === 'waiting'
            ) {
              const evtBytes = encodeBleHostEvent({
                version: BLE_PROTOCOL_VERSION,
                code: BleHostEventCode.JOIN_REJECTED_FULL,
                roomCode: Number(this.currentRoomCode) || 8848,
              });
              safeInvoke('ble_notify_state_to_clients', {
                payload: Array.from(evtBytes),
                targetPeerId: peerId,
              });
            }
          }
        }
      });

      this.unlistenClientDisconn = await listen<{ peer_id: string }>('ble://client_disconnected', (event) => {
        if (this.isHost && this.hostEngine) {
          const peerId = event.payload.peer_id;
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
          this.emitLocal('disconnect', 'transport close');
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
    if (!this.connected || !this.currentRoomCode) {
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
      if (event === 'create_room') {
        const roomCode = payload?.roomCode || String(getRandomInt(1000, 10000));
        this.currentRoomCode = roomCode;
        if (payload?.name) this.playerName = payload.name;
        if (payload?.avatar) this.playerAvatar = payload.avatar;

        this.isHost = true;
        this.connected = true;
        this.hostEngine = getSharedHostEngine();

        // 绑定状态机更新 -> 区分房主与客机定向推送
        this.bindHostEngineCallback(this.hostEngine);

        const initialRoom = this.hostEngine.initRoom(this.selfUserId, this.playerName, roomCode, this.playerAvatar);
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
        const roomCode = payload?.roomCode || '8848';
        const scannedDevice = BleScanner.getInstance().findByRoomCode(roomCode)?.deviceId;
        const deviceId = payload?.deviceId || payload?.discoverySource?.deviceId || scannedDevice;
        this.currentRoomCode = roomCode;
        if (payload?.name) this.playerName = payload.name;
        if (payload?.avatar) this.playerAvatar = payload.avatar;
        this.isHost = false;

        // 如果在同机单机沙盒模式下且有 Host 运行，优先直接加入
        if (sharedHostEngine?.getRawRoom()) {
          this.hostEngine = sharedHostEngine;
          this.connected = true;
          const updatedRoom = this.hostEngine.addPlayer(this.selfUserId, this.playerName, this.playerAvatar);
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
        const roomCode = payload?.roomCode || this.currentRoomCode;
        const targetUserId = payload?.userId || this.selfUserId;

        const engine = sharedHostEngine;
        if (engine && engine.getRawRoom()?.code === roomCode) {
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

          const { clientRoom } = engine.getStateForUser(targetUserId);
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
        if (this.isHost) {
          safeInvoke('ble_stop_advertising');
          resetSharedHostEngine();
          this.hostEngine = null;
        } else {
          safeInvoke('ble_disconnect_peripheral');
        }
        clearStoredDeviceId();
        this.cachedRoom = null;
        this.currentRoomCode = '';
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

        const bytes = encodeBleAction(action);

        if (this.isHost && this.hostEngine) {
          const kickedPeerId =
            actionType === BleActionType.KICK_PLAYER && targetUserId
              ? this.userIdToPeerId.get(targetUserId) || targetUserId
              : null;

          // 房主直接调用本地权威状态机处理
          const executed = this.hostEngine.executeBinaryAction(bytes, this.selfUserId, cardId, targetUserId);

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
