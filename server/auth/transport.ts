import type { IncomingMessage } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { isLoopbackHost } from '../../shared/serverUrl';

type TrustProxy = (address: string, hop: number) => boolean;
export function secureTransport(req: IncomingMessage, trustProxy: TrustProxy): boolean {
  if ((req.socket as TLSSocket).encrypted) return true;
  if (!trustProxy(req.socket.remoteAddress ?? '', 0)) return false;
  const forwarded = req.headers['x-forwarded-proto'];
  return typeof forwarded === 'string' && forwarded.split(',')[0].trim() === 'https';
}

export function accountTransportAllowed(req: IncomingMessage, trustProxy: TrustProxy, production: boolean): boolean {
  if (secureTransport(req, trustProxy)) return true;
  if (production) return false;
  const peer = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '')) return false;
  try {
    return isLoopbackHost(new URL(`http://${req.headers.host}`).hostname);
  } catch {
    return false;
  }
}
