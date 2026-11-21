import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { runMotion } from "@toonflow/motiongit";

const router = Router();

// 渲染一个 .motion 动效模板（同步等待出片，适合桌面单用户）。
export default router.post("/", validateFields({
  pkgPath: z.string().min(1).max(4096).refine((value) => value.toLowerCase().endsWith(".motion"), "仅支持 .motion 包"),
  params: z.record(z.string(), z.unknown()),
  runtime: z.object({
    python: z.string().optional(),
    node: z.string().optional(),
    chrome: z.string().optional(),
    ffmpegDir: z.string().optional(),
    packageManager: z.enum(["npm", "bun"]).optional(),
  }).optional(),
}, "body"), async (req, res) => {
  const body = req.body as {
    pkgPath: string;
    params: Record<string, unknown>;
    runtime?: { python?: string; node?: string; chrome?: string; ffmpegDir?: string; packageManager?: "npm" | "bun" };
  };
  const result = await runMotion(body.pkgPath, body.params, { runtime: body.runtime });
  res.json(success({ finalVideo: result.finalVideo, silentVideo: result.silentVideo, plan: result.plan }));
});
