import { caseThemes, projectCase, templateCatalog } from "@/lib/templateCatalog";
import { t } from "@/lib/i18n";
import { listMediaModels, generateMedia } from "@/utils/media/generation";
import { createWorkspaceFfmpeg, executeWorkspaceFfmpeg } from "@/utils/ffmpeg";
import { createBrowserContext } from "@/utils/browser";
import { createSandboxContext } from "@lumo/tool-sandbox/host";
import { canvasSchemas, isNodeToolAllowed, nodeToolPermissionsSchema } from "@lumo/tool-canvas/runtime";
import { getRuntimePlatform } from "@/lib/platform";
import { importImage } from "@/utils/workspace/chatImages";
import { basename, dirname, join, relative, resolve } from "node:path";
import { access, constants, copyFile, createReadStream, mkdir, readFile, readdir, stat, withFileAccess } from "@lumo/file";
import {
  defineTool, createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition, createLsToolDefinition,
  detectSupportedImageMimeTypeFromFile, type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { CanvasContext, QuestionContext, ToolContext, ToolFiles, MediaGenerationRequest } from "@lumo/tools-scaffold/runtime";
import { asrRequestSchema } from "@lumo/tools-scaffold/runtime";
import conf from "@/utils/conf";
import { isWithin, resolveWorkspacePath, writeWorkspaceFile, renameWorkspaceFile, removeWorkspaceFile, lockWorkspaceFiles, protectWorkspaceRoot } from "@/utils/workspace/files";
import { listTools, loadTool, validateToolConfig } from "@/utils/plugins/tools";
import { listNodeServerTools, loadNodeServerTool } from "@/utils/plugins/nodes";
import { createSkillContext } from "@/agent/skills";
import { createAssetContext } from "@/agent/assets";
import { readDocument } from "@/utils/documents";
import { createMcpAgentTools } from "@/utils/mcp/servers";
import { currentIdentity } from "@/utils/multiTenant/context";
import { modelGateway, requireDirectModelAccess } from "@/utils/multiTenant/gateway";
import { z } from "zod";
import { studioVolumeSchema, studioSpeedSchema, studioTrimSchema, studioDisabledSchema, automaticFilmSchema, timelineOperations } from "@/agent/bridge/canvas";
import { renderTemplate, templateSlotsSchema } from "@/utils/showcase";
import * as mediaTasks from "@/utils/media/tasks";

export function createAgentToolContext(cwd: string, config: Record<string, unknown> = {}, canvas?: CanvasContext, question?: QuestionContext, workspaceAvailable = true): ToolContext {
  const actor = currentIdentity();
  const sourceCanvas = canvas;
  if (sourceCanvas) {
    canvas = {
      get id() { return sourceCanvas.id; },
      get tools() { return sourceCanvas.tools; },
      getNodeLabel: sourceCanvas.getNodeLabel?.bind(sourceCanvas),
      call(request, signal) {
        if (request.name === "nodeTools") {
          const { name } = canvasSchemas.nodeTools.parse(request.args);
          const permissions = nodeToolPermissionsSchema.parse(conf.get("settings", {}).agentNodeTools ?? {});
          if (!isNodeToolAllowed(name, permissions)) {
            throw new Error(t`Agent 已禁用节点函数 ${name}，请在顶部节点工具控制中开启后再调用`);
          }
        }
        return sourceCanvas.call(request, signal);
      },
    };
  }
  const skillsDirectory = join(dirname(conf.path), "skills");
  const requireWorkspace = () => { if (!workspaceAvailable) throw new Error("此对话未提供工作目录，无法使用文件或媒体操作"); };
  async function generate(mediaType: "image" | "video" | "audio", request: MediaGenerationRequest, signal?: AbortSignal) {
    requireWorkspace();
    signal?.throwIfAborted();
    if (!modelGateway.enabled()) return generateMedia(cwd, mediaType, request, signal);
    if (!actor) throw Object.assign(new Error("请先登录 算力汇"), { status: 401 });
    const taskId = crypto.randomUUID();
    await mediaTasks.start(cwd, taskId, mediaType, request, {}, actor);
    return mediaTasks.wait(cwd, taskId, actor, signal);
  }
  const resolvePath = async (path: string, readOnly = false) => {
    requireWorkspace();
    const absolute = resolve(cwd, path);
    const root = readOnly && isWithin(skillsDirectory, absolute) ? skillsDirectory : cwd;
    return (await resolveWorkspacePath(root, relative(root, absolute), true)).path;
  };
  const withWritePaths = async (paths: string[], operation: (targets: string[]) => Promise<void>) => {
    const targets = await Promise.all(paths.map(path => resolvePath(path)));
    const release = lockWorkspaceFiles(targets);
    try { await operation(targets); }
    finally { release(); }
  };
  const files: ToolFiles = {
    importImage: url => { requireWorkspace(); return importImage(cwd, url); },
    readFile: async (path, readOnly = false, options) => {
      options?.signal?.throwIfAborted();
      const target = await resolvePath(path, readOnly);
      if (options?.maxBytes === undefined) return readFile(target, { signal: options?.signal });
      if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) throw new Error("文件读取上限无效");
      const chunks: Buffer[] = [];
      let size = 0;
      // ACT: 多读一字节判断超限，避免 stat 后文件增长导致整个大文件进入内存。
      for await (const chunk of createReadStream(target, { end: options.maxBytes, signal: options.signal })) {
        const content = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += content.byteLength;
        if (size > options.maxBytes) throw Object.assign(new Error("文件超过读取大小上限"), { code: "EFBIG" });
        chunks.push(content);
      }
      return Buffer.concat(chunks, size);
    },
    access: async (path, readOnly = false) => access(await resolvePath(path, readOnly)),
    stat: async (path, readOnly = false) => stat(await resolvePath(path, readOnly)),
    readdir: async (path, readOnly = false, signal) => readdir(await resolvePath(path, readOnly), { signal }),
    detectImageMimeType: async (path, readOnly = false) => {
      const target = await resolvePath(path, readOnly);
      return withFileAccess([target], "read", () => detectSupportedImageMimeTypeFromFile(target));
    },
    writeFile: (path, content, exclusive = false) => withWritePaths([path], async ([target]) => {
      await writeWorkspaceFile(target, content, exclusive);
    }),
    mkdir: async (path, recursive = false) => {
      const target = await resolvePath(path);
      // ACT: 递归创建已有目录无需修改，锁父目录会与 Agent 自己持有的会话文件锁冲突。
      if (recursive && (await stat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      }))?.isDirectory()) return;
      const release = lockWorkspaceFiles([target]);
      try { await mkdir(target, { recursive }); }
      finally { release(); }
    },
    rename: (path, target) => withWritePaths([path, target], async ([source, destination]) => {
      protectWorkspaceRoot(cwd, source);
      protectWorkspaceRoot(cwd, destination);
      await renameWorkspaceFile(source, resolve(dirname(destination), basename(resolve(cwd, target))));
    }),
    remove: (path, recursive = false) => withWritePaths([path], async ([target]) => {
      protectWorkspaceRoot(cwd, target);
      await removeWorkspaceFile(cwd, target, recursive);
    }),
    copyFile: (path, target, exclusive = false) => withWritePaths([path, target], async ([source, destination]) => {
      await copyFile(source, destination, exclusive ? constants.COPYFILE_EXCL : 0);
    }),
  };
  return {
    cwd, config, files, resolvePath, writeFile: files.writeFile, canvas, question, requireDirectModelAccess,
    skills: workspaceAvailable ? createSkillContext(cwd) : undefined, assets: workspaceAvailable ? createAssetContext(cwd) : undefined,
    browser: createBrowserContext(cwd),
    // ACT: OHOS 使用禁用 WASM 的嵌入式 Node，无法启动当前沙盒子进程。
    sandbox: workspaceAvailable && getRuntimePlatform().os !== "ohos" ? createSandboxContext({ files, resolvePath }) : undefined,
    asr: {
      async transcribe(path, options = {}) {
        requireWorkspace();
        options.signal?.throwIfAborted();
        if (!canvas) throw new Error("当前对话未连接画布，无法使用浏览器语音识别");
        const source = await resolvePath(path);
        const args = asrRequestSchema.parse({ path: relative(cwd, source).replaceAll("\\", "/"), lang: options.lang });
        options.signal?.throwIfAborted();
        const result = await canvas.call({ name: "transcribeAudio", args }, options.signal);
        if (typeof result !== "string") throw new Error("语音识别返回了无效的文本");
        return result;
      },
    },
    ffmpeg: signal => { requireWorkspace(); return createWorkspaceFfmpeg(cwd, signal); },
    executeFfmpeg: (request, emit, signal) => { requireWorkspace(); return executeWorkspaceFfmpeg(cwd, request, emit, signal); },
    media: workspaceAvailable ? {
      listModels: listMediaModels,
      generateImage: (request, signal) => generate("image", request, signal),
      generateVideo: (request, signal) => generate("video", request, signal),
      generateAudio: (request, signal) => generate("audio", request, signal),
    } : undefined,
    sdk: {
      defineTool, createWriteToolDefinition, createEditToolDefinition, createLsToolDefinition,
      createReadToolDefinition: (directory, options) => {
        const operations = options?.operations ?? {
          readFile: (path: string) => files.readFile(path, true),
          access: (path: string) => files.access(path, true),
          detectImageMimeType: (path: string) => files.detectImageMimeType(path, true),
        };
        const tool = createReadToolDefinition(directory, { ...options, operations: {
          ...operations,
          readFile: async path => readDocument(path, await operations.readFile(path)),
        } });
        return { ...tool, description: `${tool.description}\nHTML、Markdown、JSON、XML、配置和代码文件读取原文；Office、OpenDocument、RTF、EPUB、CSV、PDF 在本地解析为 Markdown。offset/limit 对应读取后的行。扫描 PDF 需要先做 OCR。` };
      },
      detectSupportedImageMimeTypeFromFile: path => files.detectImageMimeType(path, true),
    },
  };
}

