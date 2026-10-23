import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rootDir } from '../../config';
import {
  _resetCachedConfig,
  createDefaultConfig,
  loadRobotConfig,
  saveRobotConfig,
  updateRobotUrl,
} from '../../hook/robotConfigStore';

// 配置仓库的根目录仅在本测试文件中替换，禁止触碰真实机器人配置。
vi.mock('../../config', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  return { rootDir: fs.mkdtempSync(path.join(os.tmpdir(), 'poolpoker-robot-config-')) };
});

afterAll(() => fs.rmSync(rootDir, { recursive: true, force: true }));

describe('RobotConfigStore (配置持久化与向下兼容迁移)', () => {
  const testConfigPath = path.join(rootDir, '.robot_config.json');
  const testUrlPath = path.join(rootDir, '.robot_url');

  let originalConfigBackup: string | null = null;
  let originalUrlBackup: string | null = null;

  beforeEach(() => {
    vi.stubEnv('ROBOT_WEBHOOK_URL', '');
    _resetCachedConfig();
    originalConfigBackup = fs.existsSync(testConfigPath) ? fs.readFileSync(testConfigPath, 'utf8') : null;
    originalUrlBackup = fs.existsSync(testUrlPath) ? fs.readFileSync(testUrlPath, 'utf8') : null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetCachedConfig();
    // 恢复测试前状态
    if (originalConfigBackup !== null) {
      fs.writeFileSync(testConfigPath, originalConfigBackup, 'utf8');
    } else if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }

    if (originalUrlBackup !== null) {
      fs.writeFileSync(testUrlPath, originalUrlBackup, 'utf8');
    } else if (fs.existsSync(testUrlPath)) {
      fs.unlinkSync(testUrlPath);
    }
  });

  it('默认配置符合结构规范且版本号为 1', () => {
    const config = createDefaultConfig('https://example.com/test');
    expect(config.version).toBe(1);
    expect(config.destinations.length).toBe(1);
    expect(config.destinations[0].url).toBe('https://example.com/test');
    expect(config.rules.length).toBe(1);
    expect(config.rules[0].templateType).toBe('preset_classic_text');
    expect(config.rules[0].msgType).toBe('text');
  });

  it('保存新配置时原子写入并同步更新 .robot_url 兼容副本', () => {
    const newConfig = createDefaultConfig('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-123');
    saveRobotConfig(newConfig);

    // 验证 .robot_config.json 存在
    expect(fs.existsSync(testConfigPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(testConfigPath, 'utf8'));
    expect(saved.version).toBe(1);
    expect(saved.destinations[0].url).toContain('test-123');

    // 验证 .robot_url 同步写入
    expect(fs.existsSync(testUrlPath)).toBe(true);
    expect(fs.readFileSync(testUrlPath, 'utf8').trim()).toBe(
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-123'
    );
  });

  it('updateRobotUrl 仅更新 URL，保留既有规则', () => {
    const initialConfig = createDefaultConfig('https://qyapi.weixin.qq.com/old');
    initialConfig.rules[0].templateType = 'custom';
    initialConfig.rules[0].customTemplate = '自定义模版测试';
    saveRobotConfig(initialConfig);

    updateRobotUrl('https://qyapi.weixin.qq.com/new');
    _resetCachedConfig();

    const loaded = loadRobotConfig();
    expect(loaded.destinations[0].url).toBe('https://qyapi.weixin.qq.com/new');
    expect(loaded.rules[0].templateType).toBe('custom');
    expect(loaded.rules[0].customTemplate).toBe('自定义模版测试');
  });
});
