import type { Server, Socket } from 'socket.io';
import { CLIENT_TO_SERVER_EVENTS, SERVER_TO_CLIENT_EVENTS } from '../shared/types/protocol';
import type {
  AccidentalPocketPayload,
  BreakPocketPayload,
  ConfirmRestartPayload,
  CreateRoomPayload,
  DrawPenaltyPayload,
  JoinRoomPayload,
  KickPlayerPayload,
  LeaveRoomPayload,
  PocketBallPayload,
  RefereeDrawPenaltyPayload,
  RefereePocketBallPayload,
  RejoinRoomPayload,
  RequestRestartPayload,
  RestartGamePayload,
  RetractBallPayload,
  SocketCallbackResponse,
  StartGamePayload,
} from '../shared/types/socket';
import { applyGameRoomCommand } from './gameRoomService';
import { logSocketDisconnect } from './logger';
import { applyRoomLifecycleCommand, type RoomLifecycleResult } from './roomLifecycleService';
import { broadcastRoomState, getRoom, getSocketSession } from './roomManager';

function applyLifecycleResult(io: Server, socket: Socket, result: RoomLifecycleResult): void {
  if (result.socketData?.userName) socket.data.userName = result.socketData.userName;
  if (result.socketData?.userId) socket.data.userId = result.socketData.userId;

  for (const effect of result.socketEffects ?? []) {
    switch (effect.type) {
      case 'kick_player':
        for (const socketId of effect.socketIds) {
          const target = io.sockets.sockets.get(socketId);
          target?.leave(effect.roomCode);
          target?.emit(SERVER_TO_CLIENT_EVENTS.roomKicked, { roomCode: effect.roomCode });
        }
        break;
      case 'join_room':
        socket.join(effect.roomCode);
        break;
      case 'leave_room':
        socket.leave(effect.roomCode);
        break;
      case 'emit_room_created':
        socket.emit(SERVER_TO_CLIENT_EVENTS.roomCreated, { roomCode: effect.roomCode });
        break;
    }
  }

  if (result.broadcastRoomCode) {
    broadcastRoomState(io, result.broadcastRoomCode);
  }
}

function respond(callback: ((res: SocketCallbackResponse) => void) | undefined, result: RoomLifecycleResult): void {
  if (result.response) {
    callback?.(result.response);
  }
}

