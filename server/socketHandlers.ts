import crypto from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { Player, ServerRoom } from '../shared/types/game';
import { CLIENT_TO_SERVER_EVENTS, SERVER_TO_CLIENT_EVENTS } from '../shared/types/protocol';
import type {
  AccidentalPocketPayload,
  BreakPocketPayload,
  ConfirmRestartPayload,
  CreateRoomPayload,
  DrawPenaltyPayload,
  JoinRoomPayload,
  LeaveRoomPayload,
  PocketBallPayload,
  RefereeDrawPenaltyPayload,
  RefereePocketBallPayload,
  RejoinRoomPayload,
  RequestRestartPayload,
  RestartGamePayload,
  RetractBallPayload,
  StartGamePayload,
  UpdateSettingsPayload,
} from '../shared/types/socket';
import { isValidBallConfigKey } from './config';
import { addLog } from './gameEngine';
import { applyGameRoomCommand } from './gameRoomService';
import { logSocketDisconnect } from './logger';
import {
  broadcastRoomState,
  checkAndManageRoomCleanup,
  generateRoomCode,
  getRoom,
  getSocketSession,
  hasOtherSocketForUser,
  registerSocketSession,
  removeRoom,
  removeSocketSession,
  saveRoom,
} from './roomManager';

export function registerSocketHandlers(io: Server, socket: Socket): void {
  // 1. 创建房间
  socket.on(CLIENT_TO_SERVER_EVENTS.createRoom, (data: CreateRoomPayload, callback?: (res: any) => void) => {
    const { userId, name, avatar, ballConfigKey } = data;
    if (!userId || !name) {
      if (callback) callback({ success: false, message: '用户信息不完整' });
      return;
    }

    socket.data.userName = name;
    socket.data.userId = userId;

    const roomCode = generateRoomCode();
    const sessionToken = crypto.randomUUID();

    const newPlayer: Player = {
      id: socket.id,
      userId,
      sessionToken,
      name,
      avatar: avatar || '🎱',
      isHost: true,
      online: true,
      cardCount: 0,
      activeCardCount: 0,
      cards: [],
      pocketedCards: [],
      wins: 0,
      isWinner: false,
      totalScore: 0,
    };

    const validatedConfigKey = isValidBallConfigKey(ballConfigKey) ? ballConfigKey : 'default';

    const newRoom: ServerRoom = {
      code: roomCode,
      hostUserId: userId,
      hostSocketId: socket.id,
      status: 'waiting',
      players: [newPlayer],
      deck: [],
      accidentalBalls: [],
      breakBalls: [],
      winners: [],
      turnOrder: [],
      roundCount: 0,
      settings: {
        cardsPerPlayer: 5,
        maxPlayers: 8,
        includeBlackEight: true,
        ballConfigKey: validatedConfigKey,
      },
      logs: [],
      lastRoundScores: [],
      gameHistory: [],
    };

    saveRoom(newRoom);
    registerSocketSession(socket.id, roomCode, userId);
    socket.join(roomCode);

    addLog(newRoom, `🏠 房间创建成功，房主 ${name} 进入房间`);

    if (callback) callback({ success: true, roomCode, sessionToken });
    socket.emit(SERVER_TO_CLIENT_EVENTS.roomCreated, { roomCode });
    broadcastRoomState(io, roomCode);
  });

  // 2. 加入房间
  socket.on(CLIENT_TO_SERVER_EVENTS.joinRoom, (data: JoinRoomPayload, callback?: (res: any) => void) => {
    const { roomCode, userId, name, avatar } = data;
    if (name) socket.data.userName = name;
    if (userId) socket.data.userId = userId;
    const room = getRoom(roomCode);

    if (!room) {
      if (callback) callback({ success: false, message: '房间不存在' });
      return;
    }

    if (room.players.length >= room.settings.maxPlayers && !room.players.some((p) => p.userId === userId)) {
      if (callback) callback({ success: false, message: '房间人数已满' });
      return;
    }

    let player = room.players.find((p) => p.userId === userId);
    if (player) {
      if (!player.sessionToken) {
        player.sessionToken = crypto.randomUUID();
      }
      player.id = socket.id;
      player.name = name || player.name;
      player.avatar = avatar || player.avatar;
      player.online = true;
      addLog(room, `🔌 玩家 ${player.name} 重新连接`);
    } else {
      const sessionToken = crypto.randomUUID();
      player = {
        id: socket.id,
        userId,
        sessionToken,
        name,
        avatar: avatar || '🎱',
        isHost: false,
        online: true,
        cardCount: 0,
        activeCardCount: 0,
        cards: [],
        pocketedCards: [],
        wins: 0,
        isWinner: false,
        totalScore: 0,
      };

      if (room.status === 'playing') {
        const count = room.settings.cardsPerPlayer || 5;
        for (let i = 0; i < count; i++) {
          const card = room.deck.pop();
          if (card) {
            player.cards.push(card);
          }
        }
        player.cardCount = player.cards.length;
      }

      room.players.push(player);
      addLog(room, `👋 玩家 ${name} 加入房间`);
    }

    registerSocketSession(socket.id, roomCode, userId);
    socket.join(roomCode);

    if (callback) callback({ success: true, roomCode, sessionToken: player.sessionToken });
    checkAndManageRoomCleanup(roomCode);
    broadcastRoomState(io, roomCode);
  });

  // 2.1 尝试断线重连恢复
  socket.on(CLIENT_TO_SERVER_EVENTS.rejoinRoom, (data: RejoinRoomPayload, callback?: (res: any) => void) => {
    const { roomCode, userId, sessionToken } = data;
    const room = getRoom(roomCode);

    if (!room) {
      if (callback) callback({ success: false, message: '房间已解散或不存在' });
      return;
    }

    const player = room.players.find((p) => p.userId === userId);
    if (!player) {
      if (callback) callback({ success: false, message: '你不在此房间成员列表中' });
      return;
    }

    if (!sessionToken || player.sessionToken !== sessionToken) {
      if (callback) callback({ success: false, message: '身份凭证失效或验证失败，拒绝加入' });
      return;
    }

    if (player.name) socket.data.userName = player.name;
    if (userId) socket.data.userId = userId;

    player.id = socket.id;
    player.online = true;
    if (player.userId === room.hostUserId) {
      room.hostSocketId = socket.id;
    }

    registerSocketSession(socket.id, roomCode, userId);
    socket.join(roomCode);

    addLog(room, `🔄 玩家 ${player.name} 恢复了房间连接`);

    if (callback) callback({ success: true, roomCode, sessionToken: player.sessionToken });
    checkAndManageRoomCleanup(roomCode);
    broadcastRoomState(io, roomCode);
  });

  // 3. 修改房间设置（发牌数/黑八/球色等）
  socket.on(CLIENT_TO_SERVER_EVENTS.updateSettings, (data: UpdateSettingsPayload) => {
    const { roomCode, settings } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const session = getSocketSession(socket.id);
    if (!session || session.userId !== room.hostUserId) return;

    if (settings.ballConfigKey && !isValidBallConfigKey(settings.ballConfigKey)) {
      delete settings.ballConfigKey;
    }

    room.settings = { ...room.settings, ...settings };
    addLog(room, '⚙️ 房主更新了游戏房间设置');
    broadcastRoomState(io, roomCode);
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

  // 13. 离开房间
  socket.on(CLIENT_TO_SERVER_EVENTS.leaveRoom, (data: LeaveRoomPayload) => {
    const { roomCode, userId } = data;
    const room = getRoom(roomCode);
    if (!room) return;

    const pIdx = room.players.findIndex((p) => p.userId === userId);
    if (pIdx !== -1) {
      const [removedPlayer] = room.players.splice(pIdx, 1);
      addLog(room, `🚪 玩家 ${removedPlayer.name} 离开了房间`);

      if (room.players.length > 0) {
        if (room.hostUserId === userId) {
          room.hostUserId = room.players[0].userId;
          room.hostSocketId = room.players[0].id;
          room.players[0].isHost = true;
          addLog(room, `👑 房主已自动转让给 ${room.players[0].name}`);
        }
      } else {
        removeRoom(roomCode);
      }
    }

    socket.leave(roomCode);
    removeSocketSession(socket.id);

    checkAndManageRoomCleanup(roomCode);
    broadcastRoomState(io, roomCode);
  });

  // 14. 断开连接处理
  socket.on('disconnect', (reason?: string) => {
    logSocketDisconnect(socket, reason);

    const session = removeSocketSession(socket.id);
    if (session) {
      const { roomCode, userId } = session;
      const room = getRoom(roomCode);
      if (room) {
        const hasOtherSocket = hasOtherSocketForUser(roomCode, userId);
        if (!hasOtherSocket) {
          const player = room.players.find((p) => p.userId === userId);
          if (player) {
            player.online = false;
            addLog(room, `⚡ 玩家 ${player.name} 掉线/网络中断`);
            broadcastRoomState(io, roomCode);
          }
        }
        checkAndManageRoomCleanup(roomCode);
      }
    }
  });
}
