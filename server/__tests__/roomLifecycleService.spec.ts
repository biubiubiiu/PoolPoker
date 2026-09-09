import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, ServerRoom } from '../../shared/types/game';
import { applyRoomLifecycleCommand, type RoomLifecycleDependencies } from '../roomLifecycleService';
import { getRoom, getSocketSession, removeRoom, removeSocketSession, roomCleanupTimers, rooms } from '../roomManager';

function createDeps(roomCodes: string[] = ['1234'], sessionTokens: string[] = ['token-1']): RoomLifecycleDependencies {
  let roomCodeIndex = 0;
  let tokenIndex = 0;
  return {
    createRoomCode: () => roomCodes[roomCodeIndex++] ?? '9999',
    createSessionToken: () => sessionTokens[tokenIndex++] ?? `token-${tokenIndex}`,
    validateBallConfigKey: (key) => key === 'xingpai',
  };
}

function createCard(id: string, ballNumber: number): Card {
  return {
    id,
    suit: '♠',
    suitType: 'spade',
    color: 'black',
    rank: String(ballNumber),
    ballNumber,
  };
}

afterEach(() => {
  vi.useRealTimers();
  for (const code of Object.keys(rooms)) {
    removeRoom(code);
  }
  for (const socketId of ['socket-host', 'socket-host-2', 'socket-guest', 'socket-a', 'socket-b']) {
    removeSocketSession(socketId);
  }
  for (const timer of roomCleanupTimers.values()) {
    clearTimeout(timer);
  }
  roomCleanupTimers.clear();
});

