import { copyFile, mkdir, readFile, rename, rm } from "@lumo/file";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadConfigFromFile } from "vite";
import vue from "@vitejs/plugin-vue";
import { z } from "zod";
import { defineExt, type ExtDefinition } from "./src/runtime.ts";

const tiptapGlobals = {
  "@tiptap/core": "lumoTiptapHost.core",
  "@tiptap/vue-3": "lumoTiptapHost.vue3",
  "@tiptap/starter-kit": "lumoTiptapHost.starterKit",
  "@tiptap/markdown": "lumoTiptapHost.markdown",
  "@tiptap/extension-find-and-replace": "lumoTiptapHost.findAndReplace",
  "@tiptap/extension-highlight": "lumoTiptapHost.highlight",
  "@tiptap/extension-image": "lumoTiptapHost.image",
  "@tiptap/extension-list": "lumoTiptapHost.list",
  "@tiptap/extension-subscript": "lumoTiptapHost.subscript",
  "@tiptap/extension-superscript": "lumoTiptapHost.superscript",
  "@tiptap/extension-table": "lumoTiptapHost.table",
  "@tiptap/extension-text-align": "lumoTiptapHost.textAlign",
  "@tiptap/pm/model": "lumoTiptapHost.model",
  "@tiptap/pm/state": "lumoTiptapHost.state",
  "@tiptap/pm/view": "lumoTiptapHost.view",
  "marked": "lumoTiptapHost.marked",
  "dompurify": "lumoTiptapHost.dompurify",
};

export type ExtMetadata = Omit<ExtDefinition, "load">;

export function createExtConfig(config: ExtMetadata, configUrl: string) {
  defineExt({ ...config, load: async () => ({ default: {} }) });
  const root = fileURLToPath(new URL(".", configUrl));
  const fileName = `${config.id.slice(4)}.ext.js`;
  const outDir = fileURLToPath(new URL("../../build/ext", import.meta.url));
  const dataDir = fileURLToPath(new URL("../../data/ext", import.meta.url));
  let syncToData = process.env.NODE_ENV === "dev";

  return defineConfig({
    root,
    plugins: [
      vue(),
      {
        name: "extBundle",
        enforce: "post",
        configResolved(resolvedConfig) {
          syncToData ||= Boolean(resolvedConfig.build.watch) || resolvedConfig.mode === "development";
        },
        async generateBundle(_options, bundle) {
          const chunk = bundle[fileName];
          if (!chunk || chunk.type !== "chunk") throw new Error(`未生成扩展文件：${fileName}`);
          const packagePath = resolve(root, "package.json");
          const readmePath = resolve(root, "readme.md");
          const metadataPath = resolve(root, "src/metadata.ts");
          this.addWatchFile(metadataPath);
          const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, metadataPath, root);
          if (!loaded) throw new Error(`扩展缺少声明文件：${metadataPath}`);
          for (const dependency of loaded.dependencies) this.addWatchFile(dependency);
          const { load: _load, ...metadata } = defineExt({ ...loaded.config as unknown as ExtMetadata, load: async () => ({ default: {} }) });
          if (metadata.id !== config.id) throw new Error("修改扩展 ID 后请重新启动构建命令");
          const configRules = z.array(z.record(z.string(), z.json())).max(100).parse(metadata.configRules ?? []);
          this.addWatchFile(packagePath);
          this.addWatchFile(readmePath);
          const packageInfo = JSON.parse(await readFile(packagePath, "utf8"));
          const version = typeof packageInfo.version === "string" ? packageInfo.version.trim() : "";
          if (!version) throw new Error(`扩展 package.json 缺少有效的 version：${config.id}`);
          const readme = await readFile(readmePath, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return "";
            throw error;
          });
          let css = "";
          for (const [name, asset] of Object.entries(bundle)) {
            if (name === fileName) continue;
            if (asset.type !== "asset" || !name.endsWith(".css")) throw new Error(`扩展必须构建为单个脚本，不能包含未内联的资源：${config.id} (${name})`);
            css += typeof asset.source === "string" ? asset.source : new TextDecoder().decode(asset.source);
            delete bundle[name];
          }
          const styleId = JSON.stringify(`lumoExt-${config.id}`);
          const injectStyle = css ? `if(typeof document!=="undefined"){let style=document.getElementById(${styleId});if(!style){style=document.createElement("style");style.id=${styleId};document.head.appendChild(style)}style.textContent=${JSON.stringify(css)}}\n` : "";
          // 压缩完成后加入元数据和样式，单个 JS 即可供扩展加载器使用。
          chunk.code = `/*! lumoExt:${JSON.stringify({ ...metadata, configRules, version, readme }).replaceAll("/", "\\u002f")} */\n${injectStyle}${chunk.code}`;
          if (Buffer.byteLength(chunk.code, "utf8") > 20 * 1024 * 1024) throw new Error(`扩展文件不能超过 20 MB：${config.id}`);
        },
        async writeBundle() {
          if (!syncToData) return;
          await mkdir(dataDir, { recursive: true });
          const targetPath = resolve(dataDir, fileName);
          const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
          try {
            await copyFile(resolve(outDir, fileName), tempPath);
            await rename(tempPath, targetPath);
          } finally {
            await rm(tempPath, { force: true });
          }
        },
      },
    ],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir,
      // ACT: 多个扩展共享目录，构建单包时保留其他扩展产物。
      emptyOutDir: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      cssCodeSplit: false,
      lib: {
        entry: resolve(root, "src/index.ts"),
        name: `lumoExts.${config.id}`,
        formats: ["umd"],
        fileName: () => fileName,
      },
      rolldownOptions: {
        external: ["vue", "@vue/runtime-core", "@vue/runtime-dom", "element-plus", "@lumo/i18n/vue", ...Object.keys(tiptapGlobals)],
        output: {
          exports: "default",
          codeSplitting: false,
          globals: {
            ...tiptapGlobals,
            vue: "lumoExtHost.vue",
            "@vue/runtime-core": "lumoExtHost.vue",
            "@vue/runtime-dom": "lumoExtHost.vue",
            "element-plus": "lumoExtHost.elementPlus",
            "@lumo/i18n/vue": "lumoExtHost.i18n",
          },
        },
      },
    },
  });
}
