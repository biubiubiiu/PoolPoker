import crypto from 'node:crypto';
import type { Player, RoomSettings, ServerRoom } from '../shared/types/game';
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  KickPlayerPayload,
  LeaveRoomPayload,
  RejoinRoomPayload,
  SocketCallbackResponse,
  UpdateSettingsPayload,
} from '../shared/types/socket';
import { DEFAULT_BALL_CONFIG_KEY, isValidBallConfigKey } from './config';
import { addLog } from './gameEngine';
import {
  checkAndManageRoomCleanup,
  generateRoomCode,
  getRoom,
  getSocketSession,
  hasOtherSocketForUser,
  registerSocketSession,
  removeRoom,
  removeSocketSession,
  removeUserSocketSessions,
  saveRoom,
} from './roomManager';

export type RoomLifecycleCommand =
  | { type: 'create_room'; socketId: string; payload: CreateRoomPayload }
  | { type: 'join_room'; socketId: string; payload: JoinRoomPayload }
  | { type: 'rejoin_room'; socketId: string; payload: RejoinRoomPayload }
  | { type: 'update_settings'; socketId: string; payload: UpdateSettingsPayload }
  | { type: 'leave_room'; socketId: string; payload: LeaveRoomPayload }
  | { type: 'kick_player'; socketId: string; payload: KickPlayerPayload }
  | { type: 'disconnect'; socketId: string };

export type RoomLifecycleSocketEffect =
  | { type: 'join_room'; roomCode: string }
  | { type: 'leave_room'; roomCode: string }
  | { type: 'emit_room_created'; roomCode: string }
  | { type: 'kick_player'; roomCode: string; socketIds: string[] };

export interface RoomLifecycleResult {
  response?: SocketCallbackResponse;
  socketData?: {
    userId?: string;
    userName?: string;
  };
  socketEffects?: RoomLifecycleSocketEffect[];
  broadcastRoomCode?: string;
  changed: boolean;
}

export interface RoomLifecycleDependencies {
  createRoomCode: () => string;
  createSessionToken: () => string;
  validateBallConfigKey: (key: string | undefined) => boolean;
}

const NO_CHANGE: RoomLifecycleResult = { changed: false };

const defaultDeps: RoomLifecycleDependencies = {
  createRoomCode: generateRoomCode,
  createSessionToken: () => crypto.randomUUID(),
  validateBallConfigKey: (key) => (key ? isValidBallConfigKey(key) : false),
};

export function applyRoomLifecycleCommand(
  command: RoomLifecycleCommand,
  deps: RoomLifecycleDependencies = defaultDeps
): RoomLifecycleResult {
  switch (command.type) {
    case 'create_room':
      return createRoom(command.socketId, command.payload, deps);
    case 'join_room':
      return joinRoom(command.socketId, command.payload, deps);
    case 'rejoin_room':
      return rejoinRoom(command.socketId, command.payload);
    case 'update_settings':
      return updateSettings(command.socketId, command.payload, deps);
    case 'leave_room':
      return leaveRoom(command.socketId, command.payload);
    case 'kick_player':
      return kickPlayer(command.socketId, command.payload);
    case 'disconnect':
      return disconnectSocket(command.socketId);
  }
}

function createRoom(
  socketId: string,
  payload: CreateRoomPayload,
  deps: RoomLifecycleDependencies
): RoomLifecycleResult {
  const { userId, name, avatar, ballConfigKey } = payload;
  if (!userId || !name) {
    return {
      response: { success: false, message: '用户信息不完整' },
      changed: false,
    };
  }

  const roomCode = deps.createRoomCode();
  const sessionToken = deps.createSessionToken();
  const newPlayer = createPlayer({
    socketId,
    userId,
    sessionToken,
    name,
    avatar,
    isHost: true,
  });
  const validatedConfigKey = deps.validateBallConfigKey(ballConfigKey) ? ballConfigKey : DEFAULT_BALL_CONFIG_KEY;

  const newRoom: ServerRoom = {
    code: roomCode,
    hostUserId: userId,
    hostSocketId: socketId,
    status: 'waiting',
    players: [newPlayer],
    deck: [],
    accidentalBalls: [],
    breakBalls: [],
    winners: [],
    turnOrder: [],
    roundCount: 0,
    settings: createDefaultRoomSettings(validatedConfigKey),
    logs: [],
    lastRoundScores: [],
    gameHistory: [],
  };

  saveRoom(newRoom);
  registerSocketSession(socketId, roomCode, userId);
  addLog(newRoom, `🏠 房间创建成功，房主 ${name} 进入房间`);

  return {
    response: { success: true, roomCode, sessionToken },
    socketData: { userId, userName: name },
    socketEffects: [
      { type: 'join_room', roomCode },
      { type: 'emit_room_created', roomCode },
    ],
    broadcastRoomCode: roomCode,
    changed: true,
  };
}

