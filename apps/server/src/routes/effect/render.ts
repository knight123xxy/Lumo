import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { lowerThirdEffectIds } from "@/utils/showcase/lowerThird";

const input = z.strictObject({
  directory: z.string().min(1).max(4096),
  effectId: z.enum(lowerThirdEffectIds),
  kicker: z.string().max(32).trim().min(1),
  name: z.string().max(64).trim().min(1),
});

export default Router().post("/", validateFields(input.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { directory, effectId, kicker, name } = input.parse(req.body);
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once("close", close);
  try {
    const workspace = await u.workspace.resolveWorkspace(req, directory);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]);
    const result = await u.showcase.renderLowerThird(workspace, { kicker, name }, signal, effectId);
    if (!res.destroyed) res.set("Cache-Control", "no-store").json(success(result));
  } finally {
    res.off("close", close);
  }
});
