import { describe, expect, it } from 'vitest';
import type { Card, GameState, ServerRoom } from '../../shared/types/game';
import { recordGameStep, restoreGameState, snapshotGameState, undoGameStep } from '../gameState';

function createDummyCard(id: string, rank: string, ballNumber: number, suitType: Card['suitType'] = 'spade'): Card {
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
    id,
    suit: suitSymbolMap[suitType],
    suitType,
    color: colorMap[suitType],
    rank,
    ballNumber,
  };
}

function createDummyRoom(): ServerRoom {
  const card1 = createDummyCard('c1', 'A', 1, 'spade');
  const card2 = createDummyCard('c2', '2', 2, 'heart');
  const card3 = createDummyCard('c3', '3', 3, 'club');

  return {
    code: '1234',
    status: 'playing',
    hostUserId: 'user-1',
    hostSocketId: 'socket-1',
    settings: {
      cardsPerPlayer: 5,
      maxPlayers: 8,
      includeBlackEight: true,
      ballConfigKey: 'default',
    },
    players: [
      {
        id: 'p1',
        userId: 'user-1',
        name: 'Player 1',
        avatar: '',
        isHost: true,
        online: true,
        cards: [card1, card2],
        pocketedCards: [],
        cardCount: 2,
        activeCardCount: 2,
        wins: 0,
        isWinner: false,
        totalScore: 0,
        sessionToken: 'token-1',
      },
    ],
    deck: [card3],
    accidentalBalls: [14],
    breakBalls: [15],
    winners: [],
    turnOrder: ['user-1'],
    roundCount: 1,
    logs: [],
    lastRoundScores: [],
    gameHistory: [],
  };
}

describe('gameState logic', () => {
  it('should take deep-copied snapshots of game state', () => {
    const room = createDummyRoom();
    const snapshot = snapshotGameState(room);

    // Verify values equal
    expect(snapshot.deck).toEqual(room.deck);
    expect(snapshot.players[0].cards).toEqual(room.players[0].cards);

    // Verify reference isolation (deep clone)
    expect(snapshot.deck).not.toBe(room.deck);
    expect(snapshot.players[0].cards).not.toBe(room.players[0].cards);
    expect(snapshot.players[0].cards[0]).not.toBe(room.players[0].cards[0]);
  });

  it('should restore state with deep cloning to prevent reference pollution (bugfix 735f38d)', () => {
    const room = createDummyRoom();
    const stateToRestore: GameState = {
      deck: [createDummyCard('c4', '4', 4, 'diamond')],
      accidentalBalls: [10],
      breakBalls: [11],
      players: [
        {
          cards: [createDummyCard('c15', 'BigJoker', 15, 'joker-big')],
          pocketedCards: [],
          cardCount: 1,
          activeCardCount: 1,
        },
      ],
    };

    restoreGameState(room, stateToRestore);

    // Arrays in room should not share references with stateToRestore
    expect(room.deck).not.toBe(stateToRestore.deck);
    expect(room.players[0].cards).not.toBe(stateToRestore.players[0].cards);

    // Mutating room arrays must not pollute stateToRestore (the snapshot)
    room.deck.pop();
    room.players[0].cards.push(createDummyCard('c5', '5', 5, 'spade'));

    expect(stateToRestore.deck).toHaveLength(1);
    expect(stateToRestore.players[0].cards).toHaveLength(1);
  });

  it('should record steps with actionText and undo step correctly', () => {
    const room = createDummyRoom();

    // Step 0: Record initial baseline
    recordGameStep(room);
    expect(room.gameHistory).toHaveLength(1);
    expect(room.gameHistory[0].actionText).toBeUndefined();

    // Step 1: Perform player action (pocket a card)
    const pocketed = room.players[0].cards.pop();
    if (pocketed) {
      room.players[0].pocketedCards.push(pocketed);
    }
    const actionText = '🎯 Player 1 打进 1号球，消去卡牌 [♠A]';
    recordGameStep(room, actionText);
    expect(room.gameHistory).toHaveLength(2);
    expect(room.gameHistory[1].actionText).toBe(actionText);
    expect(room.players[0].cards).toHaveLength(1);
    expect(room.players[0].pocketedCards).toHaveLength(1);

    // Step 2: Undo action
    const previousState = undoGameStep(room);

    expect(previousState).not.toBeNull();
    expect(room.gameHistory).toHaveLength(1); // Baseline remains
    expect(room.players[0].cards).toHaveLength(2); // Restored to 2 cards
    expect(room.players[0].pocketedCards).toHaveLength(0); // Restored to 0 pocketed
  });

  it('should return null when trying to undo baseline or empty history', () => {
    const room = createDummyRoom();

    // Empty history
    expect(undoGameStep(room)).toBeNull();

    // Baseline only (1 step)
    recordGameStep(room);
    expect(undoGameStep(room)).toBeNull();
    expect(room.gameHistory).toHaveLength(1);
  });
});
