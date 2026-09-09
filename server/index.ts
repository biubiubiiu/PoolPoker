import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/socket';
import { authRouter, requestToken } from './auth/routes';
import { AuthService } from './auth/service';
import { appConfig, ballConfigs, DEFAULT_BALL_CONFIG_KEY, rootDir } from './config';
import { logSocketConnect } from './logger';
import { getStore } from './persistence/database';
import { getRobotWebhookUrl, setRobotWebhookUrl } from './robotConfig';
import { broadcastRoomState, getClientRoomState, getRoom, rooms } from './roomManager';
import { RoomController, registerSocketHandlers } from './socketHandlers';
import {
  isWecomPushDisabled,
  sendCrashReportToWecom,
  sendRoundResultToWecom,
  setWecomPushDisabled,
} from './wecomWebhook';

const app = express();
const server = http.createServer(app);
const store = getStore();
const auth = new AuthService(store);
const controller = new RoomController(store, auth);
for (const room of store.loadRooms()) rooms[room.code] = room;
store.transaction(() => controller.persist());
const allowedOrigins = (process.env.POOLPOKER_AUTH_ORIGINS || '').split(',').filter(Boolean);

app.use((_req: Request, res: Response, next: NextFunction) => {
  const origin = _req.headers.origin;
  let sameOrigin = false;
  try {
    sameOrigin = !!origin && new URL(origin).host === _req.get('host');
  } catch {}
  if (origin && !sameOrigin && !allowedOrigins.includes(origin))
    return res.status(403).json({ message: '来源未获允许' });
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-PoolPoker-Request, X-PoolPoker-Native');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '32kb' }));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 10000,
  pingInterval: 5000,
});

const invalidateSessions = () => {
  for (const socket of io.sockets.sockets.values()) if (!auth.byId(socket.data.authSessionId)) socket.disconnect(true);
};
app.use(
  '/api/auth',
  authRouter(auth, {
    inRoom: (userId) => !!controller.member(userId),
    changed: invalidateSessions,
    profile: (userId, name) => {
      controller.atomic(() => {
        store.db.prepare('UPDATE users SET nickname=? WHERE id=?').run(name, userId);
        for (const room of Object.values(rooms)) {
          const player = room.players.find((p) => p.userId === userId);
          if (player) {
            player.name = name;
            room.revision = (room.revision ?? 0) + 1;
          }
        }
      });
      for (const socket of io.sockets.sockets.values())
        if (auth.byId(socket.data.authSessionId)?.user_id === userId)
          socket.emit('profile_updated' as any, auth.view(userId));
      for (const room of Object.values(rooms))
        if (room.players.some((p) => p.userId === userId)) broadcastRoomState(io as any, room.code);
    },
    rooms: (userId) =>
      Object.values(rooms)
        .filter((r) => r.players.some((p) => p.userId === userId))
        .map((r) => ({ roomCode: r.code, roomId: r.roomId, status: r.status })),
    companion: (session, code) => {
      const room = getRoom(code);
      if (!room?.players.some((p) => p.userId === session.user_id)) throw new Error('请先加入房间');
      return auth.challenge('companion', { sessionId: session.id, roomId: room.roomId, userId: session.user_id });
    },
  })
);
io.use((socket, next) => {
  try {
    let token = typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : '';
    if (socket.handshake.auth.ticket) {
      const ticket = store.transaction(() =>
        auth.consume<{ sessionId: string }>(socket.handshake.auth.ticket, 'socket')
      );
      const row = store.db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(ticket.sessionId, Date.now());
      if (!row) throw new Error('请重新登录');
      // Ticket is exchanged for a transport-local reference; never expose the cookie token.
      socket.data.authSessionId = String(row.id);
      token = '';
    }
    if (socket.handshake.auth.companionTicket) {
      const issued = store.transaction(() => {
        const c = auth.consume<{ sessionId: string; roomId: string; userId: string }>(
          socket.handshake.auth.companionTicket,
          'companion'
        );
        if (!auth.byId(c.sessionId) || controller.member(c.userId)?.roomId !== c.roomId)
          throw new Error('伴随授权已失效');
        return auth.issue(c.userId, 'Wear OS', 'play', c.sessionId, c.roomId);
      });
      token = issued.token;
    }
    if (token) {
      const session = auth.require(token);
      socket.data.authSessionId = session.id;
    }
    if (!socket.data.authSessionId) throw new Error('请先登录');
    socket.data.authToken = token;
    next();
  } catch (e) {
    next(e instanceof Error ? e : new Error('请重新登录'));
  }
});

app.get('/api/ball-configs', (_req: Request, res: Response) => {
  res.json({
    defaultKey: DEFAULT_BALL_CONFIG_KEY,
    configs: ballConfigs,
  });
});

