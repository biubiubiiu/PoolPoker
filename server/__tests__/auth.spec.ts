import { afterEach, describe, expect, it } from 'vitest';
import { createRecoveryPhrase, recoveryPublicKey, signRecovery, verifyRecovery } from '../../shared/recovery';
import { CLIENT_TO_SERVER_EVENTS as E } from '../../shared/types/protocol';
import { AuthService, hash } from '../auth/service';
import { Store } from '../persistence/database';
import { cancelRoomCleanup, rooms, socketIndex } from '../roomManager';
import { RoomController } from '../socketHandlers';

const stores: Store[] = [];
function setup() {
  const store = new Store(':memory:');
  stores.push(store);
  const auth = new AuthService(store);
  return { store, auth, controller: new RoomController(store, auth) };
}
afterEach(() => {
  stores.splice(0).forEach((s) => {
    s.close();
  });
  for (const code of Object.keys(rooms)) {
    cancelRoomCleanup(code);
    delete rooms[code];
  }
  socketIndex.clear();
});
describe('account identity and persisted games', () => {
  it('stores only token hashes and revokes companion sessions with the parent', () => {
    const { auth } = setup();
    const first = auth.create('registered', 'Alice', 'phone');
    const watch = auth.issue(first.user.id, 'watch', 'play', first.id, 'room');
    expect(auth.session(first.token)?.user_id).toBe(first.user.id);
    expect(auth.session(watch.token)?.role).toBe('play');
    expect(auth.db.prepare('SELECT hash FROM sessions WHERE id=?').get(first.id)?.hash).toBe(hash(first.token));
    auth.revoke(first.id, first.user.id);
    expect(auth.session(watch.token)).toBeUndefined();
  });
  it('recovers one stable identity with 12 words and domain/purpose-bound proof', () => {
    const { auth } = setup(),
      phrase = createRecoveryPhrase(),
      pub = recoveryPublicKey(phrase);
    expect(phrase.split(' ')).toHaveLength(12);
    const u = auth.create('registered', 'Alice', 'phone');
    auth.db.prepare('UPDATE users SET recovery_key=? WHERE id=?').run(pub, u.user.id);
    const c = auth.recoveryChallenge('login', pub, 'localhost:3000');
    const signature = signRecovery(phrase, c.message);
    expect(verifyRecovery(pub, signature, c.message.replace('localhost:3000', 'evil'))).toBe(false);
    expect(auth.verifyProof({ ...c, signature }, 'login').key).toBe(pub);
    expect(() => auth.verifyProof({ ...c, signature }, 'login')).toThrow();
    expect(auth.db.prepare('SELECT id FROM users WHERE recovery_key=?').get(pub)?.id).toBe(u.user.id);
  });
  it('uses authenticated user, resumes by room code without dealing twice, restores deck and undo', () => {
    const { auth, store, controller } = setup();
    const first = auth.create('guest', 'Alice', 'phone');
    const s = auth.require(first.token);
    const result = controller.atomic(() => controller.execute('s1', s, E.createRoom, { userId: 'forged' }));
    const code = result.response!.roomCode!;
    expect(rooms[code].hostUserId).toBe(first.user.id);
    controller.atomic(() => controller.execute('s1', s, E.startGame, { roomCode: code }));
    const before = structuredClone(rooms[code]);
    controller.atomic(() => controller.execute('s2', s, E.joinRoom, { roomCode: code }));
    expect(rooms[code].players).toHaveLength(1);
    expect(rooms[code].players[0].cards).toEqual(before.players[0].cards);
    const restored = store.loadRooms()[0];
    expect(restored.deck).toEqual(before.deck);
    expect(restored.gameHistory).toEqual(before.gameHistory);
    expect(restored.players[0].online).toBe(false);
    expect(restored.roomId).toBe(before.roomId);
  });
  it('blocks non-members and wrong room instance, rolls back failed persistence', () => {
    const { auth, controller, store } = setup();
    const a = auth.create('registered', 'Alice', 'a'),
      b = auth.create('guest', 'Bob', 'b');
    const sa = auth.require(a.token),
      sb = auth.require(b.token);
    const created = controller.atomic(() => controller.execute('a', sa, E.createRoom, {}));
    const code = created.response!.roomCode!;
    expect(() => controller.execute('b', sb, E.accidentalPocket, { roomCode: code, ballNumber: 5 })).toThrow(
      '请先加入'
    );
    expect(() => controller.execute('a2', sa, E.joinRoom, { roomCode: code, expectedRoomId: 'other' })).toThrow('过期');
    const before = JSON.stringify(rooms[code]);
    expect(() =>
      controller.atomic(() => {
        controller.execute('a', sa, E.startGame, { roomCode: code });
        store.db.exec('INSERT INTO nonexistent VALUES(1)');
      })
    ).toThrow();
    expect(JSON.stringify(rooms[code])).toBe(before);
  });
  it('clears all sockets on leaving and cannot restore the old seat', () => {
    const { auth, controller } = setup();
    const a = auth.create('guest', 'Alice', 'a'),
      s = auth.require(a.token);
    const created = controller.atomic(() => controller.execute('a', s, E.createRoom, {}));
    const code = created.response!.roomCode!;
    controller.atomic(() => controller.execute('a2', s, E.joinRoom, { roomCode: code }));
    controller.atomic(() => controller.execute('a', s, E.leaveRoom, { roomCode: code }));
    expect(socketIndex.has('a2')).toBe(false);
    expect(controller.member(a.user.id)).toBeUndefined();
  });
});

it('matches Node crypto for the versioned recovery derivation', async () => {
  const { pbkdf2Sync, hkdfSync, createPrivateKey, createPublicKey, verify } = await import('node:crypto');
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const seed = pbkdf2Sync(phrase, 'mnemonic', 2048, 64, 'sha512');
  const privateSeed = Buffer.from(hkdfSync('sha256', seed, 'poolpoker-recovery-v1', 'account-recovery-signing', 32));
  const key = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), privateSeed]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = createPublicKey(key);
  expect(recoveryPublicKey(phrase)).toBe(
    publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex')
  );
  expect(
    verify(null, Buffer.from('test challenge'), publicKey, Buffer.from(signRecovery(phrase, 'test challenge'), 'hex'))
  ).toBe(true);
});

it('reopens the SQLite file with account sessions and the same room instance', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'poolpoker-persistence-'));
  let store = new Store(join(dir, 'test.sqlite'));
  try {
    let auth = new AuthService(store);
    const issued = auth.create('registered', '持久玩家', 'test');
    const controller = new RoomController(store, auth);
    const result = controller.atomic(() =>
      controller.execute('persisted', auth.require(issued.token), E.createRoom, {})
    );
    const code = result.response!.roomCode!;
    controller.atomic(() =>
      controller.execute('persisted', auth.require(issued.token), E.startGame, { roomCode: code })
    );
    const before = structuredClone(rooms[code]);
    store.close();
    store = new Store(join(dir, 'test.sqlite'));
    auth = new AuthService(store);
    expect(auth.require(issued.token).user_id).toBe(issued.user.id);
    const restored = store.loadRooms()[0];
    expect(restored.roomId).toBe(before.roomId);
    expect(restored.deck).toEqual(before.deck);
    expect(restored.players[0].cards).toEqual(before.players[0].cards);
    expect(restored.gameHistory).toEqual(before.gameHistory);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
