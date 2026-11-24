// 开发期代码生成工具：把 assets/pipelines（11 条流水线 md）打包成前端数据文件
// src/pages/home/pages/skills/pipelineCatalog.ts。
// 用法：PIPELINES_DIR=/path/to/assets/pipelines bun apps/web/scripts/generatePipelines.ts
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface PipelineStage {
  name: string;
  detail: string;
}

interface Pipeline {
  slug: string;
  name: string;
  summary: string;
  category: string;
  stages: PipelineStage[];
}

const outputPath = resolve(import.meta.dir, "../src/pages/home/pages/skills/pipelineCatalog.ts");
const pipelinesDir = process.env.PIPELINES_DIR
  ? resolve(process.env.PIPELINES_DIR)
  : resolve(import.meta.dir, "../../../../assets/pipelines");

function parsePipeline(text: string, fallbackSlug: string): Pipeline | undefined {
  const lines = text.split(/\r?\n/);
  const heading = lines[0]?.match(/^#\s*(.+?)（([a-z0-9-]+)）\s*$/);
  const name = heading?.[1]?.trim() || fallbackSlug;
  const slug = heading?.[2] || fallbackSlug;
  const summary = lines.map(line => line.match(/^>\s*定位：(.+)$/)?.[1]?.trim()).find(Boolean) ?? "";
  const category = lines.map(line => line.match(/^>\s*类别：([^。]+)/)?.[1]?.trim()).find(Boolean) ?? "";
  const stages: PipelineStage[] = [];
  for (const [index, line] of lines.entries()) {
    const stage = line.match(/^\*\*\d+\.\s*(.+?)\*\*/);
    if (!stage) continue;
    const detail = lines.slice(index + 1).find(next => next.startsWith(">"))?.replace(/^>\s*/, "").trim() ?? "";
    stages.push({ name: stage[1]!.trim(), detail });
  }
  if (!stages.length) return undefined;
  return { slug, name, summary, category, stages };
}

async function main() {
  const files = (await readdir(pipelinesDir)).filter(file => file.endsWith(".md")).sort();
  const pipelines: Pipeline[] = [];
  for (const file of files) {
    const pipeline = parsePipeline(await readFile(resolve(pipelinesDir, file), "utf8"), file.replace(/\.md$/, ""));
    if (pipeline) pipelines.push(pipeline);
  }
  const source = `// 由 apps/web/scripts/generatePipelines.ts 从 assets/pipelines 生成，不要手改。
export type PipelineStage = { name: string; detail: string };
export type Pipeline = { slug: string; name: string; summary: string; category: string; stages: PipelineStage[] };

export const pipelineCatalog: Pipeline[] = ${JSON.stringify(pipelines, null, 2)};
`;
  await writeFile(outputPath, source, "utf8");
  console.log(`已生成 ${pipelines.length} 条流水线：${pipelines.map(pipeline => pipeline.slug).join("、")}`);
}

await main();
