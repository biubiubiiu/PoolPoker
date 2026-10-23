import { describe, expect, it } from 'vitest';
import { renderTemplate, validateTemplate } from '../../hook/assembler';

describe('Hook Assembler (受限模板渲染引擎)', () => {
  it('正确支持变量插值与修饰符 (| sign, | rank_badge)', () => {
    const template = '房间: {{roomCode}}, 得分: {{delta | sign}}, 排名: {{rank | rank_badge}}';
    const context = { roomCode: '8888', delta: 24, rank: 1 };
    expect(renderTemplate(template, context)).toBe('房间: 8888, 得分: +24, 排名: 🥇');

    const negContext = { roomCode: '8888', delta: -16, rank: 2 };
    expect(renderTemplate(template, negContext)).toBe('房间: 8888, 得分: -16, 排名: 🥈');

    const thirdContext = { roomCode: '8888', delta: 0, rank: 3 };
    expect(renderTemplate(template, thirdContext)).toBe('房间: 8888, 得分: +0, 排名: 🥉');

    const fourthContext = { roomCode: '8888', delta: -5, rank: 4 };
    expect(renderTemplate(template, fourthContext)).toBe('房间: 8888, 得分: -5, 排名: [4]');
  });

  it('正确支持单层 {{#each list}} 列表循环与 1-based index', () => {
    const template = '积分榜:\n{{#each scores}}{{index}}. {{name}}: {{delta | sign}}\n{{/each}}';
    const context = {
      scores: [
        { name: '小明', delta: 24 },
        { name: '阿强', delta: -16 },
      ],
    };

    const rendered = renderTemplate(template, context);
    expect(rendered).toBe('积分榜:\n1. 小明: +24\n2. 阿强: -16\n');
  });

  it('严格拒绝嵌套 {{#each}} 循环并报错', () => {
    const invalidTemplate = '{{#each teams}}{{#each players}}{{name}}{{/each}}{{/each}}';
    const validation = validateTemplate(invalidTemplate);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('禁止嵌套 {{#each}}');

    expect(() => renderTemplate(invalidTemplate, {})).toThrow('禁止嵌套 {{#each}}');
  });

  it('严格检测并拒绝未闭合的 {{#each}} 标签', () => {
    const invalidTemplate = '{{#each list}}{{name}}';
    const validation = validateTemplate(invalidTemplate);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('未配对闭合');
  });

  it('防御原型污染 (禁止访问 __proto__, constructor, prototype)', () => {
    const forbiddenTemplates = ['{{__proto__.polluted}}', '{{constructor.name}}', '{{item.prototype.value}}'];

    for (const t of forbiddenTemplates) {
      const validation = validateTemplate(t);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('非法属性访问');
    }
  });

  it('遇到未知过滤器抛出清晰错误', () => {
    const template = '{{name | unknown_filter}}';
    expect(() => renderTemplate(template, { name: '小明' })).toThrow('未知过滤器: "unknown_filter"');
  });

  it('模板超长或输出超长熔断保护', () => {
    const hugeTemplate = 'a'.repeat(4097);
    const validation = validateTemplate(hugeTemplate);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('模板长度超出限制');
  });
  it('支持 Handlebars helper，保留旧管道语法且不转义战报文本', () => {
    const context = { name: 'A&B <球友>', delta: -8, rank: 2 };
    expect(renderTemplate('{{name}} {{sign delta}} {{rankBadge rank}}', context)).toBe('A&B <球友> -8 🥈');
    expect(renderTemplate('{{delta | sign}} {{rank | rank_badge}}', context)).toBe('-8 🥈');
  });

  it('玩家数据包含模板标签时保持原样，不进行二次解析', () => {
    const context = { roomCode: '8888', scores: [{ name: '{{roomCode}} {{name | unknown}}' }] };
    expect(renderTemplate('{{#each scores}}{{name}}{{/each}}', context)).toBe('{{roomCode}} {{name | unknown}}');
  });

  it('保存校验拒绝乱序标签、未知 helper 和 partial', () => {
    for (const template of ['{{/each}}{{#each scores}}', '{{unknown delta}}', '{{> report}}']) {
      expect(validateTemplate(template).valid).toBe(false);
    }
  });

  it('保留单层循环的根字段、序号和次数限制', () => {
    const scores = Array.from({ length: 51 }, () => ({ name: '球友' }));
    const output = renderTemplate('{{#each scores}}{{roomCode}}:{{index}};{{/each}}', { roomCode: '8888', scores });
    expect(output).toContain('8888:50;');
    expect(output).not.toContain('8888:51;');
    expect(() =>
      renderTemplate('{{#each scores}}{{name}}{{/each}}', {
        scores: [{ name: 'a'.repeat(10241) }],
      })
    ).toThrow('渲染输出超出大小限制');
  });
});
