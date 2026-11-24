import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const input = z.strictObject({ code: z.string().max(128).trim().regex(/^[a-f0-9]{32}$/i) });
export default Router().post("/", validateFields(input.shape), async (req, res) => {
  const { code } = input.parse(req.body);
  res.set("Cache-Control", "no-store").json(success(await u.multiTenant.redeemRechargeCard(req, code)));
});
