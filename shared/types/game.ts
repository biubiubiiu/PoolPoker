// Re-export wire models generated from JSON Schema (Single Source of Truth)
export type {
  Card,
  CardColor,
  GameLog,
  Player,
  Room,
  RoomSettings,
  RoomStatus,
  RoundScoreEntry,
  SceneEvent,
  SuitType,
  WearAction,
  WearActionPayload,
  WearPlayerSummary,
  WearSyncRoomPayload,
  WinnerInfo,
} from './generated/wire-models';

import type {
  Card,
  GameLog,
  Player,
  RoomSettings,
  RoomStatus,
  RoundScoreEntry,
  SceneEvent,
  WinnerInfo,
} from './generated/wire-models';

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

// 服务端内部完整房间模型（包含牌堆、历史撤销快照、误进球等敏感/内部数据）
// 严禁作为 wire model 直接发送给客户端
export interface ServerRoom {
  revision?: number;
  sceneEvent?: SceneEvent;
  code: string;
  hostUserId: string;
  hostSocketId: string;
  status: RoomStatus;
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
