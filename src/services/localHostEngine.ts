/**
 * LocalHostEngine - 离线面对面模式下的房主端本地权威状态机
 *
 * 纯 TypeScript 实现，直接在前端宿主环境中运行，复用领域层状态机逻辑。
 */

import { getPocketedBallNumbers } from '../../server/gameEngine';
import { applyGameRoomCommand, type GameRoomCommand } from '../../server/gameRoomService';
import {
  BLE_PROTOCOL_VERSION,
  type BleClientAction,
  BleGameStatus,
  type BlePlayerSummary,
  type BleRoomState,
} from '../../shared/types/bleProtocol';
import type { Player, Room, ServerRoom } from '../../shared/types/game';
import {
  ballsToMask,
  cardToIndex,
  decodeBleAction,
  encodeBleRoomState,
  simpleHash8,
} from '../../shared/utils/bleCodec';

export type StateUpdateCallback = (targetUserId: string, stateBytes: Uint8Array, clientRoom: Room) => void;

export function createLocalRoom(hostUserId: string, hostName: string, roomCode = '8848'): ServerRoom {
  const hostPlayer: Player = {
    id: `ble_host_${hostUserId}`,
    userId: hostUserId,
    name: hostName,
    isHost: true,
    online: true,
    cardCount: 0,
    cards: [],
    pocketedCards: [],
    wins: 0,
    isWinner: false,
    totalScore: 0,
  };

  return {
    code: roomCode,
    revision: 0,
    hostUserId,
    hostSocketId: hostPlayer.id,
    settings: {
      cardsPerPlayer: 5,
      includeBlackEight: true,
      maxPlayers: 8,
    },
    status: 'waiting',
    roundCount: 0,
    deck: [],
    logs: [],
    players: [hostPlayer],
    gameHistory: [],
    accidentalBalls: [],
    breakBalls: [],
    winners: [],
    turnOrder: [],
    lastRoundScores: [],
  };
}

export function handleLocalCommand(room: ServerRoom, command: GameRoomCommand) {
  return applyGameRoomCommand(room, command);
}

/**
 * 将内部 ServerRoom 转为针对特定玩家脱敏的 BleRoomState (准备编码为 BLE 紧凑二进制帧)
 */
export function getLocalBleState(room: ServerRoom, targetUserId: string): BleRoomState {
  const pocketedBalls = getPocketedBallNumbers(room);
  const pocketedBallsMask = ballsToMask(pocketedBalls);

  let status = BleGameStatus.WAITING;
  if (room.status === 'playing') status = BleGameStatus.PLAYING;
  else if (room.status === 'finished') status = BleGameStatus.FINISHED;

  const foundIndex = room.players.findIndex((p) => p.userId === targetUserId);
  // 未知用户标记为 0xff (255)，绝不能回退到席位 0，防止泄露房主私有手牌
  const targetPlayerIndex = foundIndex !== -1 ? foundIndex : 0xff;
  const hostIndex = Math.max(
    0,
    room.players.findIndex((p) => p.userId === room.hostUserId)
  );

  const targetPlayer = foundIndex !== -1 ? room.players[foundIndex] : null;
  const selfHandCards = targetPlayer ? targetPlayer.cards.map((c) => cardToIndex(c)) : [];

  const isFinished = room.status === 'finished';
  const players: BlePlayerSummary[] = room.players.map((p) => {
    const roundScore = room.lastRoundScores?.find((rs) => rs.userId === p.userId)?.delta;
    return {
      userIdHash: simpleHash8(p.userId),
      userId: p.userId,
      name: p.name,
      cardCount: p.cards.length,
      isHost: p.userId === room.hostUserId,
      online: p.online !== false,
      isWinner: p.isWinner || false,
      wins: p.wins || 0,
      totalScore: p.totalScore || 0,
      pocketedCards: (p.pocketedCards || []).map((c) => cardToIndex(c)),
      revealedCards: isFinished ? (p.cards || []).map((c) => cardToIndex(c)) : undefined,
      roundScoreDelta: roundScore,
    };
  });

  const turnOrderSeats =
    room.turnOrder && room.turnOrder.length > 0
      ? room.turnOrder.map((uid) => room.players.findIndex((p) => p.userId === uid)).filter((idx) => idx !== -1)
      : undefined;

  let sceneEventKind: string | undefined;
  let sceneEventTargetSeat: number | undefined;
  let sceneEventBallNumber: number | undefined;
  if (room.sceneEvent) {
    sceneEventKind = room.sceneEvent.kind;
    if (room.sceneEvent.targetUserId) {
      const seatIdx = room.players.findIndex((p) => p.userId === room.sceneEvent?.targetUserId);
      if (seatIdx !== -1) sceneEventTargetSeat = seatIdx;
    }
    sceneEventBallNumber = room.sceneEvent.ballNumber;
  }

  const lastHistoryStep =
    room.gameHistory && room.gameHistory.length > 1 ? room.gameHistory[room.gameHistory.length - 1] : null;
  const lastActionText = lastHistoryStep?.actionText || undefined;

  return {
    version: BLE_PROTOCOL_VERSION,
    revision: (room.revision ?? 0) & 0xffff,
    status,
    pocketedBallsMask,
    roundCount: room.roundCount,
    deckRemaining: room.deck.length,
    cardsPerPlayer: room.settings?.cardsPerPlayer ?? 5,
    selfSeatIndex: targetPlayerIndex,
    hostSeatIndex: hostIndex,
    selfHandCards,
    turnOrderSeats,
    sceneEventKind,
    sceneEventTargetSeat,
    sceneEventBallNumber,
    players,
    lastActionText,
  };
}

