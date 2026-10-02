import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface AppConfig {
  port: number;
  discovery?: { radius_meters?: number };
  room?: {
    default_cards_per_player?: number;
    max_players?: number;
    disconnect_timeout_ms?: number;
  };
}

const rootDir = path.resolve(import.meta.dirname, '..');

let appConfig: AppConfig = {
  port: 3000,
  room: {
    default_cards_per_player: 5,
    max_players: 8,
    disconnect_timeout_ms: 3600000,
  },
};
const configPath = path.join(rootDir, 'config.yaml');

if (fs.existsSync(configPath)) {
  try {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const parsedConfig = yaml.load(fileContents) as Partial<AppConfig>;
    if (parsedConfig && typeof parsedConfig === 'object') {
      appConfig = {
        ...appConfig,
        ...parsedConfig,
        room: {
          ...appConfig.room,
          ...(parsedConfig.room || {}),
        },
      };
      console.log(
        `📄 成功读取 config.yaml 配置文件 (配置端口: ${appConfig.port}, 掉线解散超时: ${appConfig.room?.disconnect_timeout_ms}ms)`
      );
    }
  } catch (e) {
    const err = e as Error;
    console.warn(`⚠️ 读取 config.yaml 异常, 使用默认参数: ${err.message}`);
  }
}

export { appConfig, rootDir };
