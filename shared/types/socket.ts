import type { Room, RoomSettings } from './game';
import { CLIENT_TO_SERVER_EVENTS, SERVER_TO_CLIENT_EVENTS } from './protocol';

export interface CommandMetadata {
  commandId?: string;
  expectedRoomId?: string;
  expectedRevision?: number;
}

export interface CreateRoomPayload extends CommandMetadata {
  userId: string;
  name: string;
  avatar: string;
  ballConfigKey: string;
}

export interface JoinRoomPayload extends CommandMetadata {
  roomCode: string;
  userId: string;
  name: string;
  avatar: string;
}

export interface RejoinRoomPayload extends CommandMetadata {
  roomCode: string;
  userId: string;
  sessionToken: string;
}

export interface UpdateSettingsPayload extends CommandMetadata {
  roomCode: string;
  settings: Partial<RoomSettings>;
}

export interface StartGamePayload extends CommandMetadata {
  roomCode: string;
}

export interface PocketBallPayload extends CommandMetadata {
  roomCode: string;
  cardId: string;
}

export interface DrawPenaltyPayload extends CommandMetadata {
  roomCode: string;
}

export interface AccidentalPocketPayload extends CommandMetadata {
  roomCode: string;
  ballNumber: number;
}

export interface BreakPocketPayload extends CommandMetadata {
  roomCode: string;
  ballNumber: number;
}

export interface RetractBallPayload extends CommandMetadata {
  expectedRevision?: number;
  roomCode: string;
}

export interface RefereePocketBallPayload extends CommandMetadata {
  roomCode: string;
  targetUserId: string;
  ballNumber: number;
}

export interface RefereeDrawPenaltyPayload extends CommandMetadata {
  roomCode: string;
  targetUserId: string;
}

export interface RequestRestartPayload extends CommandMetadata {
  roomCode: string;
}

export interface ConfirmRestartPayload extends CommandMetadata {
  roomCode: string;
}

export interface RestartGamePayload extends CommandMetadata {
  roomCode: string;
}

export interface KickPlayerPayload extends CommandMetadata {
  roomCode: string;
  targetUserId: string;
}

export interface LeaveRoomPayload extends CommandMetadata {
  roomCode: string;
}

export interface SocketData {
  userName?: string;
  userId?: string;
}

export interface SocketCallbackResponse {
  roomId?: string;
  success: boolean;
  message?: string;
  roomCode?: string;
  sessionToken?: string;
}

// 客户端接收的事件 (Server -> Client)
export interface ServerToClientEvents {
  [SERVER_TO_CLIENT_EVENTS.roomKicked]: (payload: { roomCode: string }) => void;
  [SERVER_TO_CLIENT_EVENTS.roomCreated]: (payload: { roomCode: string }) => void;
  [SERVER_TO_CLIENT_EVENTS.roomUpdated]: (room: Room) => void;
  [SERVER_TO_CLIENT_EVENTS.errorMessage]: (msg: string) => void;
}

// 客户端发送的事件 (Client -> Server)
export interface ClientToServerEvents {
  [CLIENT_TO_SERVER_EVENTS.kickPlayer]: (payload: KickPlayerPayload) => void;
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
  [CLIENT_TO_SERVER_EVENTS.pocketBall]: (
    payload: PocketBallPayload,
    callback?: (res: SocketCallbackResponse) => void
  ) => void;
  [CLIENT_TO_SERVER_EVENTS.drawPenalty]: (payload: DrawPenaltyPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.accidentalPocket]: (payload: AccidentalPocketPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.breakPocket]: (
    payload: BreakPocketPayload,
    callback?: (res: SocketCallbackResponse) => void
  ) => void;
  [CLIENT_TO_SERVER_EVENTS.retractBall]: (
    payload: RetractBallPayload,
    callback?: (res: SocketCallbackResponse) => void
  ) => void;
  [CLIENT_TO_SERVER_EVENTS.refereePocketBall]: (
    payload: RefereePocketBallPayload,
    callback?: (res: SocketCallbackResponse) => void
  ) => void;
  [CLIENT_TO_SERVER_EVENTS.refereeDrawPenalty]: (
    payload: RefereeDrawPenaltyPayload,
    callback?: (res: SocketCallbackResponse) => void
  ) => void;
  [CLIENT_TO_SERVER_EVENTS.requestRestart]: (payload: RequestRestartPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.confirmRestart]: (payload: ConfirmRestartPayload) => void;
  [CLIENT_TO_SERVER_EVENTS.restartGame]: (payload: RestartGamePayload) => void;
  [CLIENT_TO_SERVER_EVENTS.leaveRoom]: (payload: LeaveRoomPayload) => void;
}