const memoryHostRoomStorage = new Map<string, string>();

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
    this.saveToStorage();
    return this.broadcastState(hostUserId);
  }

  private saveToStorage(): void {
    if (!this.room) return;
    try {
      const data = JSON.stringify(this.room);
      memoryHostRoomStorage.set(`poolpoker_host_room_${this.room.code}`, data);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`poolpoker_host_room_${this.room.code}`, data);
      }
    } catch (_) {}
  }

  public restoreFromStorage(roomCode: string): boolean {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`poolpoker_host_room_${roomCode}`);
        if (raw) {
          this.room = JSON.parse(raw) as ServerRoom;
          return true;
        }
      }
    } catch (_) {}
    const mem = memoryHostRoomStorage.get(`poolpoker_host_room_${roomCode}`);
    if (mem) {
      try {
        this.room = JSON.parse(mem) as ServerRoom;
        return true;
      } catch (_) {}
    }
    return false;
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
      if (name && name !== '蓝牙球友') {
        existing.name = name;
      }
    } else {
      // 严禁在对局进行中或结算时插入 0 手牌新玩家，防止触发 checkGameWinners 0 手牌直接获胜漏洞
      if (this.room.status !== 'waiting') {
        return null;
      }
      const maxPlayers = this.room.settings?.maxPlayers || 8;
      if (this.room.players.length >= maxPlayers) {
        return null;
      }
      this.room.players.push({
        id: `ble_${userId}`,
        userId,
        name: name || `球友_${userId.slice(-4)}`,
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
   * 绑定物理蓝牙 peerId 与玩家真实身份 (CLIENT_JOIN 握手与 RPA 地址轮换重连恢复)
   */
  public bindPeerPlayer(
    peerId: string,
    userId: string,
    name: string
  ): { ok: boolean; reason?: 'playing' | 'full'; room?: Room } {
    if (!this.room) return { ok: false };

    const existingByUser = this.room.players.find((p) => p.userId === userId);
    if (existingByUser) {
      if (peerId !== userId) {
        const tempIdx = this.room.players.findIndex((p) => p.userId === peerId && p.cards.length === 0);
        if (tempIdx !== -1) {
          this.room.players.splice(tempIdx, 1);
        }
      }
      existingByUser.online = true;
      if (name) existingByUser.name = name;
      this.broadcastAll();
      return { ok: true, room: this.getStateForUser(userId).clientRoom };
    }

    const placeholder = this.room.players.find((p) => p.userId === peerId);
    if (placeholder) {
      placeholder.id = `ble_${userId}`;
      placeholder.userId = userId;
      if (name) placeholder.name = name;
      placeholder.online = true;
      if (this.room.turnOrder) {
        this.room.turnOrder = this.room.turnOrder.map((uid) => (uid === peerId ? userId : uid));
      }
      this.broadcastAll();
      return { ok: true, room: this.getStateForUser(userId).clientRoom };
    }

    if (this.room.status !== 'waiting') {
      return { ok: false, reason: 'playing' };
    }
    const maxPlayers = this.room.settings?.maxPlayers || 8;
    if (this.room.players.length >= maxPlayers) {
      return { ok: false, reason: 'full' };
    }

    const added = this.addPlayer(userId, name);
    return added ? { ok: true, room: added } : { ok: false };
  }

  /**
   * 移除主动退出的玩家 (若在准备阶段彻底删席释放名额；若在对局中则转为离线)
   */
  public removePlayer(userId: string): boolean {
    if (!this.room) return false;
    const idx = this.room.players.findIndex((p) => p.userId === userId);
    if (idx === -1) return false;

    if (this.room.status === 'waiting') {
      const [removed] = this.room.players.splice(idx, 1);
      if (this.room.turnOrder) {
        this.room.turnOrder = this.room.turnOrder.filter((id) => id !== userId);
      }
      this.broadcastAll();
      return true;
    }

    // 对局中退出的玩家转为离线状态
    this.room.players[idx].online = false;
    this.broadcastAll();
    return true;
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
    return this.executeAction(decodeBleAction(bytes), senderUserId, cardId, targetUserId);
  }

  /**
   * 直接执行已解析的客户端指令对象（房主本地直调无需经过二进制编解码自环）
   */
  public executeAction(action: BleClientAction, senderUserId: string, cardId?: string, targetUserId?: string): boolean {
    if (!this.room) return false;
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
          actorSocketId: selfUser === this.room.hostUserId ? `ble_host_${selfUser}` : `ble_${selfUser}`,
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
      case 12: // LEAVE_ROOM
        return this.removePlayer(selfUser);
    }

    if (command) {
      return this.executeCommand(command, selfUser);
    }
    return false;
  }

  /**
   * 直接从内部 ServerRoom 生成针对指定玩家的无损脱敏 Room 视图（保留完整日志、真实卡牌 ID 与玩家身份）
   */
  public getDirectClientRoom(userId: string): Room {
    if (!this.room) {
      throw new Error('Local room is not initialized');
    }
    const room = this.room;
    const pocketedBallNumbers = getPocketedBallNumbers(room);
    const lastHistoryStep =
      room.gameHistory && room.gameHistory.length > 1 ? room.gameHistory[room.gameHistory.length - 1] : null;
    const lastActionText = lastHistoryStep?.actionText || null;

    return {
      code: room.code,
      revision: room.revision ?? 0,
      sceneEvent: room.sceneEvent,
      hostUserId: room.hostUserId,
      hostSocketId: room.hostSocketId,
      settings: room.settings,
      status: room.status,
      roundCount: room.roundCount,
      deckCount: room.deck.length,
      logs: room.logs.slice(-15),
      winners: room.winners || [],
      pocketedBallNumbers,
      turnOrder: room.turnOrder && room.turnOrder.length > 0 ? room.turnOrder : room.players.map((p) => p.userId),
      players: room.players.map((p) => {
        const isSelf = p.userId === userId;
        return {
          id: p.id,
          userId: p.userId,
          name: p.name,
          isHost: p.userId === room.hostUserId,
          online: p.online !== false,
          cardCount: p.cards.length,
          cards: isSelf || room.status === 'finished' ? [...p.cards] : [],
          pocketedCards: [...p.pocketedCards],
          wins: p.wins || 0,
          isWinner: p.isWinner || false,
          totalScore: p.totalScore || 0,
        };
      }),
      lastRoundScores: room.lastRoundScores || [],
      lastActionText,
    };
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
    const clientRoom = this.getDirectClientRoom(userId);
    return { bleState, bytes, clientRoom };
  }

  /**
   * 向单个玩家推送状态更新（房主本人跳过无意义的 BLE 二进制编码）
   */
  private broadcastState(userId: string): Room {
    if (!this.room) {
      throw new Error('Local room is not initialized');
    }
    if (userId === this.room.hostUserId) {
      const clientRoom = this.getDirectClientRoom(userId);
      if (this.onStateUpdate) {
        this.onStateUpdate(userId, new Uint8Array(0), clientRoom);
      }
      return clientRoom;
    }
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
    this.saveToStorage();
    for (const player of this.room.players) {
      this.broadcastState(player.userId);
    }
  }

  public destroy(): void {
    this.room = null;
    this.onStateUpdate = null;
  }
}
