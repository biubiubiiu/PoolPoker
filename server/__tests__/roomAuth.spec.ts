import { describe, expect, it } from 'vitest';
import type { Player, ServerRoom } from '../../shared/types/game';
import { isActionAuthorized, type RoomActor, resolveBleActor } from '../../shared/utils/roomRules';
import { resolveHttpActor, resolveSocketActor } from '../roomAuth';
import { registerSocketSession, removeRoom, removeSocketSession, saveRoom } from '../roomManager';

function createDummyPlayer(overrides: Partial<Player>): Player {
  return {
    id: overrides.id ?? 'socket-1',
    userId: overrides.userId ?? 'user-1',
    sessionToken: overrides.sessionToken ?? 'token-1',
    name: overrides.name ?? 'Player 1',
    isHost: overrides.isHost ?? false,
    online: overrides.online ?? true,
    cardCount: 0,
    cards: overrides.cards ?? [],
    pocketedCards: overrides.pocketedCards ?? [],
    wins: 0,
    isWinner: false,
    totalScore: 0,
  };
}

function createDummyRoom(code = 'test-auth-room'): ServerRoom {
  return {
    code,
    status: 'playing',
    hostUserId: 'host-user',
    hostSocketId: 'host-socket',
    settings: { cardsPerPlayer: 5, maxPlayers: 8, includeBlackEight: true },
    players: [
      createDummyPlayer({ id: 'host-socket', userId: 'host-user', sessionToken: 'host-token', isHost: true }),
      createDummyPlayer({ id: 'guest-socket', userId: 'guest-user', sessionToken: 'guest-token', isHost: false }),
    ],
    deck: [],
    accidentalBalls: [],
    breakBalls: [],
    winners: [],
    turnOrder: ['host-user', 'guest-user'],
    roundCount: 1,
    logs: [],
    lastRoundScores: [],
    gameHistory: [],
  };
}

describe('roomAuth resolveHttpActor', () => {
  it('returns 404 if room does not exist', () => {
    const result = resolveHttpActor('non-existent-room');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it('allows anonymous/spectator access without revealing private identity', () => {
    const room = createDummyRoom();
    const result = resolveHttpActor(room);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe('');
      expect(result.actor.isMember).toBe(false);
      expect(result.actor.isHost).toBe(false);
    }
  });

  it('rejects access when userId is provided without sessionToken', () => {
    const room = createDummyRoom();
    const result = resolveHttpActor(room, { userId: 'host-user' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.message).toContain('身份凭证失效或验证失败');
    }
  });

  it('rejects access when sessionToken does not match player sessionToken', () => {
    const room = createDummyRoom();
    const result = resolveHttpActor(room, { userId: 'host-user', sessionToken: 'wrong-token' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.message).toContain('身份凭证失效或验证失败');
    }
  });

  it('rejects access when userId does not belong to any player in the room', () => {
    const room = createDummyRoom();
    const result = resolveHttpActor(room, { userId: 'intruder', sessionToken: 'intruder-token' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.message).toContain('你不在此房间成员列表中');
    }
  });

  it('successfully authenticates member with valid userId and sessionToken', () => {
    const room = createDummyRoom();
    const result = resolveHttpActor(room, { userId: 'host-user', sessionToken: 'host-token' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe('host-user');
      expect(result.actor.isMember).toBe(true);
      expect(result.actor.isHost).toBe(true);
    }
  });
});

describe('roomAuth resolveSocketActor', () => {
  it('rejects when socket has no registered session', () => {
    const room = createDummyRoom();
    const result = resolveSocketActor('unknown-socket', room);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.message).toContain('请先加入这个房间');
    }
  });

  it('rejects when socket session is for a different room', () => {
    const room = createDummyRoom();
    registerSocketSession('socket-diff', 'other-room', 'host-user');
    try {
      const result = resolveSocketActor('socket-diff', room);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(403);
      }
    } finally {
      removeSocketSession('socket-diff');
    }
  });

  it('rejects when socket user is not in room players', () => {
    const room = createDummyRoom();
    registerSocketSession('socket-stranger', room.code, 'stranger-user');
    try {
      const result = resolveSocketActor('socket-stranger', room);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(403);
        expect(result.message).toContain('你不在此房间成员列表中');
      }
    } finally {
      removeSocketSession('socket-stranger');
    }
  });

  it('resolves valid socket session for joined room player', () => {
    const room = createDummyRoom();
    saveRoom(room);
    registerSocketSession('guest-socket-2', room.code, 'guest-user');
    try {
      const result = resolveSocketActor('guest-socket-2', room.code);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.actor.userId).toBe('guest-user');
        expect(result.actor.isMember).toBe(true);
        expect(result.actor.isHost).toBe(false);
      }
    } finally {
      removeSocketSession('guest-socket-2');
      removeRoom(room.code);
    }
  });
});

