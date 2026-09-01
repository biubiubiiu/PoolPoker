import { describe, expect, it, vi } from 'vitest';
import type { Card, ServerRoom } from '../../shared/types/game';
import {
  cancelRoomCleanup,
  checkAndManageRoomCleanup,
  getClientRoomState,
  roomCleanupTimers,
  rooms,
} from '../roomManager';

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

describe('roomManager getClientRoomState', () => {
  it('should obscure unpocketed cards for other players but show pocketedCards for all players', () => {
    const card1 = createDummyCard('c1', 'A', 1);
    const card2 = createDummyCard('c2', '2', 2);
    const pocketedCard = createDummyCard('c3', '3', 3);

    const roomCode = 'test-room-100';
    rooms[roomCode] = {
      code: roomCode,
      status: 'playing',
      hostUserId: 'u1',
      hostSocketId: 's1',
      settings: {
        cardsPerPlayer: 5,
        maxPlayers: 8,
        includeBlackEight: true,
        ballConfigKey: 'default',
      },
      players: [
        {
          id: 's1',
          userId: 'u1',
          name: 'Player 1',
          avatar: '😀',
          isHost: true,
          online: true,
          cards: [card1],
          pocketedCards: [pocketedCard],
          cardCount: 1,
          activeCardCount: 1,
          wins: 0,
          isWinner: false,
          totalScore: 0,
        },
        {
          id: 's2',
          userId: 'u2',
          name: 'Player 2',
          avatar: '😎',
          isHost: false,
          online: true,
          cards: [card2],
          pocketedCards: [],
          cardCount: 1,
          activeCardCount: 1,
          wins: 0,
          isWinner: false,
          totalScore: 0,
        },
      ],
      deck: [],
      accidentalBalls: [],
      breakBalls: [],
      winners: [],
      turnOrder: ['u1', 'u2'],
      roundCount: 1,
      logs: [],
      lastRoundScores: [],
      gameHistory: [],
    } as ServerRoom;

    // View from u2's perspective (isSelf = false for u1, isSelf = true for u2)
    const clientState = getClientRoomState(roomCode, 'u2');
    expect(clientState).not.toBeNull();

    if (clientState) {
      const p1 = clientState.players.find((p) => p.userId === 'u1');
      const p2 = clientState.players.find((p) => p.userId === 'u2');

      // Player 1's secret hand cards should be clipped (empty array) for Player 2
      expect(p1?.cards).toEqual([]);

      // Player 1's pocketedCards (eliminated cards) MUST be visible to Player 2
      expect(p1?.pocketedCards).toEqual([pocketedCard]);

      // Player 2's own cards should be visible to Player 2
      expect(p2?.cards).toEqual([card2]);
      expect(p2?.pocketedCards).toEqual([]);
    }

    delete rooms[roomCode];
  });
});

describe('roomManager room cleanup timers', () => {
  it('should schedule room cleanup when all players are offline and disband after timeout', () => {
    vi.useFakeTimers();
    const roomCode = 'test-room-disband-1';
    rooms[roomCode] = {
      code: roomCode,
      status: 'waiting',
      hostUserId: 'u1',
      hostSocketId: 's1',
      settings: { cardsPerPlayer: 5, maxPlayers: 8, includeBlackEight: true, ballConfigKey: 'default' },
      players: [
        {
          id: 's1',
          userId: 'u1',
          name: 'P1',
          avatar: '😀',
          isHost: true,
          online: false,
          cards: [],
          pocketedCards: [],
          cardCount: 0,
          activeCardCount: 0,
          wins: 0,
          isWinner: false,
          totalScore: 0,
        },
      ],
      deck: [],
      accidentalBalls: [],
      breakBalls: [],
      winners: [],
      turnOrder: [],
      roundCount: 0,
      logs: [],
      lastRoundScores: [],
      gameHistory: [],
    } as ServerRoom;

    checkAndManageRoomCleanup(roomCode, 3600000);
    expect(roomCleanupTimers.has(roomCode)).toBe(true);
    expect(rooms[roomCode]).toBeDefined();

    // Advance 30 mins -> room still exists
    vi.advanceTimersByTime(1800000);
    expect(rooms[roomCode]).toBeDefined();

    // Advance another 30 mins (total 1 hour) -> room is disbanded
    vi.advanceTimersByTime(1800000);
    expect(rooms[roomCode]).toBeUndefined();
    expect(roomCleanupTimers.has(roomCode)).toBe(false);

    vi.useRealTimers();
  });

  it('should cancel cleanup timer when a player reconnects', () => {
    vi.useFakeTimers();
    const roomCode = 'test-room-rejoin-1';
    rooms[roomCode] = {
      code: roomCode,
      status: 'waiting',
      hostUserId: 'u1',
      hostSocketId: 's1',
      settings: { cardsPerPlayer: 5, maxPlayers: 8, includeBlackEight: true, ballConfigKey: 'default' },
      players: [
        {
          id: 's1',
          userId: 'u1',
          name: 'P1',
          avatar: '😀',
          isHost: true,
          online: false,
          cards: [],
          pocketedCards: [],
          cardCount: 0,
          activeCardCount: 0,
          wins: 0,
          isWinner: false,
          totalScore: 0,
        },
      ],
      deck: [],
      accidentalBalls: [],
      breakBalls: [],
      winners: [],
      turnOrder: [],
      roundCount: 0,
      logs: [],
      lastRoundScores: [],
      gameHistory: [],
    } as ServerRoom;

    checkAndManageRoomCleanup(roomCode, 3600000);
    expect(roomCleanupTimers.has(roomCode)).toBe(true);

    // Player reconnects
    rooms[roomCode].players[0].online = true;
    checkAndManageRoomCleanup(roomCode);

    expect(roomCleanupTimers.has(roomCode)).toBe(false);

    // Advance 1 hour -> room should NOT be deleted
    vi.advanceTimersByTime(3600000);
    expect(rooms[roomCode]).toBeDefined();

    cancelRoomCleanup(roomCode);
    delete rooms[roomCode];
    vi.useRealTimers();
  });

  it('should immediately delete empty rooms when players length is 0', () => {
    const roomCode = 'test-room-empty-1';
    rooms[roomCode] = {
      code: roomCode,
      status: 'waiting',
      hostUserId: 'u1',
      hostSocketId: 's1',
      settings: { cardsPerPlayer: 5, maxPlayers: 8, includeBlackEight: true, ballConfigKey: 'default' },
      players: [],
      deck: [],
      accidentalBalls: [],
      breakBalls: [],
      winners: [],
      turnOrder: [],
      roundCount: 0,
      logs: [],
      lastRoundScores: [],
      gameHistory: [],
    } as ServerRoom;

    checkAndManageRoomCleanup(roomCode);
    expect(rooms[roomCode]).toBeUndefined();
    expect(roomCleanupTimers.has(roomCode)).toBe(false);
  });
});
