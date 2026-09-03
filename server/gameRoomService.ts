import type { ServerRoom } from '../shared/types/game';
import { addLog, checkGameWinners, computeTurnOrder, handleGameFinished } from './gameEngine';
import { recordGameStep, undoGameStep } from './gameState';
import { create54PokerDeck, shuffle } from './pokerDeck';

export type GameRoomCommand =
  | { type: 'start_game'; actorUserId: string }
  | { type: 'pocket_ball'; actorUserId: string; cardId: string }
  | { type: 'draw_penalty'; actorUserId: string }
  | { type: 'accidental_pocket'; ballNumber: number }
  | { type: 'break_pocket'; ballNumber: number }
  | { type: 'retract_ball' }
  | { type: 'referee_pocket_ball'; actorSocketId: string; targetUserId: string; ballNumber: number }
  | { type: 'referee_draw_penalty'; targetUserId: string }
  | { type: 'restart_game'; actorUserId: string }
  | { type: 'request_restart' };

export interface GameRoomCommandResult {
  shouldBroadcast: boolean;
  changed: boolean;
}

const NO_BROADCAST: GameRoomCommandResult = { shouldBroadcast: false, changed: false };
const BROADCAST_ONLY: GameRoomCommandResult = { shouldBroadcast: true, changed: false };
const CHANGED: GameRoomCommandResult = { shouldBroadcast: true, changed: true };

export function applyGameRoomCommand(room: ServerRoom, command: GameRoomCommand): GameRoomCommandResult {
  switch (command.type) {
    case 'start_game':
      return startGame(room, command.actorUserId);
    case 'pocket_ball':
      return pocketBall(room, command.actorUserId, command.cardId);
    case 'draw_penalty':
      return drawPenalty(room, command.actorUserId);
    case 'accidental_pocket':
      return recordAccidentalPocket(room, command.ballNumber);
    case 'break_pocket':
      return recordBreakPocket(room, command.ballNumber);
    case 'retract_ball':
      return retractLastStep(room);
    case 'referee_pocket_ball':
      return refereePocketBall(room, command.actorSocketId, command.targetUserId, command.ballNumber);
    case 'referee_draw_penalty':
      return refereeDrawPenalty(room, command.targetUserId);
    case 'restart_game':
      return restartGame(room, command.actorUserId);
    case 'request_restart':
      addLog(room, '🔄 房主发起了重新开始本局对决');
      return CHANGED;
  }
}

function startGame(room: ServerRoom, actorUserId: string): GameRoomCommandResult {
  if (actorUserId !== room.hostUserId || room.players.length === 0) return NO_BROADCAST;

  room.deck = shuffle(create54PokerDeck());
  room.accidentalBalls = [];
  room.breakBalls = [];
  room.winners = [];
  room.lastRoundScores = [];
  room.roundCount += 1;
  room.status = 'playing';

  const count = room.settings.cardsPerPlayer || 5;

  room.players.forEach((p) => {
    p.cards = [];
    p.pocketedCards = [];
    p.isWinner = false;
    for (let i = 0; i < count; i++) {
      const card = room.deck.pop();
      if (card) {
        p.cards.push(card);
      }
    }
    p.cardCount = p.cards.length;
  });

  room.turnOrder = computeTurnOrder(room);
  room.lastTurnOrder = [...room.turnOrder];
  room.gameHistory = [];
  recordGameStep(room);

  addLog(room, `🎮 第 ${room.roundCount} 局游戏正式开始！每位玩家发牌 ${count} 张`);
  return CHANGED;
}

function pocketBall(room: ServerRoom, actorUserId: string, cardId: string): GameRoomCommandResult {
  if (room.status !== 'playing') return NO_BROADCAST;

  const player = room.players.find((p) => p.userId === actorUserId);
  if (!player) return NO_BROADCAST;

  const cardIndex = player.cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return NO_BROADCAST;

  const [pocketedCard] = player.cards.splice(cardIndex, 1);
  player.pocketedCards.push(pocketedCard);

  const actionText = `🎯 ${player.name} 打进 ${pocketedCard.ballNumber}号球，消去卡牌 [${pocketedCard.suit}${pocketedCard.rank}]`;
  addLog(room, actionText);

  finishIfNeeded(room, player);
  recordGameStep(room, actionText);
  return CHANGED;
}

function drawPenalty(room: ServerRoom, actorUserId: string): GameRoomCommandResult {
  if (room.status !== 'playing') return NO_BROADCAST;

  const player = room.players.find((p) => p.userId === actorUserId);
  if (!player) return NO_BROADCAST;

  const actionText = drawPenaltyCard(room, player.userId, `⚠️ ${player.name} 犯规，罚抽 1 张扑克牌`);
  recordGameStep(room, actionText);
  return CHANGED;
}

function recordAccidentalPocket(room: ServerRoom, ballNumber: number): GameRoomCommandResult {
  if (room.status !== 'playing') return NO_BROADCAST;

  if (!room.accidentalBalls.includes(ballNumber)) {
    room.accidentalBalls.push(ballNumber);
    const actionText = `🎱 记录场上 ${ballNumber}号球判定为已进球`;
    addLog(room, actionText);

    finishIfNeeded(room, null);
    recordGameStep(room, actionText);
    return CHANGED;
  }

  return BROADCAST_ONLY;
}

