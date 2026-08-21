import type { Room, RoomSettings } from './game';

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
  sessionToken: string;
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

export interface DrawPenaltyPayload {
  roomCode: string;
}

export interface AccidentalPocketPayload {
  roomCode: string;
  ballNumber: number;
}

export interface BreakPocketPayload {
  roomCode: string;
  ballNumber: number;
}

export interface RetractBallPayload {
  roomCode: string;
}

export interface RefereePocketBallPayload {
  roomCode: string;
  targetUserId: string;
  ballNumber: number;
}

export interface RefereeDrawPenaltyPayload {
  roomCode: string;
  targetUserId: string;
}

export interface RequestRestartPayload {
  roomCode: string;
}

export interface ConfirmRestartPayload {
  roomCode: string;
}

export interface RestartGamePayload {
  roomCode: string;
}

export interface LeaveRoomPayload {
  roomCode: string;
  userId: string;
}

export interface SocketData {
  userName?: string;
  userId?: string;
}

export interface SocketCallbackResponse {
  success: boolean;
  message?: string;
  roomCode?: string;
  sessionToken?: string;
}

// 客户端接收的事件 (Server -> Client)
export interface ServerToClientEvents {
  room_created: (payload: { roomCode: string }) => void;
  room_updated: (room: Room) => void;
  error_message: (msg: string) => void;
}

// 客户端发送的事件 (Client -> Server)
export interface ClientToServerEvents {
  create_room: (payload: CreateRoomPayload, callback?: (res: SocketCallbackResponse) => void) => void;
  join_room: (payload: JoinRoomPayload, callback?: (res: SocketCallbackResponse) => void) => void;
  rejoin_room: (payload: RejoinRoomPayload, callback?: (res: SocketCallbackResponse) => void) => void;
  update_settings: (payload: UpdateSettingsPayload) => void;
  start_game: (payload: StartGamePayload) => void;
  pocket_ball: (payload: PocketBallPayload) => void;
  draw_penalty: (payload: DrawPenaltyPayload) => void;
  accidental_pocket: (payload: AccidentalPocketPayload) => void;
  break_pocket: (payload: BreakPocketPayload) => void;
  retract_ball: (payload: RetractBallPayload) => void;
  referee_pocket_ball: (payload: RefereePocketBallPayload) => void;
  referee_draw_penalty: (payload: RefereeDrawPenaltyPayload) => void;
  request_restart: (payload: RequestRestartPayload) => void;
  confirm_restart: (payload: ConfirmRestartPayload) => void;
  restart_game: (payload: RestartGamePayload) => void;
  leave_room: (payload: LeaveRoomPayload) => void;
}
