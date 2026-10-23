import { describe, expect, it } from 'vitest';
import { assertRobotConfig } from '../../hook/configValidation';
import { createDefaultConfig } from '../../hook/robotConfigStore';

describe('RobotConfig JSON Schema / Ajv', () => {
  it('接受默认配置及自定义模板规则', () => {
    const config = createDefaultConfig();
    expect(() => assertRobotConfig(config)).not.toThrow();
    config.rules[0].templateType = 'custom';
    config.rules[0].customTemplate = '{{sign delta}}';
    expect(() => assertRobotConfig(config)).not.toThrow();
  });

  it('拒绝缺失字段、错误类型、非法枚举与未知字段', () => {
    const malformed = [
      null,
      { version: 1, destinations: [] },
      { ...createDefaultConfig(), version: 2 },
      { ...createDefaultConfig(), rules: 'invalid' },
      { ...createDefaultConfig(), extra: true },
      { ...createDefaultConfig(), destinations: [null] },
    ];
    for (const config of malformed) expect(() => assertRobotConfig(config)).toThrow('机器人配置格式无效');
    const config = createDefaultConfig();
    Object.assign(config.rules[0], { msgType: 'html' });
    expect(() => assertRobotConfig(config)).toThrow('机器人配置格式无效');
  });
});
