import { describe, expect, it } from 'vitest';
import type { Card, ServerRoom } from '../../shared/types/game';
import { getClientRoomState, rooms } from '../roomManager';

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
