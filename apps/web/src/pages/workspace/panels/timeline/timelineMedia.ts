import type { BrowserFfmpegCommand, BrowserFfmpegFactory, FfprobeData } from "@lumo/ffmpeg/browser";

export function atempoChain(speed: number) {
  const parts: string[] = [];
  let remaining = speed;
  // ffmpeg atempo 稳定区间为 0.5~2.0，超出时串联多个滤镜。
  while (remaining > 2) { parts.push("atempo=2.0"); remaining /= 2; }
  while (remaining < 0.5) { parts.push("atempo=0.5"); remaining /= 0.5; }
  parts.push(`atempo=${remaining.toFixed(4)}`);
  return parts.join(",");
}

function normalizePath(path: string) {
  if (!path || /[\x00-\x1f]/.test(path) || /^(?:[\\/]|[a-z][a-z\d+.-]*:)/i.test(path) || path.split(/[\\/]+/).includes("..")) {
    throw new Error("媒体路径必须为工作区相对路径");
  }
  return path;
}

export function probeMedia(factory: BrowserFfmpegFactory, path: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const command = factory(normalizePath(path));
  const cancel = () => command.kill();
  signal?.addEventListener("abort", cancel, { once: true });
  return new Promise<FfprobeData>((resolve, reject) => {
    command.ffprobe((error, data) => {
      if (signal?.aborted) reject(signal.reason);
      else if (error) reject(error);
      else resolve(data);
    });
  }).finally(() => signal?.removeEventListener("abort", cancel));
}

export function runCommand(command: BrowserFfmpegCommand, signal?: AbortSignal, onProgress?: (percent: number) => void) {
  signal?.throwIfAborted();
  const cancel = () => command.kill();
  signal?.addEventListener("abort", cancel, { once: true });
  return new Promise<void>((resolve, reject) => {
    command.on("start", () => { if (signal?.aborted) command.kill(); });
    command.on("progress", progress => { if (progress.percent !== undefined) onProgress?.(progress.percent); });
    command.on("error", error => reject(signal?.aborted ? signal.reason : error));
    command.on("end", () => signal?.aborted ? reject(signal.reason) : resolve());
    command.run();
  }).finally(() => signal?.removeEventListener("abort", cancel));
}

/** 抽取视频/音频片段对应的音频到工作区路径，供浏览器 ASR 或波形使用。 */
export function extractAudio(factory: BrowserFfmpegFactory, source: string, outputPath: string, signal?: AbortSignal, range?: { inPoint: number; outPoint: number; speed: number }) {
  signal?.throwIfAborted();
  if (normalizePath(source) === normalizePath(outputPath)) throw new Error("输出路径不能覆盖源文件");
  const command = factory(normalizePath(source));
  if (range) {
    if (![range.inPoint, range.outPoint, range.speed].every(Number.isFinite) || range.inPoint < 0 || range.outPoint <= range.inPoint || range.speed <= 0) {
      throw new Error("字幕音频的时间范围或倍速无效");
    }
    command.audioFilter(`atrim=start=${range.inPoint}:end=${range.outPoint},asetpts=PTS-STARTPTS,${atempoChain(range.speed)}`);
  }
  command.noVideo().audioCodec("libmp3lame").audioBitrate(128).format("mp3").output(normalizePath(outputPath)).outputOptions(["-map", "0:a:0"]);
  return runCommand(command, signal);
}
