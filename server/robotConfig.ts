import { loadRobotConfig, updateRobotUrl } from './hook/robotConfigStore';

export function getRobotWebhookUrl(): string {
  const config = loadRobotConfig();
  const defaultDest = config.destinations.find((d) => d.id === 'default_wecom') || config.destinations[0];
  return defaultDest?.url?.trim() || '';
}

export function setRobotWebhookUrl(url: string): void {
  updateRobotUrl(url);
}
