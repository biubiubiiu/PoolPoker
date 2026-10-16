/**
 * LocalHostEngine - 离线面对面模式下的房主端本地权威状态机
 *
 * 纯 TypeScript 实现，直接在前端/Web 环境中运行，复用 shared/engine/isomorphicEngine。
 * 彻底避免跨线程 UB 与内嵌 QuickJS 的性能与构建损耗。
 */

import type { GameRoomCommand } from '../../server/gameRoomService';
import { createLocalRoom, getLocalBleState, handleLocalCommand } from '../../shared/engine/isomorphicEngine';
import {
  type BleClientAction,
  type BleRoomState,
  bleStateToClientRoom,
  decodeBleAction,
  encodeBleRoomState,
} from '../../shared/types/bleProtocol';
import type { Room, ServerRoom } from '../../shared/types/game';

export type StateUpdateCallback = (targetUserId: string, stateBytes: Uint8Array, clientRoom: Room) => void;

export class LocalHostEngine {
  private room: ServerRoom | null = null;
  private onStateUpdate: StateUpdateCallback | null = null;

  constructor(callback?: StateUpdateCallback) {
    if (callback) {
      this.onStateUpdate = callback;
    }
  }

  public setStateUpdateCallback(callback: StateUpdateCallback): void {
    this.onStateUpdate = callback;
  }

  /**
   * 初始化创建本地房间
   */
  public initRoom(hostUserId: string, hostName: string, roomCode = '8848'): Room {
    this.room = createLocalRoom(hostUserId, hostName, roomCode);
    return this.broadcastState(hostUserId);
  }

  /**
   * 获取当前内部房间对象 (只读)
   */
  public getRawRoom(): ServerRoom | null {
    return this.room;
  }

  /**
   * 添加或恢复玩家入局
   */
  public addPlayer(userId: string, name: string): Room | null {
    if (!this.room) return null;

    const existing = this.room.players.find((p) => p.userId === userId);
    if (existing) {
      existing.online = true;
      existing.name = name || existing.name;
    } else {
      this.room.players.push({
        id: `ble_${userId}`,
        userId,
        name: name || `球友_${userId.slice(-4)}`,
        avatar: '🎱',
        isHost: false,
        online: true,
        cardCount: 0,
        cards: [],
        pocketedCards: [],
        wins: 0,
        isWinner: false,
        totalScore: 0,
      });
    }

    this.broadcastAll();
    const targetPlayer = this.room.players.find((p) => p.userId === userId);
    return targetPlayer ? this.getStateForUser(userId).clientRoom : null;
  }

  /**
   * 标记玩家离线
   */
  public setPlayerOffline(userId: string): void {
    if (!this.room) return;
    const player = this.room.players.find((p) => p.userId === userId);
    if (player) {
      player.online = false;
      this.broadcastAll();
    }
  }

  /**
   * 执行前端业务指令
   */
  public executeCommand(command: GameRoomCommand, _actorUserId: string): boolean {
    if (!this.room) return false;
    const res = handleLocalCommand(this.room, command);
    if (res.changed) {
      this.broadcastAll();
      return true;
    }
    return false;
  }

  /**
   * 执行来自 BLE 二进制数据帧的客户端指令
   */
  public executeBinaryAction(bytes: Uint8Array, senderUserId: string, cardId?: string, targetUserId?: string): boolean {
    if (!this.room) return false;
    const action: BleClientAction = decodeBleAction(bytes);
    const selfUser = senderUserId;
    const resolvedTargetUser =
      action.targetSeatIndex !== undefined && this.room.players[action.targetSeatIndex]
        ? this.room.players[action.targetSeatIndex].userId
        : targetUserId || selfUser;
    const tUser = resolvedTargetUser;

    let command: GameRoomCommand | null = null;
    switch (action.actionType) {
      case 1: // START_GAME
        command = { type: 'start_game', actorUserId: selfUser };
        break;
      case 2: // POCKET_BALL
        command = {
          type: 'pocket_ball',
          actorUserId: selfUser,
          cardId: cardId || '',
          ballNumber: action.ballNumber,
          cardIndex: action.cardIndex,
        };
        break;
      case 3: // DRAW_PENALTY
        command = { type: 'draw_penalty', actorUserId: selfUser };
        break;
      case 4: // ACCIDENTAL_POCKET
        command = { type: 'accidental_pocket', ballNumber: action.ballNumber ?? 0 };
        break;
      case 5: // BREAK_POCKET
        command = { type: 'break_pocket', ballNumber: action.ballNumber ?? 0 };
        break;
      case 6: // RETRACT_BALL
        command = { type: 'retract_ball' };
        break;
      case 7: // RESTART_GAME
        command = { type: 'restart_game', actorUserId: selfUser };
        break;
      case 8: // REFEREE_POCKET
        command = {
          type: 'referee_pocket_ball',
          targetUserId: tUser,
          ballNumber: action.ballNumber ?? 0,
        };
        break;
      case 9: // REFEREE_PENALTY
        command = { type: 'referee_draw_penalty', targetUserId: tUser };
        break;
      case 10: // UPDATE_SETTINGS
        command = {
          type: 'update_settings',
          actorUserId: selfUser,
          cardsPerPlayer: action.cardsPerPlayer ?? 5,
        };
        break;
      case 11: // KICK_PLAYER
        command = { type: 'kick_player', actorUserId: selfUser, targetUserId: tUser };
        break;
    }

    if (command) {
      return this.executeCommand(command, selfUser);
    }
    return false;
  }

  /**
   * 为指定玩家生成脱敏的 Client Room 视图与二进制报文
   */
  public getStateForUser(userId: string): { bleState: BleRoomState; bytes: Uint8Array; clientRoom: Room } {
    if (!this.room) {
      throw new Error('Local room is not initialized');
    }
    const bleState = getLocalBleState(this.room, userId);
    const bytes = encodeBleRoomState(bleState);
    const targetPlayer = this.room.players.find((p) => p.userId === userId);
    const clientRoom = bleStateToClientRoom(bleState, userId, this.room.code, targetPlayer?.name || '我');
    return { bleState, bytes, clientRoom };
  }

  /**
   * 向单个玩家推送状态更新
   */
  private broadcastState(userId: string): Room {
    const { bytes, clientRoom } = this.getStateForUser(userId);
    if (this.onStateUpdate) {
      this.onStateUpdate(userId, bytes, clientRoom);
    }
    return clientRoom;
  }

  /**
   * 向房间内全部玩家广播脱敏状态更新
   */
  public broadcastAll(): void {
    if (!this.room) return;
    for (const player of this.room.players) {
      this.broadcastState(player.userId);
    }
  }

  public destroy(): void {
    this.room = null;
    this.onStateUpdate = null;
  }
}
