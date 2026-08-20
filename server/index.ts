import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/socket';
import { appConfig, ballConfigs, rootDir } from './config';
import { registerSocketHandlers } from './socketHandlers';

const app = express();
const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.get('/api/ball-configs', (_req: Request, res: Response) => {
  res.json({
    defaultKey: 'default',
    configs: ballConfigs,
  });
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

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);
  registerSocketHandlers(io as any, socket as any);
});

server.listen(appConfig.port, () => {
  console.log('=================================');
  console.log('🎱 54张扑克台球 Web App 已启动');
  console.log(`📄 读取端口: ${appConfig.port}`);
  console.log(`🌐 访问地址: http://localhost:${appConfig.port}`);
  console.log('=================================');
});

export { app, io, server };
