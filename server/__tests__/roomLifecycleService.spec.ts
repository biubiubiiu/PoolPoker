import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card, ServerRoom } from '../../shared/types/game';
import { applyRoomLifecycleCommand, type RoomLifecycleDependencies } from '../roomLifecycleService';
import { getRoom, getSocketSession, removeRoom, removeSocketSession, roomCleanupTimers, rooms } from '../roomManager';

function createDeps(roomCodes: string[] = ['1234'], sessionTokens: string[] = ['token-1']): RoomLifecycleDependencies {
  let roomCodeIndex = 0;
  let tokenIndex = 0;
  return {
    createRoomCode: () => roomCodes[roomCodeIndex++] ?? '9999',
    createSessionToken: () => sessionTokens[tokenIndex++] ?? `token-${tokenIndex}`,
    validateBallConfigKey: (key) => key === 'default' || key === 'xingpai',
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
    expect(room?.settings.ballConfigKey).toBe('default');
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
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'default' },
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

  it('transfers host ownership when the current host leaves', () => {
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-host',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'default' },
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
      payload: { roomCode: '4321', userId: 'user-host' },
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

  it('keeps a multi-socket user online until the last socket disconnects', () => {
    vi.useFakeTimers();
    applyRoomLifecycleCommand(
      {
        type: 'create_room',
        socketId: 'socket-a',
        payload: { userId: 'user-host', name: 'Host', avatar: '🎱', ballConfigKey: 'default' },
      },
      createDeps(['6789'], ['session-host'])
    );
    applyRoomLifecycleCommand(
      {
        type: 'join_room',
        socketId: 'socket-b',
        payload: { roomCode: '6789', userId: 'user-host', name: 'Host', avatar: '🎱' },
      },
      createDeps([], ['session-host'])
    );

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
