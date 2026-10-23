import { expect, test } from '@playwright/test';
import { renderTemplate } from '../server/hook/assembler';
import { PRESET_TEMPLATES } from '../server/hook/presets';
import type { RobotConfig } from '../server/hook/types';

test('Webhook配置路由支持直达、旧路由重定向与返回游戏', async ({ page }) => {
  const config: RobotConfig = {
    version: 1,
    destinations: [{ id: 'default_wecom', name: '测试 Webhook', type: 'wecom', url: '' }],
    rules: [
      {
        id: 'test',
        name: '本局结算战报',
        enabled: true,
        eventType: 'game_round_finished',
        destinationId: 'default_wecom',
        templateType: 'preset_classic_text',
        msgType: 'text',
      },
    ],
  };
  // 仅使用模拟配置；不读取或改写本机 Webhook 地址，也不发送消息。
  await page.route(/\/api\/(webhook|robot)-config/, (route) =>
    route.fulfill({
      json: { success: true, config, presets: PRESET_TEMPLATES },
    })
  );
  await page.route(/\/api\/(webhook|robot)\/preview/, (route) => {
    const { template } = route.request().postDataJSON();
    const rendered = renderTemplate(template, {
      roomCode: '8888',
      roundNumber: 6,
      scores: [],
      winners: [],
      standings: [],
    });
    return route.fulfill({ json: { success: true, rendered } });
  });

  await page.goto('/webhook');
  await expect(page.getByRole('heading', { name: '🎱 Webhook 配置' })).toBeVisible();
  await expect(page).toHaveTitle('Webhook 配置 - PoolPoker');
  await expect(page.getByText('房间号：8888')).toBeVisible();
  await page.reload();
  await expect(page.getByTitle('返回游戏大厅')).toBeVisible();

  await page.getByTitle('返回游戏大厅').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '🎱 Webhook 配置' })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTitle('返回游戏大厅')).toBeVisible();

  // 验证从旧路径 /enter_robot 能够自动平滑重定向至 /webhook
  await page.goto('/enter_robot');
  await expect(page).toHaveURL(/\/webhook$/);
  await expect(page.getByRole('heading', { name: '🎱 Webhook 配置' })).toBeVisible();
});

test('未保存的新地址和模板用于测试发送，不修改正式配置', async ({ page }) => {
  const savedConfig: RobotConfig = {
    version: 1,
    destinations: [
      {
        id: 'default_wecom',
        name: '原群',
        type: 'wecom',
        url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=old-group',
      },
    ],
    rules: [
      {
        id: 'test',
        name: '本局结算战报',
        enabled: true,
        eventType: 'game_round_finished',
        destinationId: 'default_wecom',
        templateType: 'preset_classic_text',
        msgType: 'text',
      },
    ],
  };
  let saveRequests = 0;
  await page.route(/\/api\/(webhook|robot)-config/, (route) => {
    if (route.request().method() !== 'GET') saveRequests += 1;
    return route.fulfill({ json: { success: true, config: savedConfig, presets: PRESET_TEMPLATES } });
  });
  await page.route(/\/api\/(webhook|robot)\/preview/, (route) => {
    const { template } = route.request().postDataJSON();
    return route.fulfill({
      json: { success: true, rendered: renderTemplate(template, { roomCode: '8888', scores: [] }) },
    });
  });
  let submitted: { config: RobotConfig; destinationId: string; ruleId: string } | undefined;
  await page.route(/\/api\/(webhook|robot)\/test/, (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { success: true, message: '草稿测试成功' } });
  });

  await page.goto('/webhook');
  await expect(page.locator('textarea').first()).toHaveValue(savedConfig.destinations[0].url);
  await page.locator('textarea').first().fill('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=new-group');
  await page.getByPlaceholder('编写你的战报组装模板...').fill('未保存草稿：{{roomCode}}');
  await page.getByRole('combobox').selectOption('markdown');
  await expect(page.getByText('未保存草稿：8888', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '发送测试战报' }).click();
  await expect(page.getByText('草稿测试成功', { exact: true })).toBeVisible();

  expect(submitted?.config.destinations[0].url).toContain('key=new-group');
  expect(submitted?.config.rules[0]).toMatchObject({ customTemplate: '未保存草稿：{{roomCode}}', msgType: 'markdown' });
  expect(submitted?.destinationId).toBe('default_wecom');
  expect(submitted?.ruleId).toBe('test');
  expect(saveRequests).toBe(0);
  await page.reload();
  await expect(page.locator('textarea').first()).toHaveValue(savedConfig.destinations[0].url);
});

test('Hook 配置中心支持多 Tab 浏览与新建规则', async ({ page }) => {
  const config: RobotConfig = {
    version: 1,
    destinations: [
      {
        id: 'dest_1',
        name: '主战群',
        type: 'wecom',
        url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=dest1',
        mentionedList: ['shyren'],
      },
    ],
    rules: [
      {
        id: 'rule_1',
        name: '本局结算战报',
        enabled: true,
        eventType: 'game_round_finished',
        destinationId: 'dest_1',
        templateType: 'preset_classic_text',
        msgType: 'text',
      },
    ],
  };

  await page.route(/\/api\/(webhook|robot)-config/, (route) =>
    route.fulfill({
      json: { success: true, config, presets: PRESET_TEMPLATES },
    })
  );
  await page.route('**/api/hook/catalog', (route) =>
    route.fulfill({
      json: {
        success: true,
        catalog: [
          {
            type: 'game_start',
            name: '对局开始 (game_start)',
            category: 'game',
            description: '发牌并确认第一名开球手时触发',
            fields: [{ key: 'roomCode', label: '房间号', type: 'string', description: '4位房间号' }],
          },
          {
            type: 'game_round_finished',
            name: '本局结算 (game_round_finished)',
            category: 'round',
            description: '玩家清空手牌获胜时触发',
            fields: [{ key: 'winners', label: '胜者列表', type: 'array', description: '获胜者列表' }],
          },
          {
            type: 'system_crash',
            name: '系统异常警报 (system_crash)',
            category: 'system',
            description: '服务端发生未捕获异常时触发',
            fields: [{ key: 'error', label: '错误信息', type: 'string', description: '异常报错描述文本' }],
          },
        ],
      },
    })
  );
  await page.route(/\/api\/(webhook|robot)\/preview/, (route) =>
    route.fulfill({
      json: { success: true, rendered: '预览内容' },
    })
  );

  await page.goto('/webhook');

  // 1. 验证目标管理 Tab
  await page.getByRole('button', { name: /发送目标管理/ }).click();
  await expect(page.getByText('企业微信 Webhook 发送目标')).toBeVisible();
  await expect(page.getByText('主战群')).toBeVisible();
  await expect(page.getByText('被 1 条规则引用')).toBeVisible();

  // 2. 验证事件目录 Tab
  await page.getByRole('button', { name: /事件目录/ }).click();
  await expect(page.getByText('支持的游戏事件目录')).toBeVisible();
  await expect(page.getByText('对局开始 (game_start)')).toBeVisible();
  await expect(page.getByText('本局结算 (game_round_finished)')).toBeVisible();
  await expect(page.getByText('系统异常警报 (system_crash)')).toBeVisible();

  // 3. 返回规则列表并新建一条规则
  await page.getByRole('button', { name: /推送规则|Hook 规则/ }).click();
  await page.getByRole('button', { name: '新建 Hook' }).click();
  await expect(page.getByText('新规则 2', { exact: true })).toBeVisible();
});