describe('roomLifecycleService', () => {
  it('creates a room, registers the socket session, and returns transport effects', () => {
    const result = applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: {
          userId: 'user-host',
          name: 'Host',
          avatar: '🎯',
          ballConfigKey: 'unknown',
        },
      },
      createDeps(['2468'], ['session-host'])
    );

    expect(result.response).toEqual({ success: true, roomCode: '2468', sessionToken: 'session-host' });
    expect(result.socketData).toEqual({ userId: 'user-host', userName: 'Host' });
    expect(result.socketEffects).toEqual([
      { type: 'join_room', roomCode: '2468' },
      { type: 'emit_room_created', roomCode: '2468' },
    ]);
    expect(result.broadcastRoomCode).toBe('2468');

    const room = getRoom('2468');
    expect(room?.hostUserId).toBe('user-host');
    expect(room?.settings.ballConfigKey).toBe('xingpai');
    expect(room?.players[0]).toMatchObject({
      id: 'socket-host',
      userId: 'user-host',
      sessionToken: 'session-host',
      name: 'Host',
      isHost: true,
      online: true,
    });
    expect(getSocketSession('socket-host')).toEqual({ roomCode: '2468', userId: 'user-host' });
  });

  it('joins an existing playing room and deals initial cards to the late player', () => {
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'xingpai' },
      },
      createDeps(['1357'], ['session-host'])
    );
    const room = getRoom('1357') as ServerRoom;
    room.status = 'playing';
    room.settings.cardsPerPlayer = 2;
    room.deck = [createCard('card-1', 1), createCard('card-2', 2), createCard('card-3', 3)];

    const result = applyRoomLifecycleCommand(
      {
        type: 'join_room',
        socketId: 'socket-guest',
        payload: {
          roomCode: '1357',
          userId: 'user-guest',
          name: 'Guest',
          avatar: '🔥',
        },
      },
      createDeps([], ['session-guest'])
    );

    expect(result.response).toEqual({ success: true, roomCode: '1357', sessionToken: 'session-guest' });
    expect(result.socketEffects).toEqual([{ type: 'join_room', roomCode: '1357' }]);
    expect(room.players.find((p) => p.userId === 'user-guest')?.cards).toHaveLength(2);
    expect(room.deck).toHaveLength(1);
    expect(getSocketSession('socket-guest')).toEqual({ roomCode: '1357', userId: 'user-guest' });
  });

  it('requires a valid session token for rejoin and updates the host socket on success', () => {
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'xingpai' },
      },
      createDeps(['8642'], ['session-host'])
    );

    const rejected = applyRoomLifecycleCommand({
      type: 'rejoin_room',
      socketId: 'socket-host-2',
      payload: { roomCode: '8642', userId: 'user-host', sessionToken: 'wrong-token' },
    });

    expect(rejected.response).toEqual({ success: false, message: '身份凭证失效或验证失败，拒绝加入' });
    expect(getSocketSession('socket-host-2')).toBeUndefined();

    const accepted = applyRoomLifecycleCommand({
      type: 'rejoin_room',
      socketId: 'socket-host-2',
      payload: { roomCode: '8642', userId: 'user-host', sessionToken: 'session-host' },
    });

    expect(accepted.response).toEqual({ success: true, roomCode: '8642', sessionToken: 'session-host' });
    expect(getRoom('8642')?.hostSocketId).toBe('socket-host-2');
    expect(getSocketSession('socket-host-2')).toEqual({ roomCode: '8642', userId: 'user-host' });
  });

  it('restores the same hand after a 40-minute disconnect using the saved join credential', () => {
    vi.useFakeTimers();
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'xingpai' },
      },
      createDeps(['1234'], ['session-host'])
    );
    const joined = applyRoomLifecycleCommand(
      {
        type: 'join_room',
        socketId: 'socket-guest',
        payload: { roomCode: '1234', userId: 'watch', name: 'Watch', avatar: '⌚' },
      },
      createDeps([], ['session-watch'])
    );
    const room = getRoom('1234') as ServerRoom;
    room.status = 'playing';
    const watch = room.players.find((player) => player.userId === 'watch');
    const savedToken = joined.response?.sessionToken;
    if (!watch || !savedToken) throw new Error('Watch join did not create a session');
    watch.cards = [createCard('remaining', 8)];
    watch.pocketedCards = [createCard('pocketed', 2)];
    watch.totalScore = 12;
    const deck = [...room.deck];
    applyRoomLifecycleCommand({ type: 'disconnect', socketId: 'socket-guest' });
    vi.advanceTimersByTime(40 * 60 * 1000);

    const wrongFlow = applyRoomLifecycleCommand({
      type: 'join_room',
      socketId: 'socket-b',
      payload: { roomCode: '1234', userId: 'watch', name: 'Watch', avatar: '⌚' },
    });
    expect(wrongFlow.response?.success).toBe(false);
    expect(getSocketSession('socket-b')).toBeUndefined();

    const restored = applyRoomLifecycleCommand({
      type: 'rejoin_room',
      socketId: 'socket-b',
      payload: { roomCode: '1234', userId: 'watch', sessionToken: savedToken },
    });
    expect(restored.response?.success).toBe(true);
    expect(getSocketSession('socket-b')).toEqual({ roomCode: '1234', userId: 'watch' });
    expect(watch.online).toBe(true);
    expect(watch.cards).toEqual([createCard('remaining', 8)]);
    expect(watch.pocketedCards).toEqual([createCard('pocketed', 2)]);
    expect(watch.totalScore).toBe(12);
    expect(room.players).toHaveLength(2);
    expect(room.deck).toEqual(deck);
  });

  it('transfers host ownership when the current host leaves', () => {
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'xingpai' },
      },
      createDeps(['4321'], ['session-host'])
    );
    applyRoomLifecycleCommand(
      {
        type: 'join_room',
        socketId: 'socket-guest',
        payload: { roomCode: '4321', userId: 'user-guest', name: 'Guest', avatar: '🔥' },
      },
      createDeps([], ['session-guest'])
    );

    const result = applyRoomLifecycleCommand({
      type: 'leave_room',
      socketId: 'socket-host',
      payload: { roomCode: '4321' },
    });

    const room = getRoom('4321');
    expect(result.socketEffects).toEqual([{ type: 'leave_room', roomCode: '4321' }]);
    expect(result.broadcastRoomCode).toBe('4321');
    expect(room?.hostUserId).toBe('user-guest');
    expect(room?.hostSocketId).toBe('socket-guest');
    expect(room?.players).toHaveLength(1);
    expect(room?.players[0].isHost).toBe(true);
    expect(getSocketSession('socket-host')).toBeUndefined();
  });

  it('rejects join_room if userId already exists in the room to prevent session hijacking', () => {
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'xingpai' },
      },
      createDeps(['5555'], ['session-host'])
    );

    // Attacker tries to hijack user-host session via join_room
    const hijackAttempt = applyRoomLifecycleCommand(
      {
        type: 'join_room',
        socketId: 'socket-attacker',
        payload: { roomCode: '5555', userId: 'user-host', name: 'Attacker', avatar: '😈' },
      },
      createDeps([], ['session-attacker'])
    );

    expect(hijackAttempt.response).toEqual({
      success: false,
      message: '玩家已在房间中，请使用凭证重连',
    });
    expect(hijackAttempt.changed).toBe(false);
    expect(hijackAttempt.socketEffects).toBeUndefined();
    expect(getSocketSession('socket-attacker')).toBeUndefined();

    // Verify original host player was untouched
    const room = getRoom('5555');
    expect(room?.hostSocketId).toBe('socket-host');
    expect(room?.players[0].sessionToken).toBe('session-host');
    expect(room?.players[0].id).toBe('socket-host');
    expect(room?.players).toHaveLength(1);
  });

  it('rejects join_room if userId or name is missing', () => {
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'xingpai' },
      },
      createDeps(['1111'], ['session-host'])
    );

    const noUser = applyRoomLifecycleCommand({
      type: 'join_room',
      socketId: 'socket-guest',
      payload: { roomCode: '1111', userId: '', name: 'Guest', avatar: '🎯' },
    });
    expect(noUser.response).toEqual({ success: false, message: '用户信息不完整' });

    const noName = applyRoomLifecycleCommand({
      type: 'join_room',
      socketId: 'socket-guest',
      payload: { roomCode: '1111', userId: 'guest-1', name: '', avatar: '🎯' },
    });
    expect(noName.response).toEqual({ success: false, message: '用户信息不完整' });
  });

  it('keeps a multi-socket user online until the last socket disconnects', () => {
    vi.useFakeTimers();
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-a',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'xingpai' },
      },
      createDeps(['6789'], ['session-host'])
    );
    applyRoomLifecycleCommand({
      type: 'rejoin_room',
      socketId: 'socket-b',
      payload: { roomCode: '6789', userId: 'user-host', sessionToken: 'session-host' },
    });

    const firstDisconnect = applyRoomLifecycleCommand({ type: 'disconnect', socketId: 'socket-a' });
    expect(firstDisconnect.changed).toBe(false);
    expect(firstDisconnect.broadcastRoomCode).toBeUndefined();
    expect(getRoom('6789')?.players[0].online).toBe(true);

    const secondDisconnect = applyRoomLifecycleCommand({ type: 'disconnect', socketId: 'socket-b' });
    expect(secondDisconnect.changed).toBe(true);
    expect(secondDisconnect.broadcastRoomCode).toBe('6789');
    expect(getRoom('6789')?.players[0].online).toBe(false);
    expect(roomCleanupTimers.has('6789')).toBe(true);
  });
});

