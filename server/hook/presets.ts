import type { PresetTemplateId } from './types';

export interface PresetInfo {
  id: PresetTemplateId;
  name: string;
  description: string;
  msgType: 'text' | 'markdown';
  template: string;
}

export const PRESET_TEMPLATES: Record<PresetTemplateId, PresetInfo> = {
  preset_classic_text: {
    id: 'preset_classic_text',
    name: '经典纯文本',
    description: '标准纯文本战报，展示本局得分与累计总分。',
    msgType: 'text',
    template: `房间号：{{roomCode}}
{{#each scores}}成员{{name}}：{{sign delta}}（累计{{totalScore}}）
{{/each}}`.trim(),
  },
  preset_game_start_text: {
    id: 'preset_game_start_text',
    name: '开局纯文本',
    description: '对局开启时播报开球手与参赛名单。',
    msgType: 'text',
    template: `【对局开始】房间号：{{roomCode}}，第 {{roundNumber}} 局已开球！
开球手：{{shooter.name}}
手牌数：每人 {{cardsPerPlayer}} 张
参赛阵容：{{#each players}}{{name}} {{/each}}`.trim(),
  },
  preset_system_crash_text: {
    id: 'preset_system_crash_text',
    name: '系统异常警报',
    description: '服务端发生未捕获异常或进程崩溃时紧急报警。',
    msgType: 'text',
    template: `⚠️【系统异常警报】
💥 异常类型：{{type}}
❌ 错误详情：{{error}}
📊 活跃房间数：{{activeRoomsCount}} 间
📍 堆栈摘要：
{{stack}}`.trim(),
  },
};

export function getPresetTemplate(id: PresetTemplateId): PresetInfo {
  return PRESET_TEMPLATES[id] || PRESET_TEMPLATES.preset_classic_text;
}
