import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

// Reuse production command handlers; the fixture never sends external notifications.
process.env.DISABLE_WECOM_PUSH = 'true';
const { registerSocketHandlers } = await import('../server/socketHandlers.ts');
const server = createServer();
const io = new Server(server, { pingInterval: 100, pingTimeout: 1000 });
io.on('connection', (socket) => registerSocketHandlers(io, socket));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const child = spawn(
  'swift',
  ['test', '--package-path', 'apple/WatchTests', '--scratch-path', '/tmp/poolpoker-watch-tests'],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: '/tmp/poolpoker-watch-module-cache',
      POOLPOKER_WATCH_TEST_SERVER: `http://127.0.0.1:${server.address().port}`,
    },
  }
);
const cleanup = () => {
  child.kill('SIGTERM');
  io.close();
};
process.once('SIGINT', cleanup);
process.once('SIGTERM', cleanup);
child.once('error', (error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
child.once('exit', (code) => {
  io.close();
  process.exit(code ?? 1);
});
