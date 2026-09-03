import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_TO_SERVER_EVENTS,
  DATA_LAYER_PATHS,
  SERVER_TO_CLIENT_EVENTS,
  WEAR_ACTIONS,
} from '../../shared/types/protocol';

const kotlinModelsPath = path.resolve(
  process.cwd(),
  'android/shared-models/src/main/java/com/poolpoker/shared/Models.kt'
);
const kotlinModels = fs.readFileSync(kotlinModelsPath, 'utf8');

function expectUniqueValues(name: string, values: string[]) {
  const uniqueValues = new Set(values);
  expect(uniqueValues.size, `${name} contains duplicate protocol values`).toBe(values.length);
}

describe('shared protocol contract', () => {
  it('keeps Socket.IO event names stable and unique', () => {
    expect(SERVER_TO_CLIENT_EVENTS).toEqual({
      roomCreated: 'room_created',
      roomUpdated: 'room_updated',
      errorMessage: 'error_message',
    });
    expect(CLIENT_TO_SERVER_EVENTS).toEqual({
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
    });

    expectUniqueValues('server events', Object.values(SERVER_TO_CLIENT_EVENTS));
    expectUniqueValues('client events', Object.values(CLIENT_TO_SERVER_EVENTS));
  });

  it('keeps Wear action and DataLayer path names stable and unique', () => {
    expect(WEAR_ACTIONS).toEqual({
      pocketBall: 'POCKET_BALL',
      drawPenalty: 'DRAW_PENALTY',
      retractBall: 'RETRACT_BALL',
      accidentalPocket: 'ACCIDENTAL_POCKET',
      refereePocketBall: 'REFEREE_POCKET_BALL',
      refereeDrawPenalty: 'REFEREE_DRAW_PENALTY',
      breakPocket: 'BREAK_POCKET',
    });
    expect(DATA_LAYER_PATHS).toEqual({
      syncRoom: '/poolpoker/sync_room',
      wearAction: '/poolpoker/action',
    });

    expectUniqueValues('wear actions', Object.values(WEAR_ACTIONS));
    expectUniqueValues('data layer paths', Object.values(DATA_LAYER_PATHS));
  });

  it('keeps the Kotlin shared-model mirror aligned with the TS protocol surface', () => {
    const mirroredValues = [
      ...Object.values(SERVER_TO_CLIENT_EVENTS),
      ...Object.values(CLIENT_TO_SERVER_EVENTS),
      ...Object.values(WEAR_ACTIONS),
      ...Object.values(DATA_LAYER_PATHS),
    ];

    for (const value of mirroredValues) {
      expect(kotlinModels, `Kotlin protocol mirror is missing ${value}`).toContain(`"${value}"`);
    }
  });
});
