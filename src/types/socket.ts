import { Room, RoomSettings } from './game';

export interface CreateRoomPayload {
  userId: string;
  name: string;
  avatar: string;
  ballConfigKey: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  userId: string;
  name: string;
  avatar: string;
}

export interface RejoinRoomPayload {
  roomCode: string;
  userId: string;
}

export interface UpdateSettingsPayload {
  roomCode: string;
  settings: Partial<RoomSettings>;
}

export interface StartGamePayload {
  roomCode: string;
}

export interface PocketBallPayload {
  roomCode: string;
  cardId: string;
}

export interface RestartGamePayload {
  roomCode: string;
}

export interface SocketCallbackResponse {
  success: boolean;
  message?: string;
  roomCode?: string;
}