describe('host-only player removal', () => {
  beforeEach(() => {
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: {
          userId: 'user-host',
          name: 'Host',
          avatar: '🎱',
          ballConfigKey: 'xingpai',
        },
      },
      createDeps(['1234'], ['host-token'])
    );
    applyRoomLifecycleCommand(
      {
        type: 'join_room',
        socketId: 'socket-guest',
        payload: {
          roomCode: '1234',
          userId: 'user-guest',
          name: 'Guest',
          avatar: '🎱',
        },
      },
      createDeps([], ['guest-token'])
    );
  });

  it.each(['waiting', 'lobby'] as const)(
    'removes all guest sessions in %s and rejects the old credential',
    (status) => {
      const room = getRoom('1234') as ServerRoom;
      room.status = status;
      applyRoomLifecycleCommand({
        type: 'rejoin_room',
        socketId: 'socket-b',
        payload: {
          roomCode: '1234',
          userId: 'user-guest',
          sessionToken: 'guest-token',
        },
      });
      const result = applyRoomLifecycleCommand({
        type: 'kick_player',
        socketId: 'socket-host',
        payload: {
          roomCode: '1234',
          targetUserId: 'user-guest',
        },
      });
      expect(result.changed).toBe(true);
      expect(result.broadcastRoomCode).toBe('1234');
      expect(result.socketEffects).toEqual([
        { type: 'kick_player', roomCode: '1234', socketIds: ['socket-guest', 'socket-b'] },
      ]);
      expect(room.players.map((p) => p.userId)).toEqual(['user-host']);
      expect(room.hostUserId).toBe('user-host');
      expect(getSocketSession('socket-guest')).toBeUndefined();
      expect(getSocketSession('socket-b')).toBeUndefined();
      expect(
        applyRoomLifecycleCommand({
          type: 'rejoin_room',
          socketId: 'socket-b',
          payload: {
            roomCode: '1234',
            userId: 'user-guest',
            sessionToken: 'guest-token',
          },
        }).response?.success
      ).toBe(false);
    }
  );

  it.each([
    ['socket-guest', 'user-host'],
    ['socket-a', 'user-guest'],
    ['socket-host', 'user-host'],
    ['socket-host', 'missing'],
  ])('rejects unauthorized or invalid removal by %s of %s', (socketId, targetUserId) => {
    expect(
      applyRoomLifecycleCommand({ type: 'kick_player', socketId, payload: { roomCode: '1234', targetUserId } }).changed
    ).toBe(false);
    expect(getRoom('1234')?.players).toHaveLength(2);
    expect(getSocketSession('socket-guest')).toBeDefined();
  });

  it.each(['playing', 'ended', 'finished'] as const)('rejects removal during %s', (status) => {
    const room = getRoom('1234') as ServerRoom;
    room.status = status;
    expect(
      applyRoomLifecycleCommand({
        type: 'kick_player',
        socketId: 'socket-host',
        payload: {
          roomCode: '1234',
          targetUserId: 'user-guest',
        },
      }).changed
    ).toBe(false);
    expect(room.players).toHaveLength(2);
  });

  it('rejects a host identity from a different room', () => {
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-a',
        payload: {
          userId: 'user-host',
          name: 'Other',
          avatar: '🎱',
          ballConfigKey: 'xingpai',
        },
      },
      createDeps(['5678'])
    );
    expect(
      applyRoomLifecycleCommand({
        type: 'kick_player',
        socketId: 'socket-a',
        payload: {
          roomCode: '1234',
          targetUserId: 'user-guest',
        },
      }).changed
    ).toBe(false);
    expect(getRoom('1234')?.players).toHaveLength(2);
  });

  it('can remove an offline player', () => {
    applyRoomLifecycleCommand({ type: 'disconnect', socketId: 'socket-guest' });
    expect(
      applyRoomLifecycleCommand({
        type: 'kick_player',
        socketId: 'socket-host',
        payload: {
          roomCode: '1234',
          targetUserId: 'user-guest',
        },
      }).changed
    ).toBe(true);
    expect(getRoom('1234')?.players).toHaveLength(1);
  });

  it('only removes the caller session and prevents unauthorized leave_room', () => {
    // Sockets without matching session cannot leave or affect the room
    expect(
      applyRoomLifecycleCommand({
        type: 'leave_room',
        socketId: 'socket-outsider',
        payload: {
          roomCode: '1234',
        },
      }).changed
    ).toBe(false);
    expect(getRoom('1234')?.players).toHaveLength(2);

    // Guest leaving only removes guest, host is unaffected
    const guestLeaveResult = applyRoomLifecycleCommand({
      type: 'leave_room',
      socketId: 'socket-guest',
      payload: {
        roomCode: '1234',
      },
    });
    expect(guestLeaveResult.changed).toBe(true);
    const room = getRoom('1234');
    expect(room?.players).toHaveLength(1);
    expect(room?.players[0].userId).toBe('user-host');
    expect(getSocketSession('socket-guest')).toBeUndefined();
  });
});