function recordBreakPocket(room: ServerRoom, ballNumber: number): GameRoomCommandResult {
  if (room.status !== 'playing') return NO_BROADCAST;

  if (!room.breakBalls.includes(ballNumber)) {
    room.breakBalls.push(ballNumber);
    const actionText = `🚀 记录开球进球：${ballNumber}号球已进球`;
    addLog(room, actionText);

    finishIfNeeded(room, null);
    recordGameStep(room, actionText);
    return CHANGED;
  }

  return BROADCAST_ONLY;
}

function retractLastStep(room: ServerRoom): GameRoomCommandResult {
  const previous = undoGameStep(room);
  if (!previous) {
    addLog(room, '↩️ 没有可撤回的操作');
  } else {
    addLog(room, '↩️ 已撤回到上一步操作');
  }

  return previous ? CHANGED : BROADCAST_ONLY;
}

function refereePocketBall(
  room: ServerRoom,
  actorSocketId: string,
  targetUserId: string,
  ballNumber: number
): GameRoomCommandResult {
  if (room.status !== 'playing') return NO_BROADCAST;

  const targetPlayer = room.players.find((p) => p.userId === targetUserId);
  if (!targetPlayer) return NO_BROADCAST;

  const cardIndex = targetPlayer.cards.findIndex((c) => c.ballNumber === ballNumber);
  if (cardIndex !== -1) {
    const [pocketedCard] = targetPlayer.cards.splice(cardIndex, 1);
    targetPlayer.pocketedCards.push(pocketedCard);
    const refereePlayer = room.players.find((p) => p.id === actorSocketId);
    const isSelfAction = refereePlayer && refereePlayer.userId === targetPlayer.userId;
    const actionText = isSelfAction
      ? `🎯 ${targetPlayer.name} 打进 ${pocketedCard.ballNumber}号球，消去卡牌 [${pocketedCard.suit}${pocketedCard.rank}]`
      : `⚖️ ${refereePlayer ? refereePlayer.name : '其他玩家'} 为 ${targetPlayer.name} 记录打进并消除了手牌 [${pocketedCard.suit}${pocketedCard.rank} -> ${pocketedCard.ballNumber}号球]！`;

    addLog(room, actionText);
    finishIfNeeded(room, targetPlayer);
    recordGameStep(room, actionText);
    return CHANGED;
  }

  if (!room.accidentalBalls.includes(ballNumber)) {
    room.accidentalBalls.push(ballNumber);
    const actionText = `🎱 记录 ${targetPlayer.name} 打进 ${ballNumber}号球（判定为全场已进球）`;
    addLog(room, actionText);

    finishIfNeeded(room, null);
    recordGameStep(room, actionText);
    return CHANGED;
  }

  return BROADCAST_ONLY;
}

function refereeDrawPenalty(room: ServerRoom, targetUserId: string): GameRoomCommandResult {
  if (room.status !== 'playing') return NO_BROADCAST;

  const targetPlayer = room.players.find((p) => p.userId === targetUserId);
  if (!targetPlayer) return NO_BROADCAST;

  const actionText = drawPenaltyCard(room, targetUserId, `👨‍⚖️ 裁判代记：${targetPlayer.name} 犯规，罚抽 1 张扑克牌`);
  recordGameStep(room, actionText);
  return CHANGED;
}

function restartGame(room: ServerRoom, actorUserId: string): GameRoomCommandResult {
  if (actorUserId !== room.hostUserId) return NO_BROADCAST;

  room.deck = [];
  room.accidentalBalls = [];
  room.breakBalls = [];
  room.winners = [];
  room.status = 'waiting';
  room.gameHistory = [];

  room.players.forEach((p) => {
    p.cards = [];
    p.pocketedCards = [];
    p.isWinner = false;
    p.cardCount = 0;
    p.activeCardCount = 0;
  });

  addLog(room, '🔄 房主重置了游戏，回到发牌等待状态。');
  return CHANGED;
}

function drawPenaltyCard(room: ServerRoom, targetUserId: string, actionText: string): string | undefined {
  const targetPlayer = room.players.find((p) => p.userId === targetUserId);
  if (!targetPlayer) return undefined;

  if (room.deck.length === 0) {
    room.deck = shuffle(create54PokerDeck());
    addLog(room, '🎴 牌堆已耗尽，洗混新扑克牌库补充牌堆！');
  }

  const penaltyCard = room.deck.pop();
  if (!penaltyCard) return undefined;

  targetPlayer.cards.push(penaltyCard);
  addLog(room, actionText);
  return actionText;
}

function finishIfNeeded(room: ServerRoom, actionPlayer: Parameters<typeof handleGameFinished>[2]): void {
  const winners = checkGameWinners(room);
  if (winners.length > 0) {
    handleGameFinished(room, winners, actionPlayer);
  }
}
