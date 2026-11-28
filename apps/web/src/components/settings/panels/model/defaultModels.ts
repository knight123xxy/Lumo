import { findNodeModel, getNodeModelKey } from "@lumo/nodes-scaffold/nodeAi";
import { desktopAccountUser } from "@/lib/lumoAccountService";
import { publicWeb } from "@/stores/multiTenant";
import { settings, settingsStorage } from "@/stores/settings";

export type DefaultModelType = "text" | "image" | "video" | "audio";

const settingsKey = "lumo.defaultModels";
type DefaultModels = Partial<Record<"official" | "local", Partial<Record<DefaultModelType, string>>>>;

function readDefaultModels(stores: unknown): DefaultModels {
  if (!stores || typeof stores !== "object" || Array.isArray(stores)) return {};
  const defaults = (stores as Record<string, unknown>)[settingsKey];
  return defaults && typeof defaults === "object" && !Array.isArray(defaults) ? defaults as DefaultModels : {};
}

export function readDefaultModel(type: DefaultModelType, official = publicWeb.value || !!desktopAccountUser.value) {
  const key = readDefaultModels(settings.value.stores)[official ? "official" : "local"]?.[type];
  if (typeof key === "string" && key) return key;
  return official && type === "text" ? JSON.stringify(["multiTenant", "deepseek-v4.1-flash-1017"]) : "";
}

export function saveDefaultModel(type: DefaultModelType, key: string, official = publicWeb.value || !!desktopAccountUser.value) {
  const mode = official ? "official" : "local";
  const defaults = readDefaultModels(settings.value.stores);
  settingsStorage.setItem(settingsKey, JSON.stringify({ ...defaults, [mode]: { ...defaults[mode], [type]: key } }));
}

export function getDefaultModelKey(type: DefaultModelType, models: Parameters<typeof findNodeModel>[0]) {
  const model = findNodeModel(models, readDefaultModel(type)) ?? models[0];
  return model ? getNodeModelKey(model) : "";
}