function joinRoom(socketId: string, payload: JoinRoomPayload, deps: RoomLifecycleDependencies): RoomLifecycleResult {
  const { roomCode, userId, name, avatar } = payload;
  const socketData = {
    userId: userId || undefined,
    userName: name || undefined,
  };

  if (!userId || !name) {
    return {
      response: { success: false, message: '用户信息不完整' },
      socketData,
      changed: false,
    };
  }

  const room = getRoom(roomCode);

  if (!room) {
    return {
      response: { success: false, message: '房间不存在' },
      socketData,
      changed: false,
    };
  }

  const existingPlayer = room.players.find((p) => p.userId === userId);
  if (existingPlayer) {
    return {
      response: { success: false, message: '玩家已在房间中，请使用凭证重连' },
      socketData,
      changed: false,
    };
  }

  if (room.players.length >= room.settings.maxPlayers) {
    return {
      response: { success: false, message: '房间人数已满' },
      socketData,
      changed: false,
    };
  }

  const player = createPlayer({
    socketId,
    userId,
    sessionToken: deps.createSessionToken(),
    name,
    avatar,
    isHost: false,
  });

  if (room.status === 'playing') {
    dealInitialCards(room, player);
  }

  room.players.push(player);
  addLog(room, `👋 玩家 ${name} 加入房间`);

  registerSocketSession(socketId, roomCode, userId);
  checkAndManageRoomCleanup(roomCode);

  return {
    response: { success: true, roomCode, sessionToken: player.sessionToken },
    socketData,
    socketEffects: [{ type: 'join_room', roomCode }],
    broadcastRoomCode: roomCode,
    changed: true,
  };
}

function rejoinRoom(socketId: string, payload: RejoinRoomPayload): RoomLifecycleResult {
  const { roomCode, userId, sessionToken } = payload;
  const room = getRoom(roomCode);

  if (!room) {
    return {
      response: { success: false, message: '房间已解散或不存在' },
      changed: false,
    };
  }

  const player = room.players.find((p) => p.userId === userId);
  if (!player) {
    return {
      response: { success: false, message: '你不在此房间成员列表中' },
      changed: false,
    };
  }

  if (!sessionToken || player.sessionToken !== sessionToken) {
    return {
      response: { success: false, message: '身份凭证失效或验证失败，拒绝加入' },
      changed: false,
    };
  }

  player.id = socketId;
  player.online = true;
  if (player.userId === room.hostUserId) {
    room.hostSocketId = socketId;
  }

  registerSocketSession(socketId, roomCode, userId);
  checkAndManageRoomCleanup(roomCode);
  addLog(room, `🔄 玩家 ${player.name} 恢复了房间连接`);

  return {
    response: { success: true, roomCode, sessionToken: player.sessionToken },
    socketData: { userId, userName: player.name },
    socketEffects: [{ type: 'join_room', roomCode }],
    broadcastRoomCode: roomCode,
    changed: true,
  };
}

function updateSettings(
  socketId: string,
  payload: UpdateSettingsPayload,
  deps: RoomLifecycleDependencies
): RoomLifecycleResult {
  const { roomCode } = payload;
  const room = getRoom(roomCode);
  if (!room) return NO_CHANGE;

  const session = getSocketSession(socketId);
  if (!session || session.userId !== room.hostUserId) return NO_CHANGE;

  const settings: Partial<RoomSettings> = { ...payload.settings };
  if (settings.ballConfigKey && !deps.validateBallConfigKey(settings.ballConfigKey)) {
    delete settings.ballConfigKey;
  }

  room.settings = { ...room.settings, ...settings };
  addLog(room, '⚙️ 房主更新了游戏房间设置');

  return {
    broadcastRoomCode: roomCode,
    changed: true,
  };
}

