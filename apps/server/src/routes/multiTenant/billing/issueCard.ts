import { Router } from "express";
import { billingCreditSchema } from "@lumo/multi-tenant-billing/config";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const input = billingCreditSchema.pick({ amount: true });
export default Router().post("/", validateFields(input.shape), async (req, res) => {
  const { amount } = input.parse(req.body);
  res.set("Cache-Control", "no-store").json(success(await u.multiTenant.issueRechargeCard(req, amount)));
});
