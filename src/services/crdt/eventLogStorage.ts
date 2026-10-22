/**
 * CRDT Event Log Local Storage
 *
 * Persists Genesis and append-only GameEvents in local storage,
 * providing idempotency and event set merging.
 */

import type { GameEvent, GenesisSnapshot } from './gameEvents';

const PREFIX_GENESIS = 'poolpoker_crdt_genesis_';
const PREFIX_EVENTS = 'poolpoker_crdt_events_';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryStore = new Map<string, string>();
const defaultStorage: StorageAdapter = {
  getItem(k: string): string | null {
    if (typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem(k);
      } catch (_) {}
    }
    return memoryStore.get(k) || null;
  },
  setItem(k: string, v: string): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(k, v);
        return;
      } catch (_) {}
    }
    memoryStore.set(k, v);
  },
  removeItem(k: string): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(k);
        return;
      } catch (_) {}
    }
    memoryStore.delete(k);
  },
};

export class CrdtEventStorage {
  constructor(private storage: StorageAdapter = defaultStorage) {}

  public saveGenesis(genesis: GenesisSnapshot): void {
    this.storage.setItem(`${PREFIX_GENESIS}${genesis.gameId}`, JSON.stringify(genesis));
    // 建立 roomCode 到最新 gameId 的映射索引
    this.storage.setItem(`poolpoker_crdt_latest_${genesis.roomCode}`, genesis.gameId);
  }

  public getGenesis(gameId: string): GenesisSnapshot | null {
    const raw = this.storage.getItem(`${PREFIX_GENESIS}${gameId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  public getLatestGameIdByRoomCode(roomCode: string): string | null {
    return this.storage.getItem(`poolpoker_crdt_latest_${roomCode}`) || null;
  }

  public getEvents(gameId: string): GameEvent[] {
    const raw = this.storage.getItem(`${PREFIX_EVENTS}${gameId}`);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (_) {
      return [];
    }
  }

  /**
   * 将新事件追加或合并入本地日志集合（自动按 eventId 幂等去重）
   * @returns 成功新入库的事件列表
   */
  public mergeEvents(gameId: string, incomingEvents: GameEvent[]): { merged: GameEvent[]; newlyAdded: GameEvent[] } {
    const existing = this.getEvents(gameId);
    const eventMap = new Map<string, GameEvent>();
    for (const e of existing) {
      eventMap.set(e.eventId, e);
    }

    const newlyAdded: GameEvent[] = [];
    for (const incoming of incomingEvents) {
      if (incoming.gameId !== gameId) continue;
      if (!eventMap.has(incoming.eventId)) {
        eventMap.set(incoming.eventId, incoming);
        newlyAdded.push(incoming);
      }
    }

    const merged = Array.from(eventMap.values());
    if (newlyAdded.length > 0) {
      this.storage.setItem(`${PREFIX_EVENTS}${gameId}`, JSON.stringify(merged));
    }
    return { merged, newlyAdded };
  }

  public clearGame(gameId: string): void {
    this.storage.removeItem(`${PREFIX_GENESIS}${gameId}`);
    this.storage.removeItem(`${PREFIX_EVENTS}${gameId}`);
  }
}
