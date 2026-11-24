import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync, mkdtemp, mkdir, readFile, rm, writeFile } from "@lumo/file";
import { tmpdir } from "node:os";
import { lockWorkspaceFiles, resolveWorkspacePath, writeWorkspaceFile } from "@/utils/workspace/files";
import { beatSeconds, buildTemplateMusic } from "./templateMusic";
import { lowerThird, lowerThirdHtml, type LowerThirdEffectId } from "./lowerThird";

// ACT: 首版只内置一套竖屏模板（5 段），素材段可缺省，缺省时自动缩短总时长。
export type TemplateSlots = {
  title?: string;
  subtitle?: string;
  claim?: string;
  cta?: string;
  screenPath?: string;
  resultPath?: string;
  themeId?: string;
  titleCard?: { shotId: "paper-title-card"; text: string };
};

export type TemplateResult = { output: string; seconds: number; segments: number };

const width = 1080;
const height = 1920;
const fps = 30;
const fontStack = '-apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

function scriptPath() {
  const candidates = [join(import.meta.dir, "renderCards.mjs"), join(import.meta.dir, "showcase", "renderCards.mjs")];
  const found = candidates.find(path => existsSync(path));
  if (!found) throw Object.assign(new Error("模板渲染脚本缺失，请重新安装 Lumo"), { status: 503 });
  return found;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const templateThemes = {
  "coral-noir": { name: "珊瑚暗夜", bg: "#0e0e0d", surface: "#1a1917", ink: "#f5f0e8", muted: "#8f8981", accent: "#d97757", accentInk: "#0e0e0d" },
  "claude-light": { name: "橙光白", bg: "#f0eee6", surface: "#e8e4d8", ink: "#1f1e1d", muted: "#6b675e", accent: "#d97757", accentInk: "#1f1e1d" },
  "amber-noir": { name: "琥珀黑金", bg: "#0c0a08", surface: "#181512", ink: "#ffffff", muted: "#8f8a84", accent: "#c9a45a", accentInk: "#0c0a08" },
  "blueprint-stone": { name: "蓝图纸", bg: "#dfdedb", surface: "#d3d2ce", ink: "#26251e", muted: "#5f5d55", accent: "#2456d6", accentInk: "#f7f8fa" },
  "celadon-paper": { name: "青瓷白", bg: "#f7f9f8", surface: "#ebf0ee", ink: "#06525c", muted: "#2f737d", accent: "#06525c", accentInk: "#f7f9f8" },
  "graphite-signal": { name: "石墨信号", bg: "#18191b", surface: "#222427", ink: "#eff0f1", muted: "#9c9ea3", accent: "#ff4a1f", accentInk: "#18191b" },
} as const;

function paperTitleCardHtml(text: string, theme: typeof templateThemes[keyof typeof templateThemes]) {
  const escaped = escapeHtml(text);
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
html,body{margin:0;background:${theme.bg};overflow:hidden}#stage{width:${width}px;height:${height}px;display:flex;flex-direction:column;justify-content:center;padding:150px 96px 220px;background:${theme.surface};color:${theme.ink};font-family:${fontStack}}
.title{font-family:Georgia,"Songti SC",serif;font-size:92px;font-weight:700;line-height:1.18;max-width:100%}.rule{width:180px;height:6px;margin-top:40px;background:${theme.accent};transform-origin:left}
</style><div id="stage"><div class="title">${escaped}</div><div class="rule"></div></div><script>const title=document.querySelector('.title'),rule=document.querySelector('.rule');window.renderFrame=t=>{const p=Math.max(0,Math.min(1,t/.45));title.style.opacity=String(p);title.style.transform='translateY('+((1-p)*24)+'px)';rule.style.transform='scaleX('+Math.max(0,Math.min(1,(t-.55)/.4))+')';if(t>1.7)document.getElementById('stage').style.opacity=String(Math.max(0,1-(t-1.7)/.3))};window.renderFrame(0)</script></html>`;
}

function cardHtml(options: { eyebrow: string; title: string; body?: string; themeId: keyof typeof templateThemes }) {
  const theme = templateThemes[options.themeId];
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
html,body{margin:0;background:${theme.bg};overflow:hidden}
#stage{position:relative;width:${width}px;height:${height}px;background:radial-gradient(120% 80% at 50% 0%, ${theme.surface} 0%, ${theme.bg} 72%);
  color:${theme.ink};font-family:${fontStack};box-sizing:border-box;padding:150px 96px 220px;
  display:flex;flex-direction:column;justify-content:center;gap:36px}
.eyebrow{color:${theme.accent};font-size:40px;font-weight:700;letter-spacing:.22em}
.title{font-size:96px;font-weight:900;line-height:1.16;letter-spacing:-.01em}
.body{font-size:44px;font-weight:500;line-height:1.5;color:${theme.muted}}
.rule{width:120px;height:8px;background:${theme.accent};border-radius:8px}
</style><div id="stage"><div class="rule"></div><div class="eyebrow">${escapeHtml(options.eyebrow)}</div>
<div class="title">${escapeHtml(options.title)}</div>${options.body ? `<div class="body">${escapeHtml(options.body)}</div>` : ""}</div>
<script>window.renderFrame=t=>{const s=document.getElementById('stage');const p=Math.min(1,Math.max(0,t/0.55));
const e=1-Math.pow(1-p,3);s.style.opacity=String(p);s.style.transform='translateY('+((1-e)*40).toFixed(1)+'px)';};</script></html>`;
}

function run(command: string, args: string[], signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    // Let renderCards stop Chrome before the caller removes the render directory.
    const abort = () => { child.kill("SIGTERM"); };
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", error => { signal?.removeEventListener("abort", abort); reject(error); });
    child.on("close", code => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) {
        const timedOut = signal.reason?.name === "TimeoutError";
        reject(Object.assign(new Error(timedOut ? "渲染超时" : "渲染已取消"), { status: timedOut ? 504 : 499 }));
      } else if (code === 0) resolve();
      else reject(Object.assign(new Error(stderr.trim().slice(-400) || `渲染进程退出码 ${code}`), { status: 500 }));
    });
  });
}

