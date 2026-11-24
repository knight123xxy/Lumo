import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const inputSchema = z.strictObject({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(1).max(u.characters.characterLimits.name),
  description: z.string().max(u.characters.characterLimits.description).optional(),
  image: z.string().min(1).max(4096),
  tags: z.array(z.string().max(u.characters.characterLimits.tag)).max(u.characters.characterLimits.tags).optional(),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  res.json(success(await u.characters.saveCharacter(input)));
});
