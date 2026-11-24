import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const effectIds = u.showcase.effects.map(effect => effect.id) as [string, ...string[]];

const input = z.strictObject({
  directory: z.string().min(1).max(4096),
  effectId: z.enum(effectIds),
  kicker: z.string().max(32).trim().min(1),
  name: z.string().max(64).trim().min(1),
});

const router = Router();

// 目录与渲染同挂 /api/effect/render：GET 取可选项，POST 出片，避免再动路由编号。
router.get("/", (_req, res) => {
  res.set("Cache-Control", "no-store").json(success(u.showcase.effects.map(({ id, name, category, summary, seconds, width, height }) =>
    ({ id, name, category, summary, seconds, width, height }))));
});

router.post("/", validateFields(input.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { directory, effectId, kicker, name } = input.parse(req.body);
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once("close", close);
  try {
    const workspace = await u.workspace.resolveWorkspace(req, directory);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]);
    const result = await u.showcase.renderEffect(workspace, { effectId, kicker, name }, signal);
    if (!res.destroyed) res.set("Cache-Control", "no-store").json(success(result));
  } finally { res.off("close", close); }
});

export default router;
