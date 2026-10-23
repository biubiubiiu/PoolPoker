import http from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/socket';
import { createApp } from './app';
import { appConfig } from './config';
import { startDiscoveryBroadcast } from './discoveryBroadcast';
import { handleSystemCrash, initHookSystem } from './hook/eventBus';
import { logSocketConnect } from './logger';
import { registerSocketHandlers } from './socketHandlers';

// 挂载游戏引擎的 Hook 事件分发器与结算事件监听器
initHookSystem();

const app = createApp();
const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 10000,
  pingInterval: 5000,
});

const stopDiscoveryBroadcast = startDiscoveryBroadcast(io);
server.on('close', stopDiscoveryBroadcast);

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
    await Promise.race([handleSystemCrash(error, type), new Promise((resolve) => setTimeout(resolve, 3000))]);
  } catch (err) {
    console.error('❌ 推送崩溃告警失败:', err);
  } finally {
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => handleCrash(err, 'uncaughtException'));
process.on('unhandledRejection', (reason) => handleCrash(reason, 'unhandledRejection'));

const shutdown = () => {
  stopDiscoveryBroadcast();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(appConfig.port, () => {
  console.log('=================================');
  console.log('🎱 54张扑克台球 Web App 已启动');
  console.log(`📄 读取端口: ${appConfig.port}`);
  console.log(`🌐 访问地址: http://localhost:${appConfig.port}`);
  console.log('=================================');
});

export { app, io, server };
