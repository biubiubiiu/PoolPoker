import type { ServerRoom } from '../shared/types/game';
import { isActionAuthorized, type RoomActionType, type RoomActor, resolveBleActor } from '../shared/utils/roomRules';
import { getRoom, getSocketSession } from './roomManager';

export type { RoomActionType, RoomActor };
export { isActionAuthorized, resolveBleActor };

export interface HttpAuthCredentials {
  userId?: string;
  sessionToken?: string;
}

export type AuthResult<T = RoomActor> =
  | { ok: true; actor: T; room: ServerRoom }
  | { ok: false; status: 401 | 403 | 404; message: string };

/**
 * 统一的 HTTP 请求会话解析与鉴权 (运行在 Node.js 服务端)
 */
export function resolveHttpActor(roomOrCode: string | ServerRoom, credentials?: HttpAuthCredentials): AuthResult {
  const room = typeof roomOrCode === 'string' ? getRoom(roomOrCode) : roomOrCode;
  if (!room) {
    return { ok: false, status: 404, message: '房间不存在' };
  }

  // 匿名/旁观者访问（未传 userId）
  if (!credentials?.userId) {
    return {
      ok: true,
      actor: {
        userId: '',
        isHost: false,
        isMember: false,
      },
      room,
    };
  }

  const player = room.players.find((p) => p.userId === credentials.userId);
  if (!player) {
    return { ok: false, status: 401, message: '你不在此房间成员列表中' };
  }

  if (!credentials.sessionToken || player.sessionToken !== credentials.sessionToken) {
    return { ok: false, status: 401, message: '身份凭证失效或验证失败' };
  }

  return {
    ok: true,
    actor: {
      userId: player.userId,
      isHost: player.userId === room.hostUserId,
      isMember: true,
      player,
    },
    room,
  };
}

/**
 * 统一的 Socket 连接会话解析与鉴权 (运行在 Node.js 服务端)
 */
export function resolveSocketActor(socketId: string, roomOrCode: string | ServerRoom): AuthResult {
  const targetRoom = typeof roomOrCode === 'string' ? getRoom(roomOrCode) : roomOrCode;
  if (!targetRoom) {
    return { ok: false, status: 404, message: '房间不存在' };
  }

  const session = getSocketSession(socketId);
  if (!session || session.roomCode !== targetRoom.code) {
    return { ok: false, status: 403, message: '请先加入这个房间' };
  }

  const player = targetRoom.players.find((p) => p.userId === session.userId);
  if (!player) {
    return { ok: false, status: 403, message: '你不在此房间成员列表中' };
  }

  return {
    ok: true,
    actor: {
      userId: player.userId,
      isHost: player.userId === targetRoom.hostUserId,
      isMember: true,
      player,
    },
    room: targetRoom,
  };
}
