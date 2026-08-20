import type { Player, ServerRoom } from '../shared/types/game';
import { shuffle } from './pokerDeck';

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
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    time,
    text,
  });

  if (room.logs.length > 50) {
    room.logs = room.logs.slice(-50);
  }
}

// 获取当前房间所有已消除的球号列表 (1 ~ 15，按数字大小升序)
export function getPocketedBallNumbers(room: ServerRoom): number[] {
  if (!room?.players) return [];
  const set = new Set<number>();
  (room.accidentalBalls || []).forEach((b) => {
    set.add(b);
  });
  room.players.forEach((p) => {
    (p.pocketedCards || []).forEach((c) => {
      set.add(c.ballNumber);
    });
  });
  return Array.from(set).sort((a, b) => a - b);
}

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
    avatar: w.avatar,
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
