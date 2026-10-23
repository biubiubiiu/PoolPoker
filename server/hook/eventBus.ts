import { getRandomHex } from '../../shared/utils/crypto';
import { setHookEventDispatcher } from '../gameEngine';
import { listRooms } from '../roomManager';
import { sendCrashReportToWecom } from '../wecomWebhook';
import { renderTemplate } from './assembler';
import { sendWecomMessage } from './dispatcher';
import { getPresetTemplate } from './presets';
import { loadRobotConfig } from './robotConfigStore';
import type { GameHookEvent, HookRule, RoundFinishedPayload } from './types';

export type HookEventListener = (event: GameHookEvent) => void | Promise<void>;

const listeners = new Set<HookEventListener>();

export function registerHookListener(listener: HookEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function _clearHookListeners(): void {
  listeners.clear();
}

/**
 * 集中发射 Hook 事件，强异常隔离（同步 try/catch，异步 .catch）
 */
export function emitHookEvent(event: GameHookEvent): void {
  for (const listener of listeners) {
    try {
      const result = listener(event);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err) => {
          console.warn(
            `⚠️ [HookBus] 异步监听器执行异常 (${event.type}): ${err instanceof Error ? err.message : String(err)}`
          );
        });
      }
    } catch (err) {
      console.warn(
        `⚠️ [HookBus] 同步监听器执行异常 (${event.type}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

/**
 * 异步集中发射 Hook 事件，等待所有监听器执行完成（供系统崩溃等需要保证在 process.exit 前推送完的场景）
 */
export async function emitHookEventAsync(event: GameHookEvent): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const listener of listeners) {
    try {
      const result = listener(event);
      if (result && typeof (result as Promise<void>).then === 'function') {
        promises.push(
          (result as Promise<void>).catch((err) => {
            console.warn(
              `⚠️ [HookBus] 异步监听器执行异常 (${event.type}): ${err instanceof Error ? err.message : String(err)}`
            );
          })
        );
      }
    } catch (err) {
      console.warn(
        `⚠️ [HookBus] 同步监听器执行异常 (${event.type}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
}

/**
 * 统一处理系统崩溃事件并分发至 Hook 总线
 */
export async function handleSystemCrash(error: unknown, type: string): Promise<void> {
  const activeRooms = listRooms();
  const errorMsg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 8).join('\n') : '';

  const event: GameHookEvent = {
    id: `crash_${Date.now()}_${getRandomHex(3)}`,
    type: 'system_crash',
    timestamp: Date.now(),
    payload: {
      error: errorMsg,
      stack,
      type,
      activeRoomsCount: activeRooms.length,
      timestamp: Date.now(),
    },
  };

  await emitHookEventAsync(event);
}

/**
 * 通用事件执行分发器：匹配所有订阅该事件的规则并独立执行与审计
 */
export async function defaultHookEventHandler(event: GameHookEvent): Promise<void> {
  const config = loadRobotConfig();
  const activeRules = (config.rules || []).filter((r) => r.enabled && r.eventType === event.type);

  for (const rule of activeRules) {
    await executeSingleRule(rule, event);
  }

  // 兜底机制：若发生系统崩溃且用户未配置任何生效的 system_crash 规则，保持向下兼容调用默认崩溃报告器
  if (event.type === 'system_crash' && activeRules.length === 0) {
    await sendCrashReportToWecom(event.payload.error, event.payload.type);
  }
}

async function executeSingleRule(rule: HookRule, event: GameHookEvent): Promise<void> {
  const hookName = rule.name?.trim() || rule.id;
  const actionType = rule.actionType || 'send_wecom';
  const config = loadRobotConfig();

  // 1. 动作类型：企业微信 Webhook
  if (actionType === 'send_wecom') {
    const dest = config.destinations.find((d) => d.id === rule.destinationId);

    if (!dest?.url?.trim()) {
      return;
    }

    let template = '';
    let msgType = rule.msgType || 'text';

    if (rule.templateType === 'custom') {
      template = rule.customTemplate || '';
    } else {
      const preset = getPresetTemplate(rule.templateType);
      template = preset.template;
      msgType = preset.msgType;
    }

    if (!template.trim()) {
      return;
    }

    try {
      const rendered = renderTemplate(template, event.payload as unknown as Record<string, unknown>);
      const res = await sendWecomMessage(dest.url, rendered, msgType, dest.mentionedList);

      if (!res.success) {
        console.warn(`⚠️ [HookBus] 规则「${hookName}」发送未成功: ${res.message}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ [HookBus] 规则「${hookName}」执行异常: ${errorMsg}`);
    }
  }
}

/**
 * 保持向下兼容的老接口
 */
export async function defaultRoundFinishedHandler(payload: RoundFinishedPayload): Promise<void> {
  return defaultHookEventHandler({
    id: `legacy_${Date.now()}`,
    type: 'game_round_finished',
    timestamp: Date.now(),
    payload,
  });
}

/**
 * 初始化 Hook 事件系统，挂载游戏引擎分发器与核心监听器
 */
export function initHookSystem(): void {
  setHookEventDispatcher(emitHookEvent);
  registerHookListener((event) => {
    return defaultHookEventHandler(event);
  });
}
