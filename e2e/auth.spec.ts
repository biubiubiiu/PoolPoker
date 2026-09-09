import { expect, test } from '@playwright/test';
import { io } from 'socket.io-client';
import { createRecoveryPhrase, recoveryPublicKey, signRecovery } from '../shared/recovery';

test('HTTP recovery, pairing and authenticated room access share one identity', async ({ playwright, baseURL }) => {
  const contexts = await Promise.all(
    [0, 1, 2].map(() => playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'X-PoolPoker-Request': '1' } }))
  );
  const [owner, second, stranger] = contexts;
  const post = async (client: typeof owner, path: string, data: unknown = {}) => {
    const response = await client.post(`/api/auth/${path}`, { data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const created = await post(owner, 'register', { nickname: '恢复测试' });
  const phrase = createRecoveryPhrase();
  const publicKey = recoveryPublicKey(phrase);
  const setup = await post(owner, 'recovery/challenge', { purpose: 'setup', publicKey });
  await post(owner, 'recovery/save', { ...setup, signature: signRecovery(phrase, setup.message) });
  const challenge = await post(second, 'recovery/challenge', { purpose: 'login', publicKey });
  const proof = { ...challenge, signature: signRecovery(phrase, challenge.message) };
  const recovered = await post(second, 'recovery/login', proof);
  expect(recovered.user.id).toBe(created.user.id);
  expect((await second.post('/api/auth/recovery/login', { data: proof })).ok()).toBeFalsy();
  const ticket = (await post(owner, 'socket-ticket')).ticket;
  const socket = io(baseURL!, { auth: { ticket }, transports: ['websocket'], reconnection: false });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    const room: any = await socket.timeout(3000).emitWithAck('create_room', { userId: 'forged-user', name: 'forged' });
    expect(room.success).toBe(true);
    const snapshot = await second.get(`/api/rooms/${room.roomCode}?userId=forged-user`);
    expect(snapshot.status()).toBe(200);
    const state = await snapshot.json();
    expect(state.room.players[0].userId).toBe(created.user.id);
    const start = { roomCode: room.roomCode, commandId: 'start-once' };
    const first = await socket.timeout(3000).emitWithAck('start_game', start);
    expect(first.success).toBe(true);
    const beforeRetry = await (await second.get(`/api/rooms/${room.roomCode}`)).json();
    expect(await socket.timeout(3000).emitWithAck('start_game', start)).toEqual(first);
    const afterRetry = await (await second.get(`/api/rooms/${room.roomCode}`)).json();
    expect(afterRetry.room.players[0].cards).toEqual(beforeRetry.room.players[0].cards);
    expect(afterRetry.room.revision).toBe(beforeRetry.room.revision);
    expect((await socket.timeout(3000).emitWithAck('draw_penalty', start)).success).toBe(false);

    expect((await stranger.get(`/api/rooms/${room.roomCode}?userId=${created.user.id}`)).status()).toBe(401);
    const pairing = await post(stranger, 'pairings');
    expect((await post(stranger, 'pairings/claim', { id: pairing.id, secret: pairing.secret })).pending).toBe(true);
    const lookup = await post(owner, 'pairings/lookup', { code: pairing.code });
    await post(owner, 'pairings/approve', { id: lookup.id });
    expect((await stranger.post('/api/auth/pairings/claim', { data: { id: pairing.id, secret: 'wrong' } })).ok()).toBe(
      false
    );
    const paired = await post(stranger, 'pairings/claim', { id: pairing.id, secret: pairing.secret });
    expect(paired.user.id).toBe(created.user.id);
    const companion = await post(owner, 'companion', { roomCode: room.roomCode });
    const watch = io(baseURL!, {
      auth: { companionTicket: companion.ticket },
      transports: ['websocket'],
      reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        watch.on('connect', resolve);
        watch.on('connect_error', reject);
      });
      const result: any = await watch.timeout(3000).emitWithAck('rejoin_room', { roomCode: room.roomCode });
      expect(result.success).toBe(true);
      expect(result.sessionToken).toHaveLength(64);
      expect(
        (
          await owner.get('/api/auth/sessions', { headers: { Authorization: `Bearer ${result.sessionToken}` } })
        ).status()
      ).toBe(403);
    } finally {
      watch.disconnect();
    }
  } finally {
    socket.disconnect();
    await Promise.all(contexts.map((c) => c.dispose()));
  }
});

test('welcome keeps registration onboarding and guest access', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '以游客登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByPlaceholder('请输入昵称', { exact: true }).fill('新玩家');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page.getByRole('button', { name: '备份恢复短语', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续开玩', exact: true }).click();
  await expect(page.getByRole('button', { name: '创建新房间' })).toBeVisible();
});

test('Passkey registration and login on a supported origin', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByPlaceholder('请输入昵称', { exact: true }).fill('Passkey 玩家');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.getByRole('button', { name: '添加 Passkey', exact: true }).click();
  await expect(page.getByText('Passkey 1', { exact: true })).toBeVisible();
  const id = await page.evaluate(() => localStorage.getItem('billiards_user_id'));
  await page.getByRole('button', { name: '退出当前登录', exact: true }).click();
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await page.getByRole('button', { name: '使用 Passkey', exact: true }).click();
  await expect(page.getByText('Passkey 1', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('billiards_user_id'))).toBe(id);
});
