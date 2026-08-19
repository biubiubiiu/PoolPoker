export interface Card {
  id: string;
  suit: string;
  suitType: 'spade' | 'heart' | 'club' | 'diamond' | 'joker-small' | 'joker-big';
  color: 'black' | 'red' | 'gold' | 'gray';
  rank: string;
  ballNumber: number;
}

export interface Player {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  isHost: boolean;
  online: boolean;
  cardCount: number;
  activeCardCount: number;
  cards: Card[];
  pocketedCards: Card[];
  wins: number;
  isWinner: boolean;
}

export interface RoomSettings {
  cardsPerPlayer: number;
  maxPlayers: number;
  includeBlackEight: boolean;
  ballConfigKey: string;
}

export interface GameLog {
  id?: number | string;
  time: string;
  text: string;
}

export interface Room {
  code: string;
  hostUserId: string;
  hostSocketId?: string;
  status: 'waiting' | 'playing' | 'ended' | 'finished' | 'lobby';
  players: Player[];
  turnOrder: string[];
  currentTurnIndex?: number;
  pocketedBallNumbers: number[];
  roundCount: number;
  deckCount: number;
  winner: Player | null;
  winners?: Player[];
  settings: RoomSettings;
  logs: GameLog[];
}
