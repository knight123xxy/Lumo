import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", async (_req, res) => {
  const models = await u.ai.listAiModels();
  const official = res.locals.officialTextModels;
  res.json(success(official ? [...official, ...models.filter(model => !["ideamineText", "lumo", "multiTenant"].includes(model.providerId))] : models));
});
