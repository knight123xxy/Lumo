import type { BrowserFfmpegCommand, BrowserFfmpegFactory, FfprobeData } from "@toonflow/ffmpeg/browser";

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
export function extractAudio(factory: BrowserFfmpegFactory, source: string, outputPath: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (normalizePath(source) === normalizePath(outputPath)) throw new Error("输出路径不能覆盖源文件");
  const command = factory(normalizePath(source));
  command.noVideo().audioCodec("libmp3lame").audioBitrate(128).format("mp3").output(normalizePath(outputPath)).outputOptions(["-map", "0:a:0"]);
  return runCommand(command, signal);
}
