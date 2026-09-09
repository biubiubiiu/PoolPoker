import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { CLIENT_TO_SERVER_EVENTS as E, SERVER_TO_CLIENT_EVENTS as S } from '../shared/types/protocol';
import { AuthError, type AuthService, hash, type Session } from './auth/service';
import { appConfig } from './config';
import { applyGameRoomCommand, type GameRoomCommand } from './gameRoomService';
import type { Store } from './persistence/database';
import { applyRoomLifecycleCommand, type RoomLifecycleResult } from './roomLifecycleService';
import {
  broadcastRoomState,
  cancelRoomCleanup,
  checkAndManageRoomCleanup,
  getRoom,
  getSocketSession,
  rooms,
  socketIndex,
} from './roomManager';

export class RoomController {
  constructor(
    readonly store: Store,
    readonly auth: AuthService
  ) {}
  member(userId: string) {
    return Object.values(rooms).find((r) => r.players.some((p) => p.userId === userId));
  }
  persist() {
    const stored = this.store.db.prepare('SELECT code FROM rooms').all();
    for (const row of stored) if (!rooms[String(row.code)]) this.store.deleteRoom(String(row.code));
    for (const room of Object.values(rooms)) {
      const prior = this.store.db.prepare('SELECT expires FROM rooms WHERE code=?').get(room.code);
      const expires = room.players.some((p) => p.online !== false)
        ? null
        : Number(prior?.expires ?? Date.now() + (appConfig.room?.disconnect_timeout_ms ?? 3600000));
      this.store.saveRoom(room, expires);
      cancelRoomCleanup(room.code);
    }
  }
  atomic<T>(fn: () => T): T {
    const before = structuredClone(rooms),
      index = new Map(socketIndex);
    try {
      return this.store.transaction(() => {
        const result = fn();
        this.persist();
        return result;
      });
    } catch (e) {
      for (const code of Object.keys(rooms)) {
        cancelRoomCleanup(code);
        delete rooms[code];
      }
      Object.assign(rooms, before);
      socketIndex.clear();
      for (const [k, v] of index) socketIndex.set(k, v);
      for (const code of Object.keys(rooms)) checkAndManageRoomCleanup(code);
      throw e;
    }
  }
  execute(socketId: string, session: Session, event: string, data: Record<string, any>): RoomLifecycleResult {
    const user = this.auth.user(session.user_id),
      code = String(data.roomCode ?? '');
    const room = getRoom(code);
    if (event !== E.createRoom && !/^\d{4}$/.test(code)) throw new AuthError('请输入四位房间码');
    if (data.expectedRoomId && data.expectedRoomId !== room?.roomId)
      throw new AuthError('原房间已过期，房间码已被重新使用');
    if (
      session.role === 'play' &&
      (!room || room.roomId !== session.room_id || !room.players.some((p) => p.userId === user.id))
    )
      throw new AuthError('伴随授权已失效');
    const join = event === E.joinRoom || event === E.rejoinRoom;
    if (event === E.createRoom || join) {
      const active = this.member(user.id);
      if (active && active.code !== code) throw new AuthError('请先退出当前房间');
      if (event === E.createRoom && session.role !== 'manager') throw new AuthError('手表不能创建房间');
      const existing = room?.players.find((p) => p.userId === user.id);
      if (join && existing)
        return applyRoomLifecycleCommand({
          type: 'rejoin_room',
          socketId,
          payload: { roomCode: code, userId: user.id, sessionToken: existing.sessionToken! },
        });
      if (event === E.rejoinRoom) throw new AuthError('原座位已不存在，请重新加入');
      return applyRoomLifecycleCommand(
        event === E.createRoom
          ? {
              type: 'create_room',
              socketId,
              payload: {
                userId: user.id,
                name: user.nickname,
                avatar: '🎱',
                ballConfigKey: String(data.ballConfigKey ?? 'default'),
              },
            }
          : {
              type: 'join_room',
              socketId,
              payload: { roomCode: code, userId: user.id, name: user.nickname, avatar: '🎱' },
            }
      );
    }
    const member = getSocketSession(socketId);
    if (
      !room ||
      member?.roomCode !== code ||
      member.userId !== user.id ||
      !room.players.some((p) => p.userId === user.id)
    )
      throw new AuthError('请先加入这个房间', 403);
    if (
      [E.updateSettings, E.startGame, E.requestRestart, E.confirmRestart, E.restartGame, E.kickPlayer].includes(
        event as any
      ) &&
      room.hostUserId !== user.id
    )
      throw new AuthError('只有房主可以执行此操作', 403);
    if (data.expectedRevision !== undefined && data.expectedRevision !== (room.revision ?? 0))
      throw new AuthError('牌局已变化，请核对后重试', 409);
    if (event === E.updateSettings) {
      const settings = data.settings ?? {};
      if (
        settings.cardsPerPlayer !== undefined &&
        (!Number.isInteger(settings.cardsPerPlayer) || settings.cardsPerPlayer < 1 || settings.cardsPerPlayer > 13)
      )
        throw new AuthError('发牌数量无效');
      if (
        settings.maxPlayers !== undefined &&
        (!Number.isInteger(settings.maxPlayers) || settings.maxPlayers < 2 || settings.maxPlayers > 8)
      )
        throw new AuthError('人数上限无效');
      return applyRoomLifecycleCommand({ type: 'update_settings', socketId, payload: { roomCode: code, settings } });
    }
    if (event === E.leaveRoom || event === E.kickPlayer) {
      const target = event === E.leaveRoom ? user.id : String(data.targetUserId);
      const targets = [...socketIndex].filter(([, v]) => v.roomCode === code && v.userId === target).map(([id]) => id);
      const result = applyRoomLifecycleCommand(
        event === E.leaveRoom
          ? { type: 'leave_room', socketId, payload: { roomCode: code } }
          : { type: 'kick_player', socketId, payload: { roomCode: code, targetUserId: target } }
      );
      if (result.changed) {
        for (const id of targets) socketIndex.delete(id);
        result.socketEffects = [{ type: 'kick_player', roomCode: code, socketIds: targets }];
        room.gameHistory = [];
      }
      return result;
    }
    if (
      [E.accidentalPocket, E.breakPocket, E.refereePocketBall].includes(event as any) &&
      data.ballNumber === undefined
    )
      throw new AuthError('球号缺失');
    if (
      data.ballNumber !== undefined &&
      (!Number.isInteger(data.ballNumber) || data.ballNumber < 1 || data.ballNumber > 15)
    )
      throw new AuthError('球号无效');
    let command: GameRoomCommand;
    switch (event) {
      case E.startGame:
        command = { type: 'start_game', actorUserId: user.id };
        break;
      case E.pocketBall:
        command = { type: 'pocket_ball', actorUserId: user.id, cardId: String(data.cardId) };
        break;
      case E.drawPenalty:
        command = { type: 'draw_penalty', actorUserId: user.id };
        break;
      case E.accidentalPocket:
        command = { type: 'accidental_pocket', ballNumber: data.ballNumber };
        break;
      case E.breakPocket:
        command = { type: 'break_pocket', ballNumber: data.ballNumber };
        break;
      case E.retractBall:
        command = { type: 'retract_ball', expectedRevision: data.expectedRevision };
        break;
      case E.refereePocketBall:
        command = {
          type: 'referee_pocket_ball',
          actorSocketId: socketId,
          targetUserId: String(data.targetUserId),
          ballNumber: data.ballNumber,
        };
        break;
      case E.refereeDrawPenalty:
        command = { type: 'referee_draw_penalty', targetUserId: String(data.targetUserId) };
        break;
      case E.requestRestart:
        command = { type: 'request_restart' };
        break;
      case E.confirmRestart:
      case E.restartGame:
        command = { type: 'restart_game', actorUserId: user.id };
        break;
      default:
        throw new AuthError('不支持的操作');
    }
    const previousStatus = room.status;
    const result = applyGameRoomCommand(room, command);
    if (previousStatus !== 'finished' && room.status === 'finished')
      this.store.db.prepare('INSERT INTO outbox VALUES (?,?)').run(randomUUID(), JSON.stringify(room));
    return {
      changed: result.changed,
      broadcastRoomCode: result.shouldBroadcast ? code : undefined,
      response: { success: result.changed, message: result.changed ? undefined : '牌局已变化，操作未重复记录' },
    };
  }
}

