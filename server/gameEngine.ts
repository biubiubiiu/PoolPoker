import type { Card, Player, RoundScoreEntry, ServerRoom } from '../shared/types/game';
import { getRandomHex } from '../shared/utils/crypto';
import { createRoundFinishedPayload } from './hook/snapshot';
import type { GameHookEvent } from './hook/types';
import { shuffle } from './pokerDeck';

export type HookEventDispatcher = (event: GameHookEvent) => void;
let hookEventDispatcher: HookEventDispatcher | null = null;

export function setHookEventDispatcher(dispatcher: HookEventDispatcher | null): void {
  hookEventDispatcher = dispatcher;
}

export type RoundFinishedNotifier = (room: ServerRoom) => void;
let roundFinishedNotifier: RoundFinishedNotifier | null = null;

export function setRoundFinishedNotifier(notifier: RoundFinishedNotifier | null): void {
  roundFinishedNotifier = notifier;
}

export function addLog(room: ServerRoom, text: string): void {
  const time = new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (!room.logs) {
    room.logs = [];
  }

  room.logs.push({
    id: `${Date.now()}_${getRandomHex(3)}`,
    time,
    text,
  });

  if (room.logs.length > 50) {
    room.logs = room.logs.slice(-50);
  }
}

import { getPocketedBallNumbers } from '../shared/utils/roomRules';

export { getPocketedBallNumbers };

// 检查是否有玩家满足胜利条件（手牌中未被打进的有效卡牌数为 0）
export function checkGameWinners(room: ServerRoom): Player[] {
  if (room?.status !== 'playing') return [];
  const pocketedSet = new Set(getPocketedBallNumbers(room));
  const winners: Player[] = [];

  room.players.forEach((p) => {
    const activeCards = (p.cards || []).filter((c) => !pocketedSet.has(c.ballNumber));
    if (activeCards.length === 0) {
      p.isWinner = true;
      winners.push(p);
    }
  });

  return winners;
}

// 获取牌的基础分值：大王/小王基数1，其他牌基数2
function getCardBase(card: Card): number {
  return card.suitType === 'joker-big' || card.suitType === 'joker-small' ? 1 : 2;
}

// 计算一组未消除手牌的积分（同rank牌组合倍乘）
export function calculateHandScore(remainingCards: Card[]): number {
  if (remainingCards.length === 0) return 0;
  const groups = new Map<string, Card[]>();
  for (const card of remainingCards) {
    if (!groups.has(card.rank)) groups.set(card.rank, []);
    groups.get(card.rank)?.push(card);
  }
  let total = 0;
  for (const cards of groups.values()) {
    const n = cards.length;
    const sumBase = cards.reduce((acc, c) => acc + getCardBase(c), 0);
    total += sumBase * n;
  }
  return total;
}

