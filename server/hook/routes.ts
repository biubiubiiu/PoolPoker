import { type Request, type Response, Router } from 'express';
import { getRobotWebhookUrl, setRobotWebhookUrl } from '../robotConfig';
import { renderTemplate, validateTemplate } from './assembler';
import { EVENT_CATALOG, getMockPayloadForEvent, MOCK_ROUND_FINISHED_PAYLOAD } from './catalog';
import { assertRobotConfig } from './configValidation';
import { checkTestSendRateLimit, isValidWecomUrl, recordTestSend, sendWecomMessage } from './dispatcher';
import { getPresetTemplate, PRESET_TEMPLATES } from './presets';
import { loadRobotConfig, saveRobotConfig } from './robotConfigStore';
import type { GameHookEventType, HookActionType, RoundFinishedPayload } from './types';

export function getMockRoundFinishedPayload(): RoundFinishedPayload {
  return MOCK_ROUND_FINISHED_PAYLOAD;
}

export const hookRouter = Router();

// 机器人 Webhook 链接：内存读取 / 设置（向后兼容老接口）
hookRouter.get('/api/robot-url', (_req: Request, res: Response) => {
  res.json({ success: true, url: getRobotWebhookUrl() });
});

hookRouter.post('/api/robot-url', (req: Request, res: Response) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  setRobotWebhookUrl(url);
  res.json({ success: true, url: getRobotWebhookUrl() });
});

// 事件目录列表与字段说明
hookRouter.get('/api/hook/catalog', (_req: Request, res: Response) => {
  res.json({
    success: true,
    catalog: Object.values(EVENT_CATALOG),
    presets: PRESET_TEMPLATES,
  });
});

// Webhook 高级配置：获取当前配置与可用预设
hookRouter.get(['/api/webhook-config', '/api/robot-config'], (_req: Request, res: Response) => {
  res.json({
    success: true,
    config: loadRobotConfig(),
    presets: PRESET_TEMPLATES,
  });
});

// Webhook 高级配置：保存配置（带白名单与语法校验）
hookRouter.post(['/api/webhook-config', '/api/robot-config'], (req: Request, res: Response) => {
  const newConfig: unknown = req.body?.config;
  try {
    assertRobotConfig(newConfig);
  } catch (err) {
    return res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }

  // 1. 校验 Destinations 中的 URL 是否合法（防 SSRF）
  for (const dest of newConfig.destinations || []) {
    if (dest.url?.trim() && !isValidWecomUrl(dest.url)) {
      return res.status(400).json({
        success: false,
        message: `目标「${dest.name}」的 Webhook 地址非法（仅允许企业微信官方域名机器人地址）`,
      });
    }
  }

  // 2. 校验 Rules 中的自定义模板语法
  for (const rule of newConfig.rules || []) {
    if (rule.templateType === 'custom' && rule.customTemplate) {
      const validation = validateTemplate(rule.customTemplate);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `自定义模板语法错误: ${validation.error}`,
        });
      }
    }
  }

  try {
    saveRobotConfig(newConfig);
    res.json({ success: true, config: loadRobotConfig() });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: reason });
  }
});

// Webhook 模板预览：基于 Mock 数据进行实时组装渲染
hookRouter.post(['/api/webhook/preview', '/api/robot/preview'], (req: Request, res: Response) => {
  const template = typeof req.body?.template === 'string' ? req.body.template : '';
  const eventType = (req.body?.eventType as GameHookEventType) || 'game_round_finished';
  const validation = validateTemplate(template);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  try {
    const mockPayload = getMockPayloadForEvent(eventType);
    const rendered = renderTemplate(template, mockPayload as unknown as Record<string, unknown>);
    res.json({ success: true, rendered });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: reason });
  }
});