describe('roomAuth resolveBleActor', () => {
  it('rejects unknown BLE sender not in room players', () => {
    const room = createDummyRoom();
    const result = resolveBleActor(room, 'ble-stranger');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.message).toContain('未加入房间的 BLE 设备');
    }
  });

  it('resolves joined BLE player', () => {
    const room = createDummyRoom();
    const result = resolveBleActor(room, 'guest-user');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe('guest-user');
      expect(result.actor.isMember).toBe(true);
      expect(result.actor.isHost).toBe(false);
    }
  });
});

describe('roomAuth isActionAuthorized', () => {
  const room = createDummyRoom();
  const hostActor: RoomActor = { userId: 'host-user', isHost: true, isMember: true };
  const guestActor: RoomActor = { userId: 'guest-user', isHost: false, isMember: true };
  const strangerActor: RoomActor = { userId: 'stranger', isHost: false, isMember: false };

  it('authorizes host-only actions for host, rejects for guests and non-members', () => {
    expect(isActionAuthorized(room, hostActor, { type: 'start_game' })).toBe(true);
    expect(isActionAuthorized(room, guestActor, { type: 'start_game' })).toBe(false);
    expect(isActionAuthorized(room, strangerActor, { type: 'start_game' })).toBe(false);

    expect(isActionAuthorized(room, hostActor, { type: 'update_settings' })).toBe(true);
    expect(isActionAuthorized(room, guestActor, { type: 'update_settings' })).toBe(false);

    expect(isActionAuthorized(room, hostActor, { type: 'request_restart' })).toBe(true);
    expect(isActionAuthorized(room, guestActor, { type: 'request_restart' })).toBe(false);
  });

  it('authorizes kick_player only when host kicks another member', () => {
    expect(isActionAuthorized(room, hostActor, { type: 'kick_player', targetUserId: 'guest-user' })).toBe(true);
    expect(isActionAuthorized(room, hostActor, { type: 'kick_player', targetUserId: 'host-user' })).toBe(false);
    expect(isActionAuthorized(room, hostActor, { type: 'kick_player', targetUserId: 'stranger' })).toBe(false);
    expect(isActionAuthorized(room, guestActor, { type: 'kick_player', targetUserId: 'host-user' })).toBe(false);
  });

  it('authorizes member actions for all room members, rejects for non-members', () => {
    for (const type of ['accidental_pocket', 'break_pocket', 'retract_ball', 'draw_penalty'] as const) {
      expect(isActionAuthorized(room, hostActor, { type })).toBe(true);
      expect(isActionAuthorized(room, guestActor, { type })).toBe(true);
      expect(isActionAuthorized(room, strangerActor, { type })).toBe(false);
    }
  });

  it('authorizes referee actions only when targeting valid room members', () => {
    expect(isActionAuthorized(room, hostActor, { type: 'referee_pocket_ball', targetUserId: 'guest-user' })).toBe(true);
    expect(isActionAuthorized(room, guestActor, { type: 'referee_pocket_ball', targetUserId: 'host-user' })).toBe(true);
    expect(isActionAuthorized(room, hostActor, { type: 'referee_pocket_ball', targetUserId: 'stranger' })).toBe(false);
    expect(isActionAuthorized(room, strangerActor, { type: 'referee_pocket_ball', targetUserId: 'guest-user' })).toBe(
      false
    );
  });

  it('authorizes read_private_cards correctly based on identity and game status', () => {
    // During active playing status
    expect(isActionAuthorized(room, hostActor, { type: 'read_private_cards', targetUserId: 'host-user' })).toBe(true);
    expect(isActionAuthorized(room, hostActor, { type: 'read_private_cards', targetUserId: 'guest-user' })).toBe(false);
    expect(isActionAuthorized(room, strangerActor, { type: 'read_private_cards', targetUserId: 'host-user' })).toBe(
      false
    );

    // After finished
    const finishedRoom = { ...room, status: 'finished' as const };
    expect(
      isActionAuthorized(finishedRoom, strangerActor, { type: 'read_private_cards', targetUserId: 'host-user' })
    ).toBe(true);
  });
});
