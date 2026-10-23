import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { rootDir } from './config';
import { hookRouter } from './hook/routes';
import { resolveHttpActor } from './roomAuth';
import { getClientRoomState } from './roomManager';
import { isWecomPushDisabled, setWecomPushDisabled } from './wecomWebhook';

export function createApp(): Express {
  const app = express();

  // 全局 CORS 跨域中间件，支持凭证请求头与 OPTIONS 预检
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    const requestedHeaders = req.header('Access-Control-Request-Headers');
    res.header(
      'Access-Control-Allow-Headers',
      requestedHeaders
        ? `Origin, X-Requested-With, Content-Type, Accept, Authorization, x-session-token, X-Session-Token, ${requestedHeaders}`
        : 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-session-token, X-Session-Token'
    );
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json());

  // 房间快照极速同步接口 (验证玩家身份与 sessionToken，未提供则仅返回公开脱敏手牌)
  app.get('/api/rooms/:code', (req: Request, res: Response) => {
    const roomCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const userId = req.query.userId as string | undefined;
    const sessionToken =
      (req.query.sessionToken as string | undefined) ||
      (req.headers['x-session-token'] as string | undefined) ||
      req.headers.authorization?.replace(/^Bearer\s+/i, '');

    const auth = resolveHttpActor(roomCode, { userId, sessionToken });
    if (!auth.ok) {
      return res.status(auth.status).json({ success: false, message: auth.message });
    }

    const targetUserId = auth.actor.isMember ? auth.actor.userId : undefined;
    const clientRoom = getClientRoomState(roomCode, targetUserId);
    if (!clientRoom) {
      return res.status(404).json({ success: false, message: '房间不存在' });
    }

    res.json({ success: true, room: clientRoom });
  });

  // 机器人 Webhook 与 Hook 路由
  app.use(hookRouter);

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

  // 追分 / 大金玩法记分板页面（独立路由，独立于 SPA）
  app.get(['/break_and_run', '/break_and_run.html'], (_req: Request, res: Response) => {
    const distBreakAndRun = path.join(rootDir, 'dist', 'break_and_run.html');
    const publicBreakAndRun = path.join(rootDir, 'public', 'break_and_run.html');
    const target = fs.existsSync(distBreakAndRun) ? distBreakAndRun : publicBreakAndRun;
    if (fs.existsSync(target)) {
      res.sendFile(target);
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

  return app;
}