export function registerSocketHandlers(io: Server, socket: Socket): void {
  // 1. 创建房间
  socket.on(
    CLIENT_TO_SERVER_EVENTS.createRoom,
    (data: CreateRoomPayload, callback?: (res: SocketCallbackResponse) => void) => {
      const result = applyRoomLifecycleCommand({ type: 'create_room', socketId: socket.id, payload: data });
      respond(callback, result);
      applyLifecycleResult(io, socket, result);
    }
  );

  // 2. 加入房间
  socket.on(
    CLIENT_TO_SERVER_EVENTS.joinRoom,
    (data: JoinRoomPayload, callback?: (res: SocketCallbackResponse) => void) => {
      const result = applyRoomLifecycleCommand({ type: 'join_room', socketId: socket.id, payload: data });
      respond(callback, result);
      applyLifecycleResult(io, socket, result);
    }
  );

  // 2.1 尝试断线重连恢复
  socket.on(
    CLIENT_TO_SERVER_EVENTS.rejoinRoom,
    (data: RejoinRoomPayload, callback?: (res: SocketCallbackResponse) => void) => {
      const result = applyRoomLifecycleCommand({ type: 'rejoin_room', socketId: socket.id, payload: data });
      respond(callback, result);
      applyLifecycleResult(io, socket, result);
    }
  );

  // 3. 修改房间设置（发牌数/黑八/球色等）
  socket.on(CLIENT_TO_SERVER_EVENTS.updateSettings, (data) => {
    const result = applyRoomLifecycleCommand({ type: 'update_settings', socketId: socket.id, payload: data });
    applyLifecycleResult(io, socket, result);
  });

  // 4. 开始游戏 / 发牌
  socket.on(CLIENT_TO_SERVER_EVENTS.startGame, (data: StartGamePayload) => {
    const { roomCode } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const session = getSocketSession(socket.id);
    if (!session) return;

    const result = applyGameRoomCommand(room, { type: 'start_game', actorUserId: session.userId });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 5. 击球消除卡牌（进球）
  socket.on(CLIENT_TO_SERVER_EVENTS.pocketBall, (data: PocketBallPayload) => {
    const { roomCode, cardId } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const session = getSocketSession(socket.id);
    if (!session) return;

    const result = applyGameRoomCommand(room, { type: 'pocket_ball', actorUserId: session.userId, cardId });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 6. 犯规罚抽牌
  socket.on(CLIENT_TO_SERVER_EVENTS.drawPenalty, (data: DrawPenaltyPayload) => {
    const { roomCode } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const session = getSocketSession(socket.id);
    if (!session) return;

    const result = applyGameRoomCommand(room, { type: 'draw_penalty', actorUserId: session.userId });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 7. 误进无关球 / 裁判登记球入袋
  socket.on(CLIENT_TO_SERVER_EVENTS.accidentalPocket, (data: AccidentalPocketPayload) => {
    const { roomCode, ballNumber } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const result = applyGameRoomCommand(room, { type: 'accidental_pocket', ballNumber });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 7.1 开球进球 - 记录场上球入袋，不归入任何玩家手牌
  socket.on(CLIENT_TO_SERVER_EVENTS.breakPocket, (data: BreakPocketPayload) => {
    const { roomCode, ballNumber } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const result = applyGameRoomCommand(room, { type: 'break_pocket', ballNumber });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 8. 撤回上一步操作（整体回退到上一步状态）
  socket.on(CLIENT_TO_SERVER_EVENTS.retractBall, (data: RetractBallPayload) => {
    const { roomCode } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const result = applyGameRoomCommand(room, { type: 'retract_ball' });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 9. 记录进球 - 帮指定玩家消卡或记录全场进球
  socket.on(CLIENT_TO_SERVER_EVENTS.refereePocketBall, (data: RefereePocketBallPayload) => {
    const { roomCode, targetUserId, ballNumber } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const result = applyGameRoomCommand(room, {
      type: 'referee_pocket_ball',
      actorSocketId: socket.id,
      targetUserId,
      ballNumber,
    });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 10. 裁判代记 - 帮指定玩家罚抽卡
  socket.on(CLIENT_TO_SERVER_EVENTS.refereeDrawPenalty, (data: RefereeDrawPenaltyPayload) => {
    const { roomCode, targetUserId } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const result = applyGameRoomCommand(room, { type: 'referee_draw_penalty', targetUserId });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 11. 请求重新开始
  socket.on(CLIENT_TO_SERVER_EVENTS.requestRestart, (data: RequestRestartPayload) => {
    const { roomCode } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const result = applyGameRoomCommand(room, { type: 'request_restart' });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  // 12. 确认重新开始 / 重置房间
  socket.on(CLIENT_TO_SERVER_EVENTS.confirmRestart, (data: ConfirmRestartPayload) => {
    const { roomCode } = data;
    const room = getRoom(roomCode);
    if (!room) return;
    const session = getSocketSession(socket.id);
    if (!session) return;
    const result = applyGameRoomCommand(room, { type: 'restart_game', actorUserId: session.userId });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  socket.on(CLIENT_TO_SERVER_EVENTS.restartGame, (data: RestartGamePayload) => {
    const { roomCode } = data;
    const room = getRoom(roomCode);
    if (!room) return;
    const session = getSocketSession(socket.id);
    if (!session) return;
    const result = applyGameRoomCommand(room, { type: 'restart_game', actorUserId: session.userId });
    if (result.shouldBroadcast) broadcastRoomState(io, roomCode);
  });

  socket.on(CLIENT_TO_SERVER_EVENTS.kickPlayer, (data: KickPlayerPayload) => {
    const result = applyRoomLifecycleCommand({ type: 'kick_player', socketId: socket.id, payload: data });
    if (result.response?.message) socket.emit(SERVER_TO_CLIENT_EVENTS.errorMessage, result.response.message);
    applyLifecycleResult(io, socket, result);
  });

  // 13. 离开房间
  socket.on(CLIENT_TO_SERVER_EVENTS.leaveRoom, (data: LeaveRoomPayload) => {
    const result = applyRoomLifecycleCommand({ type: 'leave_room', socketId: socket.id, payload: data });
    applyLifecycleResult(io, socket, result);
  });

  // 14. 断开连接处理
  socket.on('disconnect', (reason?: string) => {
    logSocketDisconnect(socket, reason);
    const result = applyRoomLifecycleCommand({ type: 'disconnect', socketId: socket.id });
    applyLifecycleResult(io, socket, result);
  });
}
