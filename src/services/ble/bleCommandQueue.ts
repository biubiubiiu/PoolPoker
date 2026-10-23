/**
 * BLE Transport Command Queue & Offline Actions Module
 *
 * Manages:
 * 1. Client offline actions pending queue (memory + persistent storage)
 * 2. Idempotent action retry scheduling
 * 3. Flush coordination after handshake / reconnection
 * 4. Authoritative state alignment & pocketed ball pruning
 */

import { BleActionType, type BleClientAction } from '@shared/types/bleProtocol';
import { BleStorage } from './bleStorage';

export interface BleFlushCheckers {
  isHost: () => boolean;
  isConnected: () => boolean;
  isLeaving: () => boolean;
  getRoomCode: () => string;
}

export class BleCommandQueue {
  public pendingOfflineActions: BleClientAction[] = [];
  public isFlushingActions = false;
  private pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private flushSessionVersion = 0;

  public isRetryableRecording(action: BleClientAction): boolean {
    return [
      BleActionType.POCKET_BALL,
      BleActionType.REFEREE_POCKET,
      BleActionType.ACCIDENTAL_POCKET,
      BleActionType.BREAK_POCKET,
    ].includes(action.actionType);
  }

  public getPendingActions(roomCode: string): BleClientAction[] {
    if (this.pendingOfflineActions.length === 0 && roomCode) {
      this.pendingOfflineActions = BleStorage.loadPendingActions(roomCode);
    }
    return this.pendingOfflineActions;
  }

  public enqueueAction(action: BleClientAction, roomCode: string): void {
    this.pendingOfflineActions.push(action);
    if (roomCode) {
      BleStorage.savePendingActions(roomCode, this.pendingOfflineActions);
    }
  }

  public cancelFlushing(): void {
    this.flushSessionVersion++;
    this.isFlushingActions = false;
  }

  public clearActions(roomCode: string): void {
    this.cancelFlushing();
    if (roomCode) {
      BleStorage.clearPendingActions(roomCode);
    }
    this.pendingOfflineActions = [];
  }

  public prunePocketedBalls(pocketedBallNumbers: number[], roomCode: string): void {
    if (this.pendingOfflineActions.length === 0 && roomCode) {
      this.pendingOfflineActions = BleStorage.loadPendingActions(roomCode);
    }
    if (this.pendingOfflineActions.length === 0) return;

    const pocketedSet = new Set(pocketedBallNumbers);
    this.pendingOfflineActions = this.pendingOfflineActions.filter((act) => {
      if (act.ballNumber !== undefined && pocketedSet.has(act.ballNumber)) {
        return false;
      }
      return true;
    });

    if (roomCode) {
      BleStorage.savePendingActions(roomCode, this.pendingOfflineActions);
    }
  }

  public schedulePendingRetry(
    isHost: boolean,
    leaving: boolean,
    initialized: boolean,
    connected: boolean,
    onRetry: () => void
  ): void {
    if (this.pendingRetryTimer || isHost || leaving || !initialized || !connected) return;
    if (!this.pendingOfflineActions.some((action) => this.isRetryableRecording(action))) return;

    this.pendingRetryTimer = setTimeout(() => {
      this.pendingRetryTimer = null;
      if (!connected || leaving || !this.pendingOfflineActions.some((action) => this.isRetryableRecording(action))) {
        return;
      }
      onRetry();
    }, 1500);
  }

  public clearPendingRetry(): void {
    if (this.pendingRetryTimer) {
      clearTimeout(this.pendingRetryTimer);
      this.pendingRetryTimer = null;
    }
  }

  public async flushPendingOfflineActions(options: {
    retryOnly?: boolean;
    checkers: BleFlushCheckers;
    sendActionFn: (action: BleClientAction) => Promise<void>;
    waitHandshake?: Promise<void>;
    onRescheduleRetry?: () => void;
  }): Promise<void> {
    const { retryOnly, checkers, sendActionFn, waitHandshake, onRescheduleRetry } = options;
    const { isHost, isConnected, isLeaving, getRoomCode } = checkers;

    if (isHost() || !isConnected() || isLeaving() || this.isFlushingActions) return;

    const currentRoom = getRoomCode();
    if (this.pendingOfflineActions.length === 0 && currentRoom) {
      this.pendingOfflineActions = BleStorage.loadPendingActions(currentRoom);
    }
    if (this.pendingOfflineActions.length === 0) return;

    const currentSession = this.flushSessionVersion;
    this.isFlushingActions = true;

    try {
      if (waitHandshake) {
        await waitHandshake;
      }

      if (
        currentSession !== this.flushSessionVersion ||
        isHost() ||
        !isConnected() ||
        isLeaving() ||
        getRoomCode() !== currentRoom
      ) {
        return;
      }

      const actionsToSend = this.pendingOfflineActions.filter(
        (action) => !retryOnly || this.isRetryableRecording(action)
      );

      for (let i = 0; i < actionsToSend.length; i++) {
        const action = actionsToSend[i];
        if (
          currentSession !== this.flushSessionVersion ||
          isHost() ||
          !isConnected() ||
          isLeaving() ||
          getRoomCode() !== currentRoom
        ) {
          break;
        }

        if (!this.pendingOfflineActions.includes(action)) {
          continue;
        }

        await sendActionFn(action);

        if (
          currentSession !== this.flushSessionVersion ||
          isHost() ||
          !isConnected() ||
          isLeaving() ||
          getRoomCode() !== currentRoom
        ) {
          break;
        }

        if (i < actionsToSend.length - 1) {
          await new Promise((r) => setTimeout(r, 60));
          if (
            currentSession !== this.flushSessionVersion ||
            isHost() ||
            !isConnected() ||
            isLeaving() ||
            getRoomCode() !== currentRoom
          ) {
            break;
          }
        }
      }
    } catch (err) {
      console.warn('[BleCommandQueue] Error flushing pending actions:', err);
    } finally {
      if (currentSession === this.flushSessionVersion) {
        this.isFlushingActions = false;
        if (isConnected() && !isLeaving() && !isHost() && getRoomCode() === currentRoom) {
          onRescheduleRetry?.();
        }
      }
    }
  }

  public reset(roomCode?: string): void {
    this.clearPendingRetry();
    this.cancelFlushing();
    if (roomCode) {
      this.clearActions(roomCode);
    } else {
      this.pendingOfflineActions = [];
    }
  }
}
