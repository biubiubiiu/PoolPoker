import { DISCOVERY, type DiscoveryPosition, discoveryPositionIssue, type NearbyRoom } from '../shared/types/discovery';
import type { ServerRoom } from '../shared/types/game';
import type { SocketCallbackResponse } from '../shared/types/socket';
import { appConfig } from './config';
import { getSocketSession, listRooms, type SocketSession } from './roomManager';

interface Presence {
  position: DiscoveryPosition;
  receivedAt: number;
  expiresAt: number;
  room?: ServerRoom;
}

export function distanceMeters(a: DiscoveryPosition, b: DiscoveryPosition): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function validDiscoveryPosition(value: unknown, now: number): value is DiscoveryPosition {
  return discoveryPositionIssue(value, now) === null;
}

// Location is transient socket presence, never part of Room or a public room snapshot.
export class RoomDiscovery {
  private readonly presence = new Map<string, Presence>();

  constructor(
    private readonly getRooms: () => ServerRoom[] = listRooms,
    private readonly getSession: (socketId: string) => SocketSession | undefined = getSocketSession,
    private readonly now: () => number = Date.now,
    private readonly radius = DISCOVERY.radiusMeters as number
  ) {}

  update(socketId: string, value: unknown): SocketCallbackResponse {
    const now = this.now();
    if (!validDiscoveryPosition(value, now)) {
      this.remove(socketId);
      return { success: false, message: discoveryPositionIssue(value, now) || '定位数据无效，请重新定位' };
    }
    const session = this.getSession(socketId);
    const room = this.getRooms().find((r) => r.code === session?.roomCode);
    if (value.mode === 'advertise' && (!room || room.hostUserId !== session?.userId || !this.joinable(room))) {
      this.remove(socketId);
      return { success: false, message: '仅等待中的房主可以让附近玩家发现房间' };
    }
    if (value.mode === 'browse' && session) {
      this.remove(socketId);
      return { success: false, message: '请先退出当前房间' };
    }
    const previous = this.presence.get(socketId);
    if (previous && previous.position.mode === value.mode && now - previous.receivedAt < 1000) {
      return { success: false, message: '定位更新过于频繁' };
    }
    // Copy only the validated fields; do not retain arbitrary client data.
    const { latitude, longitude, accuracy, timestamp, mode } = value;
    this.presence.set(socketId, {
      position: { latitude, longitude, accuracy, timestamp, mode },
      receivedAt: now,
      expiresAt: now + DISCOVERY.positionMaxAgeMs - Math.max(0, now - timestamp),
      room: mode === 'advertise' ? room : undefined,
    });
    return { success: true };
  }

  remove(socketId: string): void {
    this.presence.delete(socketId);
  }

  prune(): void {
    const now = this.now();
    const rooms = this.getRooms();
    for (const [id, entry] of this.presence) {
      const session = this.getSession(id);
      if (
        entry.expiresAt <= now ||
        (entry.position.mode === 'browse' && session) ||
        (entry.room &&
          (!rooms.includes(entry.room) ||
            session?.roomCode !== entry.room.code ||
            session.userId !== entry.room.hostUserId ||
            !this.joinable(entry.room)))
      )
        this.remove(id);
    }
  }

  private joinable(room: ServerRoom): boolean {
    // Full rooms keep host presence so a freed seat can reappear immediately.
    return (
      (room.status === 'waiting' || room.status === 'lobby') &&
      room.players.some((p) => p.userId === room.hostUserId && p.online !== false)
    );
  }

  nearby(socketId: string): NearbyRoom[] {
    this.prune();
    const viewer = this.presence.get(socketId);
    if (viewer?.position.mode !== 'browse') return [];
    const candidates = new Map<string, { summary: NearbyRoom; distance: number }>();
    for (const entry of this.presence.values()) {
      const room = entry.room;
      if (!room || room.players.length >= room.settings.maxPlayers) continue;
      const distance = distanceMeters(viewer.position, entry.position);
      if (distance > this.radius) continue;
      const previous = candidates.get(room.code);
      if (previous && previous.distance <= distance) continue;
      candidates.set(room.code, {
        distance,
        summary: {
          roomCode: room.code,
          hostName: room.players.find((p) => p.userId === room.hostUserId)?.name || '房主',
          playerCount: room.players.length,
          maxPlayers: room.settings.maxPlayers,
          source: 'geolocation',
        },
      });
    }
    return [...candidates.values()]
      .sort((a, b) => a.distance - b.distance || a.summary.roomCode.localeCompare(b.summary.roomCode))
      .slice(0, DISCOVERY.maxResults)
      .map((item) => item.summary);
  }
}

const configuredRadius = appConfig.discovery?.radius_meters;
export const roomDiscovery = new RoomDiscovery(
  undefined,
  undefined,
  undefined,
  typeof configuredRadius === 'number' &&
    Number.isFinite(configuredRadius) &&
    configuredRadius > 0 &&
    configuredRadius <= 5000
    ? configuredRadius
    : DISCOVERY.radiusMeters
);
