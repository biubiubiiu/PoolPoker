import crypto from 'node:crypto';
import type { Server } from 'socket.io';
import type { Room, ServerRoom } from '../shared/types/game';
import { getPocketedBallNumbers } from './gameEngine';

export const rooms: Record<string, ServerRoom> = {};
export const socketIndex = new Map<string, { roomCode: string; userId: string }>();

export function generateRoomCode(): string {
  let code = '';
  do {
    code = crypto.randomInt(1000, 10000).toString();
  } while (rooms[code]);
  return code;
}

export function getClientRoomState(roomCode: string, targetUserId?: string): Room | null {
  const room = rooms[roomCode];
  if (!room) return null;

  const pocketedBallNumbers = getPocketedBallNumbers(room);

  return {
    code: room.code,
    hostUserId: room.hostUserId,
    hostSocketId: room.hostSocketId,
    settings: room.settings,
    status: room.status,
    roundCount: room.roundCount,
    deckCount: room.deck.length,
    logs: room.logs.slice(-15),
    winners: room.winners || [],
    pocketedBallNumbers: pocketedBallNumbers,
    turnOrder: room.turnOrder || [],
    players: room.players.map((p) => {
      const isSelf = targetUserId ? p.userId === targetUserId : false;
      return {
        id: p.id,
        userId: p.userId,
        name: p.name,
        avatar: p.avatar,
        isHost: p.userId === room.hostUserId,
        online: p.online !== false,
        cardCount: p.cards.length,
        activeCardCount: p.cards.length,
        cards: isSelf || room.status === 'finished' ? p.cards : [],
        pocketedCards: p.pocketedCards,
        wins: p.wins || 0,
        isWinner: p.isWinner || false,
        totalScore: p.totalScore || 0,
      };
    }),
    lastRoundScores: room.lastRoundScores || [],
  };
}

export function broadcastRoomState(io: Server, roomCode: string): void {
  const room = rooms[roomCode];
  if (!room) return;

  const roomSockets = io.sockets.adapter.rooms.get(roomCode);
  if (!roomSockets) return;

  for (const socketId of roomSockets) {
    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) {
      const socketData = socketIndex.get(socketId);
      const currentPlayer = room.players.find(
        (p) => p.id === socketId || (socketData?.userId && p.userId === socketData.userId)
      );
      const targetUserId = currentPlayer?.userId || socketData?.userId;
      const clientRoom = getClientRoomState(roomCode, targetUserId);
      if (clientRoom) {
        playerSocket.emit('room_updated', clientRoom);
      }
    }
  }
}
