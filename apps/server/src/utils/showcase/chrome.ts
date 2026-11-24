import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkdtemp, readFile, rm } from "@lumo/file";

type CdpReply = { id?: number; result?: Record<string, unknown>; error?: { message?: string } };

export type ChromePage = {
  navigate(url: string): Promise<void>;
  evaluate<T = unknown>(expression: string): Promise<T>;
  screenshot(format: "jpeg" | "png", quality?: number): Promise<Uint8Array>;
};

export type ChromeOptions = { width: number; height: number; executable?: string; timeout?: number };

const platformChrome = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export function resolveChrome(executable?: string) {
  const candidate = executable?.trim() || process.env.LUMO_CHROME?.trim() || platformChrome.find(path => existsSync(path));
  if (!candidate || !existsSync(candidate)) {
    throw Object.assign(new Error("未找到 Chrome，请安装 Google Chrome 或设置 LUMO_CHROME"), { status: 503 });
  }
  return candidate;
}

function deliver(target: Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (cause: Error) => void; timer: Timer }>,
  id: number, error: Error | undefined, value: Record<string, unknown> | undefined) {
  const pending = target.get(id);
  if (!pending) return;
  target.delete(id);
  clearTimeout(pending.timer);
  if (error) pending.reject(error);
  else pending.resolve(value ?? {});
}

// ACT: 不引入 puppeteer / playwright，直接用 Bun 内置 WebSocket 走 DevTools 协议，逐帧截图交给 ffmpeg。
export async function withChrome<T>(options: ChromeOptions, run: (page: ChromePage) => Promise<T>) {
  const executable = resolveChrome(options.executable);
  const profile = await mkdtemp(join(process.env.TMPDIR || "/tmp", "lumo-chrome-"));
  const timeout = options.timeout ?? 20000;
  const chrome = spawn(executable, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--no-first-run", "--no-default-browser-check",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--force-device-scale-factor=1",
    `--window-size=${options.width},${options.height}`, "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });

  let socket: WebSocket | undefined;
  try {
    const portFile = join(profile, "DevToolsActivePort");
    const deadline = Date.now() + timeout;
    let port = 0;
    while (Date.now() < deadline) {
      if (chrome.exitCode !== null) throw Object.assign(new Error("Chrome 启动后立即退出"), { status: 503 });
      const content = await readFile(portFile).then(value => value.toString("utf8")).catch(() => "");
      if (content.includes("\n")) { port = Number(content.split("\n")[0]); if (port) break; }
      await Bun.sleep(120);
    }
    if (!port) throw Object.assign(new Error("Chrome 启动超时"), { status: 504 });

    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json()) as { type?: string; webSocketDebuggerUrl?: string }[];
    const target = targets.find(item => item.type === "page" && item.webSocketDebuggerUrl);
    if (!target?.webSocketDebuggerUrl) throw Object.assign(new Error("未找到可用的浏览器页面"), { status: 503 });

    const client = new WebSocket(target.webSocketDebuggerUrl);
    socket = client;
    const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (cause: Error) => void; timer: Timer }>();
    let sequence = 0;
    await new Promise<void>((resolve, reject) => {
      client.onopen = () => resolve();
      client.onerror = () => reject(Object.assign(new Error("浏览器调试连接失败"), { status: 503 }));
    });
    client.onmessage = event => {
      const reply = JSON.parse(String(event.data)) as CdpReply;
      if (reply.id === undefined) return;
      deliver(pending, reply.id, reply.error ? Object.assign(new Error(reply.error.message || "浏览器执行失败"), { status: 500 }) : undefined, reply.result);
    };

    function send(method: string, params: Record<string, unknown> = {}) {
      const id = ++sequence;
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => deliver(pending, id, Object.assign(new Error("浏览器响应超时"), { status: 504 }), undefined), 60000);
        pending.set(id, { resolve, reject, timer });
        client.send(JSON.stringify({ id, method, params }));
      });
    }

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: options.width, height: options.height, deviceScaleFactor: 1, mobile: false });

    const page: ChromePage = {
      async navigate(url) {
        await send("Page.navigate", { url });
        const until = Date.now() + 30000;
        while (Date.now() < until) {
          const ready = await page.evaluate<string>("document.readyState").catch(() => "");
          if (ready === "complete") return;
          await Bun.sleep(80);
        }
        throw Object.assign(new Error("页面加载超时"), { status: 504 });
      },
      async evaluate<T>(expression: string) {
        const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        const details = result as { result?: { value?: T }; exceptionDetails?: { text?: string } };
        if (details.exceptionDetails) throw Object.assign(new Error(details.exceptionDetails.text || "页面脚本执行失败"), { status: 500 });
        return details.result?.value as T;
      },
      async screenshot(format, quality) {
        const result = await send("Page.captureScreenshot", { format, ...(format === "jpeg" ? { quality: quality ?? 90 } : {}), captureBeyondViewport: false });
        return new Uint8Array(Buffer.from(String((result as { data?: string }).data ?? ""), "base64"));
      },
    };
    return await run(page);
  } finally {
    try { socket?.close(); } catch { /* 连接可能已断开。 */ }
    chrome.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}
