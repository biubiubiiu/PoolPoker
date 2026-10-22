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
} from '../../shared/types/bleProtocol';
import type { Room } from '../../shared/types/game';
import {
  BleChunkReassembler,
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
} from '../../shared/utils/bleCodec';
import { getRandomHex, getRandomInt, getRandomUUID } from '../../shared/utils/crypto';
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

const memoryRoomStorage = new Map<string, string>();
const memoryPendingActionsStorage = new Map<string, string>();

export function resetSharedHostEngine(): void {
  if (sharedHostEngine) {
    sharedHostEngine.destroy();
    sharedHostEngine = null;
  }
  sharedPeerIdToUserId.clear();
  sharedUserIdToPeerId.clear();
  clearStoredDeviceId();
  memoryRoomStorage.clear();
  memoryPendingActionsStorage.clear();
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

  // 离线动作队列与同步
  private pendingOfflineActions: BleClientAction[] = [];
  private isFlushingActions = false;
  private pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;

  // A suspended WebView can lose writes while GATT still reports connected.
  // Only ball recordings are safe to retry using the existing protocol: the
  // host's pocketed-ball set makes them idempotent. Penalties/undo need IDs/ACKs.
  private isRetryableRecording(action: BleClientAction): boolean {
    return [
      BleActionType.POCKET_BALL,
      BleActionType.REFEREE_POCKET,
      BleActionType.ACCIDENTAL_POCKET,
      BleActionType.BREAK_POCKET,
    ].includes(action.actionType);
  }

  private schedulePendingRetry(): void {
    if (this.pendingRetryTimer || this.isHost || this.leaving || !this.initialized || !this.connected) return;
    if (!this.pendingOfflineActions.some((action) => this.isRetryableRecording(action))) return;
    this.pendingRetryTimer = setTimeout(() => {
      this.pendingRetryTimer = null;
      if (
        !this.connected ||
        this.leaving ||
        !this.pendingOfflineActions.some((action) => this.isRetryableRecording(action))
      )
        return;
      this.sendJoinHandshake();
      void this.flushPendingOfflineActions(true);
    }, 1500);
  }

  private clearPendingRetry(): void {
    if (this.pendingRetryTimer) clearTimeout(this.pendingRetryTimer);
    this.pendingRetryTimer = null;
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible' || this.leaving || !this.currentRoomCode) return;
    if (this.isHost) {
      // Refresh every subscribed guest, even when lock/unlock never disconnected GATT.
      this.hostEngine?.broadcastAll();
    } else if (this.connected) {
      this.sendJoinHandshake();
      void this.joinSendQueue.then(() => this.flushPendingOfflineActions(true));
    }
  };

  constructor(userId: string, playerName = '我') {
    this.selfUserId = userId;
    this.playerName = playerName;
  }

  private getStorageKey(suffix: string): string {
    return `poolpoker_ble_${this.currentRoomCode}_${suffix}`;
  }

  private saveCachedRoom(): void {
    if (!this.cachedRoom) return;
    try {
      const data = JSON.stringify(this.cachedRoom);
      memoryRoomStorage.set(this.getStorageKey('cached_room'), data);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.getStorageKey('cached_room'), data);
      }
    } catch (e) {
      console.warn('[BleTransport] Failed to cache room to localStorage:', e);
    }
  }

  private loadCachedRoom(): Room | null {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.getStorageKey('cached_room'));
        if (raw) return JSON.parse(raw) as Room;
      }
    } catch (_) {}
    const mem = memoryRoomStorage.get(this.getStorageKey('cached_room'));
    if (mem) {
      try {
        return JSON.parse(mem) as Room;
      } catch (_) {}
    }
    return null;
  }

  private clearCachedRoom(): void {
    memoryRoomStorage.delete(this.getStorageKey('cached_room'));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.getStorageKey('cached_room'));
      }
    } catch (_) {}
  }

  private savePendingActions(): void {
    try {
      const data = JSON.stringify(this.pendingOfflineActions);
      memoryPendingActionsStorage.set(this.getStorageKey('pending_actions'), data);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.getStorageKey('pending_actions'), data);
      }
    } catch (e) {
      console.warn('[BleTransport] Failed to save pending actions:', e);
    }
  }

  private loadPendingActions(): BleClientAction[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(this.getStorageKey('pending_actions'));
        if (raw) return JSON.parse(raw) as BleClientAction[];
      }
    } catch (_) {}
    const mem = memoryPendingActionsStorage.get(this.getStorageKey('pending_actions'));
    if (mem) {
      try {
        return JSON.parse(mem) as BleClientAction[];
      } catch (_) {}
    }
    return [];
  }

  private clearPendingActions(): void {
    memoryPendingActionsStorage.delete(this.getStorageKey('pending_actions'));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.getStorageKey('pending_actions'));
      }
    } catch (_) {}
    this.pendingOfflineActions = [];
  }

  public async flushPendingOfflineActions(retryOnly = false): Promise<void> {
    if (this.isHost || !this.connected || this.leaving || this.isFlushingActions) return;
    if (this.pendingOfflineActions.length === 0) {
      this.pendingOfflineActions = this.loadPendingActions();
    }
    if (this.pendingOfflineActions.length === 0) return;

    this.isFlushingActions = true;
    try {
      // Serialize after CLIENT_JOIN; sending before seat binding loses identity.
      await this.joinSendQueue;
      const actionsToSend = this.pendingOfflineActions.filter(
        (action) => !retryOnly || this.isRetryableRecording(action)
      );
      for (const action of actionsToSend) {
        if (!this.connected || this.leaving) break;
        const bytes = encodeBleAction(action);
        await safeInvoke('ble_send_command_to_host', {
          payload: Array.from(bytes),
        });
        await new Promise((r) => setTimeout(r, 60));
      }
    } catch (err) {
      console.warn('[BleTransport] Error flushing pending actions:', err);
    } finally {
      this.isFlushingActions = false;
      this.schedulePendingRetry();
    }
  }

  /**
   * 客机本地乐观应用操作（即刻消除手牌与更新落袋球，实现 0ms 响应与完全离线记牌）
   */
  public applyLocalOptimisticAction(action: BleClientAction, targetRoom?: Room): Room | null {
    if (!targetRoom && !this.cachedRoom) {
      this.cachedRoom = this.loadCachedRoom();
    }
    // Never mutate a snapshot already published to Vue. Mutating the raw object
    // bypasses its reactive proxy, and assigning it again does not trigger a render.
    // Incoming remote snapshots are private until replay completes, so targetRoom
    // can still be updated in place while overlaying pending actions.
    const room = targetRoom || (this.cachedRoom ? (JSON.parse(JSON.stringify(this.cachedRoom)) as Room) : null);
    if (!room) return null;

    let ballNumber = action.ballNumber;
    const actorUserId = this.selfUserId;
    const selfPlayer = room.players.find((p) => p.userId === actorUserId);

    if (action.actionType === BleActionType.POCKET_BALL) {
      if (selfPlayer) {
        let card = action.cardId ? selfPlayer.cards.find((c) => c.id === action.cardId) : undefined;
        if (!card && ballNumber !== undefined) {
          card = selfPlayer.cards.find((c) => c.ballNumber === ballNumber);
        }
        if (card) {
          ballNumber = card.ballNumber;
          const targetCardId = card.id;
          selfPlayer.cards = selfPlayer.cards.filter((c) => c.id !== targetCardId);
          if (!selfPlayer.pocketedCards.some((c) => c.id === targetCardId)) {
            selfPlayer.pocketedCards.push(card);
          }
          selfPlayer.cardCount = selfPlayer.cards.length;
        }
      }
      if (ballNumber !== undefined && !room.pocketedBallNumbers.includes(ballNumber)) {
        room.pocketedBallNumbers.push(ballNumber);
        room.pocketedBallNumbers.sort((a, b) => a - b);
      }
      if (selfPlayer && ballNumber !== undefined) {
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `🎯 ${selfPlayer.name} 打进 ${ballNumber}号球，消去对应卡牌`,
        });
      }
    } else if (action.actionType === BleActionType.REFEREE_POCKET) {
      const targetUserId =
        action.targetUserId ||
        (action.targetSeatIndex !== undefined && room.players[action.targetSeatIndex]
          ? room.players[action.targetSeatIndex].userId
          : undefined) ||
        actorUserId;
      const targetPlayer = room.players.find((p) => p.userId === targetUserId);
      if (ballNumber !== undefined && !room.pocketedBallNumbers.includes(ballNumber)) {
        room.pocketedBallNumbers.push(ballNumber);
        room.pocketedBallNumbers.sort((a, b) => a - b);
      }
      if (targetPlayer) {
        if (targetPlayer.cards.length > 0) {
          const cardIdx = targetPlayer.cards.findIndex((c) => c.ballNumber === ballNumber);
          if (cardIdx !== -1) {
            const [pocketedCard] = targetPlayer.cards.splice(cardIdx, 1);
            targetPlayer.pocketedCards.push(pocketedCard);
          }
        }
        targetPlayer.cardCount = Math.max(0, targetPlayer.cardCount - 1);
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `⚖️ 裁判代记：${targetPlayer.name} 打进 ${ballNumber}号球`,
        });
      }
    } else if (action.actionType === BleActionType.BREAK_POCKET) {
      if (ballNumber !== undefined && !room.pocketedBallNumbers.includes(ballNumber)) {
        room.pocketedBallNumbers.push(ballNumber);
        room.pocketedBallNumbers.sort((a, b) => a - b);
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `🎱 开球进球：${ballNumber}号球落袋`,
        });
      }
    } else if (action.actionType === BleActionType.ACCIDENTAL_POCKET) {
      if (ballNumber !== undefined && !room.pocketedBallNumbers.includes(ballNumber)) {
        room.pocketedBallNumbers.push(ballNumber);
        room.pocketedBallNumbers.sort((a, b) => a - b);
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `🎱 事故球：${ballNumber}号球误进`,
        });
      }
    } else if (
      action.actionType === BleActionType.DRAW_PENALTY ||
      action.actionType === BleActionType.REFEREE_PENALTY
    ) {
      const targetUserId = action.targetUserId || actorUserId;
      const targetPlayer = room.players.find((p) => p.userId === targetUserId);
      if (targetPlayer) {
        targetPlayer.cardCount += 1;
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `⚠️ ${targetPlayer.name} 犯规，罚抽 1 张扑克牌`,
        });
      }
    }

    // 判定胜负条件
    const pocketedSet = new Set(room.pocketedBallNumbers);
    let hasWinner = false;
    for (const p of room.players) {
      if (p.cards.length > 0) {
        const activeCards = p.cards.filter((c) => !pocketedSet.has(c.ballNumber));
        if (activeCards.length === 0) {
          p.isWinner = true;
          hasWinner = true;
          if (!room.winners.some((w) => w.userId === p.userId)) {
            room.winners.push({
              id: p.id,
              userId: p.userId,
              name: p.name,
              wins: (p.wins || 0) + 1,
            });
          }
        }
      }
    }
    if (hasWinner) {
      room.status = 'finished';
    }

    room.revision = (room.revision || 0) + 1;
    if (ballNumber !== undefined) {
      room.sceneEvent = {
        id: getRandomUUID(),
        kind: 'pocket_ball',
        revision: room.revision,
        targetUserId: action.targetUserId || actorUserId,
        ballNumber,
      };
    }

    if (room.logs.length > 50) {
      room.logs = room.logs.slice(-50);
    }

    return room;
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
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

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

            // Never replay previous-round recordings into a new deal.
            if (this.cachedRoom && this.cachedRoom.roundCount !== clientRoom.roundCount) {
              this.clearPendingActions();
              this.clearPendingRetry();
            }

            // 对齐离线暂存动作：若房主已确认并纳入权威落袋球，从本地暂存中安全剔除
            if (this.pendingOfflineActions.length === 0) {
              this.pendingOfflineActions = this.loadPendingActions();
            }
            if (this.pendingOfflineActions.length > 0) {
              const pocketedSet = new Set(clientRoom.pocketedBallNumbers);
              this.pendingOfflineActions = this.pendingOfflineActions.filter((act) => {
                if (act.ballNumber !== undefined && pocketedSet.has(act.ballNumber)) {
                  return false;
                }
                return true;
              });
              this.savePendingActions();

              // 房主若尚未处理完离线重放指令，在本地权威视图上继续垫高，杜绝手牌闪烁回弹
              for (const act of this.pendingOfflineActions) {
                this.applyLocalOptimisticAction(act, clientRoom);
              }
            }

            this.handleIncomingState(clientRoom);
            // A fresh host snapshot is also a liveness signal, not just reconnect.
            this.schedulePendingRetry();
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
      this.unlistenPeripheralConn = await listen<{ peer_id: string }>('ble://peripheral_connected', async (event) => {
        if (!this.isHost) {
          this.connected = true;
          this.connectedDeviceId = event.payload.peer_id;
          this.clearAutoReconnect();
          // 物理链路与特征值就绪后，向房主发送 CLIENT_JOIN 握手同步真实 userId 与昵称
          this.sendJoinHandshake();
          await this.flushPendingOfflineActions();
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
          this.clearPendingRetry();
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
    this.clearPendingRetry();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
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

  public handleIncomingState(room: Room, force = false): void {
    if (this.leaving || (!this.connected && !force) || !this.currentRoomCode) {
      return;
    }
    this.cachedRoom = room;
    this.saveCachedRoom();
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

        // 跨设备真实客机：从缓存或 payload 中提取上次连接的桌台 deviceId 重连物理蓝牙
        const lastDeviceId = payload?.deviceId || getStoredDeviceId();
        this.currentRoomCode = roomCode;
        this.isHost = false;

        if (!this.cachedRoom) {
          this.cachedRoom = this.loadCachedRoom();
        }
        if (this.cachedRoom && this.cachedRoom.code === roomCode) {
          if (this.cachedRoom.status === 'finished') {
            this.clearCachedRoom();
            this.cachedRoom = null;
            clearStoredDeviceId();
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
          // 如果物理链路已连接到该外设，直接恢复房间会话，无需重复调用底层 GATT 连接
          if (this.connected && this.connectedDeviceId === lastDeviceId) {
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
            await invoke('ble_connect_peripheral', { deviceId: lastDeviceId });
            this.connectedDeviceId = lastDeviceId;
            this.connected = true;
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
            // 房主锁屏时底层物理连接失败，但客机依然保持离线本地会话与记牌能力！
            if (this.cachedRoom && this.cachedRoom.code === roomCode) {
              this.connected = false;
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
        this.clearAutoReconnect();
        this.leaving = true;
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
          // 如果当前对局已完结，退房为单向完结离开，无需阻塞等待房主席位确认
          if (isAlreadyFinished || !this.connected) {
            safeInvoke('ble_disconnect_peripheral');
            this.stateReassembler.reset();
            this.commandReassemblers.clear();
            clearStoredDeviceId();
            this.clearCachedRoom();
            this.clearPendingActions();
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
            this.clearCachedRoom();
            this.clearPendingActions();
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
        this.clearCachedRoom();
        this.clearPendingActions();
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
          // 客端模式：乐观更新本地状态 + 离线持久化队列 + 尝试上报房主
          const optimisticRoom = this.applyLocalOptimisticAction(action);
          if (optimisticRoom) {
            this.handleIncomingState(optimisticRoom, true);
          }
          this.pendingOfflineActions.push(action);
          this.savePendingActions();
          this.schedulePendingRetry();

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
}
