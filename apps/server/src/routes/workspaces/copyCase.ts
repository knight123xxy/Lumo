import { Router } from "express";
import { lstat, mkdir, readFile, readdir } from "@lumo/file";
import { join } from "node:path";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { projectCase } from "@/lib/templateCatalog";

const input = z.strictObject({ caseId: z.literal(projectCase.id) });

export default Router().post("/", validateFields(input.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  input.parse(req.body);
  const source = join(req.app.locals.webRoot, "cases", projectCase.id);
  const names = await readdir(join(source, "assets", "timeline"));
  if (!names.length || names.length > 20 || names.some(name => !/^asset-[a-f0-9-]+\.(mp4|wav)$/.test(name))) {
    throw Object.assign(new Error("案例素材清单无效"), { status: 503 });
  }
  const paths = ["timeline.json", ...names.map(name => `assets/timeline/${name}`)];
  const files = await Promise.all(paths.map(async path => {
    const original = await u.workspaceFile.resolveWorkspacePath(source, path);
    const info = await lstat(original.path);
    if (!info.isFile() || info.size > 16 * 1024 * 1024) throw Object.assign(new Error("案例文件无效"), { status: 503 });
    return { path, bytes: await readFile(original.path) };
  }));
  if (req.aborted || res.destroyed) return;
  const project = await u.workspace.createWorkspace(req, projectCase.name);
  const release = u.workspaceFile.lockWorkspaceFiles([project.directory]);
  try {
    await mkdir(join(project.directory, "assets", "timeline"), { recursive: true });
    // 先复制素材，最后写入时间线。失败时保留已写入的数据，且不会覆盖既有项目。
    for (const file of [...files.slice(1), files[0]!]) {
      const target = await u.workspaceFile.resolveWorkspacePath(project.directory, file.path);
      await u.workspaceFile.writeWorkspaceFile(target.path, file.bytes, true);
    }
  } finally { release(); }
  res.set("Cache-Control", "no-store").json(success(project));
});
