import type { DiscoveryMode, NearbyRoom } from '@shared/types/discovery';

export interface DiscoveryCallbacks {
  rooms: (rooms: NearbyRoom[]) => void;
  status: (message: string) => void;
}

// A native BLE adapter can implement this same contract and return room codes.
// Discovery does not own player identity or joining; those remain in useGameRoom.
export interface DiscoveryStopOptions {
  retainAdvertisement?: boolean;
}

export interface RoomDiscoveryProvider {
  start(
    mode: DiscoveryMode,
    callbacks: DiscoveryCallbacks,
    options?: { forceLocate?: boolean }
  ): (options?: DiscoveryStopOptions) => void;
}
