import type { ServerRoom } from '../../shared/types/game';
import { getPocketedBallNumbers } from '../../shared/utils/roomRules';
import { computeTurnOrder } from '../gameEngine';
import type { PlayerScoreSnapshot, RoundFinishedPayload } from './types';

export function createRoundFinishedPayload(room: ServerRoom): RoundFinishedPayload {
  const pocketedSet = new Set(getPocketedBallNumbers(room));
  const winnerUserIds = new Set((room.winners || []).map((w) => w.userId));
  const roundScores = room.lastRoundScores || [];

  // 1. 原始玩家顺序的基础快照
  const scores: PlayerScoreSnapshot[] = (room.players || []).map((p) => {
    const delta = roundScores.find((rs) => rs.userId === p.userId)?.delta ?? 0;
    const cards = p.cards || [];
    const effectiveCount = cards.filter((c) => !pocketedSet.has(c.ballNumber)).length;
    const isWinner = winnerUserIds.has(p.userId);

    return {
      userId: p.userId,
      name: p.name,
      delta,
      totalScore: p.totalScore || 0,
      physicalCardsCount: cards.length,
      effectiveCardsCount: isWinner ? 0 : effectiveCount,
      isWinner,
    };
  });

  // 2. 本局所有胜者
  const winners: PlayerScoreSnapshot[] = scores.filter((s) => s.isWinner);

  // 3. 计算全员排行榜 (按 totalScore 降序，采用 1-2-2-4 标准竞赛并列排名算法)
  const sorted = [...scores].sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    if (b.delta !== a.delta) {
      return b.delta - a.delta;
    }
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  const standings: PlayerScoreSnapshot[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const item = sorted[index];
    let rank = 1;
    if (index > 0) {
      const prev = standings[index - 1];
      if (item.totalScore === prev.totalScore) {
        rank = prev.rank ?? 1;
      } else {
        rank = index + 1;
      }
    }
    standings.push({
      ...item,
      rank,
    });
  }

  // 4. 累计积分榜首 (支持同分并列)
  const maxTotalScore = standings.length > 0 ? standings[0].totalScore : 0;
  const leaders: PlayerScoreSnapshot[] =
    standings.length > 0 ? standings.filter((s) => s.totalScore === maxTotalScore) : [];

  // 5. 预计下局开球者
  let nextTurnFirstPlayer: { userId: string; name: string } | null = null;
  const turnOrder = computeTurnOrder(room);
  if (turnOrder.length > 0) {
    const firstUserId = turnOrder[0];
    const player = room.players.find((p) => p.userId === firstUserId);
    if (player) {
      nextTurnFirstPlayer = {
        userId: player.userId,
        name: player.name,
      };
    }
  }

  // 6. 局数与版本号：直接读取 room.roundCount，不从可能被截断的日志中推算
  const roundNumber = typeof room.roundCount === 'number' && room.roundCount > 0 ? room.roundCount : 1;
  const revision = typeof room.revision === 'number' ? room.revision : Date.now();

  return {
    roomCode: room.code,
    roundNumber,
    revision,
    winners,
    leaders,
    standings,
    scores,
    nextTurnFirstPlayer,
    timestamp: Date.now(),
  };
}
