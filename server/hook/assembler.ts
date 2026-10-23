import Handlebars from 'handlebars';

const MAX_TEMPLATE_LENGTH = 4096;
const MAX_OUTPUT_LENGTH = 10240;
const MAX_LOOP_ITERATIONS = 50;
const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'prototype', 'constructor']);
const handlebars = Handlebars.create();

// 独立环境仅注册战报格式化函数，不与其他模板共享 helper。
handlebars.registerHelper('sign', (value: unknown) => {
  const number = Number(value);
  return Number.isNaN(number) ? String(value ?? '') : number >= 0 ? `+${number}` : `${number}`;
});
handlebars.registerHelper('rankBadge', (value: unknown) => {
  const number = Number(value);
  if (number === 1) return '🥇';
  if (number === 2) return '🥈';
  if (number === 3) return '🥉';
  return Number.isNaN(number) ? String(value ?? '') : `[${number}]`;
});
// 旧模板的 rank_badge 名称与 index（从 1 开始）仍然有效。
handlebars.registerHelper('rank_badge', handlebars.helpers.rankBadge);
handlebars.registerHelper(
  'each',
  function (this: Record<string, unknown>, list: unknown, options: Handlebars.HelperOptions) {
    if (!Array.isArray(list) || list.length === 0) return options.inverse(this);
    return list
      .slice(0, MAX_LOOP_ITERATIONS)
      .map((item, index) => {
        const context = {
          ...this,
          ...(item !== null && typeof item === 'object' ? item : { this: item }),
          index: index + 1,
        };
        const data = Handlebars.createFrame(options.data || {});
        data.index = index;
        data.first = index === 0;
        data.last = index === Math.min(list.length, MAX_LOOP_ITERATIONS) - 1;
        return options.fn(context, { data });
      })
      .join('');
  }
);

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// 仅转换原始模板中的旧管道表达式；数据值从不重新解析。
function normalizeLegacyFilters(template: string): string {
  return template.replace(/\{\{\s*([\w.@/]+)\s*\|\s*([\w]+)\s*\}\}/g, '{{ $2 $1 }}');
}

function validatePath(expression: hbs.AST.Expression): void {
  if (expression.type !== 'PathExpression') throw new Error('模板参数只支持字段路径');
  const path = expression as hbs.AST.PathExpression;
  for (const part of path.parts) {
    if (FORBIDDEN_PROPERTIES.has(part)) throw new Error(`模板包含非法属性访问: "${part}"`);
  }
}

function validateProgram(program: hbs.AST.Program, insideLoop = false): void {
  if (program.blockParams?.length) throw new Error('模板不支持 block 参数别名');
  for (const statement of program.body) {
    switch (statement.type) {
      case 'ContentStatement':
      case 'CommentStatement':
        break;
      case 'MustacheStatement': {
        const node = statement as hbs.AST.MustacheStatement;
        validatePath(node.path);
        if (node.hash?.pairs.length) throw new Error('模板不支持命名参数');
        if (node.params.length) {
          const helper = (node.path as hbs.AST.PathExpression).original;
          if (!['sign', 'rankBadge', 'rank_badge'].includes(helper)) throw new Error(`未知过滤器: "${helper}"`);
          if (node.params.length !== 1) throw new Error('格式化函数只接受一个字段');
          validatePath(node.params[0]);
        }
        break;
      }
      case 'BlockStatement': {
        const node = statement as hbs.AST.BlockStatement;
        if (insideLoop) throw new Error('模板安全限制：禁止嵌套 {{#each}} 循环');
        if (node.path.original !== 'each' || node.params.length !== 1 || node.hash?.pairs.length) {
          throw new Error('模板仅支持 {{#each list}} 列表循环');
        }
        validatePath(node.params[0]);
        validateProgram(node.program, true);
        if (node.inverse) validateProgram(node.inverse, true);
        break;
      }
      default:
        throw new Error(`不支持的模板语法: ${statement.type}`);
    }
  }
}

function parseTemplate(template: string): hbs.AST.Program {
  if (typeof template !== 'string') throw new Error('模板必须为字符串');
  if (template.length > MAX_TEMPLATE_LENGTH) throw new Error(`模板长度超出限制（最大 ${MAX_TEMPLATE_LENGTH} 字符）`);
  let ast: hbs.AST.Program;
  try {
    ast = handlebars.parse(normalizeLegacyFilters(template));
  } catch {
    throw new Error('模板语法错误：请检查标签未配对闭合或表达式不完整');
  }
  validateProgram(ast);
  return ast;
}

export function validateTemplate(template: string): ValidationResult {
  try {
    parseTemplate(template);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  const ast = parseTemplate(template);
  // 输出供企微 Text/Markdown 使用，浏览器预览仍通过 Vue 文本插值显示。
  const render = handlebars.compile(ast, { noEscape: true, ignoreStandalone: true });
  const output = render(context, { allowProtoMethodsByDefault: false, allowProtoPropertiesByDefault: false });
  if (output.length > MAX_OUTPUT_LENGTH) throw new Error(`渲染输出超出大小限制（最大 ${MAX_OUTPUT_LENGTH} 字符）`);
  return output;
}
