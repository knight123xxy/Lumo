import { constants, copyFile, existsSync, mkdir, mkdtemp, readFile, realpath, stat, symlink, writeAtomic } from "@lumo/file";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readOpenFilmLegacy } from "./openFilmLegacy";

async function prepareStudioEditor(entry: string, runtime: string, parentOrigin: string) {
  const upstream = resolve(dirname(entry), "../ui/dist");
  const html = await readFile(resolve(upstream, "index.html"), "utf8");
  if (!html.includes("</head>")) throw new Error("OpenFilm Studio 界面构建无效");
  const editor = resolve(runtime, "editor");
  await mkdir(editor);
  await symlink(resolve(upstream, "assets"), resolve(editor, "assets"), "dir");
  const bridge = `
    const lumoOrigin = ${JSON.stringify(parentOrigin)};
    window.openfilmHost = {
      version: 1, name: "Lumo",
      onSelection(selection) {
        const clips = selection.refs.filter(ref => ref.kind === "clip" && ref.clipKind === "video" && typeof ref.id === "string")
          .slice(0, 32).map(ref => ({ id: ref.id, start: ref.start, end: ref.end, sourceIn: ref.in ?? 0, speed: ref.speed ?? 1, disabled: ref.disabled }));
        window.parent.postMessage({ type: "lumoStudioSelection", projectId: selection.projectId, clipIds: clips.map(clip => clip.id), clips, range: selection.range }, lumoOrigin);
      },
      refer(ref) {
        const match = /^\\/projects\\/([^/]+)\\/?$/.exec(location.pathname);
        if (!match || ref.kind !== "region") return;
        const { time, box, clipIds, image } = ref;
        window.parent.postMessage({ type: "lumoStudioRegion", projectId: decodeURIComponent(match[1]), time, box,
          clipIds: clipIds.slice(0, 32), stage: image?.stage }, lumoOrigin);
      },
    };
  `;
  // 在 Studio 初始化前注册宿主回调，保留上游构建的资源路径。
  const embeddedHtml = html.replace(/<title>[^<]*<\/title>/i, "<title>Lumo</title>");
  await writeAtomic(resolve(editor, "index.html"), embeddedHtml.replace(/<script\b|<\/head>/i, match => `<style>[role="img"][aria-label="OpenFilm"] { display: none !important; }</style><script>${bridge}</script>${match}`));
  const launcher = resolve(runtime, "studio.mjs");
  await writeAtomic(launcher, `
    import { startStudio } from ${JSON.stringify(pathToFileURL(resolve(dirname(entry), "server.mjs")).href)};
    const studio = await startStudio({ port: 0, advertise: true, editorDir: ${JSON.stringify(editor)} });
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => studio.close().then(() => process.exit(0)));
  `);
  return launcher;
}

type StudioClip = { id: string; src: string; at?: number; time?: [number, number]; speed?: number; sound?: boolean; disabled?: true; volume?: number; overrides?: { at?: string; fade?: [number, number] }[] };
const videoTypes: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm" };

type DraftMedia = { source: string; inPoint: number; outPoint: number; timelineStart: number; speed: number; volume: number };
type DraftCaption = { text: string; timelineStart: number; timelineDuration: number };

function readDraft(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("成片草稿无效");
  const draft = input as { id?: unknown; video?: unknown; audio?: unknown; subtitles?: unknown };
  if (typeof draft.id !== "string" || !/^[a-f0-9-]{36}$/.test(draft.id)) throw new Error("成片草稿标识无效");
  function media(items: unknown): DraftMedia[] {
    if (!Array.isArray(items) || !items.length || items.length > 6) throw new Error("成片媒体轨无效");
    for (const clip of items) {
      if (!clip || typeof clip.source !== "string" || !clip.source || !Number.isFinite(clip.inPoint) || clip.inPoint < 0
        || !Number.isFinite(clip.outPoint) || clip.outPoint <= clip.inPoint || !Number.isFinite(clip.timelineStart) || clip.timelineStart < 0
        || !Number.isFinite(clip.speed) || clip.speed < 0.1 || clip.speed > 16 || !Number.isFinite(clip.volume) || clip.volume < 0 || clip.volume > 2) {
        throw new Error("成片媒体片段无效");
      }
    }
    return items;
  }
  if (!Array.isArray(draft.subtitles) || !draft.subtitles.length || draft.subtitles.length > 6) throw new Error("成片字幕轨无效");
  for (const cue of draft.subtitles) {
    if (!cue || typeof cue.text !== "string" || !cue.text.trim() || cue.text.length > 120 || /[\x00-\x09\x0b\x0c\x0e-\x1f]/.test(cue.text)
      || !Number.isFinite(cue.timelineStart) || cue.timelineStart < 0 || !Number.isFinite(cue.timelineDuration) || cue.timelineDuration <= 0) {
      throw new Error("成片字幕无效");
    }
  }
  return { id: draft.id, video: media(draft.video), audio: media(draft.audio), subtitles: draft.subtitles as DraftCaption[] };
}

