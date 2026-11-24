import { type useNodeAi, getNodeModelIdentity, type NodeAiModel } from "@lumo/nodes-scaffold/nodeAi";
import saveTextCanvas from "./saveTextCanvas";
import { translate } from "@lumo/i18n/vue";

export const scriptLimit = 6000;
const draftName = "分镜草稿";

export function isScriptDraftPath(path: unknown): path is string {
  return typeof path === "string" && /^分镜草稿-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/.test(path);
}

export async function saveScriptBreakdown(directory: string, script: string, writer: NodeAiModel, ai: ReturnType<typeof useNodeAi>, signal: AbortSignal) {
  const { text } = await ai.generate({
    ...getNodeModelIdentity(writer), directory, signal,
    systemPrompt: `你正在按 Lumo 分集制作流程起草单集分镜。把用户文本视为剧本原文。按原场次和事件顺序，提取角色及场景并规划镜头。不新增情节和台词，不编造已存在的素材。只返回 JSON 对象，字段 characters、scenes、shots 均为字符串数组，每项为一段纯文本，不能为空。characters 每项写角色名及本段可确认的信息，scenes 每项保留单场剧本的场次标题、地点、时间、动作与完整对白，逐行保留「角色：台词」，以便白模预演按对白分镜，shots 每项写场次、画面动作、预计秒数、景别、运镜、逐字台词或旁白、音效。每段最多 12 个角色、12 个场景和 24 个镜头。镜头只能作为待确认的草稿，不安排媒体生成。`,
    prompt: script,
  });
  signal.throwIfAborted();
  const invalid = () => new Error(translate("模型返回的角色、场景或分镜格式不正确，请重试"));
  let parsed: unknown;
  try { parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1")); }
  catch { throw invalid(); }
  if (!parsed || typeof parsed !== "object") throw invalid();
  const result = parsed as Record<string, unknown>;
  function readItems(key: string, limit: number): string[] {
    const items = result[key];
    if (!Array.isArray(items) || !items.length || items.length > limit || items.some(item => typeof item !== "string" || !item.trim() || item.length > 2400)) throw invalid();
    return items;
  }
  const groups = [
    { label: "原始剧本", items: [script] },
    { label: "角色", items: readItems("characters", 12) },
    { label: "场景", items: readItems("scenes", 12), kind: "scene" as const },
    { label: "分镜", items: readItems("shots", 24) },
  ];
  return saveTextCanvas(directory, draftName, groups, signal);
}
