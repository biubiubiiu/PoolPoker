// 机器人 Webhook 链接：由 /enter_robot 页面动态设置，保存在内存中（服务重启后清空）
let robotWebhookUrl = '';

export function getRobotWebhookUrl(): string {
  return robotWebhookUrl;
}

export function setRobotWebhookUrl(url: string): void {
  robotWebhookUrl = (url || '').trim();
}
