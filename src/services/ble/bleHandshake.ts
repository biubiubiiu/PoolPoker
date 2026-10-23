/**
 * BLE Transport Handshake & Identity Module
 *
 * Manages:
 * 1. Client Join Handshake serialization & MTU-safe chunking
 * 2. Host Peer-to-User mapping & seat reservation verification
 * 3. Leave Room ACK negotiation and timeout safety
 */

import { BLE_PROTOCOL_VERSION, BleActionType, BleHostEventCode, BleMessageType } from '@shared/types/bleProtocol';
import {
  decodeBleJoin,
  encodeBleAction,
  encodeBleHostEvent,
  encodeBleJoin,
  splitIntoBleChunks,
} from '@shared/utils/bleCodec';
import type { LocalHostEngine } from '../localHostEngine';

export interface BleHandshakeCheckers {
  isHost: () => boolean;
  isConnected: () => boolean;
  isLeaving: () => boolean;
  getRoomCode: () => string;
}

export class BleHandshakeManager {
  private revision = 0;
  private nextTransferId = 0;
  private sessionVersion = 0;
  public joinSendQueue: Promise<void> = Promise.resolve();

  // Bidirectional physical connection <-> player identity mapping
  public peerIdToUserId: Map<string, string>;
  public userIdToPeerId: Map<string, string>;

  constructor(sharedPeerMap?: Map<string, string>, sharedUserMap?: Map<string, string>) {
    this.peerIdToUserId = sharedPeerMap || new Map<string, string>();
    this.userIdToPeerId = sharedUserMap || new Map<string, string>();
  }

  public getRevision(): number {
    return this.revision;
  }

  public nextRevision(): number {
    return ++this.revision;
  }

  public cancelPendingHandshakes(): void {
    this.sessionVersion++;
  }

  public sendJoinHandshake(
    userId: string,
    playerName: string,
    checkers: BleHandshakeCheckers,
    sendChunkFn: (chunk: Uint8Array) => Promise<void>
  ): Promise<void> {
    const { isHost, isConnected, isLeaving, getRoomCode } = checkers;
    const roomCode = getRoomCode();
    if (isHost() || isLeaving() || !isConnected() || !roomCode) {
      return this.joinSendQueue;
    }

    const capturedSession = this.sessionVersion;
    const targetRoomCode = roomCode;

    const joinBytes = encodeBleJoin({
      version: BLE_PROTOCOL_VERSION,
      revision: ++this.revision & 0xffff,
      roomCode: Number(targetRoomCode) || 8848,
      userId,
      name: playerName || '球友',
    });

    // Uplink handshake uses default ATT MTU 23 with 20-byte payload chunks
    const chunks = splitIntoBleChunks(joinBytes, this.nextTransferId++ & 0xff, 20, BleMessageType.CLIENT_COMMAND_CHUNK);

    this.joinSendQueue = this.joinSendQueue
      .catch(() => {})
      .then(async () => {
        for (const chunk of chunks) {
          if (
            capturedSession !== this.sessionVersion ||
            isHost() ||
            isLeaving() ||
            !isConnected() ||
            getRoomCode() !== targetRoomCode
          ) {
            return;
          }
          await sendChunkFn(chunk);
          if (
            capturedSession !== this.sessionVersion ||
            isHost() ||
            isLeaving() ||
            !isConnected() ||
            getRoomCode() !== targetRoomCode
          ) {
            return;
          }
        }
      });

    return this.joinSendQueue;
  }

  public handleClientJoin(
    peerId: string,
    rawBytes: Uint8Array,
    hostEngine: LocalHostEngine,
    currentRoomCode: string,
    notifyClientFn: (bytes: Uint8Array, peerId: string) => void
  ): boolean {
    try {
      const join = decodeBleJoin(rawBytes);
      const oldUserId = this.peerIdToUserId.get(peerId);
      if (oldUserId && oldUserId !== join.userId) {
        this.userIdToPeerId.delete(oldUserId);
      }
      this.peerIdToUserId.set(peerId, join.userId);
      this.userIdToPeerId.set(join.userId, peerId);

      const bindRes = hostEngine.bindPeerPlayer(peerId, join.userId, join.name);
      if (!bindRes.ok) {
        this.peerIdToUserId.delete(peerId);
        this.userIdToPeerId.delete(join.userId);
        const evtBytes = encodeBleHostEvent({
          version: BLE_PROTOCOL_VERSION,
          code:
            bindRes.reason === 'full' ? BleHostEventCode.JOIN_REJECTED_FULL : BleHostEventCode.JOIN_REJECTED_PLAYING,
          roomCode: Number(currentRoomCode) || 8848,
        });
        notifyClientFn(evtBytes, peerId);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[BleHandshake] Failed to decode CLIENT_JOIN:', err);
      return false;
    }
  }

  public getMappedUserId(peerId: string): string {
    return this.peerIdToUserId.get(peerId) || peerId;
  }

  public getMappedPeerId(userId: string): string | undefined {
    return this.userIdToPeerId.get(userId);
  }

  public removePeer(peerId: string): string | undefined {
    const userId = this.peerIdToUserId.get(peerId);
    this.peerIdToUserId.delete(peerId);
    if (userId) {
      this.userIdToPeerId.delete(userId);
    }
    return userId;
  }

  public removeUser(userId: string): string | undefined {
    const peerId = this.userIdToPeerId.get(userId);
    this.userIdToPeerId.delete(userId);
    if (peerId) {
      this.peerIdToUserId.delete(peerId);
    }
    return peerId;
  }

  public clearMappings(): void {
    this.peerIdToUserId.clear();
    this.userIdToPeerId.clear();
  }

  public createLeaveActionBytes(): Uint8Array {
    return encodeBleAction({
      version: BLE_PROTOCOL_VERSION,
      revision: ++this.revision & 0xffff,
      actionType: BleActionType.LEAVE_ROOM,
    });
  }

  public createLeaveAckBytes(roomCode: string): Uint8Array {
    return encodeBleHostEvent({
      version: BLE_PROTOCOL_VERSION,
      code: BleHostEventCode.LEAVE_ACK,
      roomCode: Number(roomCode) || 8848,
    });
  }
}
