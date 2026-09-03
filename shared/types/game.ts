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

// 单个玩家在某一时刻的「游戏进行态」快照
// 不含身份/连接类字段（id、userId、sessionToken、name、avatar、isHost、online），
// 这些字段不随牌局操作变化，撤回时保持不变。
export interface GamePlayerSnapshot {
  cards: Card[];
  pocketedCards: Card[];
  cardCount: number;
  activeCardCount: number;
}

// 一局游戏某一时刻的完整「进行态」快照，用于逐步撤回（每步操作 push 一份、撤回即 pop）
// 注意：不含 logs —— 日志属于审计记录，不随撤回回退，撤回本身会额外追加一条日志。
export interface GameState {
  players: GamePlayerSnapshot[];
  deck: Card[];
  accidentalBalls: number[];
  breakBalls: number[];
  actionText?: string;
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
  winners: WinnerInfo[] | Player[];
  settings: RoomSettings;
  logs: GameLog[];
  lastRoundScores: RoundScoreEntry[];
  lastActionText?: string | null;
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
  gameHistory: GameState[];
}

export interface BallConfig {
  name: string;
  colors: Record<string, [string, string, string]>;
}