function kickPlayer(socketId: string, payload: KickPlayerPayload): RoomLifecycleResult {
  const reject = (message: string): RoomLifecycleResult => ({ changed: false, response: { success: false, message } });
  const room = getRoom(payload?.roomCode);
  if (!room) return reject('房间不存在');
  const session = getSocketSession(socketId);
  if (!session || session.roomCode !== room.code || session.userId !== room.hostUserId) {
    return reject('只有房主可以移出玩家');
  }
  if (room.status !== 'waiting' && room.status !== 'lobby') return reject('仅可在准备界面移出玩家');
  if (payload.targetUserId === room.hostUserId) return reject('不能移出房主自己');
  const index = room.players.findIndex((player) => player.userId === payload.targetUserId);
  if (index === -1) return reject('该玩家已不在房间中');

  const [player] = room.players.splice(index, 1);
  const socketIds = removeUserSocketSessions(room.code, player.userId);
  addLog(room, `🚪 房主将玩家 ${player.name} 移出了房间`);
  checkAndManageRoomCleanup(room.code);
  return {
    changed: true,
    socketEffects: [{ type: 'kick_player', roomCode: room.code, socketIds }],
    broadcastRoomCode: room.code,
  };
}

function leaveRoom(socketId: string, payload: LeaveRoomPayload): RoomLifecycleResult {
  const { roomCode } = payload;
  const room = getRoom(roomCode);
  if (!room) return NO_CHANGE;

  const session = getSocketSession(socketId);
  if (!session || session.roomCode !== roomCode) return NO_CHANGE;

  const userId = session.userId;
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

  removeSocketSession(socketId);
  checkAndManageRoomCleanup(roomCode);

  return {
    socketEffects: [{ type: 'leave_room', roomCode }],
    broadcastRoomCode: roomCode,
    changed: pIdx !== -1,
  };
}

function disconnectSocket(socketId: string): RoomLifecycleResult {
  const session = removeSocketSession(socketId);
  if (!session) return NO_CHANGE;

  const { roomCode, userId } = session;
  const room = getRoom(roomCode);
  if (!room) return NO_CHANGE;

  const hasOtherSocket = hasOtherSocketForUser(roomCode, userId);
  let shouldBroadcast = false;
  if (!hasOtherSocket) {
    const player = room.players.find((p) => p.userId === userId);
    if (player) {
      player.online = false;
      addLog(room, `⚡ 玩家 ${player.name} 掉线/网络中断`);
      shouldBroadcast = true;
    }
  }

  checkAndManageRoomCleanup(roomCode);

  return {
    broadcastRoomCode: shouldBroadcast ? roomCode : undefined,
    changed: shouldBroadcast,
  };
}

function createDefaultRoomSettings(ballConfigKey: string): RoomSettings {
  return {
    cardsPerPlayer: 5,
    maxPlayers: 8,
    includeBlackEight: true,
    ballConfigKey,
  };
}

function createPlayer(input: {
  socketId: string;
  userId: string;
  sessionToken: string;
  name: string;
  avatar?: string;
  isHost: boolean;
}): Player {
  return {
    id: input.socketId,
    userId: input.userId,
    sessionToken: input.sessionToken,
    name: input.name,
    avatar: input.avatar || '🎱',
    isHost: input.isHost,
    online: true,
    cardCount: 0,
    activeCardCount: 0,
    cards: [],
    pocketedCards: [],
    wins: 0,
    isWinner: false,
    totalScore: 0,
  };
}

function dealInitialCards(room: ServerRoom, player: Player): void {
  const count = room.settings.cardsPerPlayer || 5;
  for (let i = 0; i < count; i++) {
    const card = room.deck.pop();
    if (card) {
      player.cards.push(card);
    }
  }
  player.cardCount = player.cards.length;
  player.activeCardCount = player.cards.length;
}

export function toSocketCallbackResponse(result: RoomLifecycleResult): SocketCallbackResponse | undefined {
  return result.response;
}
