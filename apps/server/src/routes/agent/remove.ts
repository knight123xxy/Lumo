import { Router } from "express";
import { z } from "zod";
import { unlink } from "@lumo/file";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().delete("/", validateFields({
  directory: z.string().min(1).max(4096),
  sessionFile: z.string().regex(/^[\w-]+\.jsonl$/),
}), async (req, res) => {
  const { path } = await u.workspaceFile.resolveWorkspaceFile(req, req.body.directory, `.agent/sessions/${req.body.sessionFile}`);
  const release = u.workspaceFile.lockWorkspaceFiles([path]);
  try {
    if (u.agent.getActiveAgentSession(path)) throw Object.assign(new Error("对话正在运行，请停止后再删除"), { status: 409 });
    await unlink(path);
  } finally { release(); }
  res.json(success());
});
