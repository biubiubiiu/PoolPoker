import { isWecomPushDisabled } from '../wecomWebhook';

export const WECOM_URL_PATTERN = /^https:\/\/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=[a-zA-Z0-9_-]+$/;

export function isValidWecomUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return WECOM_URL_PATTERN.test(url.trim());
}

export interface DispatchResult {
  success: boolean;
  message?: string;
}

// 供 /api/robot/test 的限流器（10秒一次）
let lastTestSendTimestamp = 0;
export const TEST_SEND_COOLDOWN_MS = 10_000;

export function checkTestSendRateLimit(): { allowed: boolean; remainingSeconds: number } {
  const now = Date.now();
  const elapsed = now - lastTestSendTimestamp;
  if (elapsed < TEST_SEND_COOLDOWN_MS) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil((TEST_SEND_COOLDOWN_MS - elapsed) / 1000),
    };
  }
  return { allowed: true, remainingSeconds: 0 };
}

export function recordTestSend(): void {
  lastTestSendTimestamp = Date.now();
}

export async function sendWecomMessage(
  url: string,
  content: string,
  msgType: 'text' | 'markdown',
  mentionedList: string[] = []
): Promise<DispatchResult> {
  const cleanUrl = url.trim();

  // 1. 白名单正则校验 (防 SSRF)
  if (!isValidWecomUrl(cleanUrl)) {
    return { success: false, message: '非法的企微机器人 Webhook 地址（仅允许企微官方域名及标准 key 参数）' };
  }

  // 2. 测试或禁用环境静音拦截
  if (isWecomPushDisabled()) {
    return { success: true, message: '当前处于测试/禁用环境，已跳过真实网络发送' };
  }

  // 3. 构建消息体
  const body =
    msgType === 'markdown'
      ? {
          msgtype: 'markdown',
          markdown: {
            content,
          },
        }
      : {
          msgtype: 'text',
          text: {
            content,
            mentioned_list: mentionedList,
          },
        };

  try {
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000), // 5秒强超时熔断
    });

    if (!res.ok) {
      return { success: false, message: `企微服务端返回 HTTP ${res.status}` };
    }

    const data = (await res.json()) as { errcode?: number; errmsg?: string };
    if (data.errcode !== 0) {
      return { success: false, message: `企微接口报错 [${data.errcode}]: ${data.errmsg || '未知错误'}` };
    }

    return { success: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { success: false, message: `请求异常或超时: ${reason}` };
  }
}
