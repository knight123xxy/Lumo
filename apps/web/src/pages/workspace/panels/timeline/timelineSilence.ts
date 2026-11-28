import type { BrowserFfmpegCommand, BrowserFfmpegFactory } from "@lumo/ffmpeg/browser";
import { atempoChain, probeMedia, runCommand } from "./timelineMedia";

export interface SilenceSegment {
  start: number;
  end: number;
}

export type SilenceEditMode = "tighten" | "speedUp";

export interface SilenceEditInput {
  path: string;
  duration: number;
  hasVideo: boolean;
}

export interface SilenceEditResult {
  silenceCount: number;
  newDuration: number;
  removedSeconds: number;
}

// 口播自动化默认参数：-30dB 阈值、0.5s 最短静音（对齐 280 §一方法 1）。
const thresholdDb = -30;
const minSilenceSeconds = 0.5;
const tightenTargetSeconds = 0.3;
const speedUpFactor = 4;
const maxSilenceSpeed = 8;
const fadeSeconds = 0.03;

interface GraphSegment {
  type: "speech" | "silence";
  start: number;
  end: number;
  speed: number;
}

/** 静音段的加速倍率：缩短模式按目标时长算，加速模式用固定倍率，上限 8x。 */
function silenceSpeed(mode: SilenceEditMode, silenceDuration: number) {
  if (mode === "speedUp") return Math.min(maxSilenceSpeed, Math.max(1, speedUpFactor));
  return Math.min(maxSilenceSpeed, Math.max(1, silenceDuration / tightenTargetSeconds));
}

function runDetect(command: BrowserFfmpegCommand, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const cancel = () => command.kill();
  signal?.addEventListener("abort", cancel, { once: true });
  return new Promise<string>((resolve, reject) => {
    command.on("start", () => { if (signal?.aborted) command.kill(); });
    command.on("error", error => reject(signal?.aborted ? signal.reason : error));
    command.on("end", (_stdout, stderr) => signal?.aborted ? reject(signal.reason) : resolve(stderr ?? ""));
    command.run();
  }).finally(() => signal?.removeEventListener("abort", cancel));
}

/** 用 ffmpeg silencedetect 检测静音段，从 stderr 解析 silence_start/silence_end（280 §一方法 1）。 */
export async function detectSilences(
  factory: BrowserFfmpegFactory,
  path: string,
  duration: number,
  signal?: AbortSignal,
): Promise<SilenceSegment[]> {
  const command = factory(path);
  command.noVideo();
  command.audioFilter(`silencedetect=noise=${thresholdDb}dB:d=${minSilenceSeconds}`);
  command.outputOptions(["-sn"]);
  command.format("null");
  command.output("assets/timeline/.null");
  const stderr = await runDetect(command, signal);
  return parseSilences(stderr, duration);
}

function parseSilences(stderr: string, duration: number): SilenceSegment[] {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const line of stderr.split("\n")) {
    const start = /silence_start:\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (start) starts.push(parseFloat(start[1]));
    const end = /silence_end:\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (end) ends.push(parseFloat(end[1]));
  }
  const segments: SilenceSegment[] = [];
  for (let index = 0; index < starts.length; index++) {
    // 文件末尾仍处于静音时 silencedetect 可能不输出 silence_end，取文件时长兜底。
    const end = index < ends.length ? ends[index] : duration;
    if (end > starts[index]) segments.push({ start: starts[index], end });
  }
  return segments;
}

function buildSegments(totalDuration: number, silences: SilenceSegment[], mode: SilenceEditMode): GraphSegment[] {
  const segments: GraphSegment[] = [];
  let pos = 0;
  for (const silence of silences) {
    if (silence.start > pos) segments.push({ type: "speech", start: pos, end: silence.start, speed: 1 });
    segments.push({ type: "silence", start: silence.start, end: silence.end, speed: silenceSpeed(mode, silence.end - silence.start) });
    pos = silence.end;
  }
  if (pos < totalDuration) segments.push({ type: "speech", start: pos, end: totalDuration, speed: 1 });
  return segments;
}

