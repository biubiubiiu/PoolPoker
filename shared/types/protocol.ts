export const SERVER_TO_CLIENT_EVENTS = {
  roomCreated: 'room_created',
  roomUpdated: 'room_updated',
  errorMessage: 'error_message',
} as const;

export const CLIENT_TO_SERVER_EVENTS = {
  createRoom: 'create_room',
  joinRoom: 'join_room',
  rejoinRoom: 'rejoin_room',
  updateSettings: 'update_settings',
  startGame: 'start_game',
  pocketBall: 'pocket_ball',
  drawPenalty: 'draw_penalty',
  accidentalPocket: 'accidental_pocket',
  breakPocket: 'break_pocket',
  retractBall: 'retract_ball',
  refereePocketBall: 'referee_pocket_ball',
  refereeDrawPenalty: 'referee_draw_penalty',
  requestRestart: 'request_restart',
  confirmRestart: 'confirm_restart',
  restartGame: 'restart_game',
  leaveRoom: 'leave_room',
} as const;

export const WEAR_ACTIONS = {
  pocketBall: 'POCKET_BALL',
  drawPenalty: 'DRAW_PENALTY',
  retractBall: 'RETRACT_BALL',
  accidentalPocket: 'ACCIDENTAL_POCKET',
  refereePocketBall: 'REFEREE_POCKET_BALL',
  refereeDrawPenalty: 'REFEREE_DRAW_PENALTY',
  breakPocket: 'BREAK_POCKET',
} as const;

export const DATA_LAYER_PATHS = {
  syncRoom: '/poolpoker/sync_room',
  wearAction: '/poolpoker/action',
} as const;

export type ServerToClientEventName = (typeof SERVER_TO_CLIENT_EVENTS)[keyof typeof SERVER_TO_CLIENT_EVENTS];
export type ClientToServerEventName = (typeof CLIENT_TO_SERVER_EVENTS)[keyof typeof CLIENT_TO_SERVER_EVENTS];
export type WearActionName = (typeof WEAR_ACTIONS)[keyof typeof WEAR_ACTIONS];
export type DataLayerPath = (typeof DATA_LAYER_PATHS)[keyof typeof DATA_LAYER_PATHS];
