// 开发期代码生成工具：把 assets/video-styles（INDEX.md 分组 + 各风格 md 的固定小节）
// 打包成前端数据文件 src/pages/workspace/panels/timeline/videoStyles.ts。
// 用法：VIDEO_STYLES_DIR=/path/to/assets/video-styles bun apps/web/scripts/generateVideoStyles.ts
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface StyleItem {
  slug: string;
  name: string;
  summary: string;
  tech: string;
  use: string;
  mood: string;
}

interface StyleGroup {
  name: string;
  styles: StyleItem[];
}

interface StyleSections {
  essence?: string;
  colors?: string;
  fonts?: string;
  motion?: string;
}

const outputPath = resolve(import.meta.dir, "../src/pages/workspace/panels/timeline/videoStyles.ts");

const stylesDir = process.env.VIDEO_STYLES_DIR
  ? resolve(process.env.VIDEO_STYLES_DIR)
  : resolve(import.meta.dir, "../../../../assets/video-styles");

const sectionKeys = {
  "本质 / 不是什么": "essence",
  "配色": "colors",
  "字体": "fonts",
  "运动": "motion",
} as const;

async function main() {
  const indexText = await readFile(resolve(stylesDir, "INDEX.md"), "utf8");
  const groups = parseIndex(indexText);

  const files = (await readdir(stylesDir)).filter(name => name.endsWith(".md") && name !== "INDEX.md" && name !== "_template.md");
  const sections: Record<string, StyleSections> = {};
  const names: Record<string, string> = {};

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const text = await readFile(resolve(stylesDir, file), "utf8");
    names[slug] = parseName(text);
    sections[slug] = parseSections(text);
  }

  for (const group of groups) {
    for (const style of group.styles) {
      style.name = names[style.slug] ?? style.slug;
    }
  }

  const output = render(groups, sections);
  await writeFile(outputPath, output, "utf8");
  console.log(`已生成 ${outputPath}（${groups.length} 组，${files.length} 个风格）`);
}

function parseIndex(text: string): StyleGroup[] {
  const groups: StyleGroup[] = [];
  let current: StyleGroup | null = null;
  let inTable = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "## 目录") { inTable = true; continue; }
    if (inTable && trimmed.startsWith("## ")) break;
    if (!inTable || !trimmed.startsWith("|")) continue;
    const cells = line.split("|").map(cell => cell.trim());
    if (cells.length < 8) continue;
    const group = cells[1];
    const file = cells[2];
    const summary = cells[3];
    const tech = cells[4];
    const use = cells[5];
    const mood = cells[6];
    const slugMatch = file.match(/`([^`]+)\.md`/);
    if (!slugMatch) continue;
    if (group) {
      current = { name: group, styles: [] };
      groups.push(current);
    }
    current?.styles.push({ slug: slugMatch[1], name: "", summary, tech, use, mood });
  }
  return groups;
}

function parseName(text: string): string {
  const first = text.split("\n")[0].trim();
  const match = first.match(/^# (.+?)（(.+)）$/);
  return match ? match[1].trim() : first.replace(/^#\s*/, "");
}

function parseSections(text: string): StyleSections {
  const buffers: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of text.split("\n")) {
    const match = line.match(/^## (.+)$/);
    if (match) {
      const title = match[1].trim();
      const key = sectionKeys[title as keyof typeof sectionKeys];
      current = key ?? null;
      if (key) buffers[key] = [];
      continue;
    }
    if (current) buffers[current].push(line);
  }
  const result: StyleSections = {};
  for (const [key, lines] of Object.entries(buffers)) {
    const value = lines.join("\n").trim();
    if (value) result[key as keyof StyleSections] = value;
  }
  return result;
}

function render(groups: StyleGroup[], sections: Record<string, StyleSections>): string {
  const header = [
    "// 本文件由 apps/web/scripts/generateVideoStyles.ts 从 assets/video-styles 生成，勿手工修改。",
    "// 重新生成：VIDEO_STYLES_DIR=/path/to/assets/video-styles bun apps/web/scripts/generateVideoStyles.ts",
    "",
    "export interface StyleItem {",
    "  slug: string;",
    "  name: string;",
    "  summary: string;",
    "  tech: string;",
    "  use: string;",
    "  mood: string;",
    "}",
    "",
    "export interface StyleGroup {",
    "  name: string;",
    "  styles: StyleItem[];",
    "}",
    "",
    "export interface StyleSections {",
    "  essence?: string;",
    "  colors?: string;",
    "  fonts?: string;",
    "  motion?: string;",
    "}",
    "",
  ].join("\n");
  return `${header}export const styleGroups: StyleGroup[] = ${JSON.stringify(groups, null, 2)};\n\nexport const styleSections: Record<string, StyleSections> = ${JSON.stringify(sections, null, 2)};\n`;
}

void main();
