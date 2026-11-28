import { createHmac, randomInt, randomUUID } from "node:crypto";
import { RedisClient } from "bun";
import nodemailer from "nodemailer";
import { z } from "zod";

export const registrationCodeSchema = z.string().regex(/^\d{6}$/);

type CodePurpose = "registrationEmail" | "passwordReset";
type RecoveryAccount = { id: string; authVersion: number; emailVerifiedAt: number };

const emailSubject = {
  registrationEmail: "Lumo 注册验证码",
  passwordReset: "Lumo 密码重置验证码",
};
const emailText = {
  registrationEmail: (code: string) => `你的 Lumo 注册验证码为 ${code}，5 分钟内有效。请勿向他人透露此验证码。如果你没有发起注册，请忽略此邮件。`,
  passwordReset: (code: string) => `你的 Lumo 密码重置验证码为 ${code}，5 分钟内有效。请勿向他人透露此验证码。如果你没有发起密码重置，请忽略此邮件。`,
};

function codeScope(account: RecoveryAccount | undefined) {
  return account ? `${account.id}:${account.authVersion}:${account.emailVerifiedAt}` : "ineligible";
}

const codeLifetime = 300;
const sendCooldown = 60;
const quotaWindow = 3600;
const emailQuota = 5;
const globalQuota = 120;
const maxAttempts = 5;
const resetResponse = { retryAfter: sendCooldown };

// ACT: 固定窗口从首笔额度预留开始；SMTP 失败仍占额度和冷却，避免自动重发和故障期间无限触发。
const reserveScript = `
local retryAfter = redis.call('TTL', KEYS[2])
for index = 3, 4 do
  if tonumber(redis.call('GET', KEYS[index]) or '0') >= tonumber(ARGV[index + 2]) then
    retryAfter = math.max(retryAfter, redis.call('TTL', KEYS[index]), 1)
  end
end
if retryAfter >= 0 then return math.max(retryAfter, 1) end
for index = 3, 4 do
  if redis.call('INCR', KEYS[index]) == 1 then redis.call('EXPIRE', KEYS[index], ARGV[4]) end
end
redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 0
`;

const activateScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
return 1
`;

const verifyScript = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local digest, attempts = string.match(current, '^([0-9a-f]+):([1-9][0-9]*)$')
if not digest or #digest ~= #ARGV[1] then return 0 end
local difference = 0
for index = 1, #digest do
  difference = bit.bor(difference, bit.bxor(string.byte(digest, index), string.byte(ARGV[1], index)))
end
if difference == 0 then
  redis.call('SET', KEYS[1], 'consumed', 'KEEPTTL')
  return 1
end
redis.call('SET', KEYS[1], digest .. ':' .. (tonumber(attempts) - 1), 'KEEPTTL')
return 0
`;

function unavailable() {
  return Object.assign(new Error("邮箱验证服务暂不可用，请稍后重试"), { status: 503 });
}

export function isRegistrationEmailRequired() {
  const value = process.env.LUMO_EMAIL_REGISTRATION_REQUIRED;
  // 无效开关值不能回退为无需验码的注册模式。
  return value !== undefined && value !== "0";
}

const configSchema = z.object({
  redisUrl: z.url({ protocol: /^rediss?$/ }).refine(value => !!new URL(value).hostname),
  secret: z.base64().transform(value => Buffer.from(value, "base64")).refine(value => value.length === 32),
  host: z.string().max(253).regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i),
  user: z.email(),
  password: z.string().refine(value => !!value.trim()),
});

function readConfig() {
  return configSchema.safeParse({
    redisUrl: process.env.LUMO_REGISTRATION_REDIS_URL,
    secret: process.env.LUMO_REGISTRATION_CODE_SECRET,
    host: process.env.LUMO_DIRECTMAIL_SMTP_HOST,
    user: process.env.LUMO_DIRECTMAIL_SMTP_USER,
    password: process.env.LUMO_DIRECTMAIL_SMTP_PASSWORD,
  });
}

export function isPasswordResetEnabled() {
  return readConfig().success;
}

let service: ReturnType<typeof createService> | undefined;
function getService() {
  if (service) return service;
  const config = readConfig();
  if (!config.success) throw unavailable();
  return service = createService(config.data);
}

