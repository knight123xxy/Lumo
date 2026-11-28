import axios from "axios";
import useWorkspaceFiles from "@/lib/workspaceFiles";

type TextGroup = { label: string; items: string[]; kind?: "scene" };

export default async function saveTextCanvas(directory: string, name: string, groups: TextGroup[], signal: AbortSignal) {
  const files = useWorkspaceFiles(directory);
  signal.throwIfAborted();
  await files.mkdir("assets").catch(error => {
    if (!axios.isAxiosError<{ data?: { code?: string } }>(error) || error.response?.data.data?.code !== "EEXIST") throw error;
  });
  const nodes = [];
  // 正文依次落盘，避免多个文本节点挂载时同时创建素材目录。全部正文写完后才公布画布文件。
  for (const [column, { label, items, kind }] of groups.entries()) {
    for (const [row, content] of items.entries()) {
      signal.throwIfAborted();
      const id = crypto.randomUUID();
      const textPath = `assets/${id}/content.md`;
      await files.mkdir(`assets/${id}`);
      await files.write(textPath, content, true);
      nodes.push({ id, type: "remote-textNode", position: { x: column * 420, y: row * 310 },
        data: { label: items.length === 1 ? label : `${label} ${row + 1}`, textPath, ...(kind ? { scriptBreakdownKind: kind } : {}) } });
    }
  }
  const path = `${name}-${crypto.randomUUID()}.json`;
  signal.throwIfAborted();
  await files.writeJson(path, { lumoCanvas: true, nodes, edges: [], viewport: { x: 0, y: 0, zoom: 0.7 } }, true);
  return path;
}
