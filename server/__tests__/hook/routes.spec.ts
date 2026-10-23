import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RobotConfig } from '../../hook/types';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (req: Request, res: Response) => unknown>(),
  getHandlers: new Map<string, (req: Request, res: Response) => unknown>(),
  send: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock('express', () => {
  const register = (
    map: Map<string, (req: Request, res: Response) => unknown>,
    path: string | string[],
    handler: (req: Request, res: Response) => unknown
  ) => {
    if (Array.isArray(path)) {
      for (const p of path) map.set(p, handler);
    } else {
      map.set(path, handler);
    }
  };
  return {
    Router: () => ({
      get: (path: string | string[], handler: (req: Request, res: Response) => unknown) =>
        register(mocks.getHandlers, path, handler),
      post: (path: string | string[], handler: (req: Request, res: Response) => unknown) =>
        register(mocks.handlers, path, handler),
    }),
  };
});
vi.mock('../../hook/robotConfigStore', () => ({ loadRobotConfig: mocks.load, saveRobotConfig: mocks.save }));
vi.mock('../../robotConfig', () => ({ getRobotWebhookUrl: vi.fn(), setRobotWebhookUrl: vi.fn() }));
vi.mock('../../hook/dispatcher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hook/dispatcher')>()),
  checkTestSendRateLimit: () => ({ allowed: true, remainingSeconds: 0 }),
  recordTestSend: vi.fn(),
  sendWecomMessage: mocks.send,
}));

import '../../hook/routes';

function draft(): RobotConfig {
  return {
    version: 1,
    destinations: [
      {
        id: 'draft',
        name: '新群',
        type: 'wecom',
        url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=new-group',
        mentionedList: ['new-member'],
      },
    ],
    rules: [
      {
        id: 'draft-rule',
        enabled: true,
        eventType: 'game_round_finished',
        destinationId: 'draft',
        templateType: 'custom',
        customTemplate: '新草稿：{{roomCode}}',
        msgType: 'markdown',
      },
    ],
  };
}

async function testSend(config: unknown, destinationId = 'draft', ruleId = 'draft-rule') {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await mocks.handlers.get('/api/robot/test')?.(
    { body: { config, destinationId, ruleId } } as Request,
    res as unknown as Response
  );
  return res;
}

describe('机器人草稿测试发送 (/api/robot/test)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ success: true });
  });

  it('使用未保存的地址、模板、消息类型和提及成员，不读写已保存配置', async () => {
    const res = await testSend(draft());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mocks.send).toHaveBeenCalledWith(
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=new-group',
      '新草稿：8888',
      'markdown',
      ['new-member']
    );
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('预设的内容及消息类型与预览一致', async () => {
    const config = draft();
    config.rules[0].templateType = 'preset_classic_text';
    await testSend(config);
    expect(mocks.send).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('房间号：8888'), 'text', [
      'new-member',
    ]);
  });

  it('拒绝缺失或非法草稿，不回退发送旧配置', async () => {
    for (const config of [undefined, { version: 1 }]) {
      const res = await testSend(config);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('拒绝非法地址、空模板和非法模板', async () => {
    for (const invalid of ['url', 'empty', 'syntax']) {
      const config = draft();
      if (invalid === 'url') config.destinations[0].url = 'http://127.0.0.1/';
      if (invalid === 'empty') config.rules[0].customTemplate = ' ';
      if (invalid === 'syntax') config.rules[0].customTemplate = '{{#each scores}}';
      const res = await testSend(config);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('拒绝不存在或互不匹配的目标与规则', async () => {
    const res = await testSend(draft(), 'missing');
    expect(res.status).toHaveBeenCalledWith(400);
    const config = draft();
    config.rules[0].destinationId = 'other';
    expect((await testSend(config)).status).toHaveBeenCalledWith(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('Hook 系统新路由 (/api/hook/*)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ success: true });
  });

  it('GET /api/hook/catalog 返回事件目录与预设列表', async () => {
    const res = { json: vi.fn().mockReturnThis() };
    await mocks.getHandlers.get('/api/hook/catalog')?.({} as Request, res as unknown as Response);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        catalog: expect.arrayContaining([
          expect.objectContaining({ type: 'game_start' }),
          expect.objectContaining({ type: 'game_round_finished' }),
          expect.objectContaining({ type: 'system_crash' }),
        ]),
        presets: expect.any(Object),
      })
    );
  });

  it('POST /api/robot/preview 支持不同事件类型的渲染', async () => {
    const resStart = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await mocks.handlers.get('/api/robot/preview')?.(
      { body: { template: '开球手: {{shooter.name}}', eventType: 'game_start' } } as Request,
      resStart as unknown as Response
    );
    expect(resStart.json).toHaveBeenCalledWith({ success: true, rendered: '开球手: 小明' });

    const resRound = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await mocks.handlers.get('/api/robot/preview')?.(
      { body: { template: '房间: {{roomCode}}', eventType: 'game_round_finished' } } as Request,
      resRound as unknown as Response
    );
    expect(resRound.json).toHaveBeenCalledWith({ success: true, rendered: '房间: 8888' });

    const resCrash = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await mocks.handlers.get('/api/robot/preview')?.(
      { body: { template: '警报: {{type}} - {{error}}', eventType: 'system_crash' } } as Request,
      resCrash as unknown as Response
    );
    expect(resCrash.json).toHaveBeenCalledWith({
      success: true,
      rendered: '警报: uncaughtException - TypeError: Cannot read properties of undefined (reading "userId")',
    });
  });

  it('POST /api/hook/test-draft 支持直接向目标 URL 发送企微测试', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await mocks.handlers.get('/api/hook/test-draft')?.(
      {
        body: {
          actionType: 'send_wecom',
          eventType: 'game_start',
          destinationUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=draft-key',
          templateType: 'custom',
          customTemplate: '开球：{{shooter.name}}',
          msgType: 'text',
        },
      } as Request,
      res as unknown as Response
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mocks.send).toHaveBeenCalledWith(
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=draft-key',
      '开球：小明',
      'text',
      []
    );
  });
});
