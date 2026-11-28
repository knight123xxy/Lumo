import { Router } from "express";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ email: u.multiTenant.registrationEmailSchema }), async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(success(await u.multiTenant.sendPasswordResetCode(req, req.body.email)));
  } catch (cause) {
    const retryAfter = (cause as { retryAfter?: number })?.retryAfter;
    if (retryAfter) res.set("Retry-After", String(retryAfter));
    throw cause;
  }
});
