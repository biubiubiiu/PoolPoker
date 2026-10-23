import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, Player, ServerRoom } from '../../shared/types/game';
import { CLIENT_TO_SERVER_EVENTS } from '../../shared/types/protocol';
import { createApp } from '../app';
import { registerSocketSession, removeRoom, removeSocketSession, saveRoom } from '../roomManager';
import { registerSocketHandlers } from '../socketHandlers';

function createDummyCard(id: string, rank: string, ballNumber: number): Card {
  return {
    id,
    suit: '♠',
    suitType: 'spade',
    color: 'black',
    rank,
    ballNumber,
  };
}

function createDummyPlayer(overrides: Partial<Player>): Player {
  return {
    id: overrides.id ?? 'socket-1',
    userId: overrides.userId ?? 'user-1',
    sessionToken: overrides.sessionToken ?? 'token-1',
    name: overrides.name ?? 'Player 1',
    isHost: overrides.isHost ?? false,
    online: overrides.online ?? true,
    cardCount: overrides.cards?.length ?? 0,
    cards: overrides.cards ?? [],
    pocketedCards: overrides.pocketedCards ?? [],
    wins: 0,
    isWinner: false,
    totalScore: 0,
  };
}

function createTestRoom(code = 'test-entrypoint-room'): ServerRoom {
  return {
    code,
    status: 'playing',
    hostUserId: 'host-user',
    hostSocketId: 'host-socket',
    settings: { cardsPerPlayer: 2, maxPlayers: 8, includeBlackEight: true },
    players: [
      createDummyPlayer({
        id: 'host-socket',
        userId: 'host-user',
        sessionToken: 'host-token-123',
        name: 'HostPlayer',
        isHost: true,
        cards: [createDummyCard('c1', 'A', 1), createDummyCard('c2', '2', 2)],
      }),
      createDummyPlayer({
        id: 'victim-socket',
        userId: 'victim-user',
        sessionToken: 'victim-token-456',
        name: 'VictimPlayer',
        isHost: false,
        cards: [createDummyCard('c3', '3', 3), createDummyCard('c4', '4', 4)],
      }),
    ],
    deck: [],
    accidentalBalls: [],
    breakBalls: [],
    winners: [],
    turnOrder: ['host-user', 'victim-user'],
    roundCount: 1,
    logs: [],
    lastRoundScores: [],
    gameHistory: [],
  };
}