export function registerSocketHandlers(io: Server, socket: Socket, controller: RoomController): void {
  let rateStart = Date.now(),
    rateCount = 0;
  for (const event of Object.values(E))
    socket.on(event, (data: Record<string, any> = {}, callback?: (r: any) => void) => {
      try {
        if (Date.now() - rateStart > 1000) {
          rateStart = Date.now();
          rateCount = 0;
        }
        if (++rateCount > 30) throw new AuthError('操作过于频繁');
        const session = controller.auth.byId(socket.data.authSessionId);
        if (!session) throw new AuthError('请重新登录', 401);
        if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 8192)
          throw new AuthError('请求无效');
        const room = getRoom(String(data.roomCode ?? ''));
        const commandId = typeof data.commandId === 'string' ? data.commandId : undefined;
        if (commandId && commandId.length > 100) throw new AuthError('命令编号无效');
        const payloadHash = hash(JSON.stringify({ event, data }));
        if (commandId && room?.roomId) {
          const receipt = controller.store.db
            .prepare('SELECT hash,result FROM receipts WHERE room_id=? AND user_id=? AND command_id=?')
            .get(room.roomId, session.user_id, commandId);
          if (receipt) {
            if (receipt.hash !== payloadHash) throw new AuthError('命令编号已被使用');
            callback?.(JSON.parse(String(receipt.result)));
            broadcastRoomState(io, room.code);
            return;
          }
        }
        const result = controller.atomic(() => {
          const revision = room?.revision ?? 0;
          const result = controller.execute(socket.id, session, event, data);
          const changedRoom = getRoom(result.broadcastRoomCode ?? String(data.roomCode ?? ''));
          if (result.changed && changedRoom && (changedRoom.revision ?? 0) === revision)
            changedRoom.revision = revision + 1;
          controller.persist();
          const response = {
            ...(result.response ?? { success: result.changed }),
            roomId: changedRoom?.roomId,
            sessionToken: session.role === 'play' ? socket.data.authToken : undefined,
          };
          result.response = response;
          if (commandId && changedRoom?.roomId)
            controller.store.db
              .prepare('INSERT INTO receipts VALUES (?,?,?,?,?)')
              .run(changedRoom.roomId, session.user_id, commandId, payloadHash, JSON.stringify(response));
          return result;
        });
        for (const effect of result.socketEffects ?? []) {
          if (effect.type === 'join_room') socket.join(effect.roomCode);
          if (effect.type === 'leave_room') socket.leave(effect.roomCode);
          if (effect.type === 'emit_room_created') socket.emit(S.roomCreated, { roomCode: effect.roomCode });
          if (effect.type === 'kick_player')
            for (const id of effect.socketIds) {
              const target = io.sockets.sockets.get(id);
              target?.leave(effect.roomCode);
              if (event !== E.leaveRoom || id !== socket.id)
                target?.emit(S.roomKicked, { roomCode: effect.roomCode, voluntary: event === E.leaveRoom });
            }
        }
        if (result.broadcastRoomCode) broadcastRoomState(io, result.broadcastRoomCode);
        callback?.(result.response ?? { success: result.changed });
      } catch (e) {
        const message = e instanceof Error ? e.message : '操作失败';
        if (callback) callback({ success: false, message });
        else socket.emit(S.errorMessage, message);
      }
    });
  socket.on('disconnect', () => {
    try {
      const result = controller.atomic(() => applyRoomLifecycleCommand({ type: 'disconnect', socketId: socket.id }));
      if (result.broadcastRoomCode) broadcastRoomState(io, result.broadcastRoomCode);
    } catch (e) {
      console.error('断线状态保存失败', e);
    }
  });
}
