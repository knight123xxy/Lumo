import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

// 托管充值入口：quota 为要增加的 remain_quota（元→quota 换算 quota = 元 × 500000 ÷ 7，由支付网关换算后传入）。
const schema = z.strictObject({ userId: z.uuid(), quota: z.number().int().positive().max(9007199254740991) });

export default Router().post("/", validateFields(schema.shape), async (req, res) => {
  const input = schema.parse(req.body);
  res.set("Cache-Control", "no-store").json(success(await u.multiTenant.rechargeUserSubAccount(req, input.userId, input.quota)));
});
