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
  sessionToken?: string;
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
  totalScore: number;
}

export interface RoundScoreEntry {
  userId: string;
  delta: number;
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

export interface WinnerInfo {
  name: string;
  avatar: string;
  id: string;
  userId: string;
  wins: number;
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
  breakBalls: number[];
  roundCount: number;
  deckCount: number;
  winners: WinnerInfo[] | Player[];
  settings: RoomSettings;
  logs: GameLog[];
  lastRoundScores: RoundScoreEntry[];
}

export interface ServerRoom {
  code: string;
  hostUserId: string;
  hostSocketId: string;
  status: 'waiting' | 'playing' | 'ended' | 'finished' | 'lobby';
  players: Player[];
  deck: Card[];
  accidentalBalls: number[];
  breakBalls: number[];
  winners: WinnerInfo[];
  lastWinnerUserId?: string;
  lastTurnOrder?: string[];
  turnOrder: string[];
  roundCount: number;
  settings: RoomSettings;
  logs: GameLog[];
  lastRoundScores: RoundScoreEntry[];
}

export interface BallConfig {
  name: string;
  colors: Record<string, [string, string, string]>;
}
