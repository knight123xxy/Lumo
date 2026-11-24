import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const slots = z.strictObject({
  title: z.string().max(200).optional(),
  subtitle: z.string().max(300).optional(),
  claim: z.string().max(200).optional(),
  cta: z.string().max(200).optional(),
  screenPath: z.string().min(1).max(1024).optional(),
  resultPath: z.string().min(1).max(1024).optional(),
  themeId: z.enum(["coral-noir", "claude-light", "amber-noir", "blueprint-stone", "celadon-paper", "graphite-signal"]).optional(),
  templateId: z.enum(["vertical-beat", "product-three", "knowledge-qa", "data-brief"]).optional(),
  titleCard: z.object({ shotId: z.literal("paper-title-card"), text: z.string().trim().min(1).max(180) }).optional(),
});
const input = z.strictObject({ directory: z.string().min(1).max(4096), output: z.string().min(1).max(1024), slots });

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
