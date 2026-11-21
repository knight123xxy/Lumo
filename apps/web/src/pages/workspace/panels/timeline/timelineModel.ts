import { defaultCrop, defaultFilter, speedRange, trackDefaults, type ClipKind, type TimelineClip, type TimelineProject, type TimelineTrack, type TrackType } from "./timelineTypes";

export const timelineProjectFile = "timeline.json";
export const pixelsPerSecond = 48;
export const trackGutter = 132;
export const timelineAssetMime = "application/x-timeline-asset";

export function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function snap(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function formatTime(seconds: number, fps = 30) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalFrames = Math.round(safe * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${String(frames).padStart(2, "0")}`;
}

export function createEmptyProject(name = "未命名剪辑"): TimelineProject {
  return {
    version: 1,
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    assets: [],
    tracks: (["video", "audio", "subtitle", "text"] as const).map(type => createTrack(type)),
  };
}

export function createTrack(type: TrackType): TimelineTrack {
  const defaults = trackDefaults[type];
  return { id: uid("track"), type, name: defaults.name, hidden: defaults.hidden, muted: defaults.muted, clips: [] };
}

export function createClip(input: {
  kind: ClipKind;
  source?: string;
  sourceDuration?: number;
  timelineStart?: number;
  timelineDuration?: number;
  text?: string;
  speed?: number;
}): TimelineClip {
  const speed = clamp(input.speed ?? 1, speedRange.min, speedRange.max);
  const timelineDuration = input.timelineDuration ?? 0;
  return {
    id: uid("clip"),
    kind: input.kind,
    source: input.source ?? "",
    sourceDuration: input.sourceDuration ?? timelineDuration,
    inPoint: 0,
    outPoint: timelineDuration * speed,
    timelineStart: input.timelineStart ?? 0,
    timelineDuration,
    speed,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    filter: defaultFilter(),
    crop: defaultCrop(),
    text: input.text ?? "",
  };
}

export function clipSourceRange(clip: TimelineClip) {
  return { start: clip.inPoint, duration: clip.timelineDuration * clip.speed };
}

/** 时间线总长 = 所有轨道中最靠右的片段末端。 */
export function computeDuration(project: Pick<TimelineProject, "tracks">) {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.timelineStart + clip.timelineDuration);
  }
  return end;
}

/** 播放头吸附：按帧对齐，吸附开启时优先贴到任意片段首尾。 */
export function snapPlayhead(seconds: number, fps: number, project: Pick<TimelineProject, "tracks">, enabled: boolean) {
  const framed = Math.round(seconds * fps) / fps;
  if (!enabled) return framed;
  const threshold = 0.5 / fps;
  let best = framed;
  let bestDistance = threshold;
  const consider = (candidate: number) => {
    const distance = Math.abs(candidate - seconds);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  };
  consider(0);
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      consider(clip.timelineStart);
      consider(clip.timelineStart + clip.timelineDuration);
    }
  }
  return best;
}

/** 切割：把一个片段拆成两段相邻片段，切点落在源时间轴对应位置。 */
export function splitClip(clip: TimelineClip, at: number): [TimelineClip, TimelineClip] {
  const offset = clamp(at - clip.timelineStart, 0, clip.timelineDuration);
  const sourceAt = clip.inPoint + offset * clip.speed;
  const left = {
    ...clip,
    id: uid("clip"),
    outPoint: sourceAt,
    timelineDuration: offset,
  };
  const right = {
    ...clip,
    id: uid("clip"),
    inPoint: sourceAt,
    outPoint: clip.outPoint,
    timelineStart: clip.timelineStart + offset,
    timelineDuration: clip.timelineDuration - offset,
  };
  return [left, right];
}

/** 变速：改 timelineDuration 与源 outPoint 的关系（265 §三约定）。 */
export function applySpeed(clip: TimelineClip, speed: number): TimelineClip {
  const nextSpeed = clamp(speed, speedRange.min, speedRange.max);
  const sourceLength = clip.outPoint - clip.inPoint;
  return {
    ...clip,
    speed: nextSpeed,
    timelineDuration: sourceLength / nextSpeed,
  };
}

export function setSourceRange(clip: TimelineClip, inPoint: number, outPoint: number): TimelineClip {
  const start = clamp(inPoint, 0, clip.sourceDuration);
  const end = clamp(outPoint, start, clip.sourceDuration);
  return {
    ...clip,
    inPoint: start,
    outPoint: end,
    timelineDuration: (end - start) / clip.speed,
  };
}

export function moveClip(clip: TimelineClip, timelineStart: number): TimelineClip {
  return { ...clip, timelineStart: Math.max(0, timelineStart) };
}

/** 解析 SRT 文本为带时间轴的字幕条目（忽略序号与不合法块）。 */
export function parseSrt(text: string): { start: number; end: number; text: string }[] {
  const result: { start: number; end: number; text: string }[] = [];
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const timestamp = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
  for (const block of blocks) {
    const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const match = timestamp.exec(lines.join("\n"));
    if (!match) continue;
    const start = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4].padEnd(3, "0")) / 1000;
    const end = Number(match[5]) * 3600 + Number(match[6]) * 60 + Number(match[7]) + Number(match[8].padEnd(3, "0")) / 1000;
    if (end <= start) continue;
    const textLine = lines.slice(1).join("\n").replace(timestamp, "").trim();
    if (!textLine) continue;
    result.push({ start, end, text: textLine });
  }
  return result;
}
