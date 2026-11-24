import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const input = z.strictObject({ name: z.string().trim().min(1).max(120) });

export default Router().post("/", validateFields(input.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { name } = input.parse(req.body);
  res.set("Cache-Control", "no-store").json(success(await u.workspace.createWorkspace(req, name)));
});
