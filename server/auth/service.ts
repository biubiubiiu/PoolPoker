import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { verifyRecovery } from '../../shared/recovery';
import type { AuthUser } from '../../shared/types/generated/wire-models';
import type { Store } from '../persistence/database';

export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
export interface UserRow {
  id: string;
  kind: 'guest' | 'registered';
  nickname: string;
  recovery_key: string | null;
  epoch: number;
}
export interface Session {
  id: string;
  user_id: string;
  hash: string;
  name: string;
  role: 'manager' | 'play';
  expires: number;
  parent_id: string | null;
  room_id: string | null;
  source: string | null;
}
export class AuthService {
  constructor(readonly store: Store) {}
  get db() {
    return this.store.db;
  }
  user(id: string): UserRow {
    const u = this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as UserRow;
    if (!u) throw new AuthError('账号不存在', 401);
    return u;
  }
  view(id: string): AuthUser {
    const u = this.user(id);
    return {
      id: u.id,
      kind: u.kind,
      nickname: u.nickname,
      hasRecovery: !!u.recovery_key,
      passkeyCount: Number(this.db.prepare('SELECT count(*) AS n FROM passkeys WHERE user_id=?').get(id)?.n),
    };
  }
  nickname(value: unknown, optional = false): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name && optional) return `球友${randomInt(100, 1000)}`;
    if (!name || Array.from(name).length > 24 || /[\p{Cc}\p{Cf}]/u.test(name))
      throw new AuthError('昵称需为 1–24 个字符');
    return name;
  }
  issue(
    userId: string,
    name = '新设备',
    role: 'manager' | 'play' = 'manager',
    parent?: string,
    roomId?: string,
    source?: string
  ) {
    const token = secret(),
      id = randomUUID(),
      expires = Date.now() + (role === 'play' ? 30 * 60_000 : 30 * 86400_000);
    this.db
      .prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, userId, hash(token), name.slice(0, 60), role, expires, parent ?? null, roomId ?? null, source ?? null);
    return { token, id, expires, user: this.view(userId) };
  }
  session(token: string): Session | undefined {
    if (!token) return;
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE hash=? AND expires>?')
      .get(hash(token), Date.now()) as unknown as Session | undefined;
    if (!row) return;
    if (
      row.parent_id &&
      !this.db.prepare('SELECT id FROM sessions WHERE id=? AND expires>?').get(row.parent_id, Date.now())
    )
      return;
    return row;
  }
  require(token: string): Session {
    const s = this.session(token);
    if (!s) throw new AuthError('请重新登录', 401);
    return s;
  }
  byId(id: string): Session | undefined {
    const s = this.db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(id ?? '', Date.now()) as unknown as
      | Session
      | undefined;
    if (
      s?.parent_id &&
      !this.db.prepare('SELECT id FROM sessions WHERE id=? AND expires>?').get(s.parent_id, Date.now())
    )
      return;
    return s;
  }
  manager(s: Session) {
    if (s.role !== 'manager') throw new AuthError('伴随设备不能管理账号', 403);
  }
  create(kind: 'guest' | 'registered', nickname: unknown, name: string) {
    const id = randomUUID();
    return this.store.transaction(() => {
      this.db
        .prepare('INSERT INTO users(id,kind,nickname) VALUES (?,?,?)')
        .run(id, kind, this.nickname(nickname, kind === 'guest'));
      return this.issue(id, name);
    }, true);
  }
  challenge(purpose: string, data: Record<string, unknown>, ttl = 60_000) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO challenges VALUES (?,?,?,?)').run(id, purpose, JSON.stringify(data), Date.now() + ttl);
    return id;
  }
  consume<T>(id: string, purpose: string): T {
    const row = this.db
      .prepare('SELECT data FROM challenges WHERE id=? AND purpose=? AND expires>?')
      .get(id, purpose, Date.now()) as { data: string } | undefined;
    if (!row) throw new AuthError('请求已过期或已使用');
    this.db.prepare('DELETE FROM challenges WHERE id=?').run(id);
    return JSON.parse(row.data);
  }
  recoveryChallenge(purpose: 'login' | 'setup' | 'rotate' | 'stepup', key: string, service: string, session?: Session) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new AuthError('恢复公钥无效');
    if (purpose !== 'login' && !session) throw new AuthError('请先登录', 401);
    const requestSecret = secret();
    const message = JSON.stringify({
      version: 'poolpoker-recovery-v1',
      purpose,
      service,
      nonce: secret(),
      key,
      userId: session?.user_id ?? null,
      requestHash: hash(requestSecret),
      expires: Date.now() + 60_000,
    });
    const id = this.challenge(`recovery:${purpose}`, {
      key,
      message,
      requestHash: hash(requestSecret),
      sessionId: session?.id,
    });
    return { id, message, requestSecret };
  }
  verifyProof(
    body: { id: string; signature: string; requestSecret: string },
    purpose: string,
    session?: Session
  ): { key: string } {
    const row = this.consume<{ key: string; message: string; requestHash: string; sessionId?: string }>(
      body.id,
      `recovery:${purpose}`
    );
    if (
      row.requestHash !== hash(body.requestSecret) ||
      row.sessionId !== session?.id ||
      !verifyRecovery(row.key, body.signature, row.message)
    )
      throw new AuthError('恢复验证失败', 403);
    return row;
  }
  proveAccount(session: Session, proofId?: string) {
    this.manager(session);
    const u = this.view(session.user_id);
    if (!u.hasRecovery && !u.passkeyCount) return;
    const proof = this.consume<{ sessionId: string }>(proofId ?? '', 'stepup');
    if (proof.sessionId !== session.id) throw new AuthError('请重新验证账号', 403);
  }
  revoke(id: string, userId: string) {
    this.db.prepare('DELETE FROM sessions WHERE user_id=? AND (id=? OR parent_id=?)').run(userId, id, id);
    this.db.prepare('DELETE FROM pairings WHERE approver=?').run(id);
  }
  cleanup() {
    this.db.prepare('DELETE FROM challenges WHERE expires<=?').run(Date.now());
    this.db.prepare('DELETE FROM pairings WHERE expires<=?').run(Date.now());
    this.db
      .prepare(
        'DELETE FROM sessions WHERE expires<=? OR (parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM sessions))'
      )
      .run(Date.now());
  }
}
