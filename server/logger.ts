import type { Socket } from 'socket.io';
import { getRoom, getSocketSession } from './roomManager';

export function formatTimestamp(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function getSocketUsername(socket: Socket): string {
  if (socket.data?.userName && typeof socket.data.userName === 'string' && socket.data.userName.trim()) {
    return socket.data.userName.trim();
  }
  const authName = socket.handshake?.auth?.name || socket.handshake?.query?.name;
  if (authName && typeof authName === 'string' && authName.trim()) {
    return authName.trim();
  }
  const session = getSocketSession(socket.id);
  if (session) {
    const room = getRoom(session.roomCode);
    const player = room?.players.find((p) => p.userId === session.userId);
    if (player?.name) {
      return player.name;
    }
  }
  return '';
}

export function logSocketConnect(socket: Socket): void {
  const userName = getSocketUsername(socket);
  if (userName) {
    socket.data.userName = userName;
  }
  const userText = userName ? ` | User: ${userName}` : ' | User: 无';
  console.log(`[${formatTimestamp()}] [Socket Connected] ID: ${socket.id}${userText}`);
}

export function logSocketDisconnect(socket: Socket, reason?: string): void {
  const userName = getSocketUsername(socket);
  const userText = userName ? ` | User: ${userName}` : ' | User: 无';
  const reasonText = reason ? ` (Reason: ${reason})` : '';
  console.log(`[${formatTimestamp()}] [Socket Disconnected] ID: ${socket.id}${userText}${reasonText}`);
}
