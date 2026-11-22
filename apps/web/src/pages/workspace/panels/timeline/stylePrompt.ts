import type { ProjectStyle } from "./timelineTypes";

// 把已套用的风格约束拼成一段文本，注入 Agent 生成请求的 prompt。
// essence/colors/fonts/motion 的原始内容已自带小标题，这里按原样拼接，避免二次包装。
export function buildStyleConstraint(style: ProjectStyle) {
  const lines = [
    `风格：${style.name}（${style.group}）`,
    `摘要：${style.summary}`,
  ];
  if (style.essence) lines.push(style.essence);
  if (style.colors) lines.push(style.colors);
  if (style.fonts) lines.push(style.fonts);
  if (style.motion) lines.push(style.motion);
  return lines.join("\n");
}
