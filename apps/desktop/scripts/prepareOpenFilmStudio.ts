import { $ } from "bun";
import { mkdir, mkdtemp, createReadStream, cp, copyFile, constants, realpath, readFile, existsSync, lstat } from "@lumo/file";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

const revision = "327ef4c86ceab07122a145c0d6d984045af7c295";
const sourceSha256 = "7c4e413659f7a87ee5388cacee7717d0be7d4e95cbddfc896c18d7cad26bf85e";
const repository = resolve(import.meta.dir, "../../..");
const buildRoot = resolve(repository, "build/openFilmStudio");
const node = Bun.which("node");
if (!node) throw new Error("需要安装 Node.js 22.18 或以上版本");
const nodeVersion = (await $`${node} --version`.text()).trim();
const [major, minor] = nodeVersion.slice(1).split(".").map(Number);
if (!major || major < 22 || (major === 22 && minor < 18)) throw new Error(`OpenFilm 构建需要 Node.js 22.18 或以上版本，当前为 ${nodeVersion}`);
if (process.argv.length > 3) throw new Error("用法：bun apps/desktop/scripts/prepareOpenFilmStudio.ts [固定版本源码压缩包]");

await mkdir(buildRoot, { recursive: true });
const build = await mkdtemp(resolve(buildRoot, "studio-"));
const source = resolve(build, "source");
const browsers = resolve(buildRoot, "browsers");
const archive = process.argv[2] ? resolve(process.argv[2]) : resolve(build, "openFilm.tar.gz");
if (!process.argv[2]) {
  const url = `https://codeload.github.com/openfilm/openfilm/tar.gz/${revision}`;
  await $`curl --fail --silent --show-error --location --max-time 120 --output ${archive} ${url}`;
}

const hash = createHash("sha256");
for await (const chunk of createReadStream(archive)) hash.update(chunk);
if (hash.digest("hex") !== sourceSha256) throw new Error("OpenFilm 源码压缩包校验失败");
await mkdir(source);
await $`tar -xzf ${archive} --strip-components 1 -C ${source}`;
await $`git apply ${resolve(repository, "patches/openFilmColorLut.patch")} ${resolve(repository, "patches/openFilmTrackNames.patch")} ${resolve(repository, "patches/openFilmVisionDownload.patch")} ${resolve(repository, "patches/openFilmStrictEdit.patch")} ${resolve(repository, "patches/openFilmSelectionState.patch")} ${resolve(repository, "patches/openFilmAlphaTags.patch")} ${resolve(repository, "patches/openFilmArchiveBoards.patch")}`.cwd(source);
const managerVersion = (await $`pnpm --version`.cwd(source).text()).trim();
if (managerVersion !== "9.15.9") throw new Error(`OpenFilm 构建需要 pnpm 9.15.9，当前为 ${managerVersion}`);
const bundleMac = process.platform === "darwin" && process.env.LUMO_OPENFILM_BUNDLE === "1";
// Electrobun 将依赖的符号链接复制为空文件，打包时使用实体依赖目录。
const installOptions = bundleMac ? ["--config.node-linker=hoisted"] : [];
await $`pnpm --filter openfilm install --frozen-lockfile --ignore-scripts --store-dir ${resolve(buildRoot, "pnpmStore")} ${installOptions}`.cwd(source);
await $`pnpm --filter openfilm build:ui`.cwd(source);
await $`pnpm --filter openfilm exec playwright-core install chromium --only-shell`
  .cwd(source).env({ ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers });

const bundle = bundleMac ? resolve(build, "bundle") : undefined;
if (bundle) {
  await mkdir(bundle);
  const nodePath = await realpath(node);
  const studioPackage = "packages/openfilm";
  const bundledSource = resolve(bundle, "source");
  await cp(resolve(source, studioPackage), resolve(bundledSource, studioPackage), { recursive: true, verbatimSymlinks: true });
  const manifest = async (directory: string) => JSON.parse(await readFile(resolve(directory, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const pending = Object.keys((await manifest(resolve(source, studioPackage))).dependencies ?? {});
  const copied = new Set<string>();
  // ACT: 固定版本的生产依赖位于 hoisted 根目录，包内嵌套依赖随包复制。
  while (pending.length) {
    const name = pending.pop()!;
    if (copied.has(name)) continue;
    const dependency = resolve(source, "node_modules", name);
    if (!(await lstat(dependency)).isDirectory()) throw new Error(`OpenFilm 打包依赖必须是实体目录：${name}`);
    const { dependencies, optionalDependencies, peerDependencies } = await manifest(dependency);
    for (const child of Object.keys({ ...dependencies, ...optionalDependencies, ...peerDependencies })) {
      if (existsSync(resolve(dependency, "node_modules", child))) continue;
      if (optionalDependencies?.[child] && !existsSync(resolve(source, "node_modules", child))) continue;
      pending.push(child);
    }
    await cp(dependency, resolve(bundledSource, "node_modules", name), { recursive: true, verbatimSymlinks: true });
    copied.add(name);
  }
  await cp(browsers, resolve(bundle, "browsers"), { recursive: true, verbatimSymlinks: true });
  await copyFile(nodePath, resolve(bundle, "node"), constants.COPYFILE_EXCL);
  await copyFile(resolve(dirname(nodePath), "../LICENSE"), resolve(bundle, "nodeLicense.txt"), constants.COPYFILE_EXCL);
}

console.log(JSON.stringify({
  LUMO_OPENFILM_ENTRY: resolve(source, "packages/openfilm/studio/server/main.mjs"),
  LUMO_OPENFILM_NODE: node,
  LUMO_OPENFILM_BROWSERS: browsers,
  ...(bundle ? { LUMO_OPENFILM_BUNDLE_DIR: bundle } : {}),
}, null, 2));
