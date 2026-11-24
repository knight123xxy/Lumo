import type { Request } from "express";
import type { ModelProvider, ModelRoute } from "@lumo/multi-tenant-models/config";
import type { BillingCredit } from "@lumo/multi-tenant-billing/config";
import { authorize } from "./index";
import { requestIdentity } from "./runtime";
import { modelGateway } from "./gateway";
import { hosting } from "@/utils/channel";
import { assertAppRequest } from "@/utils/mcp/control";

export async function getModelRouting(req: Request) {
  await authorize(req);
  return modelGateway.read();
}

export async function getAvailableModels(req: Request) {
  await authorize(req);
  return modelGateway.available();
}

export async function saveModelRouting(req: Request, input: ModelRoute[], expectedRevision: number) {
  await authorize(req);
  return modelGateway.save(input, expectedRevision);
}

export async function configureModelCloud(req: Request, token: string | undefined, expectedRevision: number, signal: AbortSignal) {
  await authorize(req);
  return modelGateway.configureCloud(token, expectedRevision, signal);
}

export async function getModelProviders(req: Request) {
  await authorize(req);
  return modelGateway.getProviders();
}

export async function saveModelProviders(req: Request, providers: ModelProvider[], expectedRevision: number) {
  await authorize(req);
  return modelGateway.saveProviders(providers, expectedRevision);
}

export async function inspectModelProvider(req: Request, kind: ModelProvider["kind"], source: string, config: ModelProvider["config"], models?: unknown) {
  await authorize(req);
  return modelGateway.inspectProvider(kind, source, config, models);
}

export async function getUserBilling(req: Request, userId: string) {
  await authorize(req);
  return modelGateway.readBalance(userId);
}

export async function creditUserBalance(req: Request, input: BillingCredit) {
  await authorize(req);
  return modelGateway.credit(input);
}

export async function releaseUserReservation(req: Request, userId: string, requestId: string, reason: string) {
  await authorize(req);
  return modelGateway.releaseReservation(userId, requestId, { actorId: "admin", reason });
}

export async function readOwnBalance(req: Request) {
  assertAppRequest(req);
  const user = requestIdentity(req);
  if (!user) throw Object.assign(new Error("请先登录 算力汇"), { status: 401 });
  if (user.role !== "user") return { wallets: [], transactions: [] };
  return modelGateway.readBalance(user.id);
}

export async function issueRechargeCard(req: Request, amount: string) {
  await authorize(req);
  return modelGateway.issueCard(amount);
}

export async function redeemRechargeCard(req: Request, code: string) {
  assertAppRequest(req);
  const user = requestIdentity(req);
  if (user?.role !== "user") throw Object.assign(new Error("请使用普通账号兑换充值卡"), { status: 403 });
  return modelGateway.redeemCard(user.id, code);
}

// 托管充值：Lumo 内支付成功后由服务端调用，调大该用户算力汇子账号 remain_quota。
// ACT: 支付网关尚不存在，此方法当前仅对超管开放；接入真实支付后由支付回调持服务端凭据调用，不能在用户端凭自报金额充值。
export async function rechargeUserSubAccount(req: Request, userId: string, quota: number) {
  await authorize(req);
  return { remainingQuota: await hosting.rechargeUserSubAccount(userId, quota) };
}
