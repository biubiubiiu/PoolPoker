import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/socket';
import { appConfig, ballConfigs, rootDir } from './config';
import { logSocketConnect } from './logger';
import { getRobotWebhookUrl, setRobotWebhookUrl } from './robotConfig';
import { getClientRoomState } from './roomManager';
import { registerSocketHandlers } from './socketHandlers';
import { isWecomPushDisabled, sendCrashReportToWecom, setWecomPushDisabled } from './wecomWebhook';

const app = express();
const server = http.createServer(app);

app.use(express.json());

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 10000,
  pingInterval: 5000,
});

app.get('/api/ball-configs', (_req: Request, res: Response) => {
  res.json({
    defaultKey: 'default',
    configs: ballConfigs,
  });
});

app.get('/api/rooms/:code', (req: Request, res: Response) => {
  const roomCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const userId = req.query.userId as string | undefined;

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
  console.warn('⚠️ 注意: 未发现 dist 构建目录，请先运行 `npm run build` 进行项目构建。');
}

io.on('connection', (socket: any) => {
  logSocketConnect(socket);
  registerSocketHandlers(io as any, socket as any);
});

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

server.listen(appConfig.port, () => {
  console.log('=================================');
  console.log('🎱 54张扑克台球 Web App 已启动');
  console.log(`📄 读取端口: ${appConfig.port}`);
  console.log(`🌐 访问地址: http://localhost:${appConfig.port}`);
  console.log('=================================');
});

export { app, io, server };