function mediaArgs(input: string, seconds: number, output: string, still: boolean) {
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1${still ? "" : `,tpad=stop_mode=clone:stop_duration=${seconds}`}`;
  return [
    "-v", "error", "-y", ...(still ? ["-loop", "1"] : []), "-i", input,
    "-map", "0:v:0", "-vf", filter, "-frames:v", String(Math.round(seconds * fps)), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps), output,
  ];
}

export async function renderTemplate(workspace: string, outputPath: string, slots: TemplateSlots, signal?: AbortSignal): Promise<TemplateResult> {
  const title = slots.title?.trim();
  if (!title) throw Object.assign(new Error("请填写模板标题"), { status: 400 });
  const themeId = slots.themeId || "coral-noir";
  if (!Object.hasOwn(templateThemes, themeId)) throw Object.assign(new Error("模板主题无效"), { status: 400 });
  const target = await resolveWorkspacePath(workspace, outputPath, true);
  await mkdir(join(workspace, "exports"), { recursive: true }).catch(() => {});
  const work = await mkdtemp(join(tmpdir(), "lumo-template-"));
  const segments: string[] = [];
  let beats = 0;

  try {
    const order: ({ beats: number; html: string } | { beats: number; path: string })[] = [
      { beats: 6, html: cardHtml({ eyebrow: "LUMO", title, body: slots.subtitle?.trim() || undefined, themeId: themeId as keyof typeof templateThemes }) },
      ...(slots.screenPath ? [{ beats: 8, path: slots.screenPath }] : []),
      ...(slots.titleCard?.text.trim() ? [{ beats: 4, html: paperTitleCardHtml(slots.titleCard.text.trim(), templateThemes[themeId as keyof typeof templateThemes]) }] : []),
      { beats: 5, html: cardHtml({ eyebrow: "一句话", title: slots.claim?.trim() || title, themeId: themeId as keyof typeof templateThemes }) },
      ...(slots.resultPath ? [{ beats: 6, path: slots.resultPath }] : []),
      { beats: 5, html: cardHtml({ eyebrow: "下一步", title: slots.cta?.trim() || "现在就去试", themeId: themeId as keyof typeof templateThemes }) },
    ];

    const script = scriptPath();
    for (const [position, step] of order.entries()) {
      signal?.throwIfAborted();
      const out = join(work, `seg-${position}.mp4`);
      const seconds = step.beats * beatSeconds;
      if ("html" in step) {
        const htmlPath = join(work, `card-${position}.html`);
        await writeFile(htmlPath, step.html);
        const jobPath = join(work, `job-${position}.json`);
        await writeFile(jobPath, JSON.stringify({ htmlPath, out, seconds, fps, width, height, settle: 0.9 }));
        await run("node", [script, "--input", jobPath], signal);
      } else {
        const source = await resolveWorkspacePath(workspace, step.path);
        await run("ffmpeg", mediaArgs(source.path, seconds, out, /\.(png|jpe?g|webp|bmp)$/i.test(source.path)), signal);
      }
      beats += step.beats;
      segments.push(out);
    }

    const listPath = join(work, "segments.txt");
    await writeFile(listPath, segments.map(path => `file '${path.replace(/'/g, "'\\''")}'`).join("\n"));
    const musicPath = join(work, "music.wav");
    await writeFile(musicPath, buildTemplateMusic(beats));
    await run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-i", musicPath,
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", target.path], signal);
    return { output: outputPath, seconds: beats * beatSeconds, segments: segments.length };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function renderLowerThird(workspace: string, text: { kicker: string; name: string }, signal: AbortSignal, effectId: LowerThirdEffectId = "lt-kicker-name") {
  signal.throwIfAborted();
  const script = scriptPath();
  const output = `assets/effects/lowerThird${crypto.randomUUID().replaceAll("-", "")}.webm`;
  const work = await mkdtemp(join(tmpdir(), "lumo-effect-"));
  try {
    const htmlPath = join(work, "effect.html");
    const jobPath = join(work, "job.json");
    const out = join(work, "effect.webm");
    await writeFile(htmlPath, lowerThirdHtml(text, effectId));
    // No settle time: the exit animates after the hold.
    await writeFile(jobPath, JSON.stringify({ htmlPath, out, ...lowerThird, transparent: true }));
    signal.throwIfAborted();
    await run("node", [script, "--input", jobPath], signal);
    const bytes = await readFile(out, { signal });

    const target = await resolveWorkspacePath(workspace, output, true);
    const release = lockWorkspaceFiles([target.path]);
    try {
      signal.throwIfAborted();
      await mkdir(dirname(target.path), { recursive: true });
      const checked = await resolveWorkspacePath(workspace, output);
      if (checked.path !== target.path) throw Object.assign(new Error("动效输出路径已改变"), { status: 409 });
      signal.throwIfAborted();
      await writeWorkspaceFile(checked.path, bytes, true);
    } finally { release(); }
    return { output, ...lowerThird };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