/** 每段 splice 边界加 30ms 音频淡入淡出防爆音（280 §四 Hard Rule 3），在输出时间轴（atempo 之后）应用。 */
function buildEdgeFade(duration: number, fadeIn: boolean, fadeOut: boolean) {
  const parts: string[] = [];
  if (fadeIn) parts.push(`afade=t=in:st=0:d=${fadeSeconds}`);
  if (fadeOut) parts.push(`afade=t=out:st=${Math.max(0, duration - fadeSeconds).toFixed(3)}:d=${fadeSeconds}`);
  return parts.join(",");
}

/** 按 280 §三 生成「逐段 trim + 静音段 setpts/atempo + concat」的 filter_complex。 */
function buildSilenceGraph(segments: GraphSegment[], hasVideo: boolean) {
  const parts: string[] = [];
  const videoInputs: string[] = [];
  const audioInputs: string[] = [];
  const count = segments.length;

  for (let index = 0; index < count; index++) {
    const seg = segments[index];
    const start = seg.start.toFixed(6);
    const end = seg.end.toFixed(6);
    if (hasVideo) parts.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`);
    parts.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`);

    const isSilence = seg.type === "silence";
    const segDuration = (seg.end - seg.start) / seg.speed;
    const fade = buildEdgeFade(segDuration, index > 0, index < count - 1);

    if (hasVideo) {
      if (isSilence && seg.speed > 1) {
        parts.push(`[v${index}]setpts=PTS/${seg.speed.toFixed(4)}[vs${index}]`);
        videoInputs.push(`[vs${index}]`);
      } else {
        videoInputs.push(`[v${index}]`);
      }
    }

    let audioLabel = `a${index}`;
    if (isSilence && seg.speed > 1) {
      const mid = `at${index}`;
      parts.push(`[a${index}]${atempoChain(seg.speed)}[${mid}]`);
      audioLabel = mid;
    }
    if (fade) {
      const out = `af${index}`;
      parts.push(`[${audioLabel}]${fade}[${out}]`);
      audioLabel = out;
    }
    audioInputs.push(`[${audioLabel}]`);
  }

  if (hasVideo) {
    const inputs = videoInputs.map((video, index) => `${video}${audioInputs[index]}`).join("");
    parts.push(`${inputs}concat=n=${count}:v=1:a=1[outv][outa]`);
  } else {
    parts.push(`${audioInputs.join("")}concat=n=${count}:v=0:a=1[outa]`);
  }
  return parts.join(";");
}

/** 检测静音并按「缩短/加速停顿」策略渲染成新的媒体文件，返回新时长与省去的秒数。 */
export async function applySilenceEdit(
  factory: BrowserFfmpegFactory,
  input: SilenceEditInput,
  outputPath: string,
  mode: SilenceEditMode,
  signal?: AbortSignal,
): Promise<SilenceEditResult> {
  const silences = await detectSilences(factory, input.path, input.duration, signal);
  if (!silences.length) return { silenceCount: 0, newDuration: input.duration, removedSeconds: 0 };

  const segments = buildSegments(input.duration, silences, mode);
  const graph = buildSilenceGraph(segments, input.hasVideo);

  const command = factory(input.path);
  command.complexFilter(graph);
  command.output(outputPath);
  if (input.hasVideo) {
    command.map("[outv]").map("[outa]");
    command.videoCodec("libx264").format("mp4");
    command.audioCodec("aac").audioBitrate(192);
    command.outputOptions(["-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
  } else {
    command.map("[outa]");
    command.audioCodec("libmp3lame").audioBitrate(192).format("mp3");
  }
  await runCommand(command, signal);

  // 编码会按视频帧和音频采样对齐，时间线使用成品容器的实际时长。
  const { format, streams } = await probeMedia(factory, outputPath, signal);
  const newDuration = Number(format.duration);
  if (!Number.isFinite(newDuration) || newDuration <= 0 || !streams.some(stream => stream.codec_type === "audio")
    || (input.hasVideo && !streams.some(stream => stream.codec_type === "video"))) {
    throw new Error("无法读取口播剪辑成品的时长或轨道");
  }
  return { silenceCount: silences.length, newDuration, removedSeconds: Math.max(0, input.duration - newDuration) };
}
