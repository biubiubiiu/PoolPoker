import { describe, expect, it } from 'vitest';
import { shouldAnimateRoomChange } from '../utils/roomPresentation';

const baseline = {
  code: '6845',
  roundCount: 1,
  revision: 2,
  sceneEvent: { id: 'event-2', kind: 'pocket_ball', revision: 2 },
};
const next = { ...baseline, revision: 3, sceneEvent: { id: 'event-3', kind: 'pocket_ball', revision: 3 } };
const live = { live: true, suppress: false, visible: true };

describe('room presentation continuity', () => {
  it('performs a confirmed live event once, despite duplicate broadcasts', () => {
    expect(shouldAnimateRoomChange(baseline, next, live)).toBe(true);
    expect(shouldAnimateRoomChange(next, next, live)).toBe(false);
  });
  it('snaps initial, HTTP, rejoin and background snapshots without replay', () => {
    expect(shouldAnimateRoomChange(null, next, live)).toBe(false);
    expect(shouldAnimateRoomChange(baseline, next, { ...live, live: false })).toBe(false);
    expect(shouldAnimateRoomChange(baseline, next, { ...live, suppress: true })).toBe(false);
    expect(shouldAnimateRoomChange(baseline, next, { ...live, visible: false })).toBe(false);
  });
  it('does not replay a previous round, another room or an older response', () => {
    expect(shouldAnimateRoomChange(baseline, { ...next, roundCount: 2 }, live)).toBe(false);
    expect(shouldAnimateRoomChange(baseline, { ...next, code: '9988' }, live)).toBe(false);
    expect(shouldAnimateRoomChange(next, baseline, live)).toBe(false);
  });
  it('accepts undo as a newer event even though game state goes backwards', () => {
    expect(
      shouldAnimateRoomChange(baseline, { ...next, sceneEvent: { ...next.sceneEvent, kind: 'retract_ball' } }, live)
    ).toBe(true);
  });
});
