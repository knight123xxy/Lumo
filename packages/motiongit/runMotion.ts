import { exec } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

type RuntimePaths = {
  /** python3，需已装 jsonschema（adapter.py）+ numpy/scipy/soundfile/pyloudnorm（mix.py，见其 PEP 723 头）。缺省用 PATH 里的 python3 */
  python?: string;
  /** node 22+，缺省用 PATH 里的 node */
  node?: string;
  /** Chrome/Chromium 可执行文件，通过 CHROME 环境变量传给 render.mjs */
  chrome?: string;
  /** 含 ffmpeg/ffprobe 的目录，会前置到 PATH */
  ffmpegDir?: string;
  /** 包管理器（npm / bun），缺省自动探测 */
  packageManager?: "npm" | "bun";
};

type RunMotionResult = {
  plan: unknown;
  instanceDir: string;
  silentVideo: string;
  finalVideo: string;
  workDir: string;
};

async function sh(command: string, opts: { cwd: string; env: NodeJS.ProcessEnv }) {
  await execAsync(command, { cwd: opts.cwd, env: opts.env });
}

/**
 * 运行一个 .motion 模板的完整制作流水线：
 * 解包 → 安装依赖 → adapter.py plan → prepare → render（render.mjs Chrome 渲染 + mix.py 合成音频）。
 * 返回 plan、instance 目录、无声片与最终成片路径。workDir 由调用方决定是否保留。
 */
export async function runMotion(
  pkgPath: string,
  userInput: unknown,
  opts: { runtime?: RuntimePaths; workDir?: string } = {},
): Promise<RunMotionResult> {
  const runtime = opts.runtime ?? {};
  const python = runtime.python ?? "python3";
  const node = runtime.node ?? "node";
  const chrome = runtime.chrome;
  const ffmpegDir = runtime.ffmpegDir;

  const absPkg = resolve(pkgPath);
  const workDir = resolve(opts.workDir ?? mkdtempSync(join(tmpdir(), "motion-run-")));
  mkdirSync(workDir, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (chrome) env.CHROME = chrome;
  if (ffmpegDir) env.PATH = `${ffmpegDir}:${env.PATH ?? ""}`;

  const pkgDir = join(workDir, "pkg");
  await sh(`unzip -o -q "${absPkg}" -d "${pkgDir}"`, { cwd: workDir, env });

  const userJson = join(workDir, "user.json");
  writeFileSync(userJson, JSON.stringify(userInput, null, 2));

  // 安装 render.mjs 的 Node 依赖（模板自带 package.json 时）
  if (existsSync(join(pkgDir, "package.json"))) {
    const pm = runtime.packageManager ?? (existsSync(join(pkgDir, "bun.lock")) ? "bun" : "npm");
    await sh(`${pm} install --production`, { cwd: pkgDir, env });
  }

  const planOut = join(workDir, "plan.json");
  await sh(`${python} adapter.py plan --input "${userJson}" --out "${planOut}"`, { cwd: pkgDir, env });
  const plan = JSON.parse(readFileSync(planOut, "utf8"));

  const instance = join(workDir, "instance");
  await sh(`${python} adapter.py prepare --input "${userJson}" --out "${instance}"`, { cwd: pkgDir, env });

  const silent = join(workDir, "silent.mp4");
  await sh(`${python} adapter.py render --instance "${instance}" --out "${silent}"`, { cwd: pkgDir, env });

  // adapter.py render 会调用 mix.py 产出 silent-with-audio.mp4
  const finalVideo = silent.replace(/\.mp4$/, "-with-audio.mp4");
  if (!existsSync(finalVideo)) throw new Error(`渲染未产出成片: ${finalVideo}`);
  return { plan, instanceDir: instance, silentVideo: silent, finalVideo, workDir };
}

/** 清理 runMotion 创建的工作目录（不传 workDir 时用完即删） */
export function cleanMotionWork(workDir: string) {
  rmSync(workDir, { recursive: true, force: true });
}
