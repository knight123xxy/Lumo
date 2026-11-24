import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const modelId = z.string().min(1).max(128);
const input = z.strictObject({ writerId: modelId, narratorId: modelId });

export default Router().post("/", validateFields(input.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { writerId, narratorId } = input.parse(req.body);
  const gateway = u.multiTenant.modelGateway;
  const [writer, narrator] = await Promise.all([
    gateway.quoteRequest("text", "multiTenant", writerId, {}),
    gateway.quoteRequest("audio", "multiTenant", narratorId, {}),
  ]);
  if (writer.revision !== narrator.revision) throw Object.assign(new Error("模型报价已更新，请重新获取"), { status: 409 });
  const totals = new Map<string, bigint>();
  for (const [quote, calls] of [[writer, 1n], [narrator, 6n]] as const) {
    const [whole, fraction = ""] = quote.amount.split(".");
    const micros = BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, "0"));
    totals.set(quote.currency, (totals.get(quote.currency) ?? 0n) + micros * calls);
  }
  res.set("Cache-Control", "no-store").json(success([...totals].map(([currency, micros]) => {
    const fraction = (micros % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
    return { currency, amount: `${micros / 1000000n}${fraction ? `.${fraction}` : ""}` };
  })));
});
