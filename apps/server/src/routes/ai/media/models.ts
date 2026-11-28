import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", async (_req, res) => {
  const models = await u.mediaGeneration.listMediaModels();
  const official: typeof models | undefined = res.locals.officialMediaModels;
  res.json(success(official ? [...official, ...models.filter(model => model.providerId !== "ideamine" && model.providerId !== "lumo" && model.providerId !== "multiTenant")] : models));
});
