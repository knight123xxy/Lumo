import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

import { templateSlotsSchema } from "@/utils/showcase";

const input = z.strictObject({ directory: z.string().min(1).max(4096), output: z.string().min(1).max(1024), slots: templateSlotsSchema });

export default Router().post("/", validateFields(input.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const body = input.parse(req.body);
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once("close", close);
  try {
    const workspace = await u.workspace.resolveWorkspace(req, body.directory);
    const result = await u.showcase.renderTemplate(workspace, body.output, body.slots, controller.signal);
    if (!res.destroyed) res.set("Cache-Control", "no-store").json(success(result));
  } finally { res.off("close", close); }
});
