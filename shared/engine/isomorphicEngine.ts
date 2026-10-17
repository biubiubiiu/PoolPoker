/**
 * Isomorphic Game State Machine for PoolPoker
 * Runs identically in Node.js server, QuickJS (Rust runtime), and Browser Web Worker.
 */

import { getPocketedBallNumbers } from '../../server/gameEngine';
import { applyGameRoomCommand, type GameRoomCommand } from '../../server/gameRoomService';
import {
  BLE_PROTOCOL_VERSION,
  BleGameStatus,
  type BlePlayerSummary,
  type BleRoomState,
  ballsToMask,
  cardToIndex,
  decodeBleAction,
  decodeBleRoomState,
  encodeBleAction,
  encodeBleRoomState,
  simpleHash8,
} from '../types/bleProtocol';
import type { Player, ServerRoom } from '../types/game';

export { decodeBleAction, decodeBleRoomState, encodeBleAction, encodeBleRoomState };

export function createLocalRoom(
  hostUserId: string,
  hostName: string,
  roomCode = '8848',
  hostAvatar = '🎱'
): ServerRoom {
  const hostPlayer: Player = {
    id: `ble_host_${hostUserId}`,
    userId: hostUserId,
    name: hostName,
    avatar: hostAvatar || '🎱',
    isHost: true,
    online: true,
    cardCount: 0,
    cards: [],
    pocketedCards: [],
    wins: 0,
    isWinner: false,
    totalScore: 0,
  };

  return {
    code: roomCode,
    revision: 0,
    hostUserId,
    hostSocketId: hostPlayer.id,
    settings: {
      cardsPerPlayer: 5,
      includeBlackEight: true,
      maxPlayers: 8,
    },
    status: 'waiting',
    roundCount: 0,
    deck: [],
    logs: [],
    players: [hostPlayer],
    gameHistory: [],
    accidentalBalls: [],
    breakBalls: [],
    winners: [],
    turnOrder: [],
    lastRoundScores: [],
  };
}

export function handleLocalCommand(room: ServerRoom, command: GameRoomCommand) {
  return applyGameRoomCommand(room, command);
}

/**
 * 将内部 ServerRoom 转为针对特定玩家脱敏的 BleRoomState (准备编码为 BLE 极小二进制包)
 */
export function getLocalBleState(room: ServerRoom, targetUserId: string): BleRoomState {
  const pocketedBalls = getPocketedBallNumbers(room);
  const pocketedBallsMask = ballsToMask(pocketedBalls);

  let status = BleGameStatus.WAITING;
  if (room.status === 'playing') status = BleGameStatus.PLAYING;
  else if (room.status === 'finished') status = BleGameStatus.FINISHED;

  const foundIndex = room.players.findIndex((p) => p.userId === targetUserId);
  // 未知用户标记为 0xff (255)，绝不能回退到席位 0，防止泄露房主私有手牌
  const targetPlayerIndex = foundIndex !== -1 ? foundIndex : 0xff;
  const hostIndex = Math.max(
    0,
    room.players.findIndex((p) => p.userId === room.hostUserId)
  );

  const targetPlayer = foundIndex !== -1 ? room.players[foundIndex] : null;
  const selfHandCards = targetPlayer ? targetPlayer.cards.map((c) => cardToIndex(c)) : [];

  const isFinished = room.status === 'finished';
  const players: BlePlayerSummary[] = room.players.map((p) => {
    const roundScore = room.lastRoundScores?.find((rs) => rs.userId === p.userId)?.delta;
    return {
      userIdHash: simpleHash8(p.userId),
      userId: p.userId,
      name: p.name,
      avatar: p.avatar || '🎱',
      cardCount: p.cards.length,
      isHost: p.userId === room.hostUserId,
      online: p.online !== false,
      isWinner: p.isWinner || false,
      wins: p.wins || 0,
      totalScore: p.totalScore || 0,
      pocketedCards: (p.pocketedCards || []).map((c) => cardToIndex(c)),
      revealedCards: isFinished ? (p.cards || []).map((c) => cardToIndex(c)) : undefined,
      roundScoreDelta: roundScore,
    };
  });

  const turnOrderSeats =
    room.turnOrder && room.turnOrder.length > 0
      ? room.turnOrder.map((uid) => room.players.findIndex((p) => p.userId === uid)).filter((idx) => idx !== -1)
      : undefined;

  let sceneEventKind: string | undefined;
  let sceneEventTargetSeat: number | undefined;
  let sceneEventBallNumber: number | undefined;
  if (room.sceneEvent) {
    sceneEventKind = room.sceneEvent.kind;
    if (room.sceneEvent.targetUserId) {
      const seatIdx = room.players.findIndex((p) => p.userId === room.sceneEvent?.targetUserId);
      if (seatIdx !== -1) sceneEventTargetSeat = seatIdx;
    }
    sceneEventBallNumber = room.sceneEvent.ballNumber;
  }

  const lastHistoryStep =
    room.gameHistory && room.gameHistory.length > 1 ? room.gameHistory[room.gameHistory.length - 1] : null;
  const lastActionText = lastHistoryStep?.actionText || undefined;

  return {
    version: BLE_PROTOCOL_VERSION,
    revision: (room.revision ?? 0) & 0xffff,
    status,
    pocketedBallsMask,
    roundCount: room.roundCount,
    deckRemaining: room.deck.length,
    cardsPerPlayer: room.settings?.cardsPerPlayer ?? 5,
    selfSeatIndex: targetPlayerIndex,
    hostSeatIndex: hostIndex,
    selfHandCards,
    turnOrderSeats,
    sceneEventKind,
    sceneEventTargetSeat,
    sceneEventBallNumber,
    players,
    lastActionText,
  };
}
