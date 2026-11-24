import { computed, ref, shallowRef } from "vue";
import axios from "axios";
import { createBrowserFfmpeg, type BrowserFfmpegFactory } from "@lumo/ffmpeg/browser";
import { isBrowserAudioAsrSupported, transcribeBrowserAudio } from "@lumo/asr";
import { translate } from "@lumo/i18n/vue";
import { useNodeAi } from "@lumo/nodes-scaffold/nodeAi";
import http from "@/lib/http";
import { buildAutomaticFilm, type AutomaticFilmInput } from "./automaticFilm";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import {
  applySpeed,
  clamp,
  computeDuration,
  createClip,
  createEmptyProject,
  createTrack,
  moveClip,
  parseSrt,
  setSourceRange,
  splitClip,
  timelineProjectFile,
  uid,
} from "./timelineModel";
import { extractAudio, probeMedia } from "./timelineMedia";
import { applySilenceEdit, type SilenceEditMode } from "./timelineSilence";
import type { AssetItem, ClipFilter, ClipCrop, ProjectStyle, TimelineClip, TimelineProject, TrackType } from "./timelineTypes";

type Selection = { trackId: string; clipId: string };

function snapshot<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

// 剪贴板跨工作区保留，符合「复制 → 切项目 → 粘贴」的常规预期。
let clipboardClip: TimelineClip | undefined;

