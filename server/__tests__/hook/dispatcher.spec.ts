import { describe, expect, it } from 'vitest';
import { checkTestSendRateLimit, isValidWecomUrl, recordTestSend, sendWecomMessage } from '../../hook/dispatcher';

describe('Hook Dispatcher (企微发送与安全校验)', () => {
  it('正确放行标准企微官方 Webhook URL', () => {
    const validUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=693a91f6-7xxx-4bc4-97a0-0ec2sifa5aaa';
    expect(isValidWecomUrl(validUrl)).toBe(true);
  });

  it('严格拦截非企微域名或 SSRF 内网探测地址', () => {
    const dangerousUrls = [
      'http://127.0.0.1:3000/api/hack',
      'http://169.254.169.254/latest/meta-data/',
      'https://attacker.com/webhook',
      'https://qyapi.weixin.qq.com.evil.com/webhook',
      'ftp://qyapi.weixin.qq.com/webhook',
      '',
      'javascript:alert(1)',
    ];

    for (const url of dangerousUrls) {
      expect(isValidWecomUrl(url)).toBe(false);
    }
  });

  it('sendWecomMessage 拦截非法 URL 并返回明确错误说明', async () => {
    const res = await sendWecomMessage('http://evil.com', 'test', 'text');
    expect(res.success).toBe(false);
    expect(res.message).toContain('非法的企微机器人 Webhook 地址');
  });

  it('测试发送频控冷却正确生效', () => {
    // 记录一次发送
    recordTestSend();
    const rateLimit = checkTestSendRateLimit();
    expect(rateLimit.allowed).toBe(false);
    expect(rateLimit.remainingSeconds).toBeGreaterThan(0);
  });
});
