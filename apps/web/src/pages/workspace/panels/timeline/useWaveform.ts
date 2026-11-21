import useWorkspaceFiles from "@/lib/workspaceFiles";

const cache = new Map<string, number[]>();

function guessMime(path: string) {
  const suffix = path.split(".").at(-1)?.toLowerCase();
  if (suffix === "mp3") return "audio/mpeg";
  if (suffix === "wav") return "audio/wav";
  if (suffix === "m4a" || suffix === "aac") return "audio/aac";
  if (suffix === "ogg" || suffix === "oga") return "audio/ogg";
  if (suffix === "flac") return "audio/flac";
  if (suffix === "mp4" || suffix === "m4v") return "video/mp4";
  if (suffix === "webm") return "video/webm";
  if (suffix === "mov") return "video/quicktime";
  return "application/octet-stream";
}

/** 解码音频并返回归一化峰值数组；失败时回退为确定性伪波形，避免空白。 */
export async function computeWaveform(directory: string, path: string, buckets = 100): Promise<number[]> {
  const key = `${directory}\0${path}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const fallback = Array.from({ length: buckets }, (_, index) => 0.35 + 0.3 * Math.abs(Math.sin(index * 0.7)) * (0.4 + 0.6 * Math.abs(Math.sin(index * 0.13))));
  try {
    const files = useWorkspaceFiles(directory);
    const handle = files.acquireUrl(path, guessMime(path));
    try {
      const url = await handle.url;
      const arrayBuffer = await fetch(url).then(response => {
        if (!response.ok) throw new Error("音频读取失败");
        return response.arrayBuffer();
      });
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(arrayBuffer);
        const data = buffer.getChannelData(0);
        const peaks = new Array<number>(buckets).fill(0);
        const step = Math.max(1, Math.floor(data.length / buckets));
        for (let index = 0; index < buckets; index++) {
          const start = index * step;
          const end = Math.min(data.length, start + step);
          let max = 0;
          for (let sample = start; sample < end; sample++) max = Math.max(max, Math.abs(data[sample]!));
          peaks[index] = Math.max(0, Math.min(1, max));
        }
        cache.set(key, peaks);
        return peaks;
      } finally {
        await context.close().catch(() => {});
      }
    } finally {
      handle.release();
    }
  } catch {
    return fallback;
  }
}
