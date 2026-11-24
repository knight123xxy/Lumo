import { Router } from "express";
import { adminAccountSchema, passwordSchema, referralCodeSchema } from "@lumo/multi-tenant-auth";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ userName: adminAccountSchema, password: passwordSchema, referralCode: referralCodeSchema.optional() }), async (req, res) => {
  const result = await u.multiTenant.registerUser(req, res, req.body.userName, req.body.password, req.body.referralCode);
  res.set("Cache-Control", "no-store").json(success(result));
});
