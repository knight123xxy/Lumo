import { Router } from "express";
import { userIdSchema } from "@lumo/multi-tenant-auth";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ userId: userIdSchema }), async (req, res) => {
  const result = await u.multiTenant.issueReferralCode(req, req.body.userId);
  res.set("Cache-Control", "no-store").json(success(result));
});
