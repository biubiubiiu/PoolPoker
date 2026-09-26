import { describe, expect, it } from 'vitest';
import { normalizeGeolocationTimestamp } from '../discovery/geolocationTimestamp';

const now = Date.UTC(2026, 8, 26, 12);
const offset = Date.UTC(2001, 0, 1);
const apple = 'Apple Computer, Inc.';

describe('Safari geolocation timestamp compatibility', () => {
  it('normalizes the observed 2001 epoch while preserving the actual sample age', () => {
    expect(normalizeGeolocationTimestamp(now - offset - 69, now, apple)).toBe(now - 69);
  });

  it('leaves standard Safari and Chrome Unix timestamps unchanged', () => {
    expect(normalizeGeolocationTimestamp(now - 69, now, apple)).toBe(now - 69);
    expect(normalizeGeolocationTimestamp(now - 69, now, 'Google Inc.')).toBe(now - 69);
  });

  it('does not reinterpret non-Apple old timestamps', () => {
    expect(normalizeGeolocationTimestamp(now - offset - 69, now, 'Google Inc.')).toBe(now - offset - 69);
  });

  it.each([60_000, 120_000, -16_000])('does not make stale or future Apple samples fresh: age %d', (age) => {
    const raw = now - offset - age;
    expect(normalizeGeolocationTimestamp(raw, now, apple)).toBe(raw);
  });

  it.each([NaN, Infinity, 0, -1])('does not manufacture valid timestamps for %s', (timestamp) => {
    expect(normalizeGeolocationTimestamp(timestamp, now, apple)).toBe(timestamp);
  });
});
