import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ServerRoom } from '../../shared/types/game';

export class Store {
  readonly db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename, { timeout: 100 });
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, kind TEXT NOT NULL, nickname TEXT NOT NULL, recovery_key TEXT UNIQUE, epoch INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, expires INTEGER NOT NULL, parent_id TEXT, room_id TEXT, source TEXT);
      CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, purpose TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pairings (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, secret_hash TEXT NOT NULL, name TEXT NOT NULL, expires INTEGER NOT NULL, user_id TEXT, approver TEXT);
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, revision INTEGER NOT NULL, expires INTEGER, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS undo_steps (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, step INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(room_id,step));
      CREATE TABLE IF NOT EXISTS receipts (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, user_id TEXT NOT NULL, command_id TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(room_id,user_id,command_id));
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      INSERT OR IGNORE INTO migrations VALUES (1);`);
  }
  transaction<T>(fn: () => T, durable = false): T {
    if (durable) this.db.exec('PRAGMA synchronous=FULL');
    let begun = false;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      begun = true;
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      if (begun) this.db.exec('ROLLBACK');
      throw error;
    } finally {
      if (durable) this.db.exec('PRAGMA synchronous=NORMAL');
    }
  }
  saveRoom(room: ServerRoom, expires: number | null = null): void {
    room.roomId ??= randomUUID();
    const { gameHistory, ...state } = room;
    const encoded = JSON.stringify(state);
    const current = this.db.prepare('SELECT state,expires FROM rooms WHERE id=?').get(room.roomId);
    if (current?.state !== encoded || current.expires !== expires)
      this.db
        .prepare(
          'INSERT INTO rooms VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,revision=excluded.revision,expires=excluded.expires,state=excluded.state'
        )
        .run(room.roomId, room.code, room.revision ?? 0, expires, encoded);
    const steps = this.db
      .prepare('SELECT step,state FROM undo_steps WHERE room_id=? ORDER BY step')
      .all(room.roomId) as { step: number; state: string }[];
    this.db.prepare('DELETE FROM undo_steps WHERE room_id=? AND step>=?').run(room.roomId, gameHistory.length);
    const write = this.db.prepare(
      'INSERT INTO undo_steps VALUES (?,?,?) ON CONFLICT(room_id,step) DO UPDATE SET state=excluded.state'
    );
    gameHistory.forEach((step, i) => {
      const json = JSON.stringify(step);
      if (steps[i]?.state !== json) write.run(room.roomId!, i, json);
    });
  }
  loadRooms(): ServerRoom[] {
    this.db.prepare('DELETE FROM rooms WHERE expires IS NOT NULL AND expires<=?').run(Date.now());
    return (this.db.prepare('SELECT id,state FROM rooms').all() as { id: string; state: string }[]).map((row) => {
      const room = JSON.parse(row.state) as ServerRoom;
      room.roomId = row.id;
      room.gameHistory = (
        this.db.prepare('SELECT state FROM undo_steps WHERE room_id=? ORDER BY step').all(row.id) as { state: string }[]
      ).map((s) => JSON.parse(s.state));
      room.players.forEach((p) => {
        p.online = false;
        p.id = '';
      });
      room.hostSocketId = '';
      return room;
    });
  }
  deleteRoom(code: string): void {
    this.db.prepare('DELETE FROM rooms WHERE code=?').run(code);
  }
  close(): void {
    this.db.close();
  }
}
let instance: Store | undefined;
export function getStore(): Store {
  instance ??= new Store(process.env.POOLPOKER_DB_PATH || path.resolve('data/poolpoker.sqlite'));
  return instance;
}
