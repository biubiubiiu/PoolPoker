import type { Player, Room, ServerRoom } from '../types/game';

export interface RoomActor {
  userId: string;
  isHost: boolean;
  isMember: boolean;
  player?: Player;
}

export type RoomActionType =
  | 'start_game'
  | 'restart_game'
  | 'request_restart'
  | 'update_settings'
  | 'kick_player'
  | 'pocket_ball'
  | 'draw_penalty'
  | 'accidental_pocket'
  | 'break_pocket'
  | 'retract_ball'
  | 'referee_pocket_ball'
  | 'referee_draw_penalty'
  | 'read_private_cards'
  | 'leave_room';

/**
 * 获取当前房间所有已消除的球号列表 (1 ~ 15，按数字大小升序)
 * 纯函数，无 Node.js 或服务端运行依赖
 */
export function getPocketedBallNumbers(room: ServerRoom): number[] {
  if (!room?.players) return [];
  const set = new Set<number>();
  (room.accidentalBalls || []).forEach((b) => {
    set.add(b);
  });
  (room.breakBalls || []).forEach((b) => {
    set.add(b);
  });
  room.players.forEach((p) => {
    (p.pocketedCards || []).forEach((c) => {
      set.add(c.ballNumber);
    });
  });
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * 房间状态脱敏与手牌裁剪 (纯函数，可在浏览器端、移动端及服务端跨平台执行)
 * 仅对请求操作者 targetUserId（且游戏未结束时）保留私有手牌；其余玩家手牌一律脱敏为空数组
 */
export function sanitizeRoomState(room: ServerRoom, targetUserId?: string): Room {
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
      const isSelf = targetUserId ? p.userId === targetUserId : false;
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
 * 跨传输层（HTTP、Socket、BLE）共用的房间权限规则
 * 纯业务逻辑，无任何 Node.js 或服务端运行依赖
 */
export function isActionAuthorized(
  room: ServerRoom,
  actor: RoomActor,
  action: {
    type: RoomActionType;
    targetUserId?: string;
  }
): boolean {
  if (action.type === 'read_private_cards') {
    if (room.status === 'finished') return true;
    return actor.isMember && actor.userId === action.targetUserId;
  }

  if (!actor.isMember) {
    return false;
  }

  switch (action.type) {
    case 'start_game':
    case 'restart_game':
    case 'request_restart':
    case 'update_settings':
      return actor.isHost;

    case 'kick_player':
      return (
        actor.isHost &&
        !!action.targetUserId &&
        action.targetUserId !== actor.userId &&
        room.players.some((p) => p.userId === action.targetUserId)
      );

    case 'referee_pocket_ball':
    case 'referee_draw_penalty':
      return actor.isMember && !!action.targetUserId && room.players.some((p) => p.userId === action.targetUserId);

    case 'pocket_ball':
    case 'draw_penalty':
    case 'accidental_pocket':
    case 'break_pocket':
    case 'retract_ball':
    case 'leave_room':
      return actor.isMember;

    default:
      return false;
  }
}

/**
 * BLE 客户端操作者解析与鉴权 (纯函数，在房主本地宿主环境中执行)
 */
export function resolveBleActor(
  room: ServerRoom,
  senderUserId: string
): { ok: true; actor: RoomActor } | { ok: false; status: 403; message: string } {
  const player = room.players.find((p) => p.userId === senderUserId);
  if (!player) {
    return { ok: false, status: 403, message: '未加入房间的 BLE 设备' };
  }

  return {
    ok: true,
    actor: {
      userId: player.userId,
      isHost: player.userId === room.hostUserId,
      isMember: true,
      player,
    },
  };
}
