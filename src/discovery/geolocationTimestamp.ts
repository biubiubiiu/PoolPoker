import { DISCOVERY } from '@shared/types/discovery';

const APPLE_REFERENCE_DATE_MS = Date.UTC(2001, 0, 1);

/**
 * Some Safari/Core Location builds expose milliseconds since 2001 instead of 1970.
 * Observed on real Safari: raw age 978307200069ms, corrected age 69ms.
 * Only accept this specific Apple offset when the corrected fix is still fresh.
 * Do not replace timestamps with Date.now(): that would renew stale coordinates.
 */
export function normalizeGeolocationTimestamp(timestamp: number, now: number, vendor: string): number {
  if (vendor !== 'Apple Computer, Inc.' || !Number.isFinite(timestamp) || timestamp <= 0) return timestamp;
  const corrected = timestamp + APPLE_REFERENCE_DATE_MS;
  const correctedAge = now - corrected;
  if (correctedAge >= -15_000 && correctedAge < DISCOVERY.positionMaxAgeMs) return corrected;
  return timestamp;
}
