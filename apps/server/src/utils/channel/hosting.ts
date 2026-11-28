import { z } from "zod";

// Lumo 账号托管（算力汇 new-api）：Lumo 服务端持总账号 access_token（id=78）静默管理子账号。
// 总账号 token 只从环境变量读取，绝不落代码或明文仓库；子账号明文 key 只用于请求，不写日志。
const hostingBaseUrl = "https://api.ideamine.cn";
const lumoMasterUserId = "78";
const trialRemainQuota = 142857;
const requestTimeoutMs = 20000;
const hostedGroup = "default";
const hostedKeyLifetime = 5 * 60 * 1000;
const hostedKeyCache = new Map<string, { key: string; expiresAt: number }>();

export type HostedSubAccount = { id: number; key: string };
export type HostedTokenSummary = { id: number; name: string };
export type HostedUserAccount = { id: number; key: string; remainingQuota: number };

const hostedTokenId = z.number().int().positive();

function fail(message: string, status = 502): never {
  throw Object.assign(new Error(message), { status });
}

function masterToken() {
  const token = process.env.LUMO_ACCESS_TOKEN?.trim();
  if (!token) fail("未配置 Lumo 总账号 access_token（LUOMO_ACCESS_TOKEN）", 503);
  return token;
}

// ACT: 管理端走 new-api 的 { success, data, message } 包装；余额接口是 OpenAI 兼容直出，单独解析。
function unwrap(body: unknown, signal?: AbortSignal): unknown {
  if (signal?.aborted) fail("请求已取消", 499);
  const record = body as { success?: unknown; message?: unknown; data?: unknown } | null;
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("算力汇 响应格式不正确", 502);
  if (record.success === false) {
    let message = typeof record.message === "string" && record.message.trim() ? record.message : "算力汇 请求失败";
    message = message.replace(/(Bearer\s+)[^\s"'<>]+/gi, "$1••••••").slice(0, 1000);
    fail(message, 502);
  }
  return record.data;
}

async function request(params: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: unknown;
  token?: string;
  newApiUser?: boolean;
  signal?: AbortSignal;
}): Promise<{ body: unknown; ok: boolean; status: number }> {
  const timeout = AbortSignal.timeout(requestTimeoutMs);
  const signal = params.signal ? AbortSignal.any([params.signal, timeout]) : timeout;
  const token = params.token ?? masterToken();
  let response: Response | undefined;
  let body: unknown;
  try {
    response = await fetch(hostingBaseUrl + params.path, {
      method: params.method ?? "GET",
      signal,
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
        ...(params.newApiUser ? { "New-Api-User": lumoMasterUserId } : {}),
        ...(params.data !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(params.data !== undefined ? { body: JSON.stringify(params.data) } : {}),
    });
    body = await response.json();
  } catch (error) {
    if (params.signal?.aborted) fail("请求已取消", 499);
    if (timeout.aborted) fail("算力汇 请求超时，请重试", 504);
    fail(response ? "算力汇 响应格式不正确" : "算力汇 请求失败，请检查网络连接", 502);
  }
  if (params.signal?.aborted) fail("请求已取消", 499);
  return { body, ok: response.ok, status: response.status };
}

function sanitizeMessage(value: unknown): string {
  let message = typeof value === "string" && value.trim() ? value : "算力汇 请求失败";
  message = message.replace(/(Bearer\s+)[^\s"'<>]+/gi, "$1••••••").slice(0, 1000);
  return message;
}

export const hosting = {
  // 建子账号并取明文 key（name=lumo-<uid> 即映射；不传 group，自动跟随 lumo 分组享 9 折）。
  async createSubAccount(userId: string, remainQuota = trialRemainQuota, signal?: AbortSignal): Promise<HostedSubAccount> {
    if (typeof userId !== "string" || !userId.trim() || userId.trim().length > 64) fail("用户 ID 无效", 400);
    if (!Number.isFinite(remainQuota) || remainQuota < 0) fail("体验额度无效", 400);
    const name = `lumo-${userId.trim()}`;
    const result = await request({
      method: "POST", path: "/api/token/", newApiUser: true, signal,
      data: { name, remain_quota: remainQuota, expired_time: -1, unlimited_quota: false, model_limits_enabled: false, group: hostedGroup },
    });
    if (!result.ok) fail(sanitizeMessage((result.body as { message?: unknown })?.message), result.status >= 400 && result.status <= 599 ? result.status : 502);
    const data = unwrap(result.body, signal);
    const id = (data as { id?: unknown } | null)?.id;
    if (!hostedTokenId.safeParse(id).success) fail("算力汇 建子账号响应格式不正确", 502);
    return { id: id as number, key: await this.getSubAccountKey(id as number, signal) };
  },

  // 列表/搜索接口里的 key 是打码的，明文只能走这个 POST。
  async getSubAccountKey(tokenId: number, signal?: AbortSignal): Promise<string> {
    if (!hostedTokenId.safeParse(tokenId).success) fail("子账号 ID 无效", 400);
    const result = await request({ method: "POST", path: `/api/token/${tokenId}/key`, newApiUser: true, signal });
    if (!result.ok) fail(sanitizeMessage((result.body as { message?: unknown })?.message), result.status >= 400 && result.status <= 599 ? result.status : 502);
    const data = unwrap(result.body, signal);
    const key = typeof data === "string" ? data : (data as { key?: unknown } | null)?.key;
    if (typeof key !== "string" || !key.trim()) fail("算力汇 明文 key 响应格式不正确", 502);
    return key.trim();
  },

  // ACT: new-api 的 PUT 会整体覆盖令牌，必须回传已有字段，否则 name 等会被清空。
  async updateSubAccount(tokenId: number, changes: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
    const current = await request({ path: `/api/token/${tokenId}`, newApiUser: true, signal });
    const data = unwrap(current.body, signal) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") fail("算力汇 子账号响应格式不正确", 502);
    const editable = ["name", "expired_time", "remain_quota", "unlimited_quota", "model_limits_enabled", "model_limits", "allow_ips", "status", "group"];
    const payload: Record<string, unknown> = { id: tokenId };
    for (const key of editable) if (data[key] !== undefined) payload[key] = data[key];
    Object.assign(payload, changes);
    // ACT: 分组为空会让令牌在 /v1 鉴权时报 Invalid token，必须落回可用分组。
    if (!payload.group) payload.group = hostedGroup;
    const result = await request({ method: "PUT", path: "/api/token/", newApiUser: true, signal, data: payload });
    if (!result.ok) fail(sanitizeMessage((result.body as { message?: unknown })?.message), result.status >= 400 && result.status <= 599 ? result.status : 502);
    unwrap(result.body, signal);
  },

  // 充值：调大 remain_quota。Lumo 内支付成功后由服务端调用（S2 接入支付流）。
  async rechargeSubAccount(tokenId: number, remainQuota: number, signal?: AbortSignal): Promise<void> {
    if (!hostedTokenId.safeParse(tokenId).success) fail("子账号 ID 无效", 400);
    if (!Number.isFinite(remainQuota) || remainQuota < 0) fail("充值额度无效", 400);
    await this.updateSubAccount(tokenId, { remain_quota: remainQuota }, signal);
  },

  // 封停：status=2。欠费或人工封停时使用（S2 余额拦截联动）。
  async suspendSubAccount(tokenId: number, signal?: AbortSignal): Promise<void> {
    if (!hostedTokenId.safeParse(tokenId).success) fail("子账号 ID 无效", 400);
    await this.updateSubAccount(tokenId, { status: 2 }, signal);
  },

  // 余额：子账号维度，用子账号 key 当 Bearer（OpenAI 兼容直出）。
  async getBalance(key: string, signal?: AbortSignal): Promise<number> {
    if (typeof key !== "string" || !key.trim()) fail("子账号 key 无效", 400);
    const result = await request({ path: "/v1/dashboard/billing/subscription", token: key.trim(), signal });
    if (!result.ok) fail(sanitizeMessage((result.body as { message?: unknown })?.message), result.status >= 400 && result.status <= 599 ? result.status : 502);
    const remainingQuota = (result.body as { remaining_quota?: unknown } | null)?.remaining_quota;
    if (typeof remainingQuota !== "number" || !Number.isFinite(remainingQuota)) fail("算力汇 余额响应格式不正确", 502);
    return remainingQuota;
  },

  // 反查映射：keyword=lumo-<uid>。返回 token 摘要，供对账/补齐子账号用。
  async searchSubAccounts(keyword: string, signal?: AbortSignal): Promise<HostedTokenSummary[]> {
    if (typeof keyword !== "string" || !keyword.trim() || keyword.trim().length > 200) fail("反查关键词无效", 400);
    const query = new URLSearchParams({ keyword: keyword.trim() });
    const result = await request({ path: "/api/token/search?" + query, newApiUser: true, signal });
    if (!result.ok) fail(sanitizeMessage((result.body as { message?: unknown })?.message), result.status >= 400 && result.status <= 599 ? result.status : 502);
    const data = unwrap(result.body, signal);
    const list = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items;
    if (!Array.isArray(list)) return [];
    return list.flatMap(item => {
      const record = item as { id?: unknown; name?: unknown } | null;
      if (!record || typeof record !== "object" || !hostedTokenId.safeParse(record.id).success || typeof record.name !== "string") return [];
      return [{ id: record.id as number, name: record.name }];
    });
  },

  // 文本只需子账号 Key；上游余额接口格式变动不能阻断取 Key。
  async getUserSubAccountKey(userId: string, signal?: AbortSignal): Promise<string> {
    if (typeof userId !== "string" || !userId.trim() || userId.trim().length > 64) fail("用户 ID 无效", 400);
    const id = userId.trim();
    const cached = hostedKeyCache.get(id);
    if (cached && cached.expiresAt > Date.now()) return cached.key;
    const service = this;
    async function resolve() {
      const name = `lumo-${id}`;
      const matches = await service.searchSubAccounts(name, signal);
      const account = matches.find((item: HostedTokenSummary) => item.name === name);
      if (!account) fail("未找到算力汇子账号，请重新注册或联系客服", 404);
      return service.getSubAccountKey(account.id, signal);
    }
    let key: string;
    try {
      key = await resolve();
    } catch (error) {
      if ((error as { status?: number }).status === 404 || signal?.aborted) throw error;
      key = await resolve();
    }
    hostedKeyCache.set(id, { key, expiresAt: Date.now() + hostedKeyLifetime });
    return key;
  },

  // 按 Lumo 用户 ID 反查子账号（name=lumo-<uid>）并取明文 key + 余额。明文 key 仅用于本次请求，不落日志、不持久化。
  async getUserSubAccount(userId: string, signal?: AbortSignal): Promise<HostedUserAccount> {
    if (typeof userId !== "string" || !userId.trim() || userId.trim().length > 64) fail("用户 ID 无效", 400);
    const name = `lumo-${userId.trim()}`;
    const matches = await this.searchSubAccounts(name, signal);
    const account = matches.find(item => item.name === name);
    if (!account) fail("未找到算力汇子账号，请重新注册或联系客服", 404);
    const key = await this.getSubAccountKey(account.id, signal);
    const remainingQuota = await this.getBalance(key, signal);
    return { id: account.id, key, remainingQuota };
  },

  // 按用户增量调高子账号额度；上游余额接口不参与，避免格式变动阻断充值对齐。
  async addSubAccountQuota(userId: string, quotaDelta: number, signal?: AbortSignal): Promise<void> {
    if (!Number.isSafeInteger(quotaDelta) || quotaDelta <= 0) fail("充值额度无效", 400);
    const name = `lumo-${userId.trim()}`;
    const matches = await this.searchSubAccounts(name, signal);
    const account = matches.find(item => item.name === name);
    if (!account) fail("未找到算力汇子账号，请重新注册或联系客服", 404);
    const current = await request({ path: `/api/token/${account.id}`, newApiUser: true, signal });
    const data = unwrap(current.body, signal) as { remain_quota?: unknown } | null;
    const remain = typeof data?.remain_quota === "number" ? data.remain_quota : 0;
    await this.rechargeSubAccount(account.id, remain + quotaDelta, signal);
  },

  // 充值：先查当前余额，再按增量调大 remain_quota（PUT 的 remain_quota 为绝对值）。
  async rechargeUserSubAccount(userId: string, quotaDelta: number, signal?: AbortSignal): Promise<number> {
    if (!Number.isSafeInteger(quotaDelta) || quotaDelta <= 0) fail("充值额度无效", 400);
    const account = await this.getUserSubAccount(userId, signal);
    const next = account.remainingQuota + quotaDelta;
    if (!Number.isSafeInteger(next)) fail("充值额度超出范围", 400);
    await this.rechargeSubAccount(account.id, next, signal);
    return next;
  },
};
