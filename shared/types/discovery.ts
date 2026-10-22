export type { DiscoveryMode, DiscoveryPosition, DiscoverySource, NearbyRoom } from './generated/wire-models';

export const DISCOVERY = {
  radiusMeters: 300,
  maxAccuracyMeters: 300,
  positionMaxAgeMs: 60_000,
  refreshMs: 20_000,
  publishMs: 2_000,
  maxResults: 20,
} as const;
