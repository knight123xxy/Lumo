import { setLocaleFallback, t, translateMessage } from "@lumo/server/i18n";
import { setRuntimeHost } from "@lumo/server/platform";
import { detectLocale, normalizeLocale } from "@lumo/i18n";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, writeAtomicSync } from "@lumo/file";
import { file } from "@lumo/file/bun";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { dlopen, ptr } from "bun:ffi";
import type { DesktopRuntime, PluginInstallRequest } from "@lumo/server/desktop";
import { showNativeSplash } from "@lumo/startup";
import Electrobun, { ApplicationMenu, BrowserWindow, PATHS, Screen, Utils, Updater } from "electrobun/main";
import { parseInstallUrl } from "./protocol";
import saveFile, { selectSaveFile } from "./saveFile";
import createLinuxDebUpdater from "./update/linuxDebUpdater";
import createWindowsUpdater, { confirmWindowsUpdateStartup } from "./update/windowsUpdater";
import showWindowsNotification from "./windowsNotification";
import registerWindowAppearance from "./windowAppearance";
import startOpenFilmStudio, { openFilmRuntime } from "./openFilmStudio";

const execFileAsync = promisify(execFile);
const pendingInstalls: PluginInstallRequest[] = [];
let deliverInstall: ((request: PluginInstallRequest) => void) | undefined;
function openUrl(url: string) {
  const request = parseInstallUrl(url);
  if (deliverInstall) deliverInstall(request);
  else if (!pendingInstalls.some(item => item.type === request.type && item.url === request.url)) {
    if (pendingInstalls.length >= 20) throw new Error(t`待确认的安装请求过多，请稍后重试`);
    pendingInstalls.push(request);
  }
}
// 冷启动的 macOS URL 可能先于窗口就绪到达，先接收再等待页面挂载。
Electrobun.events.on("open-url", event => {
  try { openUrl(event.data.url); }
  catch (error) {
    void Utils.showMessageBox({ type: "error", title: t`安装链接无效`, message: translateMessage(error instanceof Error ? error.message : "无法打开安装链接") });
  }
});

// ACT: 原生运行时准备窗口收到的安装链接，在主进程接管后交回同一安装队列。
const pendingUrlData = process.env.LUMO_PENDING_URLS;
delete process.env.LUMO_PENDING_URLS;
if (process.platform === "darwin" && pendingUrlData) {
  try {
    if (pendingUrlData.length > 65536) throw new Error("待处理安装链接过长");
    const urls: unknown = JSON.parse(pendingUrlData);
    if (!Array.isArray(urls) || urls.length > 20 || urls.some(url => typeof url !== "string")) throw new Error("待处理安装链接格式无效");
    for (const url of urls) openUrl(url);
  } catch (error) {
    console.error("接收首次启动安装链接失败：", error);
  }
}

