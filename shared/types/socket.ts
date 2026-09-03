import type { Room, RoomSettings } from './game';
import { CLIENT_TO_SERVER_EVENTS, SERVER_TO_CLIENT_EVENTS } from './protocol';

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
  [SERVER_TO_CLIENT_EVENTS.roomCreated]: (payload: { roomCode: string }) => void;
  [SERVER_TO_CLIENT_EVENTS.roomUpdated]: (room: Room) => void;
  [SERVER_TO_CLIENT_EVENTS.errorMessage]: (msg: string) => void;
}

// 客户端发送的事件 (Client -> Server)
export interface ClientToServerEvents {
  [CLIENT_TO_SERVER_EVENTS.createRoom]: (
    payload: CreateRoomPayload,
    callback?: (res: SocketCallbackResponse) => void
  ) => void;
  [CLIENT_TO_SERVER_EVENTS.joinRoom]: (
    payload: JoinRoomPayload,
    callback?: (res: SocketCallbackResponse) => void
  ) => void;
  [CLIENT_TO_SERVER_EVENTS.rejoinRoom]: (
    payload: RejoinRoomPayload,
    callback?: (res: SocketCallbackResponse) => void
  ) => void;
  [CLIENT_TO_SERVER_EVENTS.updateSettings]: (payload: UpdateSettingsPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.startGame]: (payload: StartGamePayload) => void;
  [CLIENT_TO_SERVER_EVENTS.pocketBall]: (payload: PocketBallPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.drawPenalty]: (payload: DrawPenaltyPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.accidentalPocket]: (payload: AccidentalPocketPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.breakPocket]: (payload: BreakPocketPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.retractBall]: (payload: RetractBallPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.refereePocketBall]: (payload: RefereePocketBallPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.refereeDrawPenalty]: (payload: RefereeDrawPenaltyPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.requestRestart]: (payload: RequestRestartPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.confirmRestart]: (payload: ConfirmRestartPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.restartGame]: (payload: RestartGamePayload) => void;
  [CLIENT_TO_SERVER_EVENTS.leaveRoom]: (payload: LeaveRoomPayload) => void;
}
