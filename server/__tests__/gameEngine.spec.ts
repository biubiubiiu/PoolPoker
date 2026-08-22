import { describe, expect, it, vi } from 'vitest';
import type { Card, Player, ServerRoom } from '../../shared/types/game';
import {
  addLog,
  calculateHandScore,
  checkGameWinners,
  computeTurnOrder,
  getPocketedBallNumbers,
  handleGameFinished,
} from '../gameEngine';

// Mock sendRoundResultToWecom to avoid making real network requests in unit tests
vi.mock('../wecomWebhook', () => ({
  sendRoundResultToWecom: vi.fn(),
}));

function createTestCard(rank: string, ballNumber: number, suitType: Card['suitType'] = 'spade'): Card {
  const suitSymbolMap: Record<Card['suitType'], string> = {
    spade: '♠',
    heart: '♥',
    club: '♣',
    diamond: '♦',
    'joker-small': '🃏',
    'joker-big': '👑',
  };
  const colorMap: Record<Card['suitType'], Card['color']> = {
    spade: 'black',
    club: 'black',
    heart: 'red',
    diamond: 'red',
    'joker-small': 'gray',
    'joker-big': 'gold',
  };

  return {
    id: `c_${ballNumber}_${rank}_${suitType}`,
    suit: suitSymbolMap[suitType],
    suitType,
    color: colorMap[suitType],
    rank,
    ballNumber,
  };
}

describe('gameEngine logic', () => {
  describe('addLog', () => {
    it('should add log entries and cap at max 50 entries', () => {
      const room = { logs: [] } as unknown as ServerRoom;

      for (let i = 1; i <= 60; i++) {
        addLog(room, `Log entry ${i}`);
      }

      expect(room.logs).toHaveLength(50);
      expect(room.logs[0].text).toBe('Log entry 11');
      expect(room.logs[49].text).toBe('Log entry 60');
    });
  });

  describe('getPocketedBallNumbers', () => {
    it('should combine and deduplicate pocketed ball numbers from accidental, break, and player pocketed cards', () => {
      const room: Partial<ServerRoom> = {
        accidentalBalls: [14, 5],
        breakBalls: [8, 5], // 5 is duplicated
        players: [
          {
            pocketedCards: [createTestCard('A', 1), createTestCard('K', 13)],
          } as Player,
        ],
      };

      const result = getPocketedBallNumbers(room as ServerRoom);
      expect(result).toEqual([1, 5, 8, 13, 14]); // Sorted asc, no duplicates
    });

    it('should return empty array if no balls pocketed', () => {
      const room: Partial<ServerRoom> = { players: [] };
      expect(getPocketedBallNumbers(room as ServerRoom)).toEqual([]);
    });
  });

  describe('calculateHandScore', () => {
    it('should return 0 for empty hand', () => {
      expect(calculateHandScore([])).toBe(0);
    });

    it('should calculate score for single standard cards (base 2)', () => {
      const cards = [createTestCard('A', 1), createTestCard('2', 2)];
      // Group 'A': count 1, sumBase 2 -> 2 * 1 = 2
      // Group '2': count 1, sumBase 2 -> 2 * 1 = 2
      // Total = 4
      expect(calculateHandScore(cards)).toBe(4);
    });

    it('should calculate multiplier for same rank cards (n * sumBase)', () => {
      const cards = [createTestCard('A', 1, 'spade'), createTestCard('A', 1, 'heart'), createTestCard('A', 1, 'club')];
      // Group 'A': count 3, sumBase (2+2+2)=6 -> 6 * 3 = 18
      expect(calculateHandScore(cards)).toBe(18);
    });

    it('should handle jokers with base 1', () => {
      const cards = [createTestCard('SmallJoker', 14, 'joker-small'), createTestCard('BigJoker', 15, 'joker-big')];
      // SmallJoker (rank SmallJoker): count 1, base 1 -> 1 * 1 = 1
      // BigJoker (rank BigJoker): count 1, base 1 -> 1 * 1 = 1
      // Total = 2
      expect(calculateHandScore(cards)).toBe(2);
    });
  });

  describe('checkGameWinners', () => {
    it('should identify winner when all player remaining cards match pocketed ball numbers', () => {
      const room: Partial<ServerRoom> = {
        status: 'playing',
        accidentalBalls: [1, 2],
        breakBalls: [],
        players: [
          {
            id: 'p1',
            name: 'P1',
            cards: [createTestCard('A', 1), createTestCard('2', 2)], // both pocketed
            isWinner: false,
          } as Player,
          {
            id: 'p2',
            name: 'P2',
            cards: [createTestCard('3', 3)], // 3 not pocketed
            isWinner: false,
          } as Player,
        ],
      };

      const winners = checkGameWinners(room as ServerRoom);
      expect(winners).toHaveLength(1);
      expect(winners[0].id).toBe('p1');
      expect(winners[0].isWinner).toBe(true);
    });

    it('should return empty list if game is not in playing status', () => {
      const room: Partial<ServerRoom> = {
        status: 'finished',
        players: [{ cards: [] } as unknown as Player],
      };
      expect(checkGameWinners(room as ServerRoom)).toEqual([]);
    });
  });

  describe('handleGameFinished', () => {
    it('should update room status, winner wins, total scores and lastRoundScores correctly', () => {
      const p1: Partial<Player> = {
        id: 'p1',
        userId: 'u1',
        name: 'P1',
        cards: [createTestCard('A', 1)], // pocketed
        wins: 0,
        totalScore: 0,
      };
      const p2: Partial<Player> = {
        id: 'p2',
        userId: 'u2',
        name: 'P2',
        cards: [createTestCard('5', 5)], // remaining -> score = 2
        wins: 0,
        totalScore: 0,
      };

      const room: Partial<ServerRoom> = {
        status: 'playing',
        accidentalBalls: [1],
        breakBalls: [],
        players: [p1 as Player, p2 as Player],
        logs: [],
      };

      handleGameFinished(room as ServerRoom, [p1 as Player], p1 as Player);

      expect(room.status).toBe('finished');
      expect(p1.wins).toBe(1);
      expect(p2.totalScore).toBe(-2);
      expect(p1.totalScore).toBe(2);
      expect(room.lastRoundScores).toEqual([
        { userId: 'u2', delta: -2 },
        { userId: 'u1', delta: 2 },
      ]);
    });
  });

  describe('computeTurnOrder', () => {
    it('should reverse order and prioritize winner from last round', () => {
      const room: Partial<ServerRoom> = {
        players: [{ userId: 'u1' } as Player, { userId: 'u2' } as Player, { userId: 'u3' } as Player],
        lastTurnOrder: ['u1', 'u2', 'u3'],
        lastWinnerUserId: 'u2',
      };

      // Reversed of ['u1', 'u2', 'u3'] is ['u3', 'u2', 'u1']
      // Prioritizing winner 'u2': ['u2', 'u1', 'u3']
      const newOrder = computeTurnOrder(room as ServerRoom);
      expect(newOrder).toEqual(['u2', 'u1', 'u3']);
    });
  });
});