async function restoreInstallRegistration(installDirectory: string) {
  const uninstaller = resolve(installDirectory, "UninstallNSIS.exe");
  if (process.platform === "win32" && existsSync(uninstaller)) {
    try {
      // SDK 启动和更新会重写卸载入口；安装了 NSIS 时统一交给它处理数据保留选项。
      const { identifier, channel } = await file(resolve(PATHS.RESOURCES_FOLDER, "version.json")).json();
      const registryKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${identifier}.${channel}`;
      for (const [name, command] of [["UninstallString", `"${uninstaller}"`], ["QuietUninstallString", `"${uninstaller}" /S`]]) {
        await execFileAsync("reg.exe", ["add", registryKey, "/v", name, "/t", "REG_SZ", "/d", command, "/f"], { windowsHide: true });
      }
      const protocolLauncher = resolve(PATHS.RESOURCES_FOLDER, "app/protocolLauncher.exe");
      if (existsSync(protocolLauncher)) {
        const protocolKey = "HKCU\\Software\\Classes\\lumo";
        const commandKey = `${protocolKey}\\shell\\open\\command`;
        const command = `"${protocolLauncher}" "%1"`;
        let protocolExists = true;
        try {
          await execFileAsync("reg.exe", ["query", protocolKey], { windowsHide: true });
        } catch (error) {
          if ((error as { code?: number }).code !== 1) throw error;
          protocolExists = false;
        }
        // ACT: 自动更新不经过 NSIS；仅补全缺失协议，已有注册（包括其他安装）保持不动。
        if (!protocolExists) {
          for (const [key, value] of [[protocolKey, "URL:Lumo Protocol"], [`${protocolKey}\\DefaultIcon`, `"${resolve(PATHS.RESOURCES_FOLDER, "app.ico")}",0`], [commandKey, command]]) {
            await execFileAsync("reg.exe", ["add", key, "/ve", "/t", "REG_SZ", "/d", value, "/f"], { windowsHide: true });
          }
          await execFileAsync("reg.exe", ["add", protocolKey, "/v", "URL Protocol", "/t", "REG_SZ", "/d", "", "/f"], { windowsHide: true });
        }
      }
    } catch (error) {
      console.error("恢复桌面安装注册信息失败：", error);
    }
  }
}

async function start() {
  const startedAt = performance.now();
  const trace = process.platform === "darwin" && process.env.LUMO_MAC_STARTUP_TRACE === "1"
    ? (stage: string) => console.info(`[Lumo 启动] ${Math.round(performance.now() - startedAt)} ms ${stage}`)
    : undefined;
  trace?.("桌面入口已加载");
  let splash: Awaited<ReturnType<typeof showNativeSplash>> | undefined;
  let desktopConnection: Awaited<ReturnType<typeof import("./connection").default>> | undefined;
  let creationWindow: BrowserWindow | undefined;
  let isClosing = false;
  function closeCreationWindow() {
    const current = creationWindow;
    creationWindow = undefined;
    current?.close();
  }

  try {
    // Linux 安装目录由包管理器管理，数据使用 XDG 用户目录；Windows/macOS 保留原位置。
    const installDirectory = resolve(PATHS.RESOURCES_FOLDER, process.platform === "darwin" ? "../../.." : "../..");
    const dataDirectory = process.env.LUMO_DATA_DIR ?? (process.platform === "linux"
      ? resolve(Utils.paths.appData, "lumo/data") : resolve(installDirectory, "data"));
    // ACT: 先显示原生动画，再加载服务，避免初始化期间没有反馈。
    const startupSettings = await file(resolve(dataDirectory, "settings.json")).json().catch((error) => {
      if (error.code !== "ENOENT") console.error("读取启动设置失败，使用默认启动动画：", error);
      return null;
    });
    setLocaleFallback(() => normalizeLocale(startupSettings?.settings?.ui?.language)
      ?? detectLocale([Intl.DateTimeFormat().resolvedOptions().locale]));
    if (process.platform === "darwin") {
      // ACT: WKWebView 的 Command 编辑快捷键由原生菜单角色交给当前响应者处理。
      ApplicationMenu.setApplicationMenu([
        { label: "Lumo", submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "showAll" },
          { type: "separator" },
          { role: "quit" },
        ] },
        { label: t`编辑`, submenu: [
          { role: "undo", label: t`撤销` },
          { role: "redo", label: t`重做` },
          { type: "separator" },
          { role: "cut", label: t`剪切` },
          { role: "copy", label: t`复制` },
          { role: "paste", label: t`粘贴` },
          { role: "selectAll", label: t`全选` },
        ] },
      ]);
    }
    try {
      if ((process.platform === "darwin" || process.platform === "win32" && process.arch === "x64")
        && startupSettings?.settings?.ui?.startupAnimation !== false) {
        splash = await showNativeSplash(resolve(PATHS.VIEWS_FOLDER, "../startup"), () => {
          isClosing = true;
          splash = undefined;
          Utils.quit();
        });
      }
    } catch (error) {
      console.error("原生启动画面创建失败：", error);
    }
    if (isClosing) {
      splash?.close();
      return;
    }
    trace?.("正在加载服务模块");
    setRuntimeHost("desktop");
    const { createApp } = await import("@lumo/server/app");
    const { closeBrowsers } = await import("@lumo/server/browser");
    const { hash, version, identifier, channel } = await file(resolve(PATHS.RESOURCES_FOLDER, "version.json")).json();
    if (typeof hash !== "string" || !hash) throw new Error(t`应用构建标识缺失，无法同步内置插件`);
    trace?.("正在初始化本地服务");
    const app = await createApp({
      webRoot: resolve(PATHS.VIEWS_FOLDER, "mainview"),
      appVersion: typeof version === "string" ? version : "",
      dataDirectory,
      toolsRoot: resolve(PATHS.VIEWS_FOLDER, "../tools"),
      nodesRoot: resolve(PATHS.VIEWS_FOLDER, "../nodes"),
      extRoot: resolve(PATHS.VIEWS_FOLDER, "../ext"),
      skillsRoot: resolve(PATHS.VIEWS_FOLDER, "../skills"),
      // ACT: 暂不安装内置团队，随团队打包一同恢复。
      // agentsRoot: resolve(PATHS.VIEWS_FOLDER, "../agents"),
      pluginRevision: hash,
    });
    trace?.("本地服务已初始化，正在建立桌面连接");
    const hostSecret = randomBytes(32).toString("hex");
    const accountRestoreSecret = randomBytes(32).toString("hex");
    const { registerHostClient } = await import("@lumo/server/multiTenant");
    registerHostClient(app, hostSecret);
    let studioConnectionRevision = 0;
    let openFilmBridgeToken = randomBytes(32).toString("hex");
    let openFilmStudio: ReturnType<typeof startOpenFilmStudio> | undefined;
    let studioShutdown = Promise.resolve();
    function closeOpenFilmStudio() {
      const pending = openFilmStudio;
      openFilmStudio = undefined;
      if (pending) {
        studioShutdown = studioShutdown.then(async () => {
          const studio = await pending.catch(() => undefined);
          await studio?.close();
        }).catch(error => console.error("OpenFilm Studio 关闭失败：", error));
      }
    }
    const { default: createDesktopConnection } = await import("./connection");
    const connection = desktopConnection = await createDesktopConnection(app, dataDirectory, resolve(PATHS.VIEWS_FOLDER, "../mcp/stdio.js"), accountRestoreSecret, (port, remote, hostMode) => {
      studioConnectionRevision++;
      openFilmBridgeToken = randomBytes(32).toString("hex");
      closeOpenFilmStudio();
      deliverInstall = undefined;
      closeCreationWindow();
      saveRuntime(port);
      mainWindow.webview.setNavigationRules(getNavigationRules(port));
      mainWindow.webview.loadURL(getMainWindowUrl(port, remote, hostMode));
    }, error => {
      console.error("设备连接切换失败：", error);
      void Utils.showMessageBox({ type: "error", title: t`设备连接失败`, message: error instanceof Error ? error.message : String(error) });
    });
    if (isClosing) { await connection.close(); return; }
    console.log(`桌面服务：http://127.0.0.1:${connection.port}`);
    const openFilmBundle = resolve(PATHS.VIEWS_FOLDER, "../openFilmStudio");
    const openFilmEnabled = Boolean(openFilmRuntime(openFilmBundle));
    function installStudioBridge() {
      if (!openFilmEnabled || isClosing || connection.remote || connection.hostMode) return;
      const origin = JSON.stringify(`http://127.0.0.1:${connection.port}`);
      mainWindow.webview.executeJavascript(`(() => {
        if (window !== window.top || location.origin !== ${origin} || typeof window.__electrobunSendToHost !== "function") return;
        const params = new URLSearchParams(location.search);
        if (params.has("remote") || params.has("host")) return;
        window.lumoRequestOpenFilm = (message) => window.__electrobunSendToHost({
          ...message, type: "openFilmStudio", bridgeToken: ${JSON.stringify(openFilmBridgeToken)},
        });
        window.lumoOpenFilmAvailable = true;
        window.dispatchEvent(new Event("lumo:open-film-available"));
        ${trace ? `window.__electrobunSendToHost({ type: "openFilmBridgeReady", bridgeToken: ${JSON.stringify(openFilmBridgeToken)} });` : ""}
      })()`);
    }

    const { workArea } = Screen.getPrimaryDisplay();
    // ACT: 宽高分别限制在屏幕可用区域内，预留标题栏和边距，不固定比例。
    const width = Math.min(1280, workArea.width - 64);
    const height = Math.min(960, workArea.height - 64);
    const mainWindow = new BrowserWindow({
      title: "Lumo",
      // ACT: macOS 用 hiddenInset 让页面背景延伸到标题栏，避免顶部出现一条与页面割裂的深色条；其他平台保留原生标题栏。
      ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
      url: getMainWindowUrl(connection.port, connection.remote, connection.hostMode),
      navigationRules: JSON.stringify(getNavigationRules(connection.port)),
      // ACT: Windows SDK 未接管普通新窗口请求，在创建 WebView 弹窗前交给宿主。
      preload: `
        (() => {
          window.lumoHostReady = window !== window.top || location.protocol !== "http:" || location.hostname !== "127.0.0.1"
            || new URLSearchParams(location.search).get("remote") === "1" || new URLSearchParams(location.search).get("host") !== "1"
            ? Promise.resolve()
            : fetch("/api/multiTenant/hostSession", {
              method: "POST",
              headers: { "x-lumo-host-token": ${JSON.stringify(hostSecret)}, "x-lumo-workspace": "1" },
            }).then(async response => {
              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || ${JSON.stringify(t`登录失败`)});
              }
            });
          const params = new URLSearchParams(location.search);
          if (window === window.top && location.origin === ${JSON.stringify(`http://127.0.0.1:${connection.port}`)}
            && params.get("desktop") === "1" && !params.has("remote") && !params.has("host")) {
            window.lumoDesktopAccountReady = fetch("/api/desktop/account/restore", {
              method: "POST",
              headers: { "x-lumo-workspace": "1", "x-lumo-account-restore": ${JSON.stringify(accountRestoreSecret)} },
              redirect: "error",
              signal: AbortSignal.timeout(5000),
            }).catch(() => {});
          }
          // 开发者工具仅通过设置调用宿主 API 打开，屏蔽 WebView 的默认入口。
          window.addEventListener("keydown", event => {
            if (event.key === "F12" || ["KeyI", "KeyJ", "KeyC"].includes(event.code)
              && (event.ctrlKey && event.shiftKey || event.metaKey && event.altKey)) {
              event.preventDefault();
            }
          }, true);
          window.addEventListener("contextmenu", event => event.preventDefault(), true);
          function openExternal(url) {
            const target = new URL(url, document.baseURI);
            if (!["http:", "https:"].includes(target.protocol)) return false;
            if (window === window.top && target.origin === window.location.origin) return false;
            window.__electrobunSendToHost({ type: "openExternal", url: target.href });
            return true;
          }
          const openWindow = window.open.bind(window);
          window.open = (url, ...options) => url && openExternal(url) ? null : openWindow(url, ...options);
          function openLink(event) {
            if (event.button !== 0 && event.button !== 1) return;
            const link = event.composedPath().find(element => element instanceof HTMLAnchorElement);
            if (!link?.href || !openExternal(link.href)) return;
            event.preventDefault();
          }
          window.addEventListener("click", openLink, true);
          window.addEventListener("auxclick", openLink, true);
        })();
      `,
      hidden: Boolean(splash),
      frame: {
        width,
        height,
        x: workArea.x + Math.round((workArea.width - width) / 2),
        y: workArea.y + Math.round((workArea.height - height) / 2),
      },
    });
    registerWindowAppearance(mainWindow);
    const quitApproval = new AsyncLocalStorage<boolean>();
    let quitReady = false;
    let quitAckTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingQuit: { requestId: string; resolve: (confirmed: boolean | undefined) => void } | undefined;
    async function confirmQuit() {
      if (isClosing) return true;
      if (pendingQuit) return false;
      const { promise, resolve } = Promise.withResolvers<boolean | undefined>();
      const request = { requestId: crypto.randomUUID(), resolve };
      pendingQuit = request;
      try {
        if (quitReady) {
          try {
            mainWindow.unminimize();
            mainWindow.show();
            mainWindow.activate();
            // ACT: 只限制页面接收请求的时间，不限制用户阅读弹窗；页面失去响应时仍可退出。
            quitAckTimer = setTimeout(() => request.resolve(undefined), 3000);
            mainWindow.webview.executeJavascript(`window.dispatchEvent(new CustomEvent("lumo:confirm-quit", { detail: ${JSON.stringify({ requestId: request.requestId })} }));`);
            const confirmed = await promise;
            if (confirmed !== undefined) return confirmed;
            mainWindow.webview.executeJavascript(`window.dispatchEvent(new CustomEvent("lumo:confirm-quit", { detail: ${JSON.stringify({ requestId: request.requestId, cancelled: true })} }));`);
          } catch (error) {
            console.error("应用内退出弹窗显示失败：", error);
          } finally {
            clearTimeout(quitAckTimer);
          }
        }
        // ACT: 页面未就绪或加载失败时保留原生后备，正常界面使用应用内弹窗。
        const result = await Utils.showMessageBox({
          type: "warning",
          title: t`退出 Lumo`,
          message: t`退出后，正在运行的任务将被中断。确定要退出吗？`,
          buttons: [t`取消`, t`退出`],
          defaultId: 0,
          cancelId: 0,
        });
        return result.response === 1;
      } finally {
        if (pendingQuit === request) pendingQuit = undefined;
      }
    }
    function requestQuit(event: { response?: { allow: boolean } }) {
      if (isClosing || quitApproval.getStore()) return;
      event.response = { allow: false };
      if (pendingQuit) return;
      void confirmQuit().then(confirmed => {
        if (confirmed) quitApproval.run(true, () => Utils.quit());
      }).catch(error => console.error("退出确认失败：", error));
    }
    Electrobun.events.on(`will-close-${mainWindow.id}`, requestQuit);
    Electrobun.events.on("before-quit", requestQuit);
    let isControlHeld = () => false;
    let navigationTimer: ReturnType<typeof setTimeout> | undefined;
    function openLink(detail: unknown) {
      if (isClosing) return;
      const url = typeof detail === "string" ? detail : detail && typeof detail === "object" && "url" in detail ? detail.url : undefined;
      if (typeof url !== "string" || !URL.canParse(url)) return;
      const target = new URL(url);
      if (target.protocol !== "http:" && target.protocol !== "https:") return;
      const current = new URL(mainWindow.webview.url!);
      if (connection.hostMode && target.origin === current.origin && !target.username && !target.password
        && target.pathname === "/" && !target.search && target.hash === "#/multiTenant") {
        mainWindow.webview.loadURL(getMainWindowUrl(connection.port, connection.remote, true));
        mainWindow.unminimize();
        mainWindow.show();
        mainWindow.activate();
        return;
      }
      if (connection.hostMode && !connection.remote && !target.username && !target.password
        && target.origin === "http://127.0.0.1:10888" && target.pathname === "/" && !target.search
        && (!target.hash || target.hash === "#/home")) {
        if (creationWindow) {
          creationWindow.unminimize();
          creationWindow.show();
          creationWindow.activate();
          return;
        }
        const creationWidth = Math.min(1100, workArea.width - 64);
        const creationHeight = Math.min(800, workArea.height - 64);
        const opened = creationWindow = new BrowserWindow({
          title: "Lumo",
          url: "http://127.0.0.1:10888/#/home",
          navigationRules: JSON.stringify(getNavigationRules(10888)),
          sandbox: true,
          preload: `
            (() => {
              if (window !== window.top || location.origin !== "http://127.0.0.1:10888") return;
              const bootstrapKey = "lumo.hostWebReady";
              let bootstrapped = window.name === bootstrapKey;
              try { bootstrapped ||= sessionStorage.getItem(bootstrapKey) === "1"; } catch {}
              window.lumoHostReady = bootstrapped ? Promise.resolve() : fetch("/api/multiTenant/user/host", {
                method: "POST",
                headers: { "x-lumo-host-token": ${JSON.stringify(hostSecret)}, "x-lumo-workspace": "1" },
              }).then(async response => {
                if (!response.ok) {
                  const body = await response.json().catch(() => ({}));
                  throw new Error(body.message || ${JSON.stringify(t`登录失败`)});
                }
                try { sessionStorage.setItem(bootstrapKey, "1"); } catch {}
                // ACT: 存储受限时用窗口名称保留非敏感标记，避免显式退出后被重载自动登录。
                try { window.name = bootstrapKey; } catch {}
              });
            })();
          `,
          frame: {
            width: creationWidth,
            height: creationHeight,
            x: workArea.x + Math.round((workArea.width - creationWidth) / 2),
            y: workArea.y + Math.round((workArea.height - creationHeight) / 2),
          },
        });
        registerWindowAppearance(opened);
        opened.on("close", () => { if (creationWindow === opened) creationWindow = undefined; });
        return;
      }
      if (process.platform === "win32" && target.origin === current.origin && target.pathname === current.pathname && target.search === current.search) {
        // ACT: SDK 把 Ctrl 刷新误判为新窗口；松开后恢复内部导航，避免再次触发误判。
        clearTimeout(navigationTimer);
        const navigate = () => {
          if (isClosing) return;
          if (isControlHeld()) { navigationTimer = setTimeout(navigate, 50); return; }
          navigationTimer = undefined;
          let url = target.href;
          if (connection.hostMode) {
            const destination = new URL(getMainWindowUrl(connection.port, connection.remote, true));
            // ACT: 只保留后台根与当前页面；新增后台页时同步白名单，其他目标仍回后台。
            if (["#/multiTenant", "#/multiTenant/overview", "#/multiTenant/configuration", "#/multiTenant/users", "#/multiTenant/sourceMapping", "#/multiTenant/models", "#/multiTenant/providers", "#/multiTenant/prices"].includes(target.hash)) destination.hash = target.hash;
            url = destination.href;
          }
          mainWindow.webview.loadURL(url);
        };
        navigate();
        return;
      }
      if (!Utils.openExternal(target.href)) {
        void Utils.showMessageBox({ type: "error", title: t`打开链接失败`, message: t`请检查默认浏览器设置后重试。` });
      }
    }
    // SDK 的全局事件不带 WebView ID，使用事件名后缀限定主窗口。
    Electrobun.events.on(`new-window-open-${mainWindow.webview.id}`, (event: { data: { detail: unknown } }) => openLink(event.data.detail));
    Electrobun.events.on(`host-message-${mainWindow.webview.id}`, (event: { data: { detail: unknown } }) => {
      const detail = event.data.detail;
      if (!detail || typeof detail !== "object" || !("type" in detail)) return;
      if (detail.type === "openExternal") openLink(detail);
      if (detail.type === "openFilmBridgeReady" && !isClosing && !connection.remote && !connection.hostMode
        && "bridgeToken" in detail && detail.bridgeToken === openFilmBridgeToken) trace?.("主窗口 Studio 桥接已就绪");
      if (detail.type === "openFilmStudio" && openFilmEnabled && !isClosing && !connection.remote && !connection.hostMode
        && "bridgeToken" in detail && detail.bridgeToken === openFilmBridgeToken
        && "directory" in detail && typeof detail.directory === "string" && "requestId" in detail && typeof detail.requestId === "string") {
        const { directory: requestedDirectory, requestId } = detail;
        const openingStudio = "action" in detail && detail.action === "open";
        if (openingStudio) trace?.("收到 Studio 打开请求，正在校验工作区");
        const lumoOrigin = `http://127.0.0.1:${connection.port}`;
        const revision = studioConnectionRevision;
        const canDispatch = () => revision === studioConnectionRevision && !isClosing && !connection.remote && !connection.hostMode
          && lumoOrigin === `http://127.0.0.1:${connection.port}`;
        function deliver(payload: { regionPng?: string; clipEdit?: Awaited<ReturnType<NonNullable<Awaited<typeof openFilmStudio>>["setClipProperty"]>>; url?: string; error?: string; clips?: Awaited<ReturnType<NonNullable<Awaited<typeof openFilmStudio>>["canvasVideos"]>>; video?: { path: string; name: string; mimeType: string } }) {
          if (!canDispatch()) return;
          mainWindow.webview.executeJavascript(`if (location.origin === ${JSON.stringify(lumoOrigin)}) window.dispatchEvent(new CustomEvent("lumo:open-film-studio", { detail: ${JSON.stringify({ ...payload, requestId })} }));`);
        }
        void (async () => {
          const checkUrl = new URL("/api/workspaces/check", lumoOrigin);
          checkUrl.searchParams.set("directory", requestedDirectory);
          const checked = await fetch(checkUrl, {
            headers: { referer: `${lumoOrigin}/?desktop=1`, "x-lumo-workspace": "1" },
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          });
          if (!checked.ok) throw new Error(`无法打开 Lumo 项目（${checked.status}）`);
          const result = await checked.json();
          const directory = result?.data?.directory;
          if (result?.code !== 200 || typeof directory !== "string") throw new Error("Lumo 项目目录无效");
          if (!canDispatch()) return;
          async function getStudio() {
            const pending = openFilmStudio ??= (async () => {
              const previousShutdown = studioShutdown;
              await previousShutdown;
              if (!canDispatch()) return;
              const { prepareWorkspaceFfmpeg } = await import("@lumo/server/ffmpeg");
              const mediaTools = await prepareWorkspaceFfmpeg();
              if (!canDispatch()) return;
              return startOpenFilmStudio(dataDirectory, lumoOrigin, openFilmBundle, mediaTools);
            })();
            try {
              const studio = await pending;
              if ((!studio || !studio.isRunning()) && openFilmStudio === pending) openFilmStudio = undefined;
              return studio;
            } catch (error) {
              if (openFilmStudio === pending) openFilmStudio = undefined;
              throw error;
            }
          }
          let studio = await getStudio();
          // 只在派发打开操作前恢复已退出的进程，避免重放已发出的写入。
          if (openingStudio && studio && !studio.isRunning() && canDispatch()) studio = await getStudio();
          if (!canDispatch()) return;
          if (!studio) throw new Error("OpenFilm Studio 原型未启用");
          if (!studio.isRunning()) throw new Error("OpenFilm Studio 已退出，请重试");
          if ("action" in detail && detail.action === "captureRegion") {
            if (!("projectId" in detail) || typeof detail.projectId !== "string" || !("region" in detail)) throw new Error("Studio 框选参数无效");
            deliver({ regionPng: await studio.captureRegion(directory, detail.projectId, detail.region) });
            return;
          }
          if ("action" in detail && detail.action === "setClipProperty") {
            const { projectId, clipId, field, value, expectedValue } = detail as Record<string, unknown>;
            const isEditValue = (item: unknown): item is boolean | number | [number, number] | null => item === null || typeof item === "number" || typeof item === "boolean"
              || (Array.isArray(item) && item.length === 2 && item.every(n => typeof n === "number"));
            if (typeof projectId !== "string" || typeof clipId !== "string" || (field !== "volume" && field !== "speed" && field !== "time" && field !== "disabled")
              || !isEditValue(value) || (expectedValue !== undefined && !isEditValue(expectedValue))) throw new Error("Studio 片段参数无效");
            deliver({ clipEdit: await studio.setClipProperty(directory, projectId, clipId, field, value, expectedValue) });
            return;
          }
          if ("action" in detail && detail.action === "listVideos") {
            if (!("projectId" in detail) || typeof detail.projectId !== "string") throw new Error("Studio 工程无效");
            deliver({ clips: await studio.canvasVideos(directory, detail.projectId) });
            return;
          }
          if ("action" in detail && (detail.action === "copyVideo" || detail.action === "renderVideo")) {
            if (!("projectId" in detail) || typeof detail.projectId !== "string" || !("clipId" in detail) || typeof detail.clipId !== "string") throw new Error("Studio 片段无效");
            deliver({ video: await studio.copyToCanvas(directory, detail.projectId, detail.clipId, detail.action === "renderVideo") });
            return;
          }
          if ("action" in detail && detail.action === "renderRange") {
            const { projectId, range } = detail as { projectId?: unknown; range?: { start?: unknown; end?: unknown } };
            if (typeof projectId !== "string" || typeof range?.start !== "number" || typeof range.end !== "number") throw new Error("Studio 时间范围无效");
            deliver({ video: await studio.renderRangeToCanvas(directory, projectId, range.start, range.end) });
            return;
          }
          if ("action" in detail && detail.action === "importLegacy") {
            deliver({ url: await studio.importLegacy(directory) });
            return;
          }
          if ("action" in detail && detail.action === "importDraft") {
            deliver({ url: await studio.importDraft(directory, "draft" in detail ? detail.draft : undefined) });
            return;
          }
          const videoPath = "videoPath" in detail ? detail.videoPath : undefined;
          if (videoPath !== undefined && typeof videoPath !== "string") throw new Error("画布视频路径无效");
          const overlayAt = "overlayAt" in detail ? detail.overlayAt : undefined;
          if (overlayAt !== undefined && typeof overlayAt !== "number") throw new Error("Studio 动效位置无效");
          if (openingStudio) trace?.("Studio 运行时已就绪，正在打开工程");
          const url = await studio.openProject(directory, videoPath, overlayAt, "clipTiming" in detail ? detail.clipTiming : undefined);
          deliver({ url });
          if (openingStudio) trace?.("Studio 工程打开调用已完成");
        })().catch(error => {
          if (openingStudio) trace?.("Studio 打开请求失败");
          const message = error instanceof Error ? error.message : String(error);
          deliver({ error: message });
        });
      }
      if (detail.type === "quitReady" && "ready" in detail && typeof detail.ready === "boolean") {
        quitReady = detail.ready;
        if (!quitReady) pendingQuit?.resolve(false);
      }
      if (detail.type === "quitShown" && "requestId" in detail && detail.requestId === pendingQuit?.requestId) clearTimeout(quitAckTimer);
      if (detail.type === "confirmQuit" && "requestId" in detail && detail.requestId === pendingQuit?.requestId
        && "confirmed" in detail && typeof detail.confirmed === "boolean") pendingQuit?.resolve(detail.confirmed);
    });
    // 页面重载时监听器随旧页面销毁，安装请求等新页面 ready 后再投递。
    Electrobun.events.on(`will-navigate-${mainWindow.webview.id}`, (event: { data: { detail: unknown } }) => {
      let detail = event.data.detail;
      if (typeof detail === "string") {
        try { detail = JSON.parse(detail); }
        catch { /* 兼容直接携带 URL 的导航通知。 */ }
      }
      if (detail && typeof detail === "object" && "allowed" in detail && detail.allowed === false) {
        openLink(detail);
        return;
      }
      quitReady = false;
      pendingQuit?.resolve(false);
      deliverInstall = undefined;
    });
    let isShowing = false;
    function showMainWindow() {
      if (isClosing || isShowing) return;
      mainWindow.show();
      isShowing = true;
      clearTimeout(splashDeadline);
      splash?.close();
      splash = undefined;
      void restoreInstallRegistration(installDirectory);
    }
    // ACT: WebView 未通知或动画收尾超时，仍展示主窗口；更新成功信号继续走 ready。
    const splashDeadline = splash ? setTimeout(() => {
      console.warn("启动画面等待超时，显示主窗口");
      showMainWindow();
    }, 5000) : undefined;
    const lifecycle = Utils as unknown as Parameters<typeof createWindowsUpdater>[1];
    const updater = process.platform === "win32" ? createWindowsUpdater(PATHS.RESOURCES_FOLDER, lifecycle)
      : process.platform === "linux" && process.env.LUMO_INSTALL_METHOD === "deb"
        ? createLinuxDebUpdater(PATHS.RESOURCES_FOLDER, dataDirectory, lifecycle) : Updater;
    app.locals.desktop = {
      openUrl,
      async showNotification(options) {
        if (process.platform === "win32") {
          await showWindowsNotification(`${identifier}.${channel}`, resolve(PATHS.RESOURCES_FOLDER, "app.ico"), options);
        } else if (process.platform === "darwin") {
          // ACT: 运行时 bun 在 .app 外，SDK 原生通知会因 UNUserNotificationCenter 断言导致进程崩溃；改用 osascript，通知来源显示为脚本编辑器。
          const sound = options.silent ? "" : " sound name \"default\"";
          await execFileAsync("/usr/bin/osascript", [
            "-e", "on run argv",
            "-e", `display notification (item 2 of argv) with title (item 1 of argv)${sound}`,
            "-e", "end run",
            options.title,
            options.body ?? "",
          ], { timeout: 15000 });
        } else {
          Utils.showNotification(options);
        }
      },
      showItemInFolder: Utils.showItemInFolder,
      readClipboardText: Utils.clipboardReadText,
      readClipboardImage: Utils.clipboardReadImage,
      writeClipboardImage: Utils.clipboardWriteImage,
      writeClipboardText: Utils.clipboardWriteText,
      selectSaveFile,
      saveFile,
      async selectProviderFile() {
        const [path] = await Utils.openFileDialog({ allowedFileTypes: "ts", canChooseFiles: true, canChooseDirectory: false, allowsMultipleSelection: false });
        return path ?? null;
      },
      async selectDirectory() {
        const [path] = await Utils.openFileDialog({ canChooseFiles: false, canChooseDirectory: true, allowsMultipleSelection: false });
        return path ?? null;
      },
      async ready(failed = false, awaitingAccount = false) {
        if (isClosing) return;
        if (!failed && !awaitingAccount) installStudioBridge();
        if (!isShowing) {
          trace?.(failed ? "主窗口页面报告初始化失败" : "主窗口页面已完成初始化");
          await splash?.finish();
          if (isClosing) return;
          showMainWindow();
        }
        if (awaitingAccount && !failed && !connection.remote && !connection.hostMode) {
          deliverInstall = undefined;
          if (process.platform === "win32") confirmWindowsUpdateStartup(PATHS.RESOURCES_FOLDER);
          else await (Updater as DesktopRuntime["updater"]).confirmStartup?.();
          return;
        }
        if (failed && !connection.remote) {
          if (process.platform === "win32") confirmWindowsUpdateStartup(PATHS.RESOURCES_FOLDER, true);
          else await (Updater as DesktopRuntime["updater"]).confirmStartup?.(true);
          deliverInstall = undefined;
          return;
        }
        if (connection.remote) {
          // 远端离线不代表本机更新启动失败；安装协议等回到独立运行后再投递。
          deliverInstall = undefined;
          if (process.platform === "win32") confirmWindowsUpdateStartup(PATHS.RESOURCES_FOLDER);
          else await (Updater as DesktopRuntime["updater"]).confirmStartup?.();
          return;
        }
        deliverInstall = request => {
          mainWindow.unminimize();
          mainWindow.show();
          mainWindow.activate();
          mainWindow.webview.executeJavascript(`window.dispatchEvent(new CustomEvent("lumo:install-plugin", { detail: ${JSON.stringify(request)} }));`);
        };
        while (pendingInstalls.length) {
          deliverInstall(pendingInstalls[0]!);
          pendingInstalls.shift();
        }
        if (process.platform === "win32") confirmWindowsUpdateStartup(PATHS.RESOURCES_FOLDER);
        else await (Updater as DesktopRuntime["updater"]).confirmStartup?.();
      },
      openDevTools() { mainWindow.webview.openDevTools(); },
      updater: {
        ...updater,
        applyUpdate: async () => {
          if (!await confirmQuit()) throw new Error(t`更新重启已取消`);
          // ACT: 只批准这次更新调用链中的退出；普通关闭仍需确认，更新失败后不会留下全局放行状态。
          await quitApproval.run(true, () => updater.applyUpdate());
        },
      },
    } satisfies DesktopRuntime;
    if (process.platform === "win32") {
      // ACT: Electrobun 2.0.5 的主窗口未加载应用图标，复用构建产物中的应用 ICO。
      const user32 = dlopen("user32.dll", {
        LoadImageW: { args: ["ptr", "ptr", "u32", "i32", "i32", "u32"], returns: "ptr" },
        SendMessageW: { args: ["ptr", "u32", "u64", "ptr"], returns: "ptr" },
        GetDpiForWindow: { args: ["ptr"], returns: "u32" },
        GetSystemMetricsForDpi: { args: ["i32", "u32"], returns: "i32" },
        DestroyIcon: { args: ["ptr"], returns: "i32" },
        GetAsyncKeyState: { args: ["i32"], returns: "i16" },
      });
      const native = user32.symbols;
      isControlHeld = () => Boolean(native.GetAsyncKeyState(0x11) & 0x8000);
      const window = mainWindow.ptr;
      const dpi = native.GetDpiForWindow(window);
      const iconPath = Buffer.from(`${resolve(PATHS.RESOURCES_FOLDER, "app.ico")}\0`, "utf16le");
      // ICON_SMALL / ICON_BIG，各自使用当前窗口 DPI 对应的系统尺寸。
      const icons = [49, 11].map((metric) => native.LoadImageW(
        null, ptr(iconPath), 1, native.GetSystemMetricsForDpi(metric, dpi), native.GetSystemMetricsForDpi(metric + 1, dpi), 0x10,
      ));
      const closeIcons = () => {
        clearTimeout(navigationTimer);
        for (const icon of icons) if (icon) native.DestroyIcon(icon);
        user32.close();
      };
      if (icons.some((icon) => !icon)) {
        closeIcons();
        throw new Error(t`无法加载主窗口图标`);
      }
      icons.forEach((icon, type) => native.SendMessageW(window, 0x80, type, icon));
      mainWindow.on("close", closeIcons);
    }
    mainWindow.on("close", () => {
      isClosing = true;
      clearTimeout(splashDeadline);
      closeCreationWindow();
      closeOpenFilmStudio();
      void connection.close().catch(error => console.error("设备连接关闭失败：", error));
      void closeBrowsers().catch(error => console.error("浏览器关闭失败：", error));
      deliverInstall = undefined;
      pendingInstalls.length = 0;
      splash?.close();
      splash = undefined;
    });
    function saveRuntime(port: number) {
      if (process.platform === "win32" || process.platform === "linux") {
        // ACT: 切换连接也更新端口；启动器通过 PID 忽略已退出进程留下的记录。
        writeAtomicSync(resolve(process.platform === "linux" ? dataDirectory : PATHS.RESOURCES_FOLDER, "desktopRuntime.json"), JSON.stringify({ pid: process.pid, port }));
      }
    }
    saveRuntime(connection.port);
    function getMainWindowUrl(port: number, remote: boolean, hostMode: boolean) {
      return `http://127.0.0.1:${port}/?desktop=1${remote ? "&remote=1" : ""}${hostMode ? "&host=1#/multiTenant" : ""}`;
    }
    function getNavigationRules(port: number) {
      return ["^http://*", "^https://*", `http://127.0.0.1:${port}/*`];
    }
  } catch (error) {
    isClosing = true;
    closeCreationWindow();
    await desktopConnection?.close().catch(error => console.error("设备连接关闭失败：", error));
    splash?.close();
    console.error("桌面启动失败：", error);
    if (process.platform === "win32") {
      try { confirmWindowsUpdateStartup(PATHS.RESOURCES_FOLDER, true); }
      catch (resultError) { console.error("更新启动结果写入失败：", resultError); }
    }
    Utils.quit(1);
  }
}

void start();
