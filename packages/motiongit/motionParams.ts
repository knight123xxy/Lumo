import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 读取模板的参数契约（params.schema.json），用于生成表单和校验输入 */
export function readMotionParamsSchema(pkgDir: string): Record<string, unknown> {
  const path = join(pkgDir, "params.schema.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

type JsonSchemaProperty = {
  type?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
};

/** 轻量校验：required / type / enum / 长度与范围（不引入完整 JSON Schema 校验器） */
export function validateMotionInput(schema: Record<string, unknown>, input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["input 必须是对象"];
  const obj = input as Record<string, unknown>;
  const s = schema as { required?: string[]; properties?: Record<string, JsonSchemaProperty> };

  for (const key of s.required ?? []) {
    if (!(key in obj)) errors.push(`缺少必填字段: ${key}`);
  }
  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    if (!(key in obj)) continue;
    const value = obj[key];
    if (prop.type === "string" && typeof value !== "string") errors.push(`${key} 应为字符串`);
    if (prop.type === "number" && typeof value !== "number") errors.push(`${key} 应为数字`);
    if (prop.type === "array" && !Array.isArray(value)) errors.push(`${key} 应为数组`);
    if (prop.type === "object" && (typeof value !== "object" || Array.isArray(value))) errors.push(`${key} 应为对象`);
    if (prop.enum && !prop.enum.includes(value)) errors.push(`${key} 不在允许值内: ${prop.enum.join(", ")}`);
    if (prop.maxLength && typeof value === "string" && value.length > prop.maxLength) errors.push(`${key} 超长（上限 ${prop.maxLength}）`);
    if (prop.maxItems && Array.isArray(value) && value.length > prop.maxItems) errors.push(`${key} 数量超上限（${prop.maxItems}）`);
  }
  return errors;
}
