import fs from 'node:fs';
import path from 'node:path';
import { rootDir } from '../config';
import { assertRobotConfig } from './configValidation';
import type { HookDestination, HookRule, RobotConfig } from './types';

const CONFIG_FILE_PATH = path.join(rootDir, '.robot_config.json');
const URL_FILE_PATH = path.join(rootDir, '.robot_url');

export const DEFAULT_MENTIONED_LIST = ['shyren'];

export function createDefaultConfig(url = ''): RobotConfig {
  const defaultDestination: HookDestination = {
    id: 'default_wecom',
    name: '企业微信 Webhook',
    type: 'wecom',
    url: url.trim(),
    mentionedList: DEFAULT_MENTIONED_LIST,
  };

  const defaultRule: HookRule = {
    id: 'rule_round_finished',
    name: '本局结算战报',
    enabled: true,
    eventType: 'game_round_finished',
    actionType: 'send_wecom',
    destinationId: 'default_wecom',
    templateType: 'preset_classic_text',
    msgType: 'text',
  };

  return {
    version: 1,
    destinations: [defaultDestination],
    rules: [defaultRule],
  };
}

let cachedConfig: RobotConfig | null = null;

export function loadRobotConfig(): RobotConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  let config: RobotConfig = createDefaultConfig();

  // 1. 尝试从 .robot_config.json 读取
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      const parsed: unknown = JSON.parse(content);
      assertRobotConfig(parsed);
      for (const rule of parsed.rules) {
        if (!rule.name) {
          rule.name =
            rule.eventType === 'game_start'
              ? '对局开球提醒'
              : rule.eventType === 'system_crash'
                ? '系统异常警报'
                : '本局结算战报';
        }
        if (!rule.actionType) {
          rule.actionType = 'send_wecom';
        }
      }
      config = parsed;
    } catch (e) {
      console.warn(`⚠️ [Hook] 读取 .robot_config.json 失败: ${e}`);
    }
  } else if (fs.existsSync(URL_FILE_PATH)) {
    // 2. 向下兼容从 .robot_url 迁移
    try {
      const url = fs.readFileSync(URL_FILE_PATH, 'utf8').trim();
      config = createDefaultConfig(url);
    } catch (e) {
      console.warn(`⚠️ [Hook] 读取 .robot_url 失败: ${e}`);
    }
  }

  // 3. 环境变量最高优先级覆盖
  const envUrl = (process.env.ROBOT_WEBHOOK_URL || '').trim();
  if (envUrl) {
    const defaultDest = config.destinations.find((d) => d.id === 'default_wecom') || config.destinations[0];
    if (defaultDest) {
      defaultDest.url = envUrl;
    }
  }

  cachedConfig = config;
  return config;
}

export function saveRobotConfig(newConfig: RobotConfig): void {
  assertRobotConfig(newConfig);

  // 校验目标引用约束：不可删除仍被有效 Hook 引用的目标
  const destIdSet = new Set((newConfig.destinations || []).map((d) => d.id));
  for (const rule of newConfig.rules || []) {
    if (rule.destinationId && !destIdSet.has(rule.destinationId)) {
      throw new Error(
        `目标 ID「${rule.destinationId}」已被规则「${rule.name || rule.id}」引用，无法删除，请先修改规则的目标设置`
      );
    }
  }

  const tmpPath = `${CONFIG_FILE_PATH}.tmp`;
  const jsonStr = JSON.stringify(newConfig, null, 2);

  try {
    // 原子写入主配置文件（使用 0o600 严格权限防止密钥被其他用户读取）
    fs.writeFileSync(tmpPath, jsonStr, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, CONFIG_FILE_PATH);
    try {
      fs.chmodSync(CONFIG_FILE_PATH, 0o600);
    } catch {
      // 忽略部分平台权限调整报错
    }

    // 同步向下兼容写入 .robot_url
    const defaultDest = newConfig.destinations.find((d) => d.id === 'default_wecom') || newConfig.destinations[0];
    const defaultUrl = defaultDest?.url?.trim() || '';

    if (defaultUrl) {
      fs.writeFileSync(URL_FILE_PATH, defaultUrl, { encoding: 'utf8', mode: 0o600 });
      try {
        fs.chmodSync(URL_FILE_PATH, 0o600);
      } catch {
        // ignore
      }
    } else if (fs.existsSync(URL_FILE_PATH)) {
      fs.unlinkSync(URL_FILE_PATH);
    }

    cachedConfig = newConfig;
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore cleanup error
      }
    }
    throw new Error(`保存机器人配置失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// 供老接口 /api/robot-url 或 robotConfig.ts 兼容更新 URL
export function updateRobotUrl(url: string): RobotConfig {
  const config = loadRobotConfig();
  let defaultDest = config.destinations.find((d) => d.id === 'default_wecom');

  if (!defaultDest) {
    defaultDest = {
      id: 'default_wecom',
      name: '企业微信 Webhook',
      type: 'wecom',
      url: url.trim(),
      mentionedList: DEFAULT_MENTIONED_LIST,
    };
    config.destinations.unshift(defaultDest);
  } else {
    defaultDest.url = url.trim();
  }

  saveRobotConfig(config);
  return config;
}

// 测试环境下重置缓存
export function _resetCachedConfig(): void {
  cachedConfig = null;
}