// 结算游戏胜利状态
export function handleGameFinished(room: ServerRoom, winners: Player[], actionPlayer?: Player | null): void {
  room.status = 'finished';
  winners.forEach((w) => {
    w.wins = (w.wins || 0) + 1;
  });

  if (actionPlayer) {
    const actionPlayerIdx = winners.findIndex((w) => w.id === actionPlayer.id || w.userId === actionPlayer.userId);
    if (actionPlayerIdx > 0) {
      const [actionPlayerWinner] = winners.splice(actionPlayerIdx, 1);
      winners.unshift(actionPlayerWinner);
    }
  }

  room.winners = winners.map((w) => ({
    name: w.name,
    id: w.id,
    userId: w.userId,
    wins: w.wins,
  }));

  room.lastWinnerUserId = winners.length > 1 && actionPlayer ? actionPlayer.userId : winners[0].userId;

  if (winners.length === 1) {
    addLog(room, `🏆 恭喜 ${winners[0].name} 清空有效手牌，夺得本局胜利！(累计胜利 ${winners[0].wins} 次) 🎉`);
  } else {
    const names = winners.map((w) => `${w.name}(累计${w.wins}胜)`).join('、');
    addLog(room, `🏆 恭喜 ${names} 共同清空有效手牌，同时夺得本局胜利！🎉`);
  }

  // 积分结算
  const pocketedSet = new Set(getPocketedBallNumbers(room));
  const winnerUserIds = new Set(winners.map((w) => w.userId));
  const actionWinnerUserId = winners[0]?.userId ?? null;

  // 计算每位输家剩余手牌分值
  const loserEntries: { player: Player; handScore: number }[] = [];
  room.players.forEach((p) => {
    if (!winnerUserIds.has(p.userId)) {
      const remaining = (p.cards || []).filter((c) => !pocketedSet.has(c.ballNumber));
      loserEntries.push({ player: p, handScore: calculateHandScore(remaining) });
    }
  });

  const totalLoserScore = loserEntries.reduce((acc, e) => acc + e.handScore, 0);
  const numWinners = winners.length;
  const baseShare = numWinners > 0 ? Math.floor(totalLoserScore / numWinners) : 0;
  const remainder = numWinners > 0 ? totalLoserScore % numWinners : 0;

  const roundScores: RoundScoreEntry[] = [];

  loserEntries.forEach(({ player, handScore }) => {
    player.totalScore = (player.totalScore || 0) - handScore;
    roundScores.push({ userId: player.userId, delta: -handScore });
  });

  winners.forEach((w) => {
    const player = room.players.find((p) => p.userId === w.userId);
    if (!player) return;
    const extra = remainder > 0 && w.userId === actionWinnerUserId ? remainder : 0;
    const gain = baseShare + extra;
    player.totalScore = (player.totalScore || 0) + gain;
    roundScores.push({ userId: w.userId, delta: gain });
  });

  room.lastRoundScores = roundScores;

  const scoreLines = roundScores
    .map((rs) => {
      const p = room.players.find((pl) => pl.userId === rs.userId);
      const sign = rs.delta >= 0 ? '+' : '';
      return `${p?.name ?? rs.userId}：${sign}${rs.delta}分`;
    })
    .join('，');
  addLog(room, `📊 本局积分结算：${scoreLines}`);

  // 触发 Hook 事件总线 (带脱敏不可变快照，强异常隔离)
  if (hookEventDispatcher) {
    try {
      const payload = createRoundFinishedPayload(room);
      hookEventDispatcher({
        id: `evt_${Date.now()}_${getRandomHex(3)}`,
        type: 'game_round_finished',
        timestamp: Date.now(),
        payload,
      });
    } catch (err) {
      console.warn(`⚠️ [GameEngine] 构造或发射 Hook 事件失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 每局胜利结算完成后，触发旧版通知回调 (若外部有显式注册，保持向下兼容)
  if (roundFinishedNotifier) {
    roundFinishedNotifier(room);
  }
}

export function handleGameStarted(room: ServerRoom): void {
  if (hookEventDispatcher) {
    try {
      const shooterUserId = room.turnOrder?.[0];
      const shooterPlayer = room.players.find((p) => p.userId === shooterUserId) || room.players[0];
      const shooter = {
        userId: shooterPlayer?.userId || '',
        name: shooterPlayer?.name || '未知玩家',
      };
      const count = room.settings.cardsPerPlayer || 5;

      hookEventDispatcher({
        id: `evt_${Date.now()}_${getRandomHex(3)}`,
        type: 'game_start',
        timestamp: Date.now(),
        payload: {
          roomCode: room.code,
          roundNumber: room.roundCount,
          revision: typeof room.revision === 'number' ? room.revision : Date.now(),
          cardsPerPlayer: count,
          playerCount: room.players.length,
          players: room.players.map((p) => ({ userId: p.userId, name: p.name })),
          shooter,
          timestamp: Date.now(),
        },
      });
    } catch (err) {
      console.warn(
        `⚠️ [GameEngine] 构造或发射 game_start Hook 事件失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

// 计算每局击球顺序
export function computeTurnOrder(room: ServerRoom): string[] {
  if (!room?.players || room.players.length === 0) return [];
  const currentP = room.players.map((p) => p.userId);

  if (
    !room.lastTurnOrder ||
    room.lastTurnOrder.length === 0 ||
    !room.lastWinnerUserId ||
    !currentP.includes(room.lastWinnerUserId)
  ) {
    return shuffle(currentP);
  }

  // 1. 保留上一局在场玩家，并补全中途加入的玩家
  const validPrev = room.lastTurnOrder.filter((id) => currentP.includes(id));
  currentP.forEach((id) => {
    if (!validPrev.includes(id)) {
      validPrev.push(id);
    }
  });

  // 2. 顺序反转
  const reversed = [...validPrev].reverse();

  // 3. 胜者优先
  let winnerIdx = reversed.indexOf(room.lastWinnerUserId);
  if (winnerIdx === -1) winnerIdx = 0;

  return [...reversed.slice(winnerIdx), ...reversed.slice(0, winnerIdx)];
}
