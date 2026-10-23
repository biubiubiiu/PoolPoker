import type { CrashPayload, GameHookEventType, GameStartPayload, RoundFinishedPayload } from './types';

export interface EventFieldDoc {
  key: string;
  label: string;
  type: string;
  description: string;
}

export interface EventCatalogItem {
  type: GameHookEventType;
  name: string;
  category: 'room' | 'game' | 'round' | 'system';
  description: string;
  fields: EventFieldDoc[];
  defaultPresetId: string;
  mockPayload: Record<string, unknown>;
}

export const MOCK_GAME_START_PAYLOAD: GameStartPayload = {
  roomCode: '8888',
  roundNumber: 6,
  revision: 11,
  cardsPerPlayer: 5,
  playerCount: 3,
  players: [
    { userId: 'u_1', name: '小明' },
    { userId: 'u_2', name: '阿强' },
    { userId: 'u_3', name: '小李' },
  ],
  shooter: { userId: 'u_1', name: '小明' },
  timestamp: Date.now(),
};

export const MOCK_ROUND_FINISHED_PAYLOAD: RoundFinishedPayload = {
  roomCode: '8888',
  roundNumber: 6,
  revision: 10,
  winners: [
    {
      userId: 'u_1',
      name: '小明',
      delta: 24,
      totalScore: 68,
      physicalCardsCount: 3,
      effectiveCardsCount: 0,
      isWinner: true,
      rank: 1,
    },
  ],
  leaders: [
    {
      userId: 'u_1',
      name: '小明',
      delta: 24,
      totalScore: 68,
      physicalCardsCount: 3,
      effectiveCardsCount: 0,
      isWinner: true,
      rank: 1,
    },
  ],
  standings: [
    {
      userId: 'u_1',
      name: '小明',
      delta: 24,
      totalScore: 68,
      physicalCardsCount: 3,
      effectiveCardsCount: 0,
      isWinner: true,
      rank: 1,
    },
    {
      userId: 'u_2',
      name: '阿强',
      delta: -16,
      totalScore: 42,
      physicalCardsCount: 2,
      effectiveCardsCount: 2,
      isWinner: false,
      rank: 2,
    },
    {
      userId: 'u_3',
      name: '小李',
      delta: -8,
      totalScore: 26,
      physicalCardsCount: 1,
      effectiveCardsCount: 1,
      isWinner: false,
      rank: 3,
    },
  ],
  scores: [
    {
      userId: 'u_1',
      name: '小明',
      delta: 24,
      totalScore: 68,
      physicalCardsCount: 3,
      effectiveCardsCount: 0,
      isWinner: true,
      rank: 1,
    },
    {
      userId: 'u_2',
      name: '阿强',
      delta: -16,
      totalScore: 42,
      physicalCardsCount: 2,
      effectiveCardsCount: 2,
      isWinner: false,
      rank: 2,
    },
    {
      userId: 'u_3',
      name: '小李',
      delta: -8,
      totalScore: 26,
      physicalCardsCount: 1,
      effectiveCardsCount: 1,
      isWinner: false,
      rank: 3,
    },
  ],
  nextTurnFirstPlayer: { userId: 'u_1', name: '小明' },
  timestamp: Date.now(),
};

export const MOCK_CRASH_PAYLOAD: CrashPayload = {
  error: 'TypeError: Cannot read properties of undefined (reading "userId")',
  type: 'uncaughtException',
  activeRoomsCount: 2,
  stack:
    'TypeError: Cannot read properties of undefined (reading "userId")\n    at gameRoomService.ts:140:22\n    at roomManager.ts:85:12',
  timestamp: Date.now(),
};

export const EVENT_CATALOG: Record<string, EventCatalogItem> = {
  game_start: {
    type: 'game_start',
    name: '对局开始 (game_start)',
    category: 'game',
    description: '房主点击开始游戏，发牌完毕并确认第一名开球手时触发。',
    defaultPresetId: 'preset_game_start_text',
    fields: [
      { key: 'roomCode', label: '房间号', type: 'string', description: '4位数字房间号' },
      { key: 'roundNumber', label: '局数', type: 'number', description: '当前房间累计局数' },
      { key: 'cardsPerPlayer', label: '每人手牌数', type: 'number', description: '开局发牌张数设定' },
      { key: 'playerCount', label: '玩家总数', type: 'number', description: '本局参赛人数' },
      { key: 'shooter.name', label: '开球手昵称', type: 'string', description: '首个击打出杆的玩家' },
      {
        key: 'players',
        label: '参赛玩家列表',
        type: 'array',
        description: '包含玩家 name 字段的数组，支持 {{#each players}}',
      },
    ],
    mockPayload: MOCK_GAME_START_PAYLOAD as unknown as Record<string, unknown>,
  },
  game_round_finished: {
    type: 'game_round_finished',
    name: '本局结算 (game_round_finished)',
    category: 'round',
    description: '有玩家清空有效手牌获胜、触发胜利积分核算完成后触发。',
    defaultPresetId: 'preset_classic_text',
    fields: [
      { key: 'roomCode', label: '房间号', type: 'string', description: '4位数字房间号' },
      { key: 'roundNumber', label: '局数', type: 'number', description: '当前完成局数' },
      { key: 'winners', label: '胜者列表', type: 'array', description: '清空有效手牌的所有胜者列表' },
      { key: 'standings', label: '积分排行榜', type: 'array', description: '按累计总积分降序排列的全员列表' },
      { key: 'scores', label: '原始得分列表', type: 'array', description: '玩家原始座次顺序的得分列表' },
      {
        key: 'nextTurnFirstPlayer.name',
        label: '下局开球预测',
        type: 'string',
        description: '预计下一局率先开球的玩家姓名',
      },
    ],
    mockPayload: MOCK_ROUND_FINISHED_PAYLOAD as unknown as Record<string, unknown>,
  },
  system_crash: {
    type: 'system_crash',
    name: '系统异常警报 (system_crash)',
    category: 'system',
    description: '服务端发生未捕获全局异常 (uncaughtException) 或未处理 Promise 拒绝时触发。',
    defaultPresetId: 'preset_system_crash_text',
    fields: [
      { key: 'error', label: '错误信息', type: 'string', description: '异常报错描述文本' },
      { key: 'type', label: '异常类型', type: 'string', description: 'uncaughtException 或 unhandledRejection' },
      { key: 'activeRoomsCount', label: '活跃房间数', type: 'number', description: '崩溃时活跃对战房间总数' },
      { key: 'stack', label: '堆栈摘要', type: 'string', description: '异常堆栈代码行追踪信息' },
    ],
    mockPayload: MOCK_CRASH_PAYLOAD as unknown as Record<string, unknown>,
  },
};

export function getMockPayloadForEvent(eventType: GameHookEventType): Record<string, unknown> {
  const item = EVENT_CATALOG[eventType];
  if (item) {
    return item.mockPayload;
  }
  return MOCK_ROUND_FINISHED_PAYLOAD as unknown as Record<string, unknown>;
}