app.get('/api/rooms/:code', (req: Request, res: Response) => {
  const roomCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const session = auth.session(requestToken(req));
  if (!session) return res.status(401).json({ message: '请先登录' });
  const room = getRoom(roomCode);
  if (!room?.players.some((p) => p.userId === session.user_id))
    return res.status(404).json({ message: '房间不存在或已离开' });
  if (req.query.expectedRoomId && req.query.expectedRoomId !== room.roomId)
    return res.status(409).json({ message: '原房间已过期' });
  if (session.role === 'play' && session.room_id !== room.roomId)
    return res.status(403).json({ message: '伴随授权不匹配' });
  const userId = session.user_id;

  const clientRoom = getClientRoomState(roomCode, userId);
  if (!clientRoom) {
    return res.status(404).json({ success: false, message: '房间不存在' });
  }

  res.json({ success: true, room: clientRoom });
});

// 机器人 Webhook 链接：内存读取 / 设置（由 /enter_robot 页面调用）
app.get('/api/robot-url', (_req: Request, res: Response) => {
  res.json({ success: true, url: getRobotWebhookUrl() });
});

app.post('/api/robot-url', (req: Request, res: Response) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  setRobotWebhookUrl(url);
  res.json({ success: true, url: getRobotWebhookUrl() });
});

// 企微机器人推送开关 (供 E2E 测试或动态关停调用)
app.get('/api/wecom-push/status', (_req: Request, res: Response) => {
  res.json({ success: true, disabled: isWecomPushDisabled() });
});

app.post('/api/wecom-push/toggle', (req: Request, res: Response) => {
  const disabled = req.body?.disabled;
  if (typeof disabled === 'boolean') {
    setWecomPushDisabled(disabled);
  }
  res.json({ success: true, disabled: isWecomPushDisabled() });
});

// 机器人链接设置页面（独立路由，独立于 SPA）
const enterRobotPage = path.join(rootDir, 'public', 'enter_robot.html');
app.get('/enter_robot', (_req: Request, res: Response) => {
  if (fs.existsSync(enterRobotPage)) {
    res.sendFile(enterRobotPage);
  } else {
    res.status(404).send('页面不存在');
  }
});

// 托管静态资源目录（优先托管打包出来的 dist 目录）
const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/socket.io') || req.url.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  console.warn('⚠️ 注意: 未发现 dist 构建目录，请先运行 `pnpm run build` 进行项目构建。');
}

io.on('connection', (socket: any) => {
  logSocketConnect(socket);
  registerSocketHandlers(io as any, socket as any, controller);
});

let sending = false,
  nextSend = 0;
const maintenance = setInterval(async () => {
  auth.cleanup();
  invalidateSessions();
  for (const row of store.db
    .prepare('SELECT code FROM rooms WHERE expires IS NOT NULL AND expires<=?')
    .all(Date.now())) {
    delete rooms[String(row.code)];
    store.deleteRoom(String(row.code));
  }
  if (sending || Date.now() < nextSend) return;
  sending = true;
  try {
    for (const row of store.db.prepare('SELECT id,state FROM outbox LIMIT 5').all()) {
      await sendRoundResultToWecom(JSON.parse(String(row.state)));
      store.db.prepare('DELETE FROM outbox WHERE id=?').run(row.id!);
    }
  } catch (e) {
    nextSend = Date.now() + 60_000;
    console.error('结算通知重试失败', e);
  } finally {
    sending = false;
  }
}, 1000);
maintenance.unref();

// 全局崩溃异常捕获与对战告警推送
let isCrashing = false;
async function handleCrash(error: unknown, type: string) {
  console.error(`💥 捕获到全局崩溃/异常 (${type}):`, error);
  if (isCrashing) return;
  isCrashing = true;

  try {
    await Promise.race([sendCrashReportToWecom(error, type), new Promise((resolve) => setTimeout(resolve, 3000))]);
  } catch (err) {
    console.error('❌ 推送崩溃告警失败:', err);
  } finally {
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => handleCrash(err, 'uncaughtException'));
process.on('unhandledRejection', (reason) => handleCrash(reason, 'unhandledRejection'));

server.listen(Number(process.env.POOLPOKER_PORT) || appConfig.port, () => {
  console.log('=================================');
  console.log('🎱 54张扑克台球 Web App 已启动');
  console.log(`📄 读取端口: ${Number(process.env.POOLPOKER_PORT) || appConfig.port}`);
  console.log(`🌐 访问地址: http://localhost:${Number(process.env.POOLPOKER_PORT) || appConfig.port}`);
  console.log('=================================');
});

export { app, io, server };
