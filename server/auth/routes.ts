import { randomInt, randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import { type Request, type Response, Router } from 'express';
import { AuthError, type AuthService, hash, type Session, secret } from './service';

export function requestToken(req: Request): string {
  const bearer = req.headers.authorization;
  if (bearer?.startsWith('Bearer ')) return bearer.slice(7);
  return (
    req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('poolpoker_session='))
      ?.slice(18) ?? ''
  );
}
interface Hooks {
  inRoom: (userId: string) => boolean;
  changed: () => void;
  profile: (userId: string, name: string) => void;
  rooms: (userId: string) => unknown[];
  companion: (session: Session, code: string) => string;
}
export function authRouter(auth: AuthService, hooks: Hooks) {
  const router = Router();
  const limits = new Map<string, { n: number; until: number }>();
  router.use((req, res, next) => {
    const key = req.ip ?? 'local',
      now = Date.now();
    if (limits.size > 5000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    let entry = limits.get(key);
    if (!entry || entry.until < now) {
      entry = { n: 0, until: now + 60_000 };
      limits.set(key, entry);
    }
    if (++entry.n > 240) {
      res.status(429).json({ message: '请求过于频繁，请稍后重试' });
      return;
    }
    if (req.method !== 'GET' && req.headers['x-poolpoker-request'] !== '1') {
      res.status(403).json({ message: '请求来源无效' });
      return;
    }
    next();
  });
  const run = (method: 'get' | 'post' | 'patch', path: string, fn: (req: Request, res: Response) => unknown) =>
    router[method](path, async (req, res) => {
      try {
        await fn(req, res);
      } catch (e) {
        res
          .status(e instanceof AuthError ? e.status : 400)
          .json({ success: false, message: e instanceof Error ? e.message : '操作失败' });
      }
    });
  const session = (req: Request) => auth.require(requestToken(req));
  const manager = (req: Request) => {
    const s = session(req);
    auth.manager(s);
    return s;
  };
  const noSwitch = (req: Request) => {
    const s = auth.session(requestToken(req));
    if (s && hooks.inRoom(s.user_id)) throw new AuthError('请先退出房间再登录其他账号', 409);
  };
  const login = (req: Request, res: Response, issued: ReturnType<AuthService['issue']>) => {
    const secure = req.secure ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `poolpoker_session=${issued.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((issued.expires - Date.now()) / 1000)}${secure}`
    );
    res.json({
      success: true,
      user: issued.user,
      token: req.headers['x-poolpoker-native'] === '1' ? issued.token : undefined,
    });
  };
  const rp = (req: Request) => {
    const origin = req.headers.origin ?? `${req.protocol}://${req.get('host')}`;
    const allowed = (process.env.POOLPOKER_AUTH_ORIGINS ?? '').split(',').filter(Boolean);
    if (!origin) throw new AuthError('当前环境不支持 Passkey');
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new AuthError('Passkey 需要 HTTPS 域名');
    if (allowed.length ? !allowed.includes(origin) : url.host !== req.get('host'))
      throw new AuthError('Passkey 来源不匹配');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(':'))
      throw new AuthError('Passkey 不支持 IP 地址');
    return { origin, rpID: process.env.POOLPOKER_RP_ID ?? url.hostname };
  };
  run('get', '/capabilities', (req, res) => {
    let passkey = false;
    try {
      rp(req);
      passkey = true;
    } catch {}
    res.json({ passkey });
  });
  run('get', '/me', (req, res) => res.json({ user: auth.view(session(req).user_id) }));
  for (const kind of ['guest', 'registered'] as const)
    run('post', kind === 'guest' ? '/guest' : '/register', (req, res) => {
      noSwitch(req);
      const existing = auth.session(requestToken(req));
      if (existing) throw new AuthError('请先退出当前账号');
      login(req, res, auth.create(kind, req.body.nickname, String(req.body.deviceName ?? '浏览器')));
    });
  run('post', '/guest/upgrade', (req, res) => {
    const s = manager(req);
    const nickname = auth.nickname(req.body.nickname);
    auth.store.transaction(
      () => auth.db.prepare("UPDATE users SET kind='registered',nickname=? WHERE id=?").run(nickname, s.user_id),
      true
    );
    hooks.profile(s.user_id, nickname);
    res.json({ user: auth.view(s.user_id) });
  });
  run('patch', '/me', (req, res) => {
    const s = manager(req),
      name = auth.nickname(req.body.nickname);
    hooks.profile(s.user_id, name);
    res.json({ user: auth.view(s.user_id) });
  });
  run('get', '/rooms', (req, res) => res.json({ rooms: hooks.rooms(session(req).user_id) }));
  run('get', '/sessions', (req, res) => {
    const s = manager(req);
    const rows = auth.db
      .prepare('SELECT id,name,role,expires FROM sessions WHERE user_id=? AND expires>?')
      .all(s.user_id, Date.now());
    res.json({
      sessions: rows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        current: r.id === s.id,
        expiresAt: new Date(Number(r.expires)).toISOString(),
      })),
    });
  });
  run('post', '/sessions/revoke', (req, res) => {
    const s = manager(req);
    auth.store.transaction(() => auth.revoke(req.body.id, s.user_id), true);
    hooks.changed();
    res.json({ success: true });
  });
  run('post', '/logout', (req, res) => {
    const s = session(req);
    auth.store.transaction(() => auth.revoke(s.id, s.user_id), true);
    hooks.changed();
    res.setHeader('Set-Cookie', 'poolpoker_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ success: true });
  });
  run('post', '/logout-all', (req, res) => {
    const s = manager(req);
    auth.store.transaction(() => {
      auth.db.prepare('DELETE FROM sessions WHERE user_id=?').run(s.user_id);
      auth.db.prepare('DELETE FROM pairings WHERE user_id=?').run(s.user_id);
    }, true);
    hooks.changed();
    res.json({ success: true });
  });
  run('post', '/socket-ticket', (req, res) => {
    const s = session(req);
    res.json({ ticket: auth.challenge('socket', { sessionId: s.id }, 30_000) });
  });
  run('post', '/companion', (req, res) => {
    const s = manager(req);
    res.json({ ticket: hooks.companion(s, String(req.body.roomCode)) });
  });
  run('post', '/companion/claim', (req, res) => {
    const row = auth.store.transaction(() =>
      auth.consume<{ sessionId: string; roomId: string; userId: string }>(req.body.ticket, 'companion')
    );
    const parent = auth.db.prepare('SELECT id FROM sessions WHERE id=? AND expires>?').get(row.sessionId, Date.now());
    if (!parent || !hooks.inRoom(row.userId)) throw new AuthError('伴随授权已失效');
    const issued = auth.issue(row.userId, 'Wear OS', 'play', row.sessionId, row.roomId);
    res.json({ token: issued.token, user: issued.user });
  });
  run('post', '/recovery/challenge', (req, res) => {
    const purpose = req.body.purpose;
    if (!['login', 'setup', 'rotate', 'stepup'].includes(purpose)) throw new AuthError('请求用途无效');
    const s = purpose === 'login' ? undefined : manager(req);
    if (s && auth.user(s.user_id).kind !== 'registered') throw new AuthError('请先注册账号');
    if (purpose === 'login') noSwitch(req);
    res.json(auth.recoveryChallenge(purpose, req.body.publicKey, req.get('host') ?? 'poolpoker', s));
  });
  run('post', '/recovery/login', (req, res) => {
    noSwitch(req);
    const result = auth.store.transaction(() => {
      const proof = auth.verifyProof(req.body, 'login');
      const u = auth.db.prepare('SELECT id FROM users WHERE recovery_key=?').get(proof.key);
      if (!u) throw new AuthError('没有找到这个恢复短语对应的账号');
      return auth.issue(
        String(u.id),
        String(req.body.deviceName ?? '恢复登录'),
        'manager',
        undefined,
        undefined,
        'recovery'
      );
    }, true);
    login(req, res, result);
  });
  run('post', '/recovery/stepup', (req, res) => {
    const s = manager(req);
    const proof = auth.verifyProof(req.body, 'stepup', s);
    if (auth.user(s.user_id).recovery_key !== proof.key) throw new AuthError('恢复短语与当前账号不匹配');
    res.json({ proofId: auth.challenge('stepup', { sessionId: s.id }) });
  });
  run('post', '/recovery/save', (req, res) => {
    const s = manager(req);
    const rotating = !!auth.user(s.user_id).recovery_key;
    const result = auth.store.transaction(() => {
      auth.proveAccount(s, req.body.proofId);
      const proof = auth.verifyProof(req.body, rotating ? 'rotate' : 'setup', s);
      auth.db.prepare('UPDATE users SET recovery_key=? WHERE id=?').run(proof.key, s.user_id);
      if (rotating) {
        auth.db.prepare('DELETE FROM sessions WHERE user_id=?').run(s.user_id);
        auth.db.prepare('DELETE FROM pairings WHERE user_id=?').run(s.user_id);
        return auth.issue(s.user_id, s.name);
      }
      return undefined;
    }, true);
    hooks.changed();
    if (result) login(req, res, result);
    else res.json({ user: auth.view(s.user_id) });
  });
  run('post', '/pairings', (req, res) => {
    noSwitch(req);
    const id = randomUUID(),
      requestSecret = secret(),
      expires = Date.now() + 120_000;
    let code = '';
    do {
      code = String(randomInt(100000, 1000000));
    } while (auth.db.prepare('SELECT id FROM pairings WHERE code=?').get(code));
    auth.db
      .prepare('INSERT INTO pairings VALUES (?,?,?,?,?,NULL,NULL)')
      .run(id, code, hash(requestSecret), String(req.body.deviceName ?? '新设备').slice(0, 60), expires);
    res.json({ id, code, secret: requestSecret, expiresAt: new Date(expires).toISOString() });
  });
  run('post', '/pairings/lookup', (req, res) => {
    manager(req);
    const p = auth.db
      .prepare('SELECT id,code,name,expires FROM pairings WHERE code=? AND expires>?')
      .get(String(req.body.code), Date.now());
    if (!p) throw new AuthError('配对码已过期或不存在');
    res.json(p);
  });
  run('post', '/pairings/approve', (req, res) => {
    const s = manager(req);
    if (auth.user(s.user_id).kind !== 'registered') throw new AuthError('请先注册账号');
    const r = auth.db
      .prepare('UPDATE pairings SET user_id=?,approver=? WHERE id=? AND expires>? AND approver IS NULL')
      .run(s.user_id, s.id, req.body.id, Date.now());
    if (!r.changes) throw new AuthError('授权请求已失效');
    res.json({ success: true });
  });
  run('post', '/pairings/claim', (req, res) => {
    noSwitch(req);
    const issued = auth.store.transaction(() => {
      const p = auth.db
        .prepare('SELECT * FROM pairings WHERE id=? AND secret_hash=? AND expires>?')
        .get(req.body.id, hash(req.body.secret), Date.now()) as Record<string, string> | undefined;
      if (!p) throw new AuthError('请求已过期或取消');
      if (!p.approver) return undefined;
      if (!auth.db.prepare('SELECT id FROM sessions WHERE id=? AND expires>?').get(p.approver, Date.now()))
        throw new AuthError('授权设备已退出');
      auth.db.prepare('DELETE FROM pairings WHERE id=?').run(p.id);
      return auth.issue(p.user_id, p.name, 'manager', undefined, undefined, `pairing:${p.approver}`);
    }, true);
    if (issued) login(req, res, issued);
    else res.json({ pending: true });
  });
  run('post', '/pairings/cancel', (req, res) => {
    auth.db.prepare('DELETE FROM pairings WHERE id=? AND secret_hash=?').run(req.body.id, hash(req.body.secret));
    res.json({ success: true });
  });
  run('get', '/passkeys', (req, res) => {
    const s = manager(req);
    res.json({ passkeys: auth.db.prepare('SELECT id FROM passkeys WHERE user_id=?').all(s.user_id) });
  });
  run('post', '/passkeys/register/options', async (req, res) => {
    const s = manager(req);
    if (auth.user(s.user_id).kind !== 'registered') throw new AuthError('请先注册账号');
    auth.proveAccount(s, req.body.proofId);
    const config = rp(req);
    const options = await generateRegistrationOptions({
      rpName: 'PoolPoker',
      rpID: config.rpID,
      userName: auth.user(s.user_id).nickname,
      userID: new TextEncoder().encode(s.user_id),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: auth.db
        .prepare('SELECT id FROM passkeys WHERE user_id=?')
        .all(s.user_id)
        .map((r) => ({ id: String(r.id) })),
    });
    res.json({
      options,
      id: auth.challenge('passkey-register', { sessionId: s.id, challenge: options.challenge, ...config }),
    });
  });
  run('post', '/passkeys/register/verify', async (req, res) => {
    const s = manager(req),
      c = auth.consume<{ sessionId: string; challenge: string; origin: string; rpID: string }>(
        req.body.id,
        'passkey-register'
      );
    if (c.sessionId !== s.id) throw new AuthError('请求不匹配');
    const result = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge: c.challenge,
      expectedOrigin: c.origin,
      expectedRPID: c.rpID,
      requireUserVerification: true,
    });
    if (!result.verified || !result.registrationInfo) throw new AuthError('Passkey 验证失败');
    auth.require(requestToken(req));
    auth.store.transaction(
      () =>
        auth.db
          .prepare('INSERT INTO passkeys VALUES (?,?,?)')
          .run(result.registrationInfo!.credential.id, s.user_id, JSON.stringify(result.registrationInfo!.credential)),
      true
    );
    res.json({ user: auth.view(s.user_id) });
  });
  run('post', '/passkeys/login/options', async (req, res) => {
    if (!req.body.stepup) noSwitch(req);
    const s = req.body.stepup ? manager(req) : undefined;
    const config = rp(req);
    const options = await generateAuthenticationOptions({ rpID: config.rpID, userVerification: 'required' });
    res.json({
      options,
      id: auth.challenge('passkey-login', { ...config, challenge: options.challenge, sessionId: s?.id }),
    });
  });
  run('post', '/passkeys/login/verify', async (req, res) => {
    const c = auth.consume<{ challenge: string; origin: string; rpID: string; sessionId?: string }>(
      req.body.id,
      'passkey-login'
    );
    if (c.sessionId && manager(req).id !== c.sessionId) throw new AuthError('请求不匹配');
    if (!c.sessionId) noSwitch(req);
    const row = auth.db.prepare('SELECT * FROM passkeys WHERE id=?').get(req.body.response.id) as
      | { id: string; user_id: string; data: string }
      | undefined;
    if (!row) throw new AuthError('Passkey 未绑定或已撤销');
    if (c.sessionId && session(req).user_id !== row.user_id) throw new AuthError('请选择当前账号的 Passkey');
    const handle = req.body.response.response.userHandle;
    if (!handle || Buffer.from(handle, 'base64url').toString() !== row.user_id)
      throw new AuthError('Passkey 身份不匹配');
    const credential = JSON.parse(row.data) as WebAuthnCredential;
    credential.publicKey = new Uint8Array(Object.values(credential.publicKey));
    const result = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge: c.challenge,
      expectedOrigin: c.origin,
      expectedRPID: c.rpID,
      credential,
      requireUserVerification: true,
    });
    if (!result.verified) throw new AuthError('Passkey 验证失败');
    credential.counter = result.authenticationInfo.newCounter;
    const issued = auth.store.transaction(() => {
      if (!auth.db.prepare('SELECT id FROM passkeys WHERE id=?').get(row.id)) throw new AuthError('凭证已撤销');
      auth.db.prepare('UPDATE passkeys SET data=? WHERE id=?').run(JSON.stringify(credential), row.id);
      if (c.sessionId) {
        auth.require(requestToken(req));
        return undefined;
      }
      noSwitch(req);
      return auth.issue(
        row.user_id,
        String(req.body.deviceName ?? 'Passkey 登录'),
        'manager',
        undefined,
        undefined,
        `passkey:${row.id}`
      );
    }, true);
    if (issued) login(req, res, issued);
    else res.json({ proofId: auth.challenge('stepup', { sessionId: c.sessionId }) });
  });
  run('post', '/passkeys/revoke', (req, res) => {
    const s = manager(req);
    auth.store.transaction(() => {
      auth.proveAccount(s, req.body.proofId);
      const u = auth.view(s.user_id);
      if (!u.hasRecovery && u.passkeyCount <= 1) throw new AuthError('请先设置另一种恢复方式');
      auth.db.prepare('DELETE FROM passkeys WHERE id=? AND user_id=?').run(req.body.id, s.user_id);
      auth.db.prepare('DELETE FROM sessions WHERE user_id=? AND source=?').run(s.user_id, `passkey:${req.body.id}`);
    }, true);
    hooks.changed();
    res.json({ success: true });
  });
  return router;
}
