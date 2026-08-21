import type { GamePlayerSnapshot, GameState, ServerRoom } from '../shared/types/game';

// 快照内所有嵌套数据统一深拷贝，与后续操作解耦（撤回时不会污染当前状态）。
function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      result[key] = deepClone((value as Record<string, unknown>)[key]);
    }
    return result as T;
  }
  return value;
}

function clonePlayer(p: GamePlayerSnapshot): GamePlayerSnapshot {
  return {
    cards: deepClone(p.cards),
    pocketedCards: deepClone(p.pocketedCards),
    cardCount: p.cardCount,
    activeCardCount: p.activeCardCount,
    wins: p.wins,
    isWinner: p.isWinner,
    totalScore: p.totalScore,
  };
}

// 记录一步操作后的房间进行态。只追加，不清理历史（历史在每局开始游戏时清空）。
export function recordGameStep(room: ServerRoom): void {
  if (!room.gameHistory) room.gameHistory = [];
  room.gameHistory.push(snapshotGameState(room));
}

// 将房间当前「游戏进行态」整体打包成一份快照（深拷贝）。
export function snapshotGameState(room: ServerRoom): GameState {
  return {
    status: room.status,
    players: (room.players || []).map(clonePlayer),
    deck: deepClone(room.deck || []),
    accidentalBalls: deepClone(room.accidentalBalls || []),
    breakBalls: deepClone(room.breakBalls || []),
    winners: deepClone(room.winners || []),
    turnOrder: deepClone(room.turnOrder || []),
    lastTurnOrder: room.lastTurnOrder ? deepClone(room.lastTurnOrder) : undefined,
    lastWinnerUserId: room.lastWinnerUserId,
    roundCount: room.roundCount,
    lastRoundScores: deepClone(room.lastRoundScores || []),
  };
}

// 用快照覆盖房间当前的「游戏进行态」。
// 快照只含进行态字段，身份/连接/设置/日志等非进行态字段（id、userId、sessionToken、name、avatar、isHost、online、settings、logs 等）保持不变。
export function restoreGameState(room: ServerRoom, state: GameState): void {
  room.status = state.status;
  room.deck = state.deck;
  room.accidentalBalls = state.accidentalBalls;
  room.breakBalls = state.breakBalls;
  room.winners = state.winners;
  room.turnOrder = state.turnOrder;
  room.lastTurnOrder = state.lastTurnOrder;
  room.lastWinnerUserId = state.lastWinnerUserId;
  room.roundCount = state.roundCount;
  room.lastRoundScores = state.lastRoundScores;

  (room.players || []).forEach((p, i) => {
    const snap = state.players[i];
    if (!snap) return;
    p.cards = snap.cards;
    p.pocketedCards = snap.pocketedCards;
    p.cardCount = snap.cardCount;
    p.activeCardCount = snap.activeCardCount;
    p.wins = snap.wins;
    p.isWinner = snap.isWinner;
    p.totalScore = snap.totalScore;
  });
}

// 撤回上一步：弹出最近一步状态，回退到再上一步（历史只剩基线或为空时不做任何改动）。
export function undoGameStep(room: ServerRoom): GameState | null {
  if (!room.gameHistory || room.gameHistory.length <= 1) return null;
  // 丢弃当前（最近一步）状态
  room.gameHistory.pop();
  // 新栈顶即「上一步」状态
  const previous = room.gameHistory[room.gameHistory.length - 1];
  restoreGameState(room, previous);
  return previous;
}
