import { Lumo } from "./lumo";
import type { Channel } from "./types";

export { hosting } from "./hosting";

const channels = new Map<string, Channel>([["lumo", new Lumo()]]);

export function getChannel(): Channel {
  const source = channels.get(process.env.LUMO_CHANNEL?.trim() || "lumo");
  if (!source) throw Object.assign(new Error("渠道未配置，请检查 LUMO_CHANNEL"), { status: 503 });
  return source;
}
