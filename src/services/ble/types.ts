/**
 * Internal BLE Transport Layer Types & Contracts
 */

import type { BleClientAction } from '@shared/types/bleProtocol';
import type { Room } from '@shared/types/game';

export interface BleConnectionEvents {
  onClientConnected?: (peerId: string) => void;
  onClientDisconnected?: (peerId: string) => void;
  onPeripheralConnected?: (peerId: string) => void;
  onPeripheralDisconnected?: (peerId: string) => void;
  onCommandReceived?: (peerId: string, payload: number[]) => void;
  onStateReceived?: (payload: number[]) => void;
}

export interface BleHandshakeJoinOptions {
  roomCode: string;
  userId: string;
  playerName: string;
  revision: number;
}

export interface BleOptimisticActionResult {
  room: Room;
  action: BleClientAction;
}
