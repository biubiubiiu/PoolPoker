export type { DiscoveryMode, DiscoveryPosition, DiscoverySource, NearbyRoom } from './generated/wire-models';

export const DISCOVERY = {
  radiusMeters: 300,
  maxAccuracyMeters: 300,
  positionMaxAgeMs: 60_000,
  refreshMs: 20_000,
  publishMs: 2_000,
  maxResults: 20,
} as const;

/** Explain why a fix cannot be used without exposing its coordinates. */
export function discoveryPositionIssue(value: unknown, now: number): string | null {
  if (!value || typeof value !== 'object') return '定位数据无效，请重新定位';
  const p = value as import('./generated/wire-models').DiscoveryPosition;
  if (
    ![p.latitude, p.longitude, p.accuracy, p.timestamp].every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    Math.abs(p.latitude) > 90 ||
    Math.abs(p.longitude) > 180 ||
    p.accuracy < 0 ||
    (p.mode !== 'browse' && p.mode !== 'advertise')
  )
    return '定位数据无效，请重新定位';
  if (p.accuracy > DISCOVERY.maxAccuracyMeters) {
    return '定位精度不足，正在重试…';
  }
  const age = now - p.timestamp;
  if (age >= DISCOVERY.positionMaxAgeMs) return '位置已过期，正在重新定位…';
  if (age < -15_000) return '定位时间异常，请检查设备时间后重新定位';
  return null;
}
