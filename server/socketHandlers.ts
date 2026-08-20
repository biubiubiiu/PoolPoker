import type { Server, Socket } from 'socket.io';
import type { Player, ServerRoom } from '../shared/types/game';
import type {
  AccidentalPocketPayload,
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
import { addLog, checkGameWinners, computeTurnOrder, handleGameFinished } from './gameEngine';
import { create54PokerDeck, shuffle } from './pokerDeck';
import { broadcastRoomState, generateRoomCode, rooms, socketIndex } from './roomManager';

export function registerSocketHandlers(io: Server, socket: Socket): void {
  // 1. 创建房间
  socket.on('create_room', (data: CreateRoomPayload, callback?: (res: any) => void) => {
    const { userId, name, avatar, ballConfigKey } = data;
    if (!userId || !name) {
      if (callback) callback({ success: false, message: '用户信息不完整' });
      return;
    }

    const roomCode = generateRoomCode();

    const newPlayer: Player = {
      id: socket.id,
      userId,
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
    };

    rooms[roomCode] = newRoom;
    socketIndex.set(socket.id, { roomCode, userId });
    socket.join(roomCode);

    addLog(newRoom, `🏠 房间创建成功，房主 ${name} 进入房间`);

    if (callback) callback({ success: true, roomCode });
    socket.emit('room_created', { roomCode });
    broadcastRoomState(io, roomCode);
  });

  // 2. 加入房间
  socket.on('join_room', (data: JoinRoomPayload, callback?: (res: any) => void) => {
    const { roomCode, userId, name, avatar } = data;
    const room = rooms[roomCode];

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
      player.id = socket.id;
      player.name = name || player.name;
      player.avatar = avatar || player.avatar;
      player.online = true;
      addLog(room, `🔌 玩家 ${player.name} 重新连接`);
    } else {
      player = {
        id: socket.id,
        userId,
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

    socketIndex.set(socket.id, { roomCode, userId });
    socket.join(roomCode);

    if (callback) callback({ success: true, roomCode });
    broadcastRoomState(io, roomCode);
  });

  // 2.1 尝试断线重连恢复
  socket.on('rejoin_room', (data: RejoinRoomPayload, callback?: (res: any) => void) => {
    const { roomCode, userId } = data;
    const room = rooms[roomCode];

    if (!room) {
      if (callback) callback({ success: false, message: '房间已解散或不存在' });
      return;
    }

    const player = room.players.find((p) => p.userId === userId);
    if (!player) {
      if (callback) callback({ success: false, message: '你不在此房间成员列表中' });
      return;
    }

    player.id = socket.id;
    player.online = true;
    if (player.userId === room.hostUserId) {
      room.hostSocketId = socket.id;
    }

    socketIndex.set(socket.id, { roomCode, userId });
    socket.join(roomCode);

    addLog(room, `🔄 玩家 ${player.name} 恢复了房间连接`);

    if (callback) callback({ success: true, roomCode });
    broadcastRoomState(io, roomCode);
  });

  // 3. 修改房间设置（发牌数/黑八/球色等）
  socket.on('update_settings', (data: UpdateSettingsPayload) => {
    const { roomCode, settings } = data;
    const room = rooms[roomCode];
    if (!room) return;

    const session = socketIndex.get(socket.id);
    if (!session || session.userId !== room.hostUserId) return;

    if (settings.ballConfigKey && !isValidBallConfigKey(settings.ballConfigKey)) {
      delete settings.ballConfigKey;
    }

    room.settings = { ...room.settings, ...settings };
    addLog(room, '⚙️ 房主更新了游戏房间设置');
    broadcastRoomState(io, roomCode);
  });

  // 4. 开始游戏 / 发牌
  socket.on('start_game', (data: StartGamePayload) => {
    const { roomCode } = data;
    const room = rooms[roomCode];
    if (!room) return;

    const session = socketIndex.get(socket.id);
    if (!session || session.userId !== room.hostUserId) return;

    if (room.players.length === 0) return;

    room.deck = shuffle(create54PokerDeck());
    room.accidentalBalls = [];
    room.winners = [];
    room.roundCount += 1;
    room.status = 'playing';

    const count = room.settings.cardsPerPlayer || 5;

    room.players.forEach((p) => {
      p.cards = [];
      p.pocketedCards = [];
      p.isWinner = false;
      for (let i = 0; i < count; i++) {
        const card = room.deck.pop();
        if (card) {
          p.cards.push(card);
        }
      }
      p.cardCount = p.cards.length;
    });

    room.turnOrder = computeTurnOrder(room);
    room.lastTurnOrder = [...room.turnOrder];

    addLog(room, `🎮 第 ${room.roundCount} 局游戏正式开始！每位玩家发牌 ${count} 张`);
    broadcastRoomState(io, roomCode);
  });

  // 5. 击球消除卡牌（进球）
  socket.on('pocket_ball', (data: PocketBallPayload) => {
    const { roomCode, cardId } = data;
    const room = rooms[roomCode];
    if (room?.status !== 'playing') return;

    const session = socketIndex.get(socket.id);
    if (!session) return;

    const player = room.players.find((p) => p.userId === session.userId);
    if (!player) return;

    const cardIndex = player.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return;

    const [pocketedCard] = player.cards.splice(cardIndex, 1);
    player.pocketedCards.push(pocketedCard);

    addLog(
      room,
      `🎯 ${player.name} 打进 ${pocketedCard.ballNumber}号球，消去卡牌 [${pocketedCard.suit}${pocketedCard.rank}]`
    );

    const winners = checkGameWinners(room);
    if (winners.length > 0) {
      handleGameFinished(room, winners, player);
    }

    broadcastRoomState(io, roomCode);
  });

  // 6. 犯规罚抽牌
  socket.on('draw_penalty', (data: DrawPenaltyPayload) => {
    const { roomCode } = data;
    const room = rooms[roomCode];
    if (room?.status !== 'playing') return;

    const session = socketIndex.get(socket.id);
    if (!session) return;

    const player = room.players.find((p) => p.userId === session.userId);
    if (!player) return;

    if (room.deck.length === 0) {
      room.deck = shuffle(create54PokerDeck());
      addLog(room, '🎴 牌堆已耗尽，洗混新扑克牌库补充牌堆！');
    }

    const penaltyCard = room.deck.pop();
    if (penaltyCard) {
      player.cards.push(penaltyCard);
      addLog(room, `⚠️ ${player.name} 犯规，罚抽 1 张扑克牌 [${penaltyCard.suit}${penaltyCard.rank}]`);
    }

    broadcastRoomState(io, roomCode);
  });

  // 7. 误进无关球 / 裁判登记球入袋
  socket.on('accidental_pocket', (data: AccidentalPocketPayload) => {
    const { roomCode, ballNumber } = data;
    const room = rooms[roomCode];
    if (room?.status !== 'playing') return;

    if (!room.accidentalBalls.includes(ballNumber)) {
      room.accidentalBalls.push(ballNumber);
      addLog(room, `🎱 记录场上 ${ballNumber}号球判定为已进球`);

      const winners = checkGameWinners(room);
      if (winners.length > 0) {
        handleGameFinished(room, winners, null);
      }
    }

    broadcastRoomState(io, roomCode);
  });

  // 8. 追回 / 撤销已消除卡牌
  socket.on('retract_ball', (data: RetractBallPayload) => {
    const { roomCode, cardId } = data;
    const room = rooms[roomCode];
    if (!room) return;

    const session = socketIndex.get(socket.id);
    if (!session) return;

    const player = room.players.find((p) => p.userId === session.userId);
    if (!player) return;

    const pCardIdx = player.pocketedCards.findIndex((c) => c.id === cardId);
    if (pCardIdx !== -1) {
      const [retractedCard] = player.pocketedCards.splice(pCardIdx, 1);
      player.cards.push(retractedCard);
      addLog(
        room,
        `↩️ ${player.name} 撤回了已打进的手牌 [${retractedCard.suit}${retractedCard.rank} -> ${retractedCard.ballNumber}号球]，该牌返回手牌中。`
      );
    }

    broadcastRoomState(io, roomCode);
  });

  // 9. 裁判代记 - 帮指定玩家消卡
  socket.on('referee_pocket_ball', (data: RefereePocketBallPayload) => {
    const { roomCode, targetUserId, ballNumber } = data;
    const room = rooms[roomCode];
    if (room?.status !== 'playing') return;

    const targetPlayer = room.players.find((p) => p.userId === targetUserId);
    if (!targetPlayer) return;

    const cardIndex = targetPlayer.cards.findIndex((c) => c.ballNumber === ballNumber);
    if (cardIndex !== -1) {
      const [pocketedCard] = targetPlayer.cards.splice(cardIndex, 1);
      targetPlayer.pocketedCards.push(pocketedCard);
      const refereePlayer = room.players.find((p) => p.id === socket.id);
      const refName = refereePlayer ? refereePlayer.name : '裁判';
      addLog(
        room,
        `⚖️ [代记] ${refName} 为 ${targetPlayer.name} 记录打进并消除了手牌 [${pocketedCard.suit}${pocketedCard.rank} -> ${pocketedCard.ballNumber}号球]！`
      );

      const winners = checkGameWinners(room);
      if (winners.length > 0) {
        handleGameFinished(room, winners, targetPlayer);
      }
    }

    broadcastRoomState(io, roomCode);
  });

  // 10. 裁判代记 - 帮指定玩家罚抽卡
  socket.on('referee_draw_penalty', (data: RefereeDrawPenaltyPayload) => {
    const { roomCode, targetUserId } = data;
    const room = rooms[roomCode];
    if (room?.status !== 'playing') return;

    const targetPlayer = room.players.find((p) => p.userId === targetUserId);
    if (!targetPlayer) return;

    if (room.deck.length === 0) {
      room.deck = shuffle(create54PokerDeck());
      addLog(room, '🎴 牌堆已耗尽，洗混新扑克牌库补充牌堆！');
    }

    const penaltyCard = room.deck.pop();
    if (penaltyCard) {
      targetPlayer.cards.push(penaltyCard);
      addLog(room, `👨‍⚖️ 裁判代记：${targetPlayer.name} 犯规，罚抽 1 张扑克牌 [${penaltyCard.suit}${penaltyCard.rank}]`);
    }

    broadcastRoomState(io, roomCode);
  });

  // 11. 请求重新开始
  socket.on('request_restart', (data: RequestRestartPayload) => {
    const { roomCode } = data;
    const room = rooms[roomCode];
    if (!room) return;

    addLog(room, '🔄 房主发起了重新开始本局对决');
    broadcastRoomState(io, roomCode);
  });

  // 12. 确认重新开始 / 重置房间
  const handleRestartRoom = (roomCode: string) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.deck = [];
    room.accidentalBalls = [];
    room.winners = [];
    room.status = 'waiting';

    room.players.forEach((p) => {
      p.cards = [];
      p.pocketedCards = [];
      p.isWinner = false;
      p.cardCount = 0;
      p.activeCardCount = 0;
    });

    addLog(room, '🔄 房主重置了游戏，回到发牌等待状态。');
    broadcastRoomState(io, roomCode);
  };

  socket.on('confirm_restart', (data: ConfirmRestartPayload) => {
    const { roomCode } = data;
    const room = rooms[roomCode];
    if (!room) return;
    const session = socketIndex.get(socket.id);
    if (!session || session.userId !== room.hostUserId) return;
    handleRestartRoom(roomCode);
  });

  socket.on('restart_game', (data: RestartGamePayload) => {
    const { roomCode } = data;
    const room = rooms[roomCode];
    if (!room) return;
    const session = socketIndex.get(socket.id);
    if (!session || session.userId !== room.hostUserId) return;
    handleRestartRoom(roomCode);
  });

  // 13. 离开房间
  socket.on('leave_room', (data: LeaveRoomPayload) => {
    const { roomCode, userId } = data;
    const room = rooms[roomCode];
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
        delete rooms[roomCode];
      }
    }

    socket.leave(roomCode);
    socketIndex.delete(socket.id);

    broadcastRoomState(io, roomCode);
  });

  // 14. 断开连接处理
  socket.on('disconnect', () => {
    const session = socketIndex.get(socket.id);
    if (session) {
      const { roomCode, userId } = session;
      const room = rooms[roomCode];
      if (room) {
        const player = room.players.find((p) => p.userId === userId);
        if (player) {
          player.online = false;
          addLog(room, `⚡ 玩家 ${player.name} 掉线/网络中断`);
          broadcastRoomState(io, roomCode);
        }
      }
      socketIndex.delete(socket.id);
    }
  });
}
