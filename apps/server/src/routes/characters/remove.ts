import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const inputSchema = z.strictObject({ id: z.string().min(1).max(80) });

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  res.json(success({ removed: await u.characters.removeCharacter(input.id) }));
});
