export type {
  GameHookEventType,
  HookActionType,
  HookDestination,
  HookRule,
  PresetTemplateId,
  RobotConfig,
} from '../../shared/types/generated/wire-models';

export interface PlayerScoreSnapshot {
  userId: string;
  name: string;
  delta: number; // 本局得分变动 (+24 / -8)
  totalScore: number; // 累计总积分
  physicalCardsCount: number; // 物理手牌总张数
  effectiveCardsCount: number; // 仍需击打的未落袋有效牌数（胜者必然为 0）
  isWinner: boolean;
  rank?: number; // 在 standings 榜单中的并列名次 (1, 2, 2, 4...)
}

export interface GameStartPayload {
  roomCode: string;
  roundNumber: number;
  revision: number;
  cardsPerPlayer: number;
  playerCount: number;
  players: { userId: string; name: string }[];
  shooter: { userId: string; name: string };
  timestamp: number;
}

export interface RoundFinishedPayload {
  roomCode: string;
  roundNumber: number;
  revision: number; // 局内版本号/递增操作序
  winners: PlayerScoreSnapshot[]; // 支持多人同时获胜
  leaders: PlayerScoreSnapshot[]; // 支持累计积分并列榜首
  standings: PlayerScoreSnapshot[]; // 全员按 totalScore 降序排列（含计算好的 rank）
  scores: PlayerScoreSnapshot[]; // 原始玩家顺序列表
  nextTurnFirstPlayer: { userId: string; name: string } | null; // 预测下局开球者
  timestamp: number;
}

export interface CrashPayload {
  error: string;
  stack?: string;
  type: string;
  activeRoomsCount: number;
  timestamp: number;
}

export type GameHookEvent =
  | {
      id: string;
      type: 'game_start';
      timestamp: number;
      payload: GameStartPayload;
    }
  | {
      id: string;
      type: 'game_round_finished';
      timestamp: number;
      payload: RoundFinishedPayload;
    }
  | {
      id: string;
      type: 'system_crash';
      timestamp: number;
      payload: CrashPayload;
    };
