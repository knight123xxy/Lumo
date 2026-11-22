// 时间线剪辑的数据模型（产品层字段对齐 265 §三）。
// 时间单位统一用秒（浮点），显示层负责格式化为 HH:MM:SS.mmm。

export type TrackType = "video" | "audio" | "subtitle" | "text";
export type ClipKind = "video" | "audio" | "image" | "text";
export type AssetKind = "video" | "audio" | "image" | "srt";

export type FilterPreset = "none" | "warm" | "cold" | "mono";

export interface ClipFilter {
  brightness: number; // -1 .. 1
  contrast: number; // -1 .. 1
  saturation: number; // -1 .. 1
  preset: FilterPreset;
}

export interface ClipCrop {
  enabled: boolean;
  left: number; // 0 .. 1，相对源画面宽度的裁剪比例
  right: number;
  top: number;
  bottom: number;
}

export interface TimelineClip {
  id: string;
  kind: ClipKind;
  source: string; // 工作区相对路径；text 片段为空
  sourceDuration: number; // 源素材时长，text 片段与 timelineDuration 一致
  inPoint: number; // 源裁剪起点（秒）
  outPoint: number; // 源裁剪终点（秒）
  timelineStart: number; // 时间线位置（秒）
  timelineDuration: number; // 时间线长度（秒）= (outPoint - inPoint) / speed
  speed: number; // 0.1 .. 16
  volume: number; // 0 .. 2
  fadeIn: number; // 淡入时长（秒）
  fadeOut: number;
  filter: ClipFilter;
  crop: ClipCrop;
  text: string; // 字幕 / 文字片段内容
}

export interface TimelineTrack {
  id: string;
  type: TrackType;
  name: string;
  hidden: boolean; // 隐藏后导出不包含该轨
  muted: boolean; // 静音后导出不包含该轨声音（仅 audio / 含音视频）
  clips: TimelineClip[];
}

export interface AssetItem {
  id: string;
  name: string;
  path: string; // 工作区相对路径
  kind: AssetKind;
  mimeType: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  subtitles?: { start: number; end: number; text: string }[]; // srt 导入后解析出的字幕
}

export interface ProjectStyle {
  slug: string;
  name: string;
  group: string;
  summary: string;
  essence?: string;
  colors?: string;
  fonts?: string;
  motion?: string;
}

export interface TimelineProject {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  assets: AssetItem[];
  tracks: TimelineTrack[];
  style?: ProjectStyle;
}

export const trackDefaults: Record<TrackType, { name: string; hidden: boolean; muted: boolean }> = {
  video: { name: "视频轨 V1", hidden: false, muted: false },
  audio: { name: "音频轨 A1", hidden: false, muted: false },
  subtitle: { name: "字幕轨 S1", hidden: false, muted: false },
  text: { name: "文字轨 T1", hidden: false, muted: false },
};

export const defaultFilter = (): ClipFilter => ({ brightness: 0, contrast: 0, saturation: 0, preset: "none" });
export const defaultCrop = (): ClipCrop => ({ enabled: false, left: 0, right: 0, top: 0, bottom: 0 });

export const speedRange = { min: 0.1, max: 16 };
export const volumeRange = { min: 0, max: 2 };