export async function createAgentTools(cwd: string, canvas?: CanvasContext, question?: QuestionContext, includeMcp = true): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];
  if (canvas?.embeddedTimeline) {
    const descriptions = {
      readTimeline: { label: "读取内置时间线", description: "读取当前项目内置时间线的播放头、所选片段与其区间，以及按起点排列的片段列表。时间单位为秒，使用 nextOffset 读取下一页。", },
      trimTimelineClip: { label: "裁切内置时间线片段", description: "用读取结果返回的片段 ID 裁切视频或音频。start 和 end 是保留的源素材秒数，必须在当前源入点与出点内。保留时间线起点，其他片段不移动。页面确认后保存，可在时间线撤销。" },
      tightenTimelineSpeech: { label: "处理口播停顿", description: "处理内置时间线中一段未裁切且未变速的音视频。tighten 缩短沉默，speedUp 加速停顿。页面确认后另存媒体并更新片段，可撤销。已有字幕或会碰到下一段时须先手动处理。" },
      subtitleTimelineSpeech: { label: "识别口播字幕", description: "在支持音频识别的浏览器里为指定音视频片段按句或短语生成多条可编辑字幕，每条有独立起止时间，可逐条修改。先完成停顿处理，确保字幕跟随最终片段。需要页面确认。" },
      exportTimelineMp4: { label: "导出时间线 MP4", description: "经页面确认，将当前内置时间线导出到项目内，保留可编辑工程，有字幕时使用可切换字幕轨。" },
      subtitleTimelineFromScript: { label: "按文稿生成字幕", description: "识别服务不可用或用户已有文稿时，按文稿断句生成多条独立字幕条并对齐到指定片段区间，可逐条修改。需要页面确认。" },
      setTimelineClipVolume: { label: "调整内置时间线片段音量", description: "用读取结果返回的视频或音频片段 ID 调整音量。0 为静音，1 为原音量，2 为两倍音量。页面确认后保存，可在时间线撤销。" },
    };
    for (const name of Object.keys(timelineOperations) as (keyof typeof timelineOperations)[]) {
      const schema = timelineOperations[name];
      tools.push({
        name, ...descriptions[name], parameters: z.toJSONSchema(schema), executionMode: "sequential",
        ...(name === "readTimeline" ? { promptGuidelines: ["用户要求局部剪辑时先读取当前时间线。优先根据当前选区或用户指定的顺序、轨道和时间定位片段；有歧义则询问。用原生剪辑工具执行并以实际结果为准，不直接写时间线 JSON。"] } : {}),
        async execute(_id, input, signal) {
          const result = await canvas.call({ name, args: schema.parse(input) }, signal);
          return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
        },
      });
    }
  }
  if (canvas?.studioSelection) tools.push({
    name: "setStudioClipVolume", label: "调整 Studio 片段音量",
    description: "根据用户要求调整本次引用的 Studio 视频片段音量。使用草稿里的项目和片段 ID，1 为原音量，0 为静音。操作需要用户在页面确认。",
    parameters: z.toJSONSchema(studioVolumeSchema), executionMode: "sequential",
    async execute(_id, input, signal) {
      const result = await canvas.call({ name: "setStudioClipVolume", args: studioVolumeSchema.parse(input) }, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  if (canvas?.studioSelection) tools.push({
    name: "setStudioClipSpeed", label: "调整 Studio 片段速度",
    description: "按用户要求调整引用的 Studio 视频片段播放倍速。使用草稿里的项目和片段 ID。修改保留素材入出点和片段起点，其他片段保持原位。操作需要页面确认。",
    parameters: z.toJSONSchema(studioSpeedSchema), executionMode: "sequential",
    async execute(_id, input, signal) {
      const result = await canvas.call({ name: "setStudioClipSpeed", args: studioSpeedSchema.parse(input) }, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  if (canvas?.studioSelection) tools.push({
    name: "trimStudioClip", label: "裁切 Studio 视频片段",
    description: "裁切用户引用的 Studio 视频片段。start 和 end 是源素材秒数，需要根据片段起点、源入点和倍速换算用户指定的时间线区间。保留片段在时间线的起点，其他片段保持原位。用户须在页面确认。",
    parameters: z.toJSONSchema(studioTrimSchema), executionMode: "sequential",
    async execute(_id, input, signal) {
      const result = await canvas.call({ name: "trimStudioClip", args: studioTrimSchema.parse(input) }, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  if (canvas?.studioSelection) tools.push({
    name: "setStudioClipDisabled", label: "停用或恢复 Studio 视频片段",
    description: "停用或恢复用户引用的 Studio 视频片段。停用保留位置和素材，播放与导出时跳过该片段。需要用户在页面确认。",
    parameters: z.toJSONSchema(studioDisabledSchema), executionMode: "sequential",
    async execute(_id, input, signal) {
      const result = await canvas.call({ name: "setStudioClipDisabled", args: studioDisabledSchema.parse(input) }, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  if (canvas?.automaticFilm) tools.push({
    name: "createAutomaticFilm", label: "一键成片",
    description: "按已确认主题和当前项目内 1–8 段视频制作 15–30 秒草稿，写入时间线。视频总时长至少 15 秒。先在对话中核对素材和主题。点击页面中的用量确认后才开始生成。",
    parameters: z.toJSONSchema(automaticFilmSchema), executionMode: "sequential",
    async execute(_id, input, signal) {
      const result = await canvas.call({ name: "createAutomaticFilm", args: automaticFilmSchema.parse(input) }, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  const caseQuerySchema = z.strictObject({ query: z.string().trim().min(1).max(80).optional() });
  tools.push({
    name: "listMarketCases", label: "查找应用市场案例",
    description: "按题材、风格或模板名查找应用市场案例。返回详情与成片路径、所需素材及可传给 renderProjectTemplate 的模板 ID。",
    parameters: z.toJSONSchema(caseQuerySchema),
    async execute(_id, input) {
      const { query } = caseQuerySchema.parse(input);
      const terms = query?.toLowerCase().split(/\s+/) ?? [];
      const result = templateCatalog.flatMap(({ cover: _cover, ...item }) => {
        const themes = item.id === "vertical-beat" ? caseThemes : [];
        const searchable = [...Object.values(item).flatMap(value => typeof value === "string" ? [value] : Object.values(value)),
          ...themes.flatMap(theme => [theme.id, theme.name])];
        if (!terms.every(term => searchable.some(value => value.toLowerCase().includes(term)))) return [];
        return [{ ...item, detail: `#/home/cases/${item.id}`, preview: `/cases/${item.id}.mp4`,
          themes: themes.map(theme => ({ ...theme, preview: `/cases/${theme.id}.mp4` })) }];
      });
      const projects = terms.every(term => Object.values(projectCase).some(value => (typeof value === "string" ? value : Object.values(value).join(" ")).toLowerCase().includes(term)))
        ? [{ ...projectCase, detail: `#/home/cases/${projectCase.id}`, copyFromDetail: true }]
        : [];
      const matches = [...result, ...projects];
      return { content: [{ type: "text", text: JSON.stringify(matches) }], details: matches };
    },
  });
  const templateInput = templateSlotsSchema.extend({ title: z.string().trim().min(1).max(200) });
  tools.push({
    name: "renderProjectTemplate", label: "渲染项目整集模板",
    description: "在当前项目渲染已确认的竖屏模板，返回 MP4 相对路径和时长。模板有竖屏卡点、产品三段、知识问答和数据简报。素材参数仅使用项目内已核对的路径。",
    parameters: z.toJSONSchema(templateInput), executionMode: "sequential",
    async execute(_id, input, signal) {
      const slots = templateInput.parse(input);
      const result = await renderTemplate(cwd, `exports/模板成片-${crypto.randomUUID()}.mp4`, slots, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  const names = new Set(tools.map(tool => tool.name));
  const context = createAgentToolContext(cwd, {}, canvas, question);
  function appendTools(definitions: ToolDefinition[], prompt: string, label: string) {
    for (const tool of definitions) {
      if (!tool.name || typeof tool.execute !== "function") throw new Error(t`${label} 返回了无效的工具`);
      if (names.has(tool.name)) throw new Error(t`工具名称重复：${tool.name}`);
      names.add(tool.name);
      tools.push({ ...tool, promptGuidelines: [...(prompt ? [prompt] : []), ...(tool.promptGuidelines ?? [])] });
    }
  }
  const nodeServices = await listNodeServerTools();
  for (const item of nodeServices) {
    const { plugin, metadata, config } = await loadNodeServerTool(item.name);
    appendTools(await plugin.createTools({ ...context, config }), metadata.prompt ?? "", item.displayName);
  }
  for (const item of await listTools()) {
    if (nodeServices.some(node => node.name === item.name)) continue;
    if (!item.enabled) continue;
    if (item.loadError) throw new Error(`${item.displayName}：${item.loadError}`);
    const { plugin, metadata } = await loadTool(item.name);
    const config = validateToolConfig(plugin, item.config);
    const definitions = await plugin.createTools({ ...context, config });
    appendTools(definitions, metadata.prompt ?? "", item.displayName);
  }
  if (includeMcp) appendTools(await createMcpAgentTools(), "", "MCP");
  return tools;
}
