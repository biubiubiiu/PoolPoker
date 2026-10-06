import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { normalizeAccountServer } from '../../shared/serverUrl';
import { accountTransportAllowed, secureTransport } from '../auth/transport';

function request(host: string, peer = '192.168.1.20', forwarded?: string, encrypted = false): IncomingMessage {
  return {
    headers: { host, 'x-forwarded-proto': forwarded },
    socket: { remoteAddress: peer, encrypted },
  } as unknown as IncomingMessage;
}
const untrusted = () => false;
const proxy = (address: string) => address === '127.0.0.1';

describe('HTTPS account transport', () => {
  it('accepts native TLS and forwarding only from configured proxies', () => {
    expect(secureTransport(request('game.example', undefined, undefined, true), untrusted)).toBe(true);
    expect(secureTransport(request('game.example', '127.0.0.1', 'https'), proxy)).toBe(true);
    expect(secureTransport(request('game.example', '192.168.1.20', 'https'), proxy)).toBe(false);
    expect(secureTransport(request('game.example', '127.0.0.1', 'https'), untrusted)).toBe(false);
    expect(secureTransport(request('game.example', '127.0.0.1', 'http, https'), proxy)).toBe(false);
  });
  it('limits the HTTP exception to local development, checking both host and peer', () => {
    expect(accountTransportAllowed(request('localhost:3000', '127.0.0.1'), untrusted, false)).toBe(true);
    expect(accountTransportAllowed(request('localhost:3000', '127.0.0.1'), untrusted, true)).toBe(false);
    expect(accountTransportAllowed(request('localhost:3000'), untrusted, false)).toBe(false);
    expect(accountTransportAllowed(request('game.example', '127.0.0.1'), untrusted, false)).toBe(false);
    expect(accountTransportAllowed(request('game.example', '127.0.0.1', 'https'), proxy, true)).toBe(true);
  });
  it('defaults addresses to HTTPS and rejects stored cleartext LAN servers', () => {
    expect(normalizeAccountServer(' game.example:8443/ ')).toBe('https://game.example:8443');
    expect(normalizeAccountServer('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeAccountServer('')).toBe('');
    for (const value of [
      'http://192.168.1.10:3000',
      'http://game.example',
      'ftp://game.example',
      'https://u:p@game.example',
      'https://game.example/path',
    ])
      expect(() => normalizeAccountServer(value)).toThrow();
  });
});

it('sets Secure cookies and resolves Passkey origin behind an explicitly trusted TLS proxy', async () => {
  const { default: express } = await import('express');
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { Store } = await import('../persistence/database');
  const { AuthService } = await import('../auth/service');
  const { authRouter } = await import('../auth/routes');
  const store = new Store(':memory:');
  const app = express();
  app.use((req, res, next) => {
    if (!accountTransportAllowed(req, app.get('trust proxy fn'), true)) return res.sendStatus(426);
    next();
  });
  app.use(express.json());
  app.use(
    authRouter(new AuthService(store), {
      inRoom: () => false,
      changed: () => {},
      profile: () => {},
      rooms: () => [],
      companion: () => '',
    })
  );
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  const base = `http://localhost:${address.port}`;
  const headers = {
    'X-Forwarded-Proto': 'https',
    'X-PoolPoker-Request': '1',
    'X-PoolPoker-Native': '1',
    'Content-Type': 'application/json',
  };
  try {
    expect((await fetch(`${base}/guest`, { method: 'POST', headers, body: '{}' })).status).toBe(426);
    app.set('trust proxy', 'loopback');
    const created = await fetch(`${base}/guest`, { method: 'POST', headers, body: '{}' });
    expect(created.status).toBe(200);
    expect(created.headers.get('set-cookie')).toContain('; Secure');
    const { token } = await created.json();
    expect(await (await fetch(`${base}/capabilities`, { headers })).json()).toEqual({ passkey: true });
    const loggedOut = await fetch(`${base}/logout`, {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: '{}',
    });
    expect(loggedOut.status).toBe(200);
    expect(loggedOut.headers.get('set-cookie')).toContain('; Secure');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    store.close();
  }
});