export function useTimeline(directory: string) {
  const files = useWorkspaceFiles(directory);
  const ai = useNodeAi();
  const project = ref<TimelineProject>(createEmptyProject());
  const loaded = ref(false);
  const ready = ref(false);
  const selection = ref<Selection | null>(null);
  const playhead = ref(0);
  const snapEnabled = ref(true);
  const playing = ref(false);
  const busy = ref(false);
  const error = ref("");
  const past = shallowRef<TimelineProject[]>([]);
  const future = shallowRef<TimelineProject[]>([]);
  const ffmpeg = shallowRef<BrowserFfmpegFactory>();
  const lifetime = new AbortController();
  let timelineReadError = "";

  const tracks = computed(() => project.value.tracks);
  const assets = computed(() => project.value.assets);
  const duration = computed(() => computeDuration(project.value));
  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);
  const selectedClip = computed(() => {
    if (!selection.value) return undefined;
    return findInTracks(selection.value.clipId)?.clip;
  });

  function findInTracks(clipId: string) {
    for (const track of project.value.tracks) {
      const clip = track.clips.find(item => item.id === clipId);
      if (clip) return { trackId: track.id, clip };
    }
    return undefined;
  }

  function commit() {
    past.value = [...past.value, snapshot(project.value)];
    if (past.value.length > 100) past.value = past.value.slice(-100);
    future.value = [];
  }

  async function getFfmpeg() {
    if (ffmpeg.value) return ffmpeg.value;
    const created = await createBrowserFfmpeg(directory, lifetime.signal);
    ffmpeg.value = created;
    return created;
  }

  async function load(strict = false) {
    try {
      const data = await files.readJson<TimelineProject>(timelineProjectFile, lifetime.signal);
      if (data && Array.isArray(data.tracks)) project.value = normalizeProject(data);
      else throw new Error(translate("剪辑工程格式不正确"));
    } catch (error) {
      // 首页成片会直接保存草稿，只有文件不存在时才允许从空工程开始。
      if (!axios.isAxiosError(error) || error.response?.status !== 404) {
        if (strict) throw error;
        timelineReadError = error instanceof Error ? error.message : translate("读取剪辑工程失败");
      }
    }
    loaded.value = true;
    ready.value = true;
  }

  async function flushSave() {
    if (!loaded.value) return;
    if (timelineReadError) throw new Error(timelineReadError);
    await files.writeJson(timelineProjectFile, project.value);
  }

  async function appendCanvasVideo(video: { path: string; name: string; mimeType: string }) {
    if (!ready.value || busy.value) throw new Error(translate("剪辑工程正在处理，请稍后重试"));
    if (timelineReadError) throw new Error(timelineReadError);
    busy.value = true;
    try {
      const media = await probeMedia(await getFfmpeg(), video.path, lifetime.signal);
      const stream = media.streams.find(item => item.codec_type === "video" && !item.disposition?.attached_pic);
      const seconds = Number(media.format.duration ?? stream?.duration);
      if (!stream || !Number.isFinite(seconds) || seconds <= 0) throw new Error(translate("无法读取画布视频的时长"));
      for (const folder of ["assets", "assets/timeline"]) {
        await files.mkdir(folder).catch(error => {
          if (!axios.isAxiosError(error) || error.response?.data?.data?.code !== "EEXIST") throw error;
        });
      }
      const suffix = video.path.match(/\.[a-z\d]{1,8}$/i)?.[0] ?? ".mp4";
      const path = `assets/timeline/${uid("asset")}${suffix}`;
      lifetime.signal.throwIfAborted();
      // 剪辑保留独立副本，画布替换或删除节点输出时，已剪片段仍然可用。
      await files.copy(video.path, path);
      lifetime.signal.throwIfAborted();
      const next = snapshot(project.value);
      const start = computeDuration(next);
      // 仅空时间线跟随首段视频的画幅，已有剪辑保留原工程尺寸。
      if (!next.tracks.some(track => track.clips.length) && stream.width && stream.height) {
        next.width = stream.width;
        next.height = stream.height;
      }
      let track = next.tracks.find(item => item.type === "video" && !item.hidden);
      if (!track) {
        track = createTrack("video");
        next.tracks.push(track);
      }
      const clip = createClip({ kind: "video", source: path, sourceDuration: seconds, timelineStart: start, timelineDuration: seconds });
      track.clips.push(clip);
      next.assets.push({ id: uid("asset"), path, name: video.name, mimeType: video.mimeType, kind: "video", size: Number(media.format.size) || 0,
        duration: seconds, width: stream.width, height: stream.height });
      await files.writeJson(timelineProjectFile, next);
      commit();
      project.value = next;
      selection.value = { trackId: track.id, clipId: clip.id };
      playing.value = false;
      playhead.value = start;
    } finally {
      busy.value = false;
    }
  }

  async function createAutomaticFilm(input: AutomaticFilmInput, signal: AbortSignal, progress: (stage: string) => void) {
    if (!ready.value || busy.value) throw new Error(translate("剪辑工程正在处理，请稍后重试"));
    if (timelineReadError) throw new Error(timelineReadError);
    busy.value = true;
    const combined = AbortSignal.any([signal, lifetime.signal]);
    try {
      const unavailable = project.value.tracks.find(track => ["video", "audio", "subtitle"].includes(track.type) && (track.hidden || track.type === "audio" && track.muted));
      if (unavailable) throw new Error(translate("请先显示视频和字幕轨，并取消音频轨静音"));
      const draft = await buildAutomaticFilm(input, directory, ai, await getFfmpeg(), combined, progress);
      combined.throwIfAborted();
      const next = snapshot(project.value);
      const start = computeDuration(next);
      for (const [type, clips] of [["video", draft.video], ["audio", draft.audio], ["subtitle", draft.subtitles]] as const) {
        let track = next.tracks.find(item => item.type === type);
        if (track && (track.hidden || (type === "audio" && track.muted))) {
          throw new Error(translate("请先显示视频和字幕轨，并取消音频轨静音"));
        }
        if (!track) {
          track = createTrack(type);
          next.tracks.push(track);
        }
        track.clips.push(...clips.map(clip => ({ ...clip, timelineStart: clip.timelineStart + start })));
      }
      next.assets.push(...draft.assets);
      if (draft.style) next.style = draft.style;
      await files.writeJson(timelineProjectFile, next);
      commit();
      project.value = next;
      playing.value = false;
      selection.value = null;
      playhead.value = start;
      return draft;
    } finally {
      busy.value = false;
    }
  }

  // ---------- 素材库 ----------

  function classifyFile(file: File): AssetItem["kind"] {
    const mimeType = file.type || "";
    const name = file.name.toLowerCase();
    if (mimeType.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/.test(name)) return "video";
    if (mimeType.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return "audio";
    if (mimeType.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/.test(name)) return "image";
    if (/\.srt$/.test(name)) return "srt";
    throw new Error(translate("暂不支持这种文件格式"));
  }

  async function importFile(file: File): Promise<AssetItem> {
    const kind = classifyFile(file);
    const suffix = file.name.split(".").at(-1)?.toLowerCase() || "bin";
    const path = `assets/timeline/${uid("asset")}.${suffix}`;
    await files.mkdir("assets").catch(() => {});
    await files.mkdir("assets/timeline").catch(() => {});
    await files.write(path, file, true);
    const asset: AssetItem = { id: uid("asset"), name: file.name, path, kind, mimeType: file.type || "application/octet-stream", size: file.size };
    if (kind === "video" || kind === "audio") {
      try {
        const media = await probeMedia(await getFfmpeg(), path, lifetime.signal);
        const video = media.streams.find(stream => stream.codec_type === "video" && !stream.disposition?.attached_pic);
        asset.duration = Number(media.format.duration ?? video?.duration ?? 0);
        asset.width = video?.width;
        asset.height = video?.height;
      } catch {
        // 探测失败不阻塞导入，仅缺元数据。
      }
    } else if (kind === "image") {
      const size = await readImageSize(path);
      asset.width = size.width;
      asset.height = size.height;
    } else if (kind === "srt") {
      const text = await files.readText(path);
      asset.subtitles = parseSrt(text);
    }
    return asset;
  }

  async function importFiles(fileList: File[], allowedKinds?: readonly AssetItem["kind"][]) {
    if (allowedKinds && fileList.some(file => !allowedKinds.includes(classifyFile(file)))) {
      throw new Error(translate("暂不支持这种文件格式"));
    }
    const added: AssetItem[] = [];
    busy.value = true;
    try {
      for (const file of fileList) {
        const asset = await importFile(file);
        project.value.assets.push(asset);
        added.push(asset);
        await flushSave();
      }
    } finally {
      busy.value = false;
    }
    return added;
  }

  function readImageSize(path: string) {
    return files.acquireUrl(path, "image/png").url.then(url => new Promise<{ width: number; height: number }>(resolve => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ width: 0, height: 0 });
      image.src = url;
    })).catch(() => ({ width: 0, height: 0 }));
  }

  // ---------- 片段操作 ----------

  function ensureTrack(type: TrackType) {
    let track = project.value.tracks.find(item => item.type === type);
    if (!track) {
      track = createTrack(type);
      project.value.tracks.push(track);
    }
    return track;
  }

  function addClip(asset: AssetItem, trackType: TrackType, timelineStart = playhead.value) {
    commit();
    if (asset.kind === "srt") {
      const track = ensureTrack("subtitle");
      for (const item of asset.subtitles ?? []) {
        track.clips.push(createClip({ kind: "text", timelineStart: timelineStart + item.start, timelineDuration: item.end - item.start, text: item.text }));
      }
      return;
    }
    const targetType = trackType === "video" ? "video" : trackType;
    const track = ensureTrack(targetType);
    const kind = asset.kind === "audio" ? "audio" : (asset.kind === "image" ? "image" : "video");
    const sourceDuration = asset.duration ?? (kind === "image" ? 3 : 1);
    const clip = createClip({ kind, source: asset.path, sourceDuration, timelineStart, timelineDuration: sourceDuration });
    if (asset.sourceInfo) clip.sourceInfo = snapshot(asset.sourceInfo);
    track.clips.push(clip);
    if (!project.value.assets.some(item => item.path === asset.path)) project.value.assets.push(asset);
    selection.value = { trackId: track.id, clipId: clip.id };
  }

  async function addLowerThird(effectId: string, kicker: string, name: string) {
    if (!ready.value || busy.value) return;
    if (timelineReadError) throw new Error(timelineReadError);
    const start = playhead.value;
    busy.value = true;
    try {
      const result = await http<{ output: string; seconds: number }>({ method: "POST", url: "/api/effect/render", timeout: 360000,
        signal: lifetime.signal, data: { directory, effectId, kicker, name } });
      lifetime.signal.throwIfAborted();
      const next = snapshot(project.value);
      let track = next.tracks.find(item => item.type === "effect" && !item.hidden);
      if (!track) {
        track = createTrack("effect");
        next.tracks.unshift(track);
      }
      const clip = createClip({ kind: "effect", source: result.output, timelineStart: start, timelineDuration: result.seconds, sourceDuration: result.seconds, text: name });
      track.clips.push(clip);
      await files.writeJson(timelineProjectFile, next);
      commit();
      project.value = next;
      playing.value = false;
      playhead.value = start;
      selection.value = { trackId: track.id, clipId: clip.id };
    } finally { busy.value = false; }
  }

  function addTextClip(trackType: TrackType, timelineStart = playhead.value) {
    commit();
    const track = ensureTrack(trackType);
    const clip = createClip({ kind: "text", timelineStart, timelineDuration: 3, text: "文字" });
    track.clips.push(clip);
    selection.value = { trackId: track.id, clipId: clip.id };
  }

  function removeClip(clipId: string) {
    const found = findInTracks(clipId);
    if (!found) return;
    commit();
    const track = project.value.tracks.find(item => item.id === found.trackId)!;
    track.clips = track.clips.filter(item => item.id !== clipId);
    if (selection.value?.clipId === clipId) selection.value = null;
  }

  function removeSelected() {
    if (selection.value) removeClip(selection.value.clipId);
  }

  function splitSelected() {
    const clip = selectedClip.value;
    if (!clip) return;
    const at = playhead.value;
    if (at <= clip.timelineStart || at >= clip.timelineStart + clip.timelineDuration) return;
    commit();
    const [left, right] = splitClip(clip, at);
    const track = project.value.tracks.find(item => item.id === selection.value!.trackId)!;
    const index = track.clips.findIndex(item => item.id === clip.id);
    track.clips.splice(index, 1, left, right);
    selection.value = { trackId: track.id, clipId: right.id };
  }

  function copySelected() {
    if (selectedClip.value) clipboardClip = snapshot(selectedClip.value);
  }

  function pasteSelected() {
    if (!clipboardClip) return;
    commit();
    const track = ensureTrack(trackTypeForClip(clipboardClip.kind));
    const clip = { ...structuredClone(clipboardClip), id: uid("clip"), timelineStart: playhead.value };
    track.clips.push(clip);
    selection.value = { trackId: track.id, clipId: clip.id };
  }

  function applyToClip(clipId: string, patch: Partial<TimelineClip>) {
    const found = findInTracks(clipId);
    if (!found) return;
    const track = project.value.tracks.find(item => item.id === found.trackId)!;
    const index = track.clips.findIndex(item => item.id === clipId);
    if (index >= 0) track.clips[index] = { ...track.clips[index]!, ...patch };
  }

  function setSpeed(clipId: string, speed: number) {
    const clip = findInTracks(clipId)?.clip;
    if (!clip) return;
    commit();
    applyToClip(clipId, applySpeed(clip, speed));
  }

  function setVolume(clipId: string, volume: number) {
    commit();
    applyToClip(clipId, { volume: clamp(volume, 0, 2) });
  }

  function setFade(clipId: string, fadeIn: number, fadeOut: number) {
    commit();
    applyToClip(clipId, { fadeIn: Math.max(0, fadeIn), fadeOut: Math.max(0, fadeOut) });
  }

  function setFilter(clipId: string, filter: ClipFilter) {
    commit();
    applyToClip(clipId, { filter });
  }

  function setCrop(clipId: string, crop: ClipCrop) {
    commit();
    applyToClip(clipId, { crop });
  }

  function setText(clipId: string, text: string) {
    commit();
    applyToClip(clipId, { text });
  }

  function setStyle(style: ProjectStyle | undefined) {
    commit();
    project.value.style = style;
  }

  function setClipRange(clipId: string, inPoint: number, outPoint: number) {
    const clip = findInTracks(clipId)?.clip;
    if (!clip) return;
    commit();
    applyToClip(clipId, setSourceRange(clip, inPoint, outPoint));
  }

  function moveClipTo(clipId: string, timelineStart: number, trackId?: string) {
    const found = findInTracks(clipId);
    if (!found) return;
    commit();
    const next = moveClip(found.clip, timelineStart);
    if (trackId && trackId !== found.trackId) {
      const from = project.value.tracks.find(item => item.id === found.trackId)!;
      const to = project.value.tracks.find(item => item.id === trackId)!;
      from.clips = from.clips.filter(item => item.id !== clipId);
      to.clips.push(next);
    } else {
      applyToClip(clipId, next);
    }
  }

  function trimClip(clipId: string, timelineStart: number, timelineEnd: number) {
    const clip = findInTracks(clipId)?.clip;
    if (!clip) return;
    const start = clamp(timelineStart, 0, clip.timelineStart + clip.timelineDuration);
    const end = clamp(timelineEnd, start, clip.timelineStart + clip.timelineDuration);
    const offsetStart = start - clip.timelineStart;
    const offsetEnd = end - clip.timelineStart;
    commit();
    applyToClip(clipId, {
      ...clip,
      timelineStart: start,
      timelineDuration: offsetEnd - offsetStart,
      inPoint: clip.inPoint + offsetStart * clip.speed,
      outPoint: clip.inPoint + offsetEnd * clip.speed,
    });
  }

  // ---------- 轨道 ----------

  function toggleTrackHidden(trackId: string) {
    commit();
    const track = project.value.tracks.find(item => item.id === trackId);
    if (track) track.hidden = !track.hidden;
  }

  function toggleTrackMuted(trackId: string) {
    commit();
    const track = project.value.tracks.find(item => item.id === trackId);
    if (track) track.muted = !track.muted;
  }

  function addTrack(type: TrackType) {
    commit();
    project.value.tracks.push(createTrack(type));
  }

  function removeTrack(trackId: string) {
    const index = project.value.tracks.findIndex(item => item.id === trackId);
    if (index < 0) return;
    commit();
    project.value.tracks.splice(index, 1);
    if (selection.value?.trackId === trackId) selection.value = null;
  }

  // ---------- 撤销 / 重做 ----------

  function undo() {
    const previous = past.value.at(-1);
    if (!previous) return;
    future.value = [snapshot(project.value), ...future.value];
    project.value = previous;
    past.value = past.value.slice(0, -1);
    selection.value = null;
  }

  function redo() {
    const next = future.value[0];
    if (!next) return;
    past.value = [...past.value, snapshot(project.value)];
    project.value = next;
    future.value = future.value.slice(1);
    selection.value = null;
  }

  // ---------- 字幕 ASR ----------

  async function generateSubtitles(clipId: string) {
    const found = findInTracks(clipId);
    if (!found) throw new Error(translate("未找到片段"));
    if (!isBrowserAudioAsrSupported()) throw new Error(translate("当前浏览器暂不支持音频识别，可以换用 Chrome 再试"));
    const clip = found.clip;
    if (clip.kind === "text") throw new Error(translate("文字片段不需要识别字幕"));
    busy.value = true;
    try {
      let audioPath = clip.kind === "audio" ? clip.source : "";
      if (clip.kind !== "audio") {
        audioPath = `assets/timeline/${clip.id}.mp3`;
        await extractAudio(await getFfmpeg(), clip.source, audioPath, lifetime.signal);
      }
      const handle = files.acquireUrl(audioPath, "audio/mpeg");
      try {
        const text = await transcribeBrowserAudio(await handle.url, { lang: "zh-CN", signal: lifetime.signal });
        if (!text.trim()) throw new Error(translate("没有识别到清晰的人声"));
        commit();
        const track = ensureTrack("subtitle");
        const subtitle = createClip({ kind: "text", timelineStart: clip.timelineStart, timelineDuration: clip.timelineDuration, text: text.trim() });
        track.clips.push(subtitle);
        selection.value = { trackId: track.id, clipId: subtitle.id };
      } finally {
        handle.release();
      }
    } finally {
      busy.value = false;
    }
  }

  // ---------- 口播自动化（剪沉默 / 加速停顿） ----------

  async function silenceEdit(mode: SilenceEditMode) {
    const clip = selectedClip.value;
    if (!clip) throw new Error(translate("请先选择要处理的口播片段"));
    if (clip.kind !== "video" && clip.kind !== "audio") throw new Error(translate("仅支持视频或音频片段"));
    // ACT: 对整段源素材做口播自动化，忽略片段已裁剪的 inPoint/outPoint 与变速，处理后重置为整段成品。
    const duration = clip.sourceDuration > 0 ? clip.sourceDuration : clip.outPoint;
    if (!clip.source || duration <= 0) throw new Error(translate("片段缺少源素材"));
    const suffix = clip.kind === "video" ? "mp4" : "mp3";
    const outputPath = `assets/timeline/${clip.id}-${mode}.${suffix}`;
    busy.value = true;
    try {
      const result = await applySilenceEdit(
        await getFfmpeg(),
        { path: clip.source, duration, hasVideo: clip.kind === "video" },
        outputPath,
        mode,
        lifetime.signal,
      );
      if (!result.silenceCount) return { silenceCount: 0, removedSeconds: 0 };
      commit();
      applyToClip(clip.id, {
        source: outputPath,
        sourceDuration: result.newDuration,
        inPoint: 0,
        outPoint: result.newDuration,
        timelineDuration: result.newDuration,
        speed: 1,
      });
      return { silenceCount: result.silenceCount, removedSeconds: result.removedSeconds };
    } finally {
      busy.value = false;
    }
  }

  function clearSelection() {
    selection.value = null;
  }

  function toggleSnap() {
    snapEnabled.value = !snapEnabled.value;
  }

  function dispose() {
    lifetime.abort(new Error("时间线已关闭"));
  }

  return {
    directory,
    project,
    tracks,
    assets,
    duration,
    loaded,
    ready,
    error,
    selection,
    selectedClip,
    playhead,
    snapEnabled,
    playing,
    busy,
    canUndo,
    canRedo,
    load,
    flushSave,
    importFiles,
    appendCanvasVideo,
    createAutomaticFilm,
    addClip,
    addLowerThird,
    addTextClip,
    removeClip,
    removeSelected,
    splitSelected,
    copySelected,
    pasteSelected,
    setSpeed,
    setVolume,
    setFade,
    setFilter,
    setCrop,
    setText,
    setStyle,
    setClipRange,
    trimClip,
    moveClipTo,
    toggleTrackHidden,
    toggleTrackMuted,
    addTrack,
    removeTrack,
    undo,
    redo,
    generateSubtitles,
    silenceEdit,
    select(trackId: string, clipId: string) {
      selection.value = { trackId, clipId };
    },
    clearSelection,
    toggleSnap,
    dispose,
  };
}

function trackTypeForClip(kind: TimelineClip["kind"]): TrackType {
  if (kind === "effect") return "effect";
  if (kind === "audio") return "audio";
  if (kind === "text") return "subtitle";
  return "video";
}

function normalizeProject(data: TimelineProject): TimelineProject {
  const project = createEmptyProject(data.name || "未命名剪辑");
  project.width = data.width || project.width;
  project.height = data.height || project.height;
  project.fps = data.fps || project.fps;
  project.assets = Array.isArray(data.assets) ? data.assets : [];
  project.tracks = Array.isArray(data.tracks) && data.tracks.length ? data.tracks : project.tracks;
  project.style = data.style;
  return project;
}
