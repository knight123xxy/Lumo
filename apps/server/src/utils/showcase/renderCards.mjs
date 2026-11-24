#!/usr/bin/env node
// 逐帧渲染一个 HTML 卡片页为 MP4。由服务端以 `node renderCards.mjs --input <json>` 调用。
// 不引入 puppeteer / playwright：用 Node 内置 WebSocket 直连 Chrome DevTools 协议。
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

function resolveChrome(explicit) {
  const candidates = [explicit, process.env.LUMO_CHROME, ...CHROME_CANDIDATES].filter(Boolean);
  const found = candidates.find(path => existsSync(path));
  if (!found) fail("未找到 Chrome，请安装 Google Chrome 或设置 LUMO_CHROME");
  return found;
}

async function waitForPort(profile, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const content = await readFile(profile + "/DevToolsActivePort", "utf8");
      const port = Number(content.split("\n")[0]);
      if (port) return port;
    } catch { /* 端口文件尚未生成。 */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  fail("Chrome 启动超时");
}

function encodeArgs({ out, fps, width, height, crf, transparent }) {
  if (transparent) return [
    "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", out,
  ];
  return [
    "-v", "error", "-y",
    "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
    "-vf", "scale=" + width + ":" + height + ":force_original_aspect_ratio=decrease,pad=" + width + ":" + height + ":(ow-iw)/2:(oh-ih)/2:color=0x0e0e0d",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf ?? 18), "-pix_fmt", "yuv420p",
    "-r", String(fps), out,
  ];
}

async function main() {
  const inputPath = process.argv[process.argv.indexOf("--input") + 1];
  if (!inputPath) fail("缺少 --input");
  const job = JSON.parse(await readFile(inputPath, "utf8"));
  const { htmlPath, out, seconds, fps = 30, width = 1080, height = 1920, crf, chrome, settle = 0, transparent = false } = job;
  const total = Math.max(1, Math.round(seconds * fps));

  const executable = resolveChrome(chrome);
  const profile = await mkdtemp(join(tmpdir(), "lumo-card-"));
  const browser = spawn(executable, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-crash-reporter",
    "--hide-scrollbars", "--mute-audio", "--no-first-run", "--no-default-browser-check",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--force-device-scale-factor=1",
    "--window-size=" + width + "," + height, "--remote-allow-origins=*", "--remote-debugging-port=0",
    "--user-data-dir=" + profile, "about:blank",
  ], { stdio: "ignore" });

  const cleanup = () => { try { browser.kill("SIGKILL"); } catch { /* 已退出。 */ } };
  process.on("exit", cleanup);
  process.on("SIGTERM", () => { cleanup(); process.exit(1); });

  try {
    const port = await waitForPort(profile, 25000);
    const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then(response => response.json());
    const target = targets.find(item => item.type === "page" && item.webSocketDebuggerUrl);
    if (!target) fail("未找到可用的浏览器页面");

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error("浏览器调试连接失败"));
    });

    const pending = new Map();
    let sequence = 0;
    socket.onmessage = event => {
      const reply = JSON.parse(String(event.data));
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (reply.error) entry.reject(new Error(reply.error.message || "浏览器执行失败"));
      else entry.resolve(reply.result || {});
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pathToFileURL(htmlPath).href });
    for (let i = 0; i < 300; i++) {
      const state = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
      if (state.result?.value === "complete") break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const hasFrame = await send("Runtime.evaluate", { expression: "typeof window.renderFrame === 'function'", returnByValue: true });

    if (transparent) await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    const screenshot = { format: transparent ? "png" : "jpeg", ...(transparent ? {} : { quality: 92 }), captureBeyondViewport: false };
    const encoder = spawn("ffmpeg", encodeArgs({ out, fps, width, height, crf, transparent }), { stdio: ["pipe", "ignore", "pipe"] });
    let encoderError = "";
    encoder.stderr.on("data", chunk => { encoderError += String(chunk); });
    const encoderDone = new Promise((resolve, reject) => {
      encoder.on("error", reject);
      encoder.on("close", code => code === 0 ? resolve() : reject(new Error(encoderError.trim() || "ffmpeg 退出码 " + code)));
    });

    // ACT: 入场动画结束后画面静止，复用最后一帧，避免整段逐帧截图（渲染时间可降一个数量级）。
    let cached = null;
    for (let index = 0; index < total; index++) {
      const secondsAt = index / fps;
      if (hasFrame.result?.value && (!settle || secondsAt < settle)) {
        await send("Runtime.evaluate", { expression: "window.renderFrame(" + secondsAt.toFixed(4) + ")" });
        cached = Buffer.from((await send("Page.captureScreenshot", screenshot)).data, "base64");
      } else if (!cached) {
        cached = Buffer.from((await send("Page.captureScreenshot", screenshot)).data, "base64");
      }
      if (!encoder.stdin.write(cached)) await new Promise(resolve => encoder.stdin.once("drain", resolve));
    }
    encoder.stdin.end();
    await encoderDone;
    socket.close();
    console.log(JSON.stringify({ out, frames: total }));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    cleanup();
  }
}

main();