function createService({ redisUrl, secret, host, user, password }: z.output<typeof configSchema>) {
  const mail = nodemailer.createTransport({
    host, port: 465, secure: true, auth: { user, pass: password },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, dnsTimeout: 5000,
  });
  let client: RedisClient | undefined;
  let connecting: Promise<void> | undefined;

  function digest(purpose: string, email: string, code = "") {
    return createHmac("sha256", secret).update(`${purpose}\0${email}\0${code}`).digest("hex");
  }

  async function execute(script: string, keys: string[], args: string[]): Promise<number> {
    let redis: RedisClient | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const active = redis = client ??= new RedisClient(redisUrl, {
        connectionTimeout: 2000, autoReconnect: false, enableOfflineQueue: false,
      });
      const command = async () => {
        if (!active.connected) {
          connecting ??= active.connect().finally(() => { if (client === active) connecting = undefined; });
          await connecting;
        }
        return await active.send("EVAL", [script, String(keys.length), ...keys, ...args]);
      };
      const result: unknown = await Promise.race([command(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(unavailable()), 3000);
        timer.unref();
      })]);
      if (typeof result !== "number" || !Number.isInteger(result) || result < 0) throw unavailable();
      return result;
    } catch {
      // 丢弃故障连接；不重放可能已提交的 Lua 命令。
      if (redis && client === redis) {
        client = undefined;
        connecting = undefined;
        redis.close();
      }
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  }

  function emailKey(prefix: string, email: string) { return `${prefix}${digest("email", email)}`; }
  function codeDigest(purpose: CodePurpose, email: string, code: string, scope: string) {
    // 保持已有注册码兼容，重置码与用途、账号、认证版本和验邮时间绑定。
    return purpose === "registrationEmail" ? digest("code", email, code) : digest(purpose, email, `${scope}\0${code}`);
  }

  async function reserve(purpose: CodePurpose, email: string) {
    const prefix = `lumo:{${purpose}}:`;
    const key = emailKey(prefix, email);
    const pending = `pending:${randomUUID()}`;
    const retryAfter = await execute(reserveScript, [`${key}:code`, `${key}:cooldown`, `${key}:quota`, `${prefix}quota`],
      [pending, String(codeLifetime), String(sendCooldown), String(quotaWindow), String(emailQuota), String(globalQuota)]);
    if (retryAfter) throw Object.assign(new Error("发送验证码过于频繁，请稍后重试"), { status: 429, retryAfter });
    return { key, pending };
  }

  async function deliver(purpose: CodePurpose, email: string, { key, pending }: Awaited<ReturnType<typeof reserve>>, scope = "") {
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    try {
      const result = await mail.sendMail({
        from: { name: "Lumo", address: user }, to: { name: "", address: email },
        subject: emailSubject[purpose], text: emailText[purpose](code),
      });
      if (result.accepted.length !== 1) throw unavailable();
    } catch {
      // 邮件服务异常可能带有邮箱或供应商响应，统一错误不能附带原异常。
      throw unavailable();
    }
    // 仅激活本次仍有效的发送，防止 SMTP 延迟后覆盖更新的验证码。
    if (await execute(activateScript, [`${key}:code`], [pending, `${codeDigest(purpose, email, code, scope)}:${maxAttempts}`]) !== 1) {
      throw unavailable();
    }
  }

  return {
    reserve, deliver,
    async verify(purpose: CodePurpose, email: string, code: string, scope = "") {
      const key = emailKey(`lumo:{${purpose}}:`, email);
      return await execute(verifyScript, [`${key}:code`], [codeDigest(purpose, email, code, scope)]) === 1;
    },
  };
}

export async function sendRegistrationEmail(email: string, checkAccount: () => Promise<void>) {
  if (process.env.LUMO_EMAIL_REGISTRATION_REQUIRED !== "1") throw unavailable();
  const mail = getService();
  const reservation = await mail.reserve("registrationEmail", email);
  // 先预留额度，让已注册地址的检查也受同一套频控保护。
  await checkAccount();
  await mail.deliver("registrationEmail", email, reservation);
  return { retryAfter: sendCooldown };
}

export async function verifyRegistrationEmail(email: string, code: string | undefined) {
  if (process.env.LUMO_EMAIL_REGISTRATION_REQUIRED !== "1") throw unavailable();
  if (!code) throw Object.assign(new Error("请输入注册验证码"), { status: 400 });
  if (!await getService().verify("registrationEmail", email, code)) {
    throw Object.assign(new Error("注册验证码无效或已过期，请重新获取"), { status: 400 });
  }
}

export async function sendPasswordResetEmail(email: string, findAccount: () => Promise<RecoveryAccount | undefined>) {
  const mail = getService();
  const reservation = await mail.reserve("passwordReset", email);
  // 先统一确认预留。查询及投递异步执行，避免通过 SMTP 耗时或失败判断账号是否存在。
  setImmediate(() => {
    void findAccount().then(account => account && mail.deliver("passwordReset", email, reservation, codeScope(account))).catch(() => {
      console.error("Lumo 密码重置邮件投递失败");
    });
  });
  return resetResponse;
}

export function verifyPasswordResetEmail(email: string, code: string, account: RecoveryAccount | undefined) {
  return getService().verify("passwordReset", email, code, codeScope(account));
}