describe('HTTP /api/rooms/:code snapshot authorization entrypoint (Real Application)', () => {
  let server: Server;
  let baseUrl: string;
  let room: ServerRoom;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    room = createTestRoom('room-http-real-test');
    saveRoom(room);
    return () => {
      removeRoom(room.code);
    };
  });

  it('rejects an attacker who knows victim userId but lacks sessionToken (401)', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${room.code}?userId=victim-user`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('身份凭证失效或验证失败');
  });

  it('rejects an attacker who sends an invalid sessionToken (401)', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${room.code}?userId=victim-user&sessionToken=stolen-guess`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain('身份凭证失效或验证失败');
  });

  it('allows public anonymous observer access without leaking any secret cards (200)', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${room.code}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.room.code).toBe(room.code);
    expect(data.room.players[0].cards).toEqual([]);
    expect(data.room.players[1].cards).toEqual([]);
    expect(data.room.players[0].cardCount).toBe(2);
    expect(data.room.players[1].cardCount).toBe(2);
  });

  it('allows legitimate player with valid sessionToken in query param to read their hand cards', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${room.code}?userId=victim-user&sessionToken=victim-token-456`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // Victim's own cards are returned
    expect(data.room.players[1].cards.map((c: Card) => c.id)).toEqual(['c3', 'c4']);
    // Other player's cards are still obscured
    expect(data.room.players[0].cards).toEqual([]);
  });

  it('allows legitimate player with valid sessionToken in x-session-token header', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${room.code}?userId=victim-user`, {
      headers: { 'x-session-token': 'victim-token-456' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.room.players[1].cards.map((c: Card) => c.id)).toEqual(['c3', 'c4']);
    expect(data.room.players[0].cards).toEqual([]);
  });

  it('handles CORS OPTIONS preflight request and explicitly permits x-session-token header', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${room.code}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://tauri.localhost',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-session-token',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const allowHeaders = res.headers.get('access-control-allow-headers') || '';
    expect(allowHeaders.toLowerCase()).toContain('x-session-token');
  });

  it('handles cross-origin GET request with x-session-token without CORS violation', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/${room.code}?userId=victim-user`, {
      method: 'GET',
      headers: {
        Origin: 'http://tauri.localhost',
        'x-session-token': 'victim-token-456',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.room.players[1].cards).toHaveLength(2);
  });
});

describe('Socket command authorization entrypoint', () => {
  let room: ServerRoom;
  let listeners: Map<string, (...args: any[]) => void>;
  let socketMock: any;
  let ioMock: any;

  beforeEach(() => {
    room = createTestRoom('room-socket-test');
    saveRoom(room);
    listeners = new Map();

    socketMock = {
      id: 'test-socket-id',
      on: (event: string, handler: (...args: any[]) => void) => {
        listeners.set(event, handler);
      },
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      data: {},
    };

    ioMock = {
      sockets: {
        adapter: {
          rooms: new Map([[room.code, new Set([socketMock.id])]]),
        },
        sockets: new Map([[socketMock.id, socketMock]]),
      },
    };

    registerSocketHandlers(ioMock as any, socketMock as any);

    return () => {
      removeSocketSession(socketMock.id);
      removeRoom(room.code);
    };
  });

  it('rejects accidentalPocket from an unjoined connection', () => {
    const callback = vi.fn();
    const handler = listeners.get(CLIENT_TO_SERVER_EVENTS.accidentalPocket);
    expect(handler).toBeDefined();

    // 未入房的 socket 调用 accidentalPocket
    handler?.({ roomCode: 'room-socket-test', ballNumber: 7 }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('请先加入这个房间'),
      })
    );
    expect(room.accidentalBalls).not.toContain(7);
  });

  it('allows accidentalPocket when socket is a joined room member', () => {
    registerSocketSession(socketMock.id, room.code, 'victim-user');
    const callback = vi.fn();
    const handler = listeners.get(CLIENT_TO_SERVER_EVENTS.accidentalPocket);

    handler?.({ roomCode: 'room-socket-test', ballNumber: 7 }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
    expect(room.accidentalBalls).toContain(7);
  });

  it('rejects breakPocket from an unjoined connection', () => {
    const callback = vi.fn();
    const handler = listeners.get(CLIENT_TO_SERVER_EVENTS.breakPocket);
    handler?.({ roomCode: 'room-socket-test', ballNumber: 9 }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('请先加入这个房间'),
      })
    );
    expect(room.breakBalls).not.toContain(9);
  });

  it('rejects retractBall from an unjoined connection', () => {
    const callback = vi.fn();
    const handler = listeners.get(CLIENT_TO_SERVER_EVENTS.retractBall);
    handler?.({ roomCode: 'room-socket-test' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('请先加入这个房间'),
      })
    );
  });

  it('rejects refereePocketBall from an unjoined connection', () => {
    const callback = vi.fn();
    const handler = listeners.get(CLIENT_TO_SERVER_EVENTS.refereePocketBall);
    handler?.({ roomCode: 'room-socket-test', targetUserId: 'victim-user', ballNumber: 3 }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('请先加入这个房间'),
      })
    );
  });

  it('rejects refereeDrawPenalty from an unjoined connection', () => {
    const callback = vi.fn();
    const handler = listeners.get(CLIENT_TO_SERVER_EVENTS.refereeDrawPenalty);
    handler?.({ roomCode: 'room-socket-test', targetUserId: 'victim-user' }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('请先加入这个房间'),
      })
    );
  });
});
