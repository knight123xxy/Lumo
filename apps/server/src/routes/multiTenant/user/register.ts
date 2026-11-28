import { Router } from "express";
import { adminAccountSchema, passwordSchema, referralCodeSchema } from "@lumo/multi-tenant-auth";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  userName: adminAccountSchema,
  password: passwordSchema,
  referralCode: referralCodeSchema.optional(),
  code: u.multiTenant.registrationCodeSchema.optional(),
}), async (req, res) => {
  const { userName, password, referralCode, code } = req.body;
  const result = await u.multiTenant.registerUser(req, res, userName, password, referralCode, code);
  res.set("Cache-Control", "no-store").json(success(result));
});
