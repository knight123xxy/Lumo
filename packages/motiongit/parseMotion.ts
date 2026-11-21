import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type BoundaryEntry = { role: string; sha256: string };
type AssetEntry = { path: string; role: string; sha256?: string; license?: string; use?: string };

export function parseMotionPackage(pkgPath: string) {
  if (!existsSync(pkgPath)) throw new Error(`包不存在: ${pkgPath}`);
  const tmp = mkdtempSync(join(tmpdir(), "motion-"));
  try {
    execSync(`unzip -o -q "${pkgPath}" -d "${tmp}"`, { stdio: "pipe" });
    const boundary = JSON.parse(readFileSync(join(tmp, "content-boundary.json"), "utf8")) as {
      profile?: string;
      files: Record<string, BoundaryEntry>;
    };
    const assetManifest = JSON.parse(readFileSync(join(tmp, "asset-manifest.json"), "utf8")) as {
      assets?: AssetEntry[];
    };

    const files = boundary.files ?? {};
    const integrity = { checked: 0, ok: 0, missing: 0, mismatch: 0 };
    for (const [rel, info] of Object.entries(files)) {
      if (!info.sha256) continue;
      integrity.checked++;
      const p = join(tmp, rel);
      if (!existsSync(p)) { integrity.missing++; continue; }
      const digest = createHash("sha256").update(readFileSync(p)).digest("hex");
      if (digest !== info.sha256) integrity.mismatch++;
      else integrity.ok++;
    }

    const assets = assetManifest.assets ?? [];
    const roles = [...new Set(assets.map((item) => item.role))];
    return {
      profile: boundary.profile ?? "",
      fileCount: Object.keys(files).length,
      integrity,
      assetCount: assets.length,
      roles,
      topLevel: Object.keys(files).filter((name) => !name.includes("/")).sort(),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 命令行自检：bun parseMotion.ts <包路径>
const pkg = process.argv[2];
if (pkg) {
  const result = parseMotionPackage(pkg);
  console.log(JSON.stringify(result, null, 2));
}
