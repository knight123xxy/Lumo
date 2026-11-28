import { Router } from "express";
import { passwordSchema } from "@lumo/multi-tenant-auth";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  email: u.multiTenant.registrationEmailSchema,
  code: u.multiTenant.registrationCodeSchema,
  password: passwordSchema,
}), async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { email, code, password } = req.body;
  await u.multiTenant.resetPassword(req, email, code, password);
  res.json(success());
});
