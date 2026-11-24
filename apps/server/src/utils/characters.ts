import { randomUUID } from "node:crypto";
import { readFile, realpath, writeAtomic } from "@lumo/file";
import { dirname, join } from "node:path";
import conf from "@/utils/conf";
import { getAssetsDirectory } from "@/utils/assets";
import { isWithin } from "@/utils/workspace/files";

// ACT: 角色是全局素材的引用，参考图始终留在 assets 目录，角色记录只保存相对路径，避免复制大图。
export type Character = {
  id: string;
  name: string;
  description: string;
  image: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

export const characterLimits = { total: 200, name: 40, description: 600, tags: 8, tag: 16 };

const storeFile = () => join(dirname(conf.path), "characters.json");

function cleanText(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const item of value) {
    const tag = cleanText(item, characterLimits.tag);
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= characterLimits.tags) break;
  }
  return tags;
}

async function readStore(): Promise<Character[]> {
  let raw: string;
  try { raw = await readFile(storeFile(), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const parsed = JSON.parse(raw) as { characters?: unknown };
  if (!Array.isArray(parsed?.characters)) return [];
  return parsed.characters.flatMap(item => {
    const character = item as Partial<Character>;
    const name = cleanText(character?.name, characterLimits.name);
    if (typeof character?.id !== "string" || !name || typeof character.image !== "string" || !character.image) return [];
    return [{
      id: character.id,
      name,
      description: cleanText(character.description, characterLimits.description),
      image: character.image,
      tags: cleanTags(character.tags),
      createdAt: Number(character.createdAt) || 0,
      updatedAt: Number(character.updatedAt) || 0,
    }];
  });
}

async function writeStore(characters: Character[]) {
  await writeAtomic(storeFile(), JSON.stringify({ characters }, null, 2));
}

async function resolveImage(image: unknown) {
  const path = String(image ?? "").trim();
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) throw Object.assign(new Error("角色参考图路径无效"), { status: 400 });
  const root = await getAssetsDirectory();
  let resolved: string;
  try { resolved = await realpath(join(root, path)); }
  catch { throw Object.assign(new Error("角色参考图不存在，请先上传图片"), { status: 400 }); }
  if (!isWithin(root, resolved)) throw Object.assign(new Error("角色参考图路径无效"), { status: 400 });
  return path;
}

export async function listCharacters() {
  return readStore();
}

export async function saveCharacter(input: { id?: string; name: string; description?: string; image: string; tags?: unknown }) {
  const name = cleanText(input.name, characterLimits.name);
  if (!name) throw Object.assign(new Error("请填写角色名称"), { status: 400 });
  const description = cleanText(input.description, characterLimits.description);
  const image = await resolveImage(input.image);
  const characters = await readStore();
  const now = Date.now();
  const id = cleanText(input.id, 80) || randomUUID();
  const index = characters.findIndex(character => character.id === id);
  const tags = cleanTags(input.tags);
  if (index >= 0) characters[index] = { ...characters[index]!, name, description, image, tags, updatedAt: now };
  else {
    if (characters.length >= characterLimits.total) throw Object.assign(new Error(`最多保存 ${characterLimits.total} 个角色`), { status: 409 });
    characters.unshift({ id, name, description, image, tags, createdAt: now, updatedAt: now });
  }
  await writeStore(characters);
  return characters.find(character => character.id === id)!;
}

export async function removeCharacter(id: string) {
  const characters = await readStore();
  const next = characters.filter(character => character.id !== id);
  if (next.length === characters.length) throw Object.assign(new Error("角色不存在"), { status: 404 });
  await writeStore(next);
  return true;
}
