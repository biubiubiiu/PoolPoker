/**
 * Virtual BLE Transport Layer for PoolPoker
 * Emulates the Socket.IO client interface over Bluetooth Low Energy.
 * Encodes client actions into ultra-compact binary and transforms incoming BLE states into standard Room models.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  BLE_PROTOCOL_VERSION,
  BleActionType,
  type BleClientAction,
  bleStateToClientRoom,
  cardToIndex,
  decodeBleRoomState,
  encodeBleAction,
} from '../../shared/types/bleProtocol';
import type { Room } from '../../shared/types/game';

type EventCallback = (...args: any[]) => void;

export class BleTransport {
  private listeners = new Map<string, Set<EventCallback>>();
  private currentRoomCode = '8848';
  private selfUserId = '';
  private playerName = '我';
  private revision = 0;
  private unlistenStateUpdate: UnlistenFn | null = null;
  public connected = false;
  private cachedRoom: Room | null = null;

  constructor(userId: string, playerName = '我') {
    this.selfUserId = userId;
    this.playerName = playerName;
  }

  public async init(): Promise<void> {
    if (this.unlistenStateUpdate) return;

    // 监听来自 Tauri Rust BLE 驱动的下行状态事件
    this.unlistenStateUpdate = await listen<number[]>('ble://state_updated', (event) => {
      try {
        const rawBytes = new Uint8Array(event.payload);
        const bleState = decodeBleRoomState(rawBytes);
        const clientRoom = bleStateToClientRoom(bleState, this.selfUserId, this.currentRoomCode, this.playerName);
        this.cachedRoom = clientRoom;
        this.emitLocal('room_updated', clientRoom);
      } catch (err) {
        console.error('[BleTransport] Failed to decode incoming BLE state:', err);
      }
    });

    this.connected = true;
    this.emitLocal('connect');
  }

  public connect(): this {
    if (!this.connected) {
      this.init();
    }
    return this;
  }

  public disconnect(): this {
    if (this.unlistenStateUpdate) {
      this.unlistenStateUpdate();
      this.unlistenStateUpdate = null;
    }
    this.connected = false;
    this.emitLocal('disconnect');
    return this;
  }

  public timeout(_ms: number): this {
    // Chainable method emulating socket.timeout(ms)
    return this;
  }

  public destroy(): void {
    this.disconnect();
    this.listeners.clear();
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

  /**
   * 拦截上层组件的业务事件并将其编码为极简 BLE 报文下发给 Rust 底层驱动
   */
  public async emit(event: string, payload?: any, callback?: EventCallback): Promise<void> {
    try {
      if (event === 'create_room') {
        const roomCode = payload?.roomCode || '8848';
        this.currentRoomCode = roomCode;
        if (payload?.name) this.playerName = payload.name;
        await invoke('ble_start_host', {
          hostUserId: this.selfUserId,
          hostName: this.playerName,
          roomCode,
        });
        if (callback) {
          callback({ success: true, roomCode, sessionToken: `ble_token_${this.selfUserId}` });
        }
        return;
      }

      if (event === 'join_room') {
        const roomCode = payload?.roomCode || '8848';
        this.currentRoomCode = roomCode;
        if (payload?.name) this.playerName = payload.name;
        try {
          await invoke('ble_connect_host', {
            userId: this.selfUserId,
            name: this.playerName,
            roomCode,
          });
          if (callback) {
            // Socket.IO timeout callback 签名: (err, res)
            callback(null, { success: true, roomCode, sessionToken: `ble_token_${this.selfUserId}` });
          }
        } catch (err: any) {
          console.error('[BleTransport] join_room failed:', err);
          if (callback) {
            callback(new Error(err?.message || String(err)), { success: false, message: String(err) });
          }
        }
        return;
      }

      if (event === 'rejoin_room') {
        const roomCode = payload?.roomCode || this.currentRoomCode;
        const targetUserId = payload?.userId || this.selfUserId;
        try {
          const bytesArray = await invoke<number[]>('ble_rejoin_room', {
            roomCode,
            userId: targetUserId,
          });
          const rawBytes = new Uint8Array(bytesArray);
          const bleState = decodeBleRoomState(rawBytes);
          const clientRoom = bleStateToClientRoom(bleState, this.selfUserId, roomCode, this.playerName);
          this.cachedRoom = clientRoom;
          this.emitLocal('room_updated', clientRoom);
          if (callback) {
            callback({
              success: true,
              roomCode,
              sessionToken: `ble_token_${this.selfUserId}`,
            });
          }
        } catch (err: any) {
          if (callback) {
            callback({
              success: false,
              message: err?.message || String(err) || '本地房间已解散或不存在',
            });
          }
        }
        return;
      }

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
          // 从已缓存的手牌中尝试获取 ballNumber / cardIndex
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

      if (actionType !== null) {
        const action: BleClientAction = {
          version: BLE_PROTOCOL_VERSION,
          revision: ++this.revision & 0xff,
          actionType,
          ballNumber,
          cardIndex,
          cardId,
          targetUserId,
          cardsPerPlayer,
        };

        const bytes = encodeBleAction(action);
        await invoke('ble_send_action', {
          payload: Array.from(bytes),
          cardId: cardId || '',
          targetUserId: targetUserId || '',
        });

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
