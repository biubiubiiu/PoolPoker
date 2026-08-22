import { describe, expect, it } from 'vitest';
import { create54PokerDeck, shuffle } from '../pokerDeck';

describe('pokerDeck logic', () => {
  it('should create a complete 54-card poker deck with correct ball mappings', () => {
    const deck = create54PokerDeck();
    expect(deck).toHaveLength(54);

    // Standard suits 4 * 13 = 52
    const regularCards = deck.filter((c) => c.suitType !== 'joker-small' && c.suitType !== 'joker-big');
    expect(regularCards).toHaveLength(52);

    // Jokers
    const smallJoker = deck.find((c) => c.suitType === 'joker-small');
    const bigJoker = deck.find((c) => c.suitType === 'joker-big');

    expect(smallJoker).toBeDefined();
    expect(smallJoker?.ballNumber).toBe(14);
    expect(bigJoker).toBeDefined();
    expect(bigJoker?.ballNumber).toBe(15);

    // Verify ball numbers range 1..15
    const ballNumbers = new Set(deck.map((c) => c.ballNumber));
    expect(Array.from(ballNumbers).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('should shuffle array without mutating original array', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffle(original);

    expect(shuffled).toHaveLength(original.length);
    expect(shuffled.sort((a, b) => a - b)).toEqual(original);
    expect(shuffled).not.toBe(original);
  });
});
