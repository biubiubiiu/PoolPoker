import { beforeEach, describe, expect, it } from 'vitest';
import { DISCOVERY, type DiscoveryPosition } from '../../shared/types/discovery';
import type { ServerRoom } from '../../shared/types/game';
import { distanceMeters, RoomDiscovery } from '../roomDiscovery';
import type { SocketSession } from '../roomManager';

function room(code = '1234'): ServerRoom {
  return {
    code,
    status: 'waiting',
    hostUserId: 'host',
    hostSocketId: 'host-socket',
    players: [
      {
        id: 'host-socket',
        userId: 'host',
        name: 'Alice',
        online: true,
        cards: [],
        pocketedCards: [],
        cardCount: 0,
        avatar: '🎱',
        isHost: true,
        wins: 0,
        isWinner: false,
        totalScore: 0,
        sessionToken: 'secret',
      },
    ],
    settings: { maxPlayers: 8, cardsPerPlayer: 5, includeBlackEight: true, ballConfigKey: 'xingpai' },
    deck: [],
    accidentalBalls: [],
    breakBalls: [],
    winners: [],
    turnOrder: [],
    roundCount: 0,
    logs: [],
    lastRoundScores: [],
    gameHistory: [],
  };
}

describe('nearby room discovery', () => {
  let now: number;
  let rooms: ServerRoom[];
  let sessions: Map<string, SocketSession>;
  let discovery: RoomDiscovery;
  const position = (mode: 'browse' | 'advertise' = 'browse', longitude = 121.47): DiscoveryPosition => ({
    latitude: 31.23,
    longitude,
    accuracy: 15,
    timestamp: now,
    mode,
  });
  beforeEach(() => {
    now = 100_000;
    rooms = [room()];
    sessions = new Map([['host-socket', { roomCode: '1234', userId: 'host' }]]);
    discovery = new RoomDiscovery(
      () => rooms,
      (id) => sessions.get(id),
      () => now
    );
    discovery.update('viewer', position());
    discovery.update('host-socket', position('advertise'));
  });

  it('discovers a new room without another viewer location update and returns only public summaries', () => {
    expect(discovery.nearby('viewer')).toEqual([
      {
        roomCode: '1234',
        hostName: 'Alice',
        playerCount: 1,
        maxPlayers: 8,
        source: 'geolocation',
      },
    ]);
    rooms.push(room('5678'));
    sessions.set('host-2', { roomCode: '5678', userId: 'host' });
    discovery.update('host-2', position('advertise', 121.471));
    expect(discovery.nearby('viewer').map((r) => r.roomCode)).toEqual(['1234', '5678']);
  });

  it('excludes distant rooms and supports a configured radius', () => {
    now += 1000;
    discovery.update('viewer', position('browse', 121.48));
    expect(discovery.nearby('viewer')).toEqual([]);
    const wider = new RoomDiscovery(
      () => rooms,
      (id) => sessions.get(id),
      () => now,
      2000
    );
    wider.update('viewer', position('browse', 121.48));
    wider.update('host-socket', position('advertise'));
    expect(wider.nearby('viewer')).toHaveLength(1);
  });

  it('hides full rooms and shows freed seats without requiring host relocation', () => {
    rooms[0].settings.maxPlayers = 1;
    expect(discovery.nearby('viewer')).toEqual([]);
    rooms[0].settings.maxPlayers = 8;
    expect(discovery.nearby('viewer')).toHaveLength(1);
  });

  it.each(['playing', 'finished'] as const)('removes %s rooms, even before the host client stops', (status) => {
    rooms[0].status = status;
    expect(discovery.nearby('viewer')).toEqual([]);
    rooms[0].status = 'waiting';
    expect(discovery.nearby('viewer')).toEqual([]);
  });

  it('does not let guests publish, and removes the former host after transfer', () => {
    sessions.set('guest', { roomCode: '1234', userId: 'guest' });
    expect(discovery.update('guest', position('advertise')).success).toBe(false);
    rooms[0].hostUserId = 'guest';
    expect(discovery.nearby('viewer')).toEqual([]);
  });

  it('requires fresh host presence after room deletion and code reuse', () => {
    rooms = [room()];
    expect(discovery.nearby('viewer')).toEqual([]);
  });

  it('expires both host and viewer location; a refresh cannot renew stale coordinates', () => {
    const stale = position('advertise');
    now += DISCOVERY.positionMaxAgeMs + 1;
    expect(discovery.nearby('viewer')).toEqual([]);
    expect(discovery.update('host-socket', stale).success).toBe(false);
    discovery.update('host-socket', position('advertise'));
    expect(discovery.nearby('viewer')).toEqual([]);
    discovery.update('viewer', position());
    expect(discovery.nearby('viewer')).toHaveLength(1);
  });

  it('removes stopped or disconnected advertisers and excludes joined viewers', () => {
    discovery.remove('host-socket');
    expect(discovery.nearby('viewer')).toEqual([]);
    discovery.update('host-socket', position('advertise'));
    sessions.set('viewer', { roomCode: '1234', userId: 'viewer' });
    expect(discovery.nearby('viewer')).toEqual([]);
  });

  it('deduplicates multiple host sockets and keeps a remaining valid socket', () => {
    sessions.set('host-watch', { roomCode: '1234', userId: 'host' });
    discovery.update('host-watch', position('advertise'));
    expect(discovery.nearby('viewer')).toHaveLength(1);
    discovery.remove('host-socket');
    expect(discovery.nearby('viewer')).toHaveLength(1);
    sessions.delete('host-watch');
    expect(discovery.nearby('viewer')).toEqual([]);
  });

  it.each([
    null,
    {},
    { latitude: NaN },
    { latitude: 91 },
    { longitude: 181 },
    { accuracy: -1 },
    { accuracy: 301 },
    { timestamp: 0 },
    { timestamp: 200_000 },
    { mode: 'bogus' },
    { latitude: '31' },
  ])('rejects malformed, stale, inaccurate or future input: %j', (invalid) => {
    expect(
      discovery.update(
        'host-socket',
        invalid === null
          ? null
          : { ...position('advertise'), ...invalid, ...(Object.keys(invalid).length ? {} : { mode: undefined }) }
      ).success
    ).toBe(false);
    expect(discovery.nearby('viewer')).toEqual([]);
  });

  it('bounds update frequency without removing valid presence', () => {
    expect(discovery.update('viewer', position()).success).toBe(false);
    expect(discovery.nearby('viewer')).toHaveLength(1);
  });

  it('calculates nearby distances across the date line', () => {
    const a = { ...position(), latitude: 0, longitude: 179.999 };
    const b = { ...a, longitude: -179.999 };
    expect(distanceMeters(a, b)).toBeCloseTo(222.39, 1);
  });
});
