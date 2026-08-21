import fs from 'node:fs';
import path from 'node:path';
import { rootDir } from './config';

const URL_FILE_PATH = path.join(rootDir, '.robot_url');

// 机器人 Webhook 链接：优先从环境变量、持久化文件读取，也可通过 /enter_robot 动态设置
let robotWebhookUrl = (process.env.ROBOT_WEBHOOK_URL || '').trim();

if (!robotWebhookUrl && fs.existsSync(URL_FILE_PATH)) {
  try {
    robotWebhookUrl = fs.readFileSync(URL_FILE_PATH, 'utf8').trim();
  } catch (e) {
    console.warn(`⚠️ 读取 .robot_url 失败: ${e}`);
  }
}

export function getRobotWebhookUrl(): string {
  return robotWebhookUrl;
}

export function setRobotWebhookUrl(url: string): void {
  robotWebhookUrl = (url || '').trim();
  try {
    if (robotWebhookUrl) {
      fs.writeFileSync(URL_FILE_PATH, robotWebhookUrl, 'utf8');
    } else if (fs.existsSync(URL_FILE_PATH)) {
      fs.unlinkSync(URL_FILE_PATH);
    }
  } catch (e) {
    console.warn(`⚠️ 保存 .robot_url 失败: ${e}`);
  }
}