function cueText(text: string) {
  // WebVTT treats a blank line as the end of a cue.
  return text.split(/\r\n?|\n/).filter(line => line.trim()).join("\n")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function cueTime(ms: number) {
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

function serializeCue(start: number, duration: number, text: string) {
  const from = Math.round(start * 1000);
  const to = Math.max(from + 1, Math.round((start + duration) * 1000));
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0) throw new Error("Studio 字幕时码无效");
  return `${cueTime(from)} --> ${cueTime(to)}\n${cueText(text)}`;
}

function stageFromMedia(width: unknown, height: unknown) {
  const valid = (side: unknown): side is number => typeof side === "number" && Number.isInteger(side) && side > 0 && side <= 8192;
  if (valid(width) && valid(height)) return { op: "stage", w: width, h: height };
}

function containsPath(root: string, path: string) {
  const local = relative(root, path);
  return Boolean(local) && !isAbsolute(local) && local.split(sep)[0] !== "..";
}

export function openFilmRuntime(bundle?: string) {
  if (process.platform !== "darwin") return;
  if (process.env.LUMO_OPENFILM_ENTRY) return {
    entry: process.env.LUMO_OPENFILM_ENTRY,
    node: process.env.LUMO_OPENFILM_NODE,
    browsers: process.env.LUMO_OPENFILM_BROWSERS,
  };
  if (!bundle) return;
  const entry = resolve(bundle, "source/packages/openfilm/studio/server/main.mjs");
  if (existsSync(entry)) return { entry, node: resolve(bundle, "node"), browsers: resolve(bundle, "browsers") };
}

export default async function startOpenFilmStudio(dataDirectory: string, parentOrigin?: string, bundle?: string,
  mediaTools?: { ffmpeg: string; ffprobe: string }) {
  const config = openFilmRuntime(bundle);
  if (!config) return;
  const { entry, node, browsers } = config;
  if (![entry, node, browsers].every(path => path && isAbsolute(path))) {
    throw new Error("OpenFilm 原型需要绝对的服务入口、Node 和 Chromium 路径");
  }

  const tools = mediaTools ?? { ffmpeg: Bun.which("ffmpeg"), ffprobe: Bun.which("ffprobe") };
  if (!tools.ffmpeg || !tools.ffprobe || !isAbsolute(tools.ffmpeg) || !isAbsolute(tools.ffprobe)) {
    throw new Error("OpenFilm Studio 需要可用的 FFmpeg 和 FFprobe");
  }
  const ffmpeg: string = tools.ffmpeg;
  const ffprobe: string = tools.ffprobe;
  const studioRoot = resolve(dataDirectory, "openFilmStudio");
  await mkdir(studioRoot, { recursive: true, mode: 0o700 });
  const runtime = await mkdtemp(resolve(studioRoot, "session-"));
  // 固定版本把视觉模型放在会话目录下。仅共享模型目录，让运行记录和会话凭据继续隔离。
  const visionCache = resolve(studioRoot, "visionModels");
  await mkdir(visionCache, { recursive: true, mode: 0o700 });
  if (await realpath(visionCache) !== resolve(await realpath(studioRoot), "visionModels")) {
    throw new Error("Studio 视觉模型缓存目录无效");
  }
  const sessionCache = resolve(runtime, "cache");
  await mkdir(sessionCache);
  await symlink(visionCache, resolve(sessionCache, "vision"), "dir");
  // Studio invokes both tools by name. Pin the pair in this session even if Lumo selected tools from different directories.
  const mediaBin = resolve(runtime, "mediaBin");
  await mkdir(mediaBin);
  await Promise.all([symlink(ffmpeg, resolve(mediaBin, "ffmpeg")), symlink(ffprobe, resolve(mediaBin, "ffprobe"))]);
  // ACT: 原型隔离项目和凭据，正式版将由 Lumo 项目入口授权和登记工程。
  const offline = "http://127.0.0.1:9";
  const launcher = parentOrigin ? await prepareStudioEditor(entry, runtime, parentOrigin) : entry;
  const child = spawn(node!, [launcher], {
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      PATH: [mediaBin, process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin"].join(":"),
      OPENFILM_HOME: runtime,
      OPENFILM_VISION_CURL: "1",
      OPENFILM_SHARED_HOME: studioRoot,
      OPENFILM_LIBRARY: resolve(studioRoot, "projects"),
      OPENFILM_EXPORTS: resolve(studioRoot, "exports"),
      OPENFILM_SAVED: resolve(studioRoot, "saved"),
      OPENFILM_SKILLS: resolve(studioRoot, "skills"),
      OPENFILM_LIBRARY_CACHE: resolve(studioRoot, "cache"),
      OPENFILM_TRASH_DIR: resolve(studioRoot, "trash"),
      OPENFILM_STUDIO_WORKER: "1",
      OPENFILM_STUDIO_PORT: "0",
      OPENFILM_NO_UPDATE_CHECK: "1",
      OPENFILM_API_URL: offline,
      OPENFILM_COMMUNITY_LIBRARY_URL: `${offline}/catalog`,
      OPENFILM_EXAMPLES_INDEX: `${offline}/index.json`,
      PLAYWRIGHT_BROWSERS_PATH: browsers,
    },
  });
  let failure: Error | undefined;
  let closing: Promise<void> | undefined;
  const exited = Promise.withResolvers<void>();
  child.on("error", error => { failure = error; });
  child.on("exit", () => { failure ??= new Error("OpenFilm Studio 已退出"); });
  child.once("close", () => exited.resolve());
  function close() {
    closing ??= (async () => {
      if (!child.kill("SIGTERM")) return;
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      try { await exited.promise; }
      finally { clearTimeout(timer); }
    })();
    return closing;
  }
  try {
    // 冷启动还需要初始化编辑器、镜头预览和插件服务，预留时间，同时早于前端请求超时。
    const startupTimeout = AbortSignal.timeout(25_000);
    while (!startupTimeout.aborted) {
      if (failure) throw failure;
      const text = await readFile(resolve(runtime, "run.json"), "utf8").catch(error => {
        if (error.code !== "ENOENT") throw error;
      });
      if (text) {
        const record = JSON.parse(text);
        const origin = typeof record.origin === "string" ? record.origin : "";
        if (record.pid !== child.pid || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin) || !/^[a-f0-9]{48}$/.test(record.key)) {
          throw new Error("OpenFilm Studio 运行记录无效");
        }
        const health = await fetch(`${origin}/api/health`, {
          signal: AbortSignal.any([startupTimeout, AbortSignal.timeout(1000)]),
        }).then(async response => response.ok && (await response.json()).product === "openfilm-studio").catch(() => false);
        if (!health) {
          await Bun.sleep(75);
          continue;
        }
        const key = record.key as string;
        const projectsRoot = resolve(studioRoot, "projects");
        async function accessProject(directory: string, videoPath?: string, draftInput?: unknown, overlayAt?: number, clipTiming?: unknown) {
          let timing: { time: [number, number]; speed: number; volume?: number; overrides?: { fade: [number, number] }[] } | undefined;
          if (clipTiming !== undefined) {
            if (!videoPath || !clipTiming || typeof clipTiming !== "object") throw new Error("Studio 片段时码无效");
            const { inPoint, outPoint, speed, volume } = clipTiming as Record<string, unknown>;
            if (volume !== undefined && (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 2)) {
              throw new Error("Studio 片段音量无效");
            }
            if (typeof inPoint !== "number" || typeof outPoint !== "number" || typeof speed !== "number"
              || ![inPoint, outPoint, speed].every(Number.isFinite) || inPoint < 0 || outPoint <= inPoint
              || speed < 0.1 || speed > 16) throw new Error("Studio 片段时码无效");
            const from = Math.round(inPoint * 1000);
            const to = Math.round(outPoint * 1000);
            if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) throw new Error("Studio 片段时码无法按毫秒保存");
            const { fadeIn = 0, fadeOut = 0 } = clipTiming as Record<string, unknown>;
            if (typeof fadeIn !== "number" || typeof fadeOut !== "number"
              || ![fadeIn, fadeOut].every(Number.isFinite) || fadeIn < 0 || fadeOut < 0) throw new Error("Studio 音频淡入淡出无效");
            const fade: [number, number] = [Math.round(fadeIn * 1000) / 1000, Math.round(fadeOut * 1000) / 1000];
            const hasFade = fade.some(value => value > 0);
            // Studio 的视频淡入淡出也会改变画面，旧剪辑器只对独立音频应用音量包络。
            if (hasFade && !/\.mp3$/i.test(videoPath)) throw new Error("仅独立口播音频支持发送淡入淡出");
            if (fade[0] + fade[1] > (to - from) / 1000 / speed + 1e-9) throw new Error("Studio 音频淡入淡出超过片段时长");
            timing = { time: [from / 1000, to / 1000], speed, volume, ...(hasFade ? { overrides: [{ fade }] } : {}) };
          }
          if (overlayAt !== undefined && (!videoPath || !/\.webm$/i.test(videoPath) || !Number.isFinite(overlayAt) || overlayAt < 0)) {
            throw new Error("Studio 动效位置或格式无效");
          }
          if (!isAbsolute(directory)) throw new Error("Lumo 项目目录无效");
          const canonical = await realpath(directory);
          const workspace = await stat(canonical, { bigint: true });
          if (!workspace.isDirectory()) throw new Error("Lumo 项目目录无效");
          let source: string | undefined;
          const audioOnly = videoPath !== undefined && /\.mp3$/i.test(videoPath);
          if (videoPath !== undefined) {
            const extension = extname(videoPath).toLowerCase();
            if (isAbsolute(videoPath) || !containsPath(canonical, resolve(canonical, videoPath)) || !(audioOnly || Object.hasOwn(videoTypes, extension))) {
              throw new Error("请选择项目内的视频或 MP3 文件");
            }
            source = await realpath(resolve(canonical, videoPath));
            if (!containsPath(canonical, source) || !(await stat(source)).isFile()) throw new Error("媒体超出 Lumo 项目目录");
          }
          const bindings = resolve(studioRoot, "workspaceBindings");
          await mkdir(bindings, { recursive: true, mode: 0o700 });
          // ACT: APFS 同卷改名或移动保留目录身份。复制、跨卷移动和整个工作区替换需要重新关联。
          const identity = createHash("sha256").update(`workspace:${workspace.dev}:${workspace.ino}:${workspace.birthtimeNs}`).digest("hex");
          const binding = resolve(bindings, `${identity}.json`);
          const readBinding = (path: string) => readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
          let id = await readBinding(binding);
          if (id === undefined) {
            const legacyId = createHash("sha256").update(canonical).digest("hex");
            let candidate = identity;
            if (existsSync(resolve(projectsRoot, legacyId, "film.html"))) {
              const claim = resolve(bindings, `${legacyId}.owner`);
              await writeAtomic(claim, identity, { exclusive: true }).catch((error: NodeJS.ErrnoException) => {
                if (error.code !== "EEXIST") throw error;
              });
              if (await readBinding(claim) === identity) candidate = legacyId;
            }
            await writeAtomic(binding, candidate, { exclusive: true }).catch((error: NodeJS.ErrnoException) => {
              if (error.code !== "EEXIST") throw error;
            });
            id = await readBinding(binding);
          }
          if (!id || !/^[a-f0-9]{64}$/.test(id)) throw new Error("OpenFilm Studio 工程关联无效");
          const projectPath = resolve(projectsRoot, id);
          await mkdir(projectPath, { recursive: true });
          if (await realpath(projectPath) !== resolve(await realpath(projectsRoot), id)) {
            throw new Error("OpenFilm Studio 工程目录无效");
          }
          const session = new URL("/open", origin);
          session.searchParams.set("key", key);
          const response = await fetch(session, { redirect: "manual", signal: AbortSignal.timeout(5000) });
          const cookie = response.headers.getSetCookie()[0]?.split(";", 1)[0];
          if (response.status !== 302 || !cookie) throw new Error("OpenFilm Studio 会话建立失败");
          const opened = await fetch(new URL("/api/projects", origin), {
            method: "POST",
            headers: { cookie, origin, "content-type": "application/json" },
            body: JSON.stringify({ path: projectPath }),
            signal: AbortSignal.timeout(5000),
          });
          if (!opened.ok) throw new Error(`OpenFilm Studio 打开工程失败（${opened.status}）`);
          const { project } = await opened.json();
          if (typeof project?.id !== "string" || !project.id) throw new Error("OpenFilm Studio 工程信息无效");
          const projectRoute = `/projects/${encodeURIComponent(project.id)}`;
          async function call(path: string, body?: unknown, options?: { method?: "DELETE" | "PATCH"; signal?: AbortSignal }) {
            const response = await fetch(`${origin}/api${projectRoute}${path}`, {
              method: options?.method ?? (body === undefined ? "GET" : "POST"),
              headers: { "x-studio-key": key, "content-type": "application/json" },
              body: body === undefined ? undefined : JSON.stringify(body),
              signal: options?.signal ?? AbortSignal.timeout(30_000),
            });
            if (path === "/lumo-edit" && response.status === 409) throw new Error("Studio 时间线已更新，请重新打开工程后重试");
            if (path === "/lumo-edit" && response.status === 404) throw new Error("Studio 不支持版本校验写入，请更新内置运行时后重试");
            if (!response.ok) throw new Error(`Studio 工程操作失败（${response.status}）`);
            return response.json();
          }
          async function readFilm() {
            const film = await call("");
            if (!Array.isArray(film.doc?.tracks) || typeof film.rev !== "string") throw new Error("Studio 时间线无法读取");
            const tracks: { clips: StudioClip[]; captions?: { src: string } }[] = film.doc.tracks;
            const clips = tracks.flatMap(track => track.clips);
            const captionSources = tracks.flatMap(track => track.captions ? [track.captions.src] : []);
            // ACT: 仅空白且仍使用 Studio 默认尺寸的工程随首个画面素材设定尺寸。
            const canSetStage = !clips.length && !captionSources.length && film.doc.stage?.w === 1920 && film.doc.stage?.h === 1080;
            return { tracks, clips, captionSources, canSetStage, stage: film.doc.stage, revision: film.rev as string };
          }
          const probe = (path: string) => call(`/media?what=probe&path=${encodeURIComponent(path)}`);
          async function appendPosition(clips: StudioClip[], captionSources: string[]) {
            const ends = await Promise.all(clips.map(async clip => {
              const end = clip.time?.[1] ?? (await probe(clip.src)).duration;
              if (!Number.isFinite(end)) throw new Error("无法确定 Studio 时间线长度");
              return (clip.at ?? 0) + (end - (clip.time?.[0] ?? 0)) / (clip.speed ?? 1);
            }));
            let end = ends.reduce((latest, next) => Math.max(latest, next), 0);
            if (captionSources.length) {
              // 使用固定版本 Studio 的 WebVTT 解析器，沿用编辑器对字幕时码的解释。
              const { readVtt } = await import(pathToFileURL(resolve(dirname(entry), "../../src/captions.mjs")).href) as {
                readVtt(text: string): { cues: { start: number; end: number }[] };
              };
              for (const src of new Set(captionSources)) {
                const { text } = await call(`/caption-tracks/file?src=${encodeURIComponent(src)}`);
                if (typeof text !== "string") throw new Error("无法读取 Studio 字幕时码");
                for (const cue of readVtt(text).cues) {
                  if (Number.isFinite(cue.end) && cue.end > cue.start) end = Math.max(end, cue.end);
                }
              }
            }
            // Studio 将片段起点保存到毫秒。变速后若结束点落在两毫秒之间，向上对齐以防重叠。
            const endMs = end * 1000;
            const rounded = Math.round(endMs);
            return (Math.abs(endMs - rounded) < 1e-7 ? rounded : Math.ceil(endMs)) / 1000;
          }
          if (source) {
            const { tracks, clips, captionSources, canSetStage, revision } = await readFilm();
            const at = overlayAt ?? await appendPosition(clips, captionSources);
            const { landed } = await call("/files/bring", { paths: [source], mode: "copy" });
            const src = landed?.[0];
            if (typeof src !== "string" || !src) throw new Error("Studio 未导入视频文件");
            const { duration, width, height, alpha, audio } = await probe(src);
            const playable = audioOnly ? audio === true : width > 0 && height > 0;
            if (!Number.isFinite(duration) || duration <= 0 || !playable) throw new Error("无法读取媒体的时长或轨道");
            if (overlayAt !== undefined && alpha !== true) throw new Error("Studio 无法识别视频的透明通道");
            const stage = canSetStage && !audioOnly && overlayAt === undefined ? stageFromMedia(width, height) : undefined;
            if (timing && timing.time[1] > duration + 0.001) throw new Error("Studio 片段出点超出源素材时长");
            const firstMediaTrack = tracks.findIndex(track => !track.captions);
            // 保留置顶字幕轨，让新动效叠在已有画面上方。
            const overlayTrack = firstMediaTrack === -1 ? tracks.length : firstMediaTrack;
            const overlay = overlayAt !== undefined;
            const insert = { op: "insert", clip: { src, ...(timing ?? { time: [0, duration] }), ...(overlay ? { volume: 0 } : {}) }, at,
              ...(overlay ? { track: { insert: overlayTrack } } : {}) };
            await call("/lumo-edit", { base: revision, ops: stage ? [stage, insert] : [insert] });
          }
          if (draftInput !== undefined) {
            const draft = readDraft(draftInput);
            const { clips, captionSources, canSetStage, revision } = await readFilm();
            const captionName = `${draft.id}.vtt`;
            const captionSource = `captions/${captionName}`;
            // 字幕轨与媒体片段一并保存。重试时先查已提交的轨道，再访问源素材。
            if (captionSources.includes(captionSource)) {
              session.searchParams.set("to", projectRoute);
              return { url: session.href, readFilm, call, projectPath: await realpath(projectPath), canonical, workspace };
            }
            const sources = new Map<string, string>();
            for (const [kind, items] of [["video", draft.video], ["audio", draft.audio]] as const) {
              for (const clip of items) {
                const extension = extname(clip.source).toLowerCase();
                const candidate = resolve(canonical, clip.source);
                if (isAbsolute(clip.source) || !containsPath(canonical, candidate)
                  || !(kind === "video" ? Object.hasOwn(videoTypes, extension) : /^\.(mp3|wav|m4a|aac|ogg|opus|flac|webm)$/i.test(extension))) {
                  throw new Error("成片媒体类型或路径无效");
                }
                try {
                  const path = await realpath(candidate);
                  if (!containsPath(canonical, path)) throw new Error("成片媒体超出 Lumo 项目目录");
                  if (!(await stat(path)).isFile()) throw new Error(`成片素材不是文件（${basename(candidate)}）`);
                  sources.set(clip.source, path);
                } catch (error) {
                  const code = (error as NodeJS.ErrnoException).code;
                  if (code === "ENOENT" || code === "ENOTDIR") {
                    throw new Error(`找不到成片${kind === "video" ? "视频" : "配音"}素材（${basename(candidate)}），请恢复文件后重试。`, { cause: error });
                  }
                  throw error;
                }
              }
            }
            const start = await appendPosition(clips, captionSources);
            const imported = new Map<string, { src: string; duration: number; width: number; height: number; audio: boolean }>();
            for (const [path, sourcePath] of sources) {
              const { landed } = await call("/files/bring", { paths: [sourcePath], mode: "copy" });
              const src = landed?.[0];
              if (typeof src !== "string" || !src) throw new Error("Studio 未导入成片媒体");
              const { duration, width, height, audio } = await probe(src);
              if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
                throw new Error(`无法读取成片素材时长：${basename(path)}`);
              }
              imported.set(path, { src, duration, width, height, audio: audio === true });
            }
            const ops: object[] = [];
            const firstVideo = draft.video.reduce((first, clip) => clip.timelineStart < first.timelineStart ? clip : first);
            const firstSource = imported.get(firstVideo.source);
            if (canSetStage && firstSource) {
              const { width, height } = firstSource;
              const stage = stageFromMedia(width, height);
              if (stage) ops.push(stage);
            }
            for (const [track, items] of [draft.video, draft.audio].entries()) {
              for (const [index, clip] of items.entries()) {
                const source = imported.get(clip.source);
                const playable = source && (track === 0
                  ? Number.isFinite(source.width) && source.width > 0 && Number.isFinite(source.height) && source.height > 0
                  : source.audio);
                if (!source || !playable) throw new Error(`成片素材缺少${track === 0 ? "视频" : "音频"}轨道：${basename(clip.source)}`);
                if (clip.outPoint > source.duration + 0.001) throw new Error(`成片片段出点超出素材时长：${basename(clip.source)}`);
                const fromMs = Math.round(clip.inPoint * 1000);
                const toMs = Math.round(clip.outPoint * 1000);
                const atMs = Math.round((start + clip.timelineStart) * 1000);
                if (![fromMs, toMs, atMs].every(Number.isSafeInteger) || toMs <= fromMs) {
                  throw new Error(`成片片段时码无法按毫秒保存：${basename(clip.source)}`);
                }
                const sound = track === 1 && Object.hasOwn(videoTypes, extname(source.src).toLowerCase());
                ops.push({ op: "insert", track: index === 0 ? { insert: track } : track, at: atMs / 1000,
                  clip: { src: source.src, time: [fromMs / 1000, toMs / 1000], speed: clip.speed, volume: clip.volume, ...(sound ? { sound: true } : {}) } });
              }
            }
            const studioProject = await realpath(projectPath);
            const captionDirectory = resolve(studioProject, "captions");
            await mkdir(captionDirectory, { recursive: true });
            if (await realpath(captionDirectory) !== captionDirectory) throw new Error("Studio 字幕目录无效");

            const cues = draft.subtitles.map(cue => {
              const from = start + cue.timelineStart;
              return serializeCue(from, cue.timelineDuration, cue.text);
            });
            await writeAtomic(resolve(captionDirectory, captionName), `WEBVTT\n\n${cues.join("\n\n")}\n`);
            ops.push({ op: "captions", at: 0, captions: { src: captionSource, kind: "subtitles", label: "Lumo" } });
            await call("/lumo-edit", { base: revision, ops });
          }
          session.searchParams.set("to", projectRoute);
          return { url: session.href, readFilm, call, projectPath: await realpath(projectPath), canonical, workspace };
        }
        const projectWrites = new Map<string, Promise<void>>();
        async function queueProjectWrite<T>(directory: string, write: (canonical: string) => Promise<T>) {
          if (!isAbsolute(directory)) throw new Error("Lumo 项目目录无效");
          const canonical = await realpath(directory);
          const workspace = await stat(canonical, { bigint: true });
          const key = `${workspace.dev}:${workspace.ino}:${workspace.birthtimeNs}`;
          const previous = projectWrites.get(key) ?? Promise.resolve();
          const next = previous.then(async () => {
            const current = await stat(canonical, { bigint: true });
            if (!current.isDirectory() || current.dev !== workspace.dev || current.ino !== workspace.ino
              || current.birthtimeNs !== workspace.birthtimeNs) throw new Error("Lumo 项目目录已切换");
            return write(canonical);
          });
          const settled = next.then(() => {}, () => {});
          projectWrites.set(key, settled);
          try { return await next; }
          finally {
            if (projectWrites.get(key) === settled) projectWrites.delete(key);
          }
        }
        function appendToProject(directory: string, videoPath?: string, draft?: unknown, overlayAt?: number, clipTiming?: unknown) {
          return queueProjectWrite(directory, canonical => accessProject(canonical, videoPath, draft, overlayAt, clipTiming));
        }
        function importLegacy(directory: string) {
          return queueProjectWrite(directory, async directory => {
            const { url, canonical, projectPath, readFilm, call } = await accessProject(directory);
            const { tracks, clips, captionSources, revision } = await readFilm();
            const receiptPath = resolve(projectPath, "lumoLegacyImport.json");
            type TrackName = { name: string; index: number; clips: string[] };
            type MigrationSettings = { fps: number | null; trackNames: TrackName[] | null };
            type MigrationReceipt = {
              completed: boolean;
              tracks: { clips: string[]; caption?: string }[];
              previous: MigrationSettings;
              desired: MigrationSettings;
            };
            const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
            const readSettings = async (): Promise<MigrationSettings> => {
              const { settings } = await call("/settings");
              return { fps: settings?.fps ?? null, trackNames: settings?.trackNames ?? null };
            };
            async function finishMigration(receipt: MigrationReceipt) {
              const current = await readSettings();
              if (!same(current, receipt.desired)) {
                if (!same(current, receipt.previous)) throw new Error("Studio 工程设置已更改，请在 Studio 中核对帧率和轨道名称");
                try { await call("/settings", receipt.desired, { method: "PATCH" }); }
                catch (cause) {
                  throw new Error("Studio 时间线已复制，工程设置尚未保存。请再次点击「复制旧时间线到 Studio」续存设置", { cause });
                }
              }
              await writeAtomic(receiptPath, JSON.stringify({ ...receipt, completed: true }));
            }
            if (clips.length || captionSources.length) {
              const stored = await readFile(receiptPath, "utf8").catch((error: NodeJS.ErrnoException) => {
                if (error.code !== "ENOENT") throw error;
              });
              const receipt: MigrationReceipt | undefined = stored ? JSON.parse(stored) : undefined;
              const currentTracks = tracks.map(track => ({ clips: track.clips.map(clip => clip.id).sort(), caption: track.captions?.src }));
              if (receipt?.completed === false && same(currentTracks, receipt.tracks)) {
                await finishMigration(receipt);
                return url;
              }
              throw new Error("请在空白 Studio 时间线中导入旧剪辑副本");
            }
            const legacy = await readOpenFilmLegacy(canonical);
            const stage = stageFromMedia(legacy.width, legacy.height);
            if (!stage) throw new Error("旧剪辑画幅无效");
            const sources = new Map<string, { src: string; duration: number; alpha: boolean; width: number; height: number }>();
            const ops: object[] = [stage];
            const looks = new Map<string, string>();
            async function importLook(filter: string) {
              const existing = looks.get(filter);
              if (existing) return existing;
              const folder = resolve(projectPath, "looks");
              await mkdir(folder, { recursive: true });
              if (await realpath(folder) !== folder) throw new Error("Studio 调色目录无效");
              // Hald CLUT 的 RGB 排列与 .cube 一致，红色通道索引变化最快。
              const size = 36;
              const process = Bun.spawn([ffmpeg, "-v", "error", "-f", "lavfi", "-i", "haldclutsrc=level=6",
                "-vf", filter, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"],
                { stdout: "pipe", stderr: "ignore", signal: AbortSignal.timeout(20_000) });
              const rgb = new Uint8Array(await new Response(process.stdout).arrayBuffer());
              if (await process.exited || rgb.length !== size ** 3 * 3) throw new Error("无法转换旧剪辑滤镜，请检查 FFmpeg 滤镜支持");
              const rows = [`LUT_3D_SIZE ${size}`];
              const values = Array.from({ length: 256 }, (_, value) => (value / 255).toFixed(6));
              for (let i = 0; i < rgb.length; i += 3) rows.push(`${values[rgb[i]!]} ${values[rgb[i + 1]!]} ${values[rgb[i + 2]!]}`);
              const name = `${crypto.randomUUID()}.cube`;
              await writeAtomic(resolve(folder, name), `${rows.join("\n")}\n`, { exclusive: true });
              const style = `--of-lut: url(looks/${name})`;
              looks.set(filter, style);
              return style;
            }
            const stillLooks = new Map<string, string>();
            async function importStillLook(src: string, filter: string) {
              const key = JSON.stringify([src, filter]);
              const existing = stillLooks.get(key);
              if (existing) return existing;
              const folder = resolve(projectPath, "looks");
              await mkdir(folder, { recursive: true });
              if (await realpath(folder) !== folder) throw new Error("Studio 调色目录无效");
              const input = await realpath(resolve(projectPath, src));
              if (!containsPath(projectPath, input)) throw new Error("Studio 图片超出工程目录");
              // ACT: 固定版本的静态片段会跳过 3D LUT，使用保留原透明通道的图片副本。
              const graph = `format=rgba,split[picture][alpha];[alpha]alphaextract[mask];[picture]${filter},format=rgb24[color];[color][mask]alphamerge`;
              const relativePath = `looks/${crypto.randomUUID()}.png`;
              const conversion = Bun.spawn([ffmpeg, "-v", "error", "-nostdin", "-n", "-i", input,
                "-filter_complex", graph, "-frames:v", "1", resolve(projectPath, relativePath)],
                { stdout: "ignore", stderr: "ignore", signal: AbortSignal.timeout(20_000) });
              if (await conversion.exited) throw new Error("无法转换旧剪辑图片滤镜，请检查 FFmpeg 滤镜支持");
              stillLooks.set(key, relativePath);
              return relativePath;
            }
            const trackNames: TrackName[] = [];
            const receipt: MigrationReceipt = {
              completed: false,
              tracks: [],
              previous: await readSettings(),
              desired: { fps: legacy.fps, trackNames },
            };
            for (const [index, track] of legacy.tracks.entries()) {
              const ids = track.type === "subtitle" ? [] : track.clips.map(() => `legacy-${crypto.randomUUID()}`);
              const expectedTrack: MigrationReceipt["tracks"][number] = { clips: [...ids].sort() };
              receipt.tracks.push(expectedTrack);
              if (track.name) trackNames.push({ name: track.name, index, clips: ids });
              if (track.type === "subtitle") {
                const folder = resolve(projectPath, "captions");
                await mkdir(folder, { recursive: true });
                if (await realpath(folder) !== folder) throw new Error("Studio 字幕目录无效");
                const name = `${crypto.randomUUID()}.vtt`;
                const cues = track.clips.flatMap(({ at, caption }) => {
                  if (!caption) return [];
                  return serializeCue(at, caption.duration, caption.text);
                });
                await writeAtomic(resolve(folder, name), `WEBVTT\n\n${cues.join("\n\n")}\n`, { exclusive: true });
                const src = `captions/${name}`;
                expectedTrack.caption = src;
                ops.push({ op: "captions", at: index, captions: { src, kind: "subtitles", label: track.name || "Lumo" } });
              } else if (track.type === "text") {
                const folder = resolve(projectPath, "legacyText");
                await mkdir(folder, { recursive: true });
                if (await realpath(folder) !== folder) throw new Error("Studio 文字目录无效");
                for (const [position, { at, caption }] of track.clips.entries()) {
                  if (!caption) throw new Error("旧剪辑文字片段无效");
                  const name = `${crypto.randomUUID()}.html`;
                  const text = caption.text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
                  await writeAtomic(resolve(folder, name), `<!doctype html><html><head><meta charset="utf-8"><style>
                    body { margin: 0; color: white; font: 72px sans-serif; }
                    #title { position: absolute; top: 96px; width: 100%; text-align: center; white-space: pre-wrap;
                      paint-order: stroke fill; -webkit-text-stroke: 3px black; }
                  </style></head><body><div id="title">${text}</div><script>window.film = { frame() {} };</script></body></html>`, { exclusive: true });
                  ops.push({ op: "insert", track: position === 0 ? { insert: index } : index, at,
                    clip: { id: ids[position], src: `legacyText/${name}`, time: [0, caption.duration], size: { w: stage.w, h: stage.h },
                      attrs: { "data-props": JSON.stringify([{ name: "Text", type: "text", at: "#title" }]) } } });
                }
              } else {
                for (const [position, { at, media }] of track.clips.entries()) {
                  if (!media) throw new Error("旧剪辑媒体无效");
                  let imported = sources.get(media.path);
                  if (!imported) {
                    const { landed } = await call("/files/bring", { paths: [media.path], mode: "copy" });
                    const src = landed?.[0];
                    if (typeof src !== "string" || !src) throw new Error("Studio 未导入旧剪辑素材");
                    const { duration, alpha, width, height } = await call(`/media?what=probe&path=${encodeURIComponent(src)}`);
                    if (media.still ? !(width > 0 && height > 0) : typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
                      throw new Error(`无法读取旧剪辑素材：${basename(media.path)}`);
                    }
                    imported = { src, duration, alpha: alpha === true, width, height };
                    sources.set(media.path, imported);
                  }
                  if (!media.still && media.time[1] > imported.duration + 0.001) throw new Error(`旧剪辑片段出点超出素材时长：${basename(media.path)}`);
                  if (track.type === "effect" && !imported.alpha) throw new Error("Studio 无法识别旧剪辑动效的透明通道");
                  let framing;
                  if (media.crop) {
                    const { width, height } = imported;
                    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error("无法读取裁剪素材尺寸");
                    const [top, right, bottom, left] = media.crop;
                    const croppedWidth = width * (1 - left - right);
                    const croppedHeight = height * (1 - top - bottom);
                    if (croppedWidth < 1 || croppedHeight < 1) throw new Error("旧剪辑画面裁剪范围无效");
                    // ACT: 旧编辑器先裁剪源画面，再等比居中。Studio 用完整素材的取景框和遮罩还原这两步。
                    const scale = Math.min(stage.w / croppedWidth, stage.h / croppedHeight);
                    const w = width * scale;
                    const h = height * scale;
                    framing = {
                      box: { x: (stage.w - croppedWidth * scale) / 2 - w * left, y: (stage.h - croppedHeight * scale) / 2 - h * top, w, h },
                      style: `object-fit: fill; clip-path: inset(${media.crop.map(value => `${(value * 100).toFixed(4)}%`).join(" ")})`,
                    };
                  }
                  const src = media.still && media.filter ? await importStillLook(imported.src, media.filter) : imported.src;
                  const look = !media.still && media.filter ? await importLook(media.filter) : undefined;
                  const style = [framing?.style, look].filter(Boolean).join("; ");
                  ops.push({ op: "insert", track: position === 0 ? { insert: index } : index, at,
                    clip: { id: ids[position], src, time: media.time, ...(framing ? { box: framing.box } : {}), ...(style ? { style } : {}),
                      ...(media.still ? {} : { speed: media.speed, volume: media.volume }),
                      ...(media.fade ? { overrides: [{ fade: media.fade }] } : {}) } });
                }
              }
              if (track.hidden) ops.push({ op: "track", track: index, field: "hidden", value: true });
              if (track.muted) ops.push({ op: "track", track: index, field: "muted", value: true });
            }
            await writeAtomic(receiptPath, JSON.stringify(receipt));
            await call("/lumo-edit", { base: revision, ops });
            await finishMigration(receipt);
            return url;
          });
        }
        async function openProject(directory: string, videoPath?: string, overlayAt?: number, clipTiming?: unknown) {
          return (await (videoPath === undefined && overlayAt === undefined && clipTiming === undefined ? accessProject(directory) : appendToProject(directory, videoPath, undefined, overlayAt, clipTiming))).url;
        }
        function isVideo(clip: StudioClip) {
          return !clip.sound && Object.hasOwn(videoTypes, extname(clip.src).toLowerCase());
        }
        async function canvasVideos(directory: string, projectId: string) {
          const { url, readFilm } = await accessProject(directory);
          if (new URL(url).searchParams.get("to") !== `/projects/${encodeURIComponent(projectId)}`) throw new Error("Studio 工程已切换");
          const { clips } = await readFilm();
          return clips.filter(isVideo).map(clip => ({ id: clip.id, name: basename(clip.src), at: clip.at ?? 0 }));
        }
        async function copyToCanvas(directory: string, projectId: string, clipId: string, render = false) {
          const { url, readFilm, projectPath, canonical, workspace, call } = await accessProject(directory);
          if (new URL(url).searchParams.get("to") !== `/projects/${encodeURIComponent(projectId)}`) throw new Error("Studio 工程已切换");
          const { clips, revision } = await readFilm();
          const clip = clips.find(item => item.id === clipId && isVideo(item));
          if (!clip || isAbsolute(clip.src)) throw new Error("Studio 视频片段已不可用");
          const source = await realpath(resolve(projectPath, clip.src));
          if (!containsPath(projectPath, source) || !(await stat(source)).isFile()) throw new Error("视频超出 Studio 工程目录");
          const extension = render ? ".mp4" : extname(clip.src).toLowerCase();
          const video = render ? await renderStudioVideo(call, revision, { clip: clip.id }) : source;
          const label = render ? `${basename(clip.src, extname(clip.src))}.mp4` : basename(clip.src);
          return copyCanvasAsset(canonical, workspace, video, extension, label);
        }
        async function renderRangeToCanvas(directory: string, projectId: string, start: number, end: number) {
          if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error("Studio 时间范围无效");
          const { url, readFilm, canonical, workspace, call } = await accessProject(directory);
          if (new URL(url).searchParams.get("to") !== `/projects/${encodeURIComponent(projectId)}`) throw new Error("Studio 工程已切换");
          const { revision } = await readFilm();
          const video = await renderStudioVideo(call, revision, { range: [start, end], burnSubtitles: true });
          return copyCanvasAsset(canonical, workspace, video, ".mp4", `Studio ${start}–${end} 秒.mp4`);
        }
        async function renderStudioVideo(call: Awaited<ReturnType<typeof accessProject>>["call"], revision: string,
          selection: { clip: string } | { range: [number, number]; burnSubtitles: true }) {
          const { settings } = await call("/settings");
          return renderStudioFile(call, revision, { kind: "video", codec: "h264", ...selection, fps: settings?.fps }, ".mp4", 180_000);
        }
        async function copyCanvasAsset(canonical: string, workspace: { dev: bigint; ino: bigint; birthtimeNs: bigint }, video: string, extension: string, label: string) {
          // 渲染期间，原工作区目录可能已移动或被替换。
          const current = await stat(canonical, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
          });
          if (!current?.isDirectory() || current.dev !== workspace.dev || current.ino !== workspace.ino
            || current.birthtimeNs !== workspace.birthtimeNs) throw new Error("Lumo 项目目录已切换");
          const assets = resolve(canonical, "assets");
          await mkdir(assets, { recursive: true });
          if (await realpath(assets) !== assets) throw new Error("Lumo 素材目录无效");
          const target = resolve(assets, "openFilmStudio");
          await mkdir(target, { recursive: true });
          if (await realpath(target) !== target) throw new Error("Lumo 素材目录无效");
          const name = `${crypto.randomUUID()}${extension}`;
          await copyFile(video, resolve(target, name), constants.COPYFILE_EXCL);
          return { path: `assets/openFilmStudio/${name}`, name: label, mimeType: videoTypes[extension]! };
        }
        type ClipValue = boolean | number | [number, number] | null;
        function setClipProperty(directory: string, projectId: string, clipId: string, field: "volume" | "speed" | "time" | "disabled", value: ClipValue, expectedValue?: ClipValue) {
          return queueProjectWrite(directory, canonical => applyClipProperty(canonical, projectId, clipId, field, value, expectedValue));
        }
        async function applyClipProperty(directory: string, projectId: string, clipId: string, field: "volume" | "speed" | "time" | "disabled", value: ClipValue, expectedValue?: ClipValue) {
          const validRange = Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[0] >= 0 && value[1] > value[0];
          if (field === "disabled" ? typeof value !== "boolean"
             : field === "time" ? !validRange && !(value === null && expectedValue !== undefined)
            : (field !== "volume" && field !== "speed") || typeof value !== "number" || !Number.isFinite(value)
              || (field === "volume" ? value < 0 || value > 2 : value < 0.1 || value > (expectedValue === undefined ? 16 : 100))) throw new Error("Studio 片段参数无效");
          const { url, readFilm, call } = await accessProject(directory);
          if (new URL(url).searchParams.get("to") !== `/projects/${encodeURIComponent(projectId)}`) throw new Error("Studio 工程已切换");
          const { clips, revision } = await readFilm();
          const clip = clips.find(item => item.id === clipId && isVideo(item));
          if (!clip) throw new Error("Studio 视频片段已不可用");
          const fallback = field === "disabled" ? false : field === "time" ? null : 1;
           const previousValue = clip[field] ?? fallback;
          if (expectedValue !== undefined && JSON.stringify(previousValue) !== JSON.stringify(expectedValue)) throw new Error("片段参数已改变，无法撤销此操作");
          if (field === "time" && Array.isArray(value)) {
            const { duration } = await call(`/media?what=probe&path=${encodeURIComponent(clip.src)}`);
            if (!Number.isFinite(duration) || value[1] > duration + 0.001) throw new Error("裁切出点超出源素材时长");
          }
          const fade = clip.overrides?.find(item => item.at === undefined)?.fade;
          const timeRange = field === "time" ? value : clip.time;
          const speed = field === "speed" && typeof value === "number" ? value : clip.speed ?? 1;
          if ((field === "time" || field === "speed") && Array.isArray(timeRange) && fade && fade[0] + fade[1] > (timeRange[1] - timeRange[0]) / speed + 1e-9) {
            throw new Error("修改后片段短于现有淡入淡出，请先在 Studio 调整淡入淡出");
          }
          const op = field === "disabled"
             ? { op: "fields", clip: clipId, fields: { disabled: value === true ? true : null } }
             : { op: "set", clip: clipId, field, value };
           const edited = await call("/lumo-edit", { base: revision, undo: expectedValue !== undefined, ops: [op] });
          const saved = edited.doc?.tracks.flatMap((track: { clips: StudioClip[] }) => track.clips).find((item: StudioClip) => item.id === clipId);
          if (!saved) throw new Error("Studio 未返回已修改片段");
          return { clipId, field, value: saved[field] ?? fallback, previousValue };
        }
        async function captureRegion(directory: string, projectId: string, input: unknown) {
          const region = input as { time: number; box: { x: number; y: number; w: number; h: number }; stage: { w: number; h: number } } | null;
          if (!region?.box || !region.stage) throw new Error("Studio 框选区域无效");
          const { time, box: { x, y, w, h }, stage } = region;
          if (![time, x, y, w, h, stage.w, stage.h].every(Number.isFinite) || time < 0 || x < 0 || y < 0 || w <= 0 || h <= 0
            || stage.w <= 0 || stage.h <= 0 || x + w > stage.w + 1 || y + h > stage.h + 1) throw new Error("Studio 框选区域无效");
          const { url, call, readFilm } = await accessProject(directory);
          if (new URL(url).searchParams.get("to") !== `/projects/${encodeURIComponent(projectId)}`) throw new Error("Studio 工程已切换");
          const film = await readFilm();
          if (film.stage?.w !== stage.w || film.stage?.h !== stage.h) throw new Error("Studio 画幅已改变，请重新框选");
          const output = await renderStudioFile(call, film.revision,
            { kind: "poster", at: time, format: "png", shortEdge: Math.max(64, Math.min(720, stage.w, stage.h)), burnSubtitles: true }, ".png", 60_000);
          const png = await readFile(output);
          if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) throw new Error("Studio 截图格式无效");
          const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
          const left = Math.min(width - 1, Math.floor(x * width / stage.w));
          const top = Math.min(height - 1, Math.floor(y * height / stage.h));
          const right = Math.min(width, Math.ceil((x + w) * width / stage.w));
          const bottom = Math.min(height, Math.ceil((y + h) * height / stage.h));
          if (right <= left || bottom <= top) throw new Error("Studio 截图裁切范围无效");
          const process = Bun.spawn([ffmpeg, "-v", "error", "-i", output, "-vf", `crop=${right - left}:${bottom - top}:${left}:${top}:exact=1`,
            "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "pipe:1"], { stdout: "pipe", stderr: "ignore", signal: AbortSignal.timeout(15_000) });
          const bytes = await new Response(process.stdout).arrayBuffer();
          if (await process.exited || !bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) throw new Error("Studio 截图裁切失败");
          return Buffer.from(bytes).toString("base64");
        }
        async function renderStudioFile(call: Awaited<ReturnType<typeof accessProject>>["call"], revision: string, ask: object, extension: string, timeout: number) {
          const deadline = AbortSignal.timeout(timeout);
          const { exports: [job] } = await call("/exports", { filmRev: revision, jobs: [ask] }, { signal: deadline });
          let finished = false;
          try {
            while (!deadline.aborted) {
              const queue = await call("/exports?view=queue", undefined, { signal: deadline });
              const item = queue.exports.find((entry: { id: string }) => entry.id === job.id);
              if (!item || item.status === "failed" || item.status === "cancelled") {
                throw new Error(item?.error || "Studio 渲染失败");
              }
              if (item.status === "done") {
                finished = true;
                if (typeof item.outputs?.[0] !== "string") throw new Error("Studio 渲染文件无效");
                const output = await realpath(item.outputs[0]);
                if (extname(output).toLowerCase() !== extension || !containsPath(await realpath(resolve(studioRoot, "exports")), output)
                  || !(await stat(output)).isFile()) throw new Error("Studio 渲染文件无效");
                return output;
              }
              await Bun.sleep(300);
            }
            throw new Error("Studio 渲染超时");
          } catch (error) {
            if (!finished) await call(`/exports/${encodeURIComponent(job.id)}`, undefined, { method: "DELETE", signal: AbortSignal.timeout(2000) }).catch(() => {});
            if (deadline.aborted) throw new Error("Studio 渲染超时");
            throw error;
          }
        }
        return { openProject, canvasVideos, copyToCanvas, renderRangeToCanvas, setClipProperty, captureRegion, importLegacy, importDraft: async (directory: string, draft: unknown) => {
          if (draft === undefined) throw new Error("缺少成片草稿");
          return (await appendToProject(directory, undefined, draft)).url;
        }, close, isRunning: () => !failure };
      }
      await Bun.sleep(75);
    }
    throw new Error("OpenFilm Studio 启动超时");
  } catch (error) {
    await close();
    throw error;
  }
}