// 测试当前页面草稿（不读取或保存正式配置）
hookRouter.post('/api/hook/test-draft', async (req: Request, res: Response) => {
  const actionType: HookActionType = req.body?.actionType || 'send_wecom';
  const eventType: GameHookEventType = req.body?.eventType || 'game_round_finished';
  const templateType = req.body?.templateType || 'preset_classic_text';
  const customTemplate = typeof req.body?.customTemplate === 'string' ? req.body.customTemplate : '';
  let msgType = req.body?.msgType || 'text';

  let template = '';
  if (templateType === 'custom') {
    template = customTemplate;
  } else {
    const preset = getPresetTemplate(templateType);
    template = preset.template;
    if (!req.body?.msgType) {
      msgType = preset.msgType;
    }
  }

  if (!template.trim()) {
    return res.status(400).json({ success: false, message: '测试模板不能为空' });
  }

  const validation = validateTemplate(template);
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: `模板语法错误: ${validation.error}` });
  }

  const mockPayload = getMockPayloadForEvent(eventType);
  let rendered = '';
  try {
    rendered = renderTemplate(template, mockPayload);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ success: false, message: `模板渲染失败: ${reason}` });
  }

  // 发送企微 Webhook
  const rateLimit = checkTestSendRateLimit();
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      message: `操作过于频繁，请等待 ${rateLimit.remainingSeconds} 秒后再试`,
    });
  }

  let destinationUrl = typeof req.body?.destinationUrl === 'string' ? req.body.destinationUrl.trim() : '';
  const destinationId = req.body?.destinationId;
  const config = req.body?.config;
  const mentionedList = Array.isArray(req.body?.mentionedList) ? req.body.mentionedList : [];

  if (!destinationUrl && destinationId) {
    const availableDestinations = config?.destinations || loadRobotConfig().destinations;
    const found = availableDestinations.find((d: { id: string; url?: string }) => d.id === destinationId);
    if (found) {
      destinationUrl = found.url?.trim() || '';
    }
  }

  if (!destinationUrl) {
    return res.status(400).json({ success: false, message: '请提供测试目标 Webhook 地址' });
  }

  if (!isValidWecomUrl(destinationUrl)) {
    return res.status(400).json({ success: false, message: '草稿的 Webhook 地址格式非法，仅支持企业微信机器人' });
  }

  try {
    const result = await sendWecomMessage(destinationUrl, rendered, msgType, mentionedList);

    if (result.success) {
      recordTestSend();
      return res.json({
        success: true,
        rendered,
        message: result.message || '✅ 测试消息已成功推送到企业微信！',
      });
    }

    return res.status(400).json({ success: false, message: result.message || '推送失败' });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, message: `发送测试消息异常: ${reason}` });
  }
});

// Webhook 测试发送接口
hookRouter.post(['/api/webhook/test', '/api/robot/test'], async (req: Request, res: Response) => {
  const rateLimit = checkTestSendRateLimit();
  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      message: `操作过于频繁，请等待 ${rateLimit.remainingSeconds} 秒后再试`,
    });
  }

  const config: unknown = req.body?.config;
  try {
    assertRobotConfig(config);
  } catch (err) {
    return res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }

  const destination = config.destinations.find((d) => d.id === req.body?.destinationId);
  const rule = config.rules.find((r) => r.id === req.body?.ruleId);
  if (!destination || !rule || rule.destinationId !== destination.id) {
    return res.status(400).json({ success: false, message: '请选择匹配的测试目标和战报规则' });
  }
  if (!isValidWecomUrl(destination.url)) {
    return res.status(400).json({ success: false, message: '草稿的 Webhook 地址格式非法，无法发送' });
  }

  let template = '';
  let msgType = rule?.msgType || 'text';

  if (rule?.templateType === 'custom') {
    template = rule.customTemplate || '';
  } else {
    const preset = getPresetTemplate(rule?.templateType || 'preset_classic_text');
    template = preset.template;
    msgType = preset.msgType;
  }

  if (!template.trim()) {
    return res.status(400).json({ success: false, message: '测试模板不能为空' });
  }
  const validation = validateTemplate(template);
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: validation.error });
  }

  try {
    const mockPayload = getMockPayloadForEvent(rule.eventType);
    const rendered = renderTemplate(template, mockPayload as unknown as Record<string, unknown>);
    const result = await sendWecomMessage(destination.url, rendered, msgType, destination.mentionedList);

    if (result.success) {
      recordTestSend();
      res.json({ success: true, message: result.message || '✅ 测试消息已成功推送到企业微信！' });
    } else {
      res.status(400).json({ success: false, message: result.message || '推送失败' });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message: `发送测试消息异常: ${reason}` });
  }
});
