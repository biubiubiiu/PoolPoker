import Ajv from 'ajv';
import schema from '../../shared/schemas/hook.schema.json';
import type { RobotConfig } from './types';

const ajv = new Ajv({ allErrors: true });
for (const [name, definition] of Object.entries(schema.definitions)) {
  ajv.addSchema(definition, name);
}
const validateConfig = ajv.compile<RobotConfig>({ $ref: 'RobotConfig' });

export function assertRobotConfig(value: unknown): asserts value is RobotConfig {
  if (!validateConfig(value)) {
    throw new Error(`机器人配置格式无效: ${ajv.errorsText(validateConfig.errors, { separator: '；' })}`);
  }
}
