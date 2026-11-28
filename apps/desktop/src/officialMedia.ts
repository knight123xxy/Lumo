import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import type { Request, RequestHandler } from "express";
import { lstat, mkdir, readFile } from "@lumo/file";
import { translateMessage } from "@lumo/server/i18n";
import { audioGenerationSchema, imageGenerationSchema, videoGenerationSchema } from "@lumo/server/mediaSchemas";
import { resolveWorkspace } from "@lumo/server/workspace";
import { lockWorkspaceFiles, resolveWorkspacePath, writeWorkspaceFile } from "@lumo/server/workspaceFiles";

const mediaPath = "/api/ai/media";
const listPath = "/api/workspaces/list";
const maxMediaSize = 100 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

type CloudRequest = (req: Request, path: string, body?: object, signal?: AbortSignal) => Promise<Response>;
type MediaResult = { path: string; mimeType: string; mediaType: "image" | "video" | "audio" };
type TaskStatus = { taskId: string; state: string; result?: { code: number; data: MediaResult[] | null } };

function fail(message: string, status: number): never {
  throw Object.assign(new Error(translateMessage(message)), { status });
}

export function createOfficialMedia(request: CloudRequest) {
  async function cloud<T>(req: Request, path: string, body?: object) {
    const response = await request(req, path, body, AbortSignal.timeout(8000));
    const result = await response.json() as { code: number; data: T; message?: string };
    if (!response.ok || result.code !== 200) fail(result.message || "连接失败", response.ok ? result.code : response.status);
    return result.data;
  }

  async function cloudDirectory(req: Request, local: string, create: boolean) {
    const name = `desktopMedia${createHash("sha256").update(local).digest("hex")}`;
    const lookup = () => cloud<{ absolutePath: string }>(req, `${listPath}?path=${name}`).catch((error: { status?: number }) => {
      if (error.status !== 404) throw error;
    });
    const existing = await lookup();
    if (existing || !create) return existing?.absolutePath;
    const root = await cloud<{ absolutePath: string }>(req, listPath);
    try {
      await cloud(req, "/api/workspaces/files/mkdir", { directory: root.absolutePath, path: name });
    } catch (error) {
      if (!(await lookup())) throw error;
    }
    return (await lookup())?.absolutePath ?? fail("无法创建云端媒体工作区", 503);
  }

  async function importMedia(req: Request, local: string, remote: string, taskId: string, image: MediaResult) {
    if (!/^(image|video|audio)\/[a-z0-9.+-]+$/i.test(image.mimeType)
      || image.mediaType !== image.mimeType.split("/", 1)[0]
      || !new RegExp(`^(image|video|audio)${taskId.replaceAll("-", "")}\\d+\\.[a-z0-9]+$`).test(basename(image.path))) {
      fail("云端媒体结果无效", 502);
    }
    const output = await resolveWorkspacePath(local, image.path, true);
    const query = new URLSearchParams({ directory: remote, path: image.path });
    const response = await request(req, `/api/workspaces/files/read?${query}`, undefined, AbortSignal.timeout(7800));
    const size = Number(response.headers.get("content-length"));
    if (!response.ok || !response.body || !Number.isSafeInteger(size) || size <= 0 || size > maxMediaSize) {
      await response.body?.cancel();
      fail("无法下载云端媒体", 502);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > size) fail("云端媒体大小超出预期", 502);
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (received !== size) fail("云端媒体下载不完整", 502);
    const bytes = Buffer.concat(chunks, received);
    const release = lockWorkspaceFiles([output.path]);
    try {
      const info = await lstat(output.path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      if (info?.isFile() && info.size === size && (await readFile(output.path)).equals(bytes)) return;
      await mkdir(dirname(output.path), { recursive: true });
      await writeWorkspaceFile(output.path, bytes, true);
    } finally { release(); }
  }

  const models: RequestHandler = async (req, res, next) => {
    // 登录桌面端使用云端发布的完整媒体目录。
    const models = await cloud<{ type: string }[]>(req, `${mediaPath}/models`);
    res.locals.officialMediaModels = models;
    next();
  };

  const submit: RequestHandler = async (req, res, next) => {
    const { directory, mediaType, taskId, ...input } = req.body ?? {};
    if (input.providerId !== "multiTenant") return next();
    delete input.nodeId;
    delete input.canvasPath;
    if (mediaType !== "image" && mediaType !== "video" && mediaType !== "audio") return next();
    if (typeof directory !== "string" || typeof taskId !== "string" || !uuid.test(taskId)) fail("媒体任务参数无效", 400);
    const schema = mediaType === "image" ? imageGenerationSchema : mediaType === "video" ? videoGenerationSchema : audioGenerationSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) fail("媒体任务参数无效", 400);
    const media = parsed.data;
    if (media.images?.length || ("videos" in media && media.videos?.length) || ("audios" in media && media.audios?.length)
      || ("firstFrame" in media && media.firstFrame) || ("lastFrame" in media && media.lastFrame)) {
      fail("当前云端媒体线路暂不支持本地参考素材", 400);
    }
    const local = await resolveWorkspace(req, directory);
    await resolveWorkspacePath(local, media.outputDirectory ?? "assets/generated", true);
    const remote = await cloudDirectory(req, local, true);
    const result = await cloud(req, `${mediaPath}/generate`, { ...media, directory: remote, mediaType, taskId,
    });
    res.json({ code: 200, data: result });
  };

  const price: RequestHandler = async (req, res, next) => {
    if (req.body?.providerId !== "multiTenant") return next();
    const { directory: _directory, ...input } = req.body;
    const result = await cloud(req, `${mediaPath}/price`, input);
    res.json({ code: 200, data: result });
  };

  return { models, submit, price, tasks(action: "status" | "cancel", localRequest: CloudRequest): RequestHandler {
    return async (req, res, next) => {
      const { directory, taskIds, resume } = req.body ?? {};
      if (typeof directory !== "string" || !Array.isArray(taskIds) || !taskIds.length || taskIds.length > 100
        || !taskIds.every(id => typeof id === "string" && uuid.test(id))) fail("媒体任务参数无效", 400);
      const local = await resolveWorkspace(req, directory);
      const remote = await cloudDirectory(req, local, action === "cancel");
      if (action === "cancel" && remote) {
        await cloud(req, `${mediaPath}/tasks/cancel`, { directory: remote, taskIds });
        return next();
      }
      if (!remote) return next();
      const status = await cloud<TaskStatus[]>(req, `${mediaPath}/tasks/status`, { directory: remote, taskIds, resume: action === "status" && resume === true });
      const remoteTasks = status.filter(item => item.result?.code !== 404);
      if (!remoteTasks.length) return next();
      const localIds = taskIds.filter(id => !remoteTasks.some(item => item.taskId === id));
      let localData: TaskStatus[] = [];
      if (localIds.length) {
        const response = await localRequest(req, `${mediaPath}/tasks/${action}`, { directory, taskIds: localIds, resume });
        if (!response.ok) fail("读取本地媒体任务失败", response.status);
        localData = (await response.json()).data ?? [];
      }
      for (const item of remoteTasks) {
        if (item.state !== "succeeded" || item.result?.code !== 200) continue;
        try {
          for (const image of item.result.data ?? []) await importMedia(req, local, remote, item.taskId, image);
        } catch {
          // 下一次状态查询只重试下载已生成的文件。
          item.state = "running";
          delete item.result;
        }
      }
      res.json({ code: 200, data: [...remoteTasks, ...localData] });
    };
  } };
}
