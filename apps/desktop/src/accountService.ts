import express from "express";
import { createOfficialMedia } from "./officialMedia";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { translateMessage } from "@lumo/server/i18n";
import type { AgentTextTransport } from "@lumo/server/agent/types";

const address = process.env.VITE_LUMO_ACCOUNT_SERVICE_URL?.trim();
const service = address && URL.canParse(address) ? new URL(address) : undefined;
const accountServiceOrigin = service?.protocol === "https:" && !service.username && !service.password
  && service.pathname === "/" && !service.search && !service.hash ? service.origin : undefined;

const methods = new Map([["session", "GET"], ["balance", "GET"], ["login", "POST"], ["register", "POST"], ["sendRegistrationCode", "POST"], ["sendPasswordResetCode", "POST"], ["resetPassword", "POST"], ["logout", "POST"], ["redeemCard", "POST"]]);
const cookieName = "lumoDesktopAccount";
const sessionLifetime = 8 * 60 * 60 * 1000;

type Session = { token: string; expiresAt: number };
const validToken = (token: unknown): token is string => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);

export function createAccountServiceRouter(directory: string, restoreSecret: string) {
  const sessions = new Map<string, Session>();
  const credential = { service: "local.lumo.desktop.account", name: createHash("sha256").update(JSON.stringify([accountServiceOrigin, directory])).digest("hex") };
  const cookieOptions = { httpOnly: true, sameSite: "strict", path: "/api" } as const;
  let credentialQueue = Promise.resolve();
  function withCredential<T>(operation: () => Promise<T>) {
    const pending = credentialQueue.then(operation);
    credentialQueue = pending.then(() => {}, () => {});
    return pending;
  }
  function readLocalSession(req: express.Request) {
    const id = (req.get("cookie") ?? "").split(";").map(value => value.trim())
      .find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const session = id ? sessions.get(id) : undefined;
    return session && session.expiresAt > Date.now() ? session : undefined;
  }
  function issueCookie(res: express.Response, session: Session) {
    const id = randomBytes(32).toString("hex");
    sessions.set(id, session);
    res.clearCookie(cookieName, { ...cookieOptions, path: "/api/desktop/account" });
    res.cookie(cookieName, id, { ...cookieOptions, maxAge: Math.max(0, session.expiresAt - Date.now()) });
  }
  async function readCredential(): Promise<Session | undefined> {
    const value = await Bun.secrets.get(credential);
    if (!value) return;
    const session = JSON.parse(value) as Partial<Session> | null;
    if (validToken(session?.token) && typeof session.expiresAt === "number" && Number.isSafeInteger(session.expiresAt) && session.expiresAt > Date.now()) {
      return { token: session.token, expiresAt: session.expiresAt };
    }
    await Bun.secrets.delete(credential);
  }
  function forgetSession(session: Session) {
    return withCredential(async () => {
      for (const [id, candidate] of sessions) if (candidate.token === session.token) sessions.delete(id);
      if ((await readCredential())?.token === session.token) await Bun.secrets.delete(credential);
    });
  }

  const accountServiceRouter = express.Router();
  accountServiceRouter.use((req, res, next) => {
    const source = req.get("origin") ?? req.get("referer");
    const localOrigin = `http://${req.get("host")}`;
    if (req.get("x-lumo-workspace") !== "1" || !source || !URL.canParse(source) || new URL(source).origin !== localOrigin) {
      return void res.sendStatus(403);
    }
    next();
  });
  accountServiceRouter.post("/restore", async (req, res) => {
    const proof = req.get("x-lumo-account-restore");
    if (!accountServiceOrigin || !validToken(proof) || !timingSafeEqual(Buffer.from(proof), Buffer.from(restoreSecret))) return void res.sendStatus(403);
    await withCredential(async () => {
      if (readLocalSession(req)) return;
      const session = await readCredential();
      if (session) issueCookie(res, session);
      else res.clearCookie(cookieName, cookieOptions);
    }).catch(() => console.warn("无法读取 Lumo 本地登录会话"));
    res.sendStatus(204);
  });
  accountServiceRouter.use(express.json({ limit: "4kb" }));
  accountServiceRouter.all("/:action", async (req, res) => {
    const action = req.params.action;
    if (!accountServiceOrigin || methods.get(action) !== req.method) return void res.sendStatus(404);

    const headers: Record<string, string> = {
      "x-lumo-workspace": "1", Origin: accountServiceOrigin, Referer: `${accountServiceOrigin}/`,
      "Accept-Language": req.get("accept-language") ?? "zh-CN",
    };
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(id);
    }
    const session = readLocalSession(req);
    if (session) headers.Cookie = `lumoWebSession=${session.token}`;
    if (req.method === "POST") headers["Content-Type"] = "application/json";
    try {
      const upstream = await fetch(`${accountServiceOrigin}/api/multiTenant/user/${action}`, {
        method: req.method, headers, redirect: "error",
        signal: AbortSignal.timeout((action === "sendRegistrationCode" || action === "sendPasswordResetCode") ? 24000 : 12000),
        body: req.method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
      });
      const result = await upstream.json();
      const retryAfter = upstream.headers.get("retry-after");
      if (upstream.status === 429 && retryAfter && /^\d{1,6}$/.test(retryAfter)) res.setHeader("Retry-After", retryAfter);
      if (upstream.ok && result?.code === 200 && (action === "login" || action === "register")) {
        const upstreamToken = upstream.headers.getSetCookie().map(value => /^lumoWebSession=([a-f0-9]{64});/.exec(value)?.[1]).find(Boolean);
        if (!validToken(upstreamToken)) return void res.status(502).json({ code: 502, message: translateMessage("登录失败") });
        const next = { token: upstreamToken, expiresAt: now + sessionLifetime };
        await withCredential(async () => {
          sessions.clear();
          if (result.data?.user?.role === "user") {
            await Bun.secrets.set({ ...credential, value: JSON.stringify(next) });
          } else {
            await Bun.secrets.delete(credential);
          }
        }).catch(() => console.warn("无法保存 Lumo 本地登录会话"));
        issueCookie(res, next);
      }
      if (session && ((action === "logout" && upstream.ok) || (upstream.status === 401 && action !== "login")
        || (action === "session" && upstream.ok && result?.code === 200 && result?.data?.user === null))) {
        await forgetSession(session).catch(() => console.warn("无法清除 Lumo 本地登录会话"));
        res.clearCookie(cookieName, cookieOptions);
      }
      res.status(upstream.status).json(result);
    } catch {
      res.status(503).json({ code: 503, message: translateMessage("连接失败") });
    }
  });
  const officialTextRouter = express.Router();
  const requireSession: express.RequestHandler = (req, res, next) => {
    const source = req.get("origin") ?? req.get("referer");
    if (!source || !URL.canParse(source) || new URL(source).origin !== `http://${req.get("host")}`
      || req.get("x-lumo-workspace") !== "1") return void res.sendStatus(403);
    if (!readLocalSession(req)) return void res.status(401).json({ code: 401, message: translateMessage("请先登录 Lumo") });
    next();
  };
  function requestCloud(req: express.Request, path: string, data?: object, signal?: AbortSignal) {
    const session = readLocalSession(req);
    if (!session) return Promise.resolve(Response.json({ code: 401, message: translateMessage("请先登录 Lumo") }, { status: 401 }));
    const origin = accountServiceOrigin!;
    return fetch(`${origin}${path}`, {
      method: data ? "POST" : "GET", redirect: "error", signal,
      headers: { Cookie: `lumoWebSession=${session.token}`, Origin: origin, Referer: `${origin}/`,
        "x-lumo-workspace": "1", "Accept-Language": req.get("accept-language") ?? "zh-CN",
        ...(data ? { "Content-Type": "application/json" } : {}) },
      body: data ? JSON.stringify(data) : undefined,
    });
  }
  async function readOfficialModels(req: express.Request) {
    const response = await requestCloud(req, "/api/ai/models", undefined, AbortSignal.timeout(10000));
    if (!response.ok) throw Object.assign(new Error(translateMessage(response.status === 401 ? "请先登录 Lumo" : "读取模型列表失败")), { status: response.status });
    const result = await response.json() as { code?: number; data?: AgentTextTransport["models"] };
    if (result.code !== 200 || !Array.isArray(result.data)) throw new Error(translateMessage("读取模型列表失败"));
    return result.data.filter(model => model.providerId === "multiTenant").map(model => ({ ...model, reasoningLevels: [] }));
  }
  if (accountServiceOrigin) {
    const media = createOfficialMedia(requestCloud);
    const json = express.json({ limit: "2mb" });
    const localRequest = (req: express.Request, path: string, body?: object) => fetch(`http://${req.get("host")}${path}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { Origin: `http://${req.get("host")}`, "x-lumo-workspace": "1", "Content-Type": "application/json",
        "Accept-Language": req.get("accept-language") ?? "zh-CN" },
      body: JSON.stringify(body),
    });
    officialTextRouter.get("/api/ai/media/models", requireSession, media.models);
    officialTextRouter.post("/api/ai/media/price", requireSession, json, media.price);
    officialTextRouter.post("/api/ai/media/generate", requireSession, json, media.submit);
    for (const action of ["status", "cancel"] as const) {
      officialTextRouter.post(`/api/ai/media/tasks/${action}`, (req, res, next) => {
        // 本机聚合请求不带桌面会话，交回本地服务处理旧任务。
        if (!readLocalSession(req)) return next("route");
        requireSession(req, res, next);
      }, json, media.tasks(action, localRequest));
    }
    officialTextRouter.get("/api/ai/models", requireSession, async (req, res, next) => {
      res.locals.officialTextModels = await readOfficialModels(req);
      next();
    });
    officialTextRouter.post("/api/agent", requireSession, express.json({ limit: "8mb" }), async (req, res, next) => {
      if (req.body?.providerId !== "multiTenant") return next();
      const models = await readOfficialModels(req);
      if (!models.length) return void res.status(503).json({ code: 503, message: translateMessage("平台尚未发布文本模型，请联系管理员") });
      const session = readLocalSession(req);
      const transport: AgentTextTransport = {
        models,
        generate: (input, signal) => session && readLocalSession(req) === session
          ? requestCloud(req, "/api/ai/generate", input, signal)
          : Promise.resolve(Response.json({ code: 401, message: translateMessage("请先登录 Lumo") }, { status: 401 })),
      };
      res.locals.agentTextTransport = transport;
      next();
    });
  }
  return { accountServiceRouter, officialTextRouter };
}
