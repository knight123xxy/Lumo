import { createBrowserFfmpeg } from "@lumo/ffmpeg/browser";
import { translate } from "@lumo/i18n/vue";
import { runCommand } from "./timelineMedia";
import type { TimelineClip, TimelineProject, TimelineTrack } from "./timelineTypes";

export interface ExportOptions {
  directory: string;
  outputPath: string;
  width: number;
  height: number;
  videoBitrate: string; // 例如 "8M"
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

interface InputSpec {
  clip: TimelineClip;
  kind: "video" | "image" | "audio";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function atempoChain(speed: number) {
  const parts: string[] = [];
  let remaining = speed;
  // ffmpeg atempo 稳定区间为 0.5~2.0，超出时串联多个滤镜。
  while (remaining > 2) { parts.push("atempo=2.0"); remaining /= 2; }
  while (remaining < 0.5) { parts.push("atempo=0.5"); remaining /= 0.5; }
  parts.push(`atempo=${remaining.toFixed(4)}`);
  return parts.join(",");
}

function escapeDrawtext(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, " ");
}

function trackVisible(track: TimelineTrack) {
  return !track.hidden;
}

function projectDuration(project: TimelineProject) {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.timelineStart + clip.timelineDuration);
  }
  return end;
}

export async function exportTimeline(project: TimelineProject, options: ExportOptions) {
  const { directory, outputPath, width, height, videoBitrate, signal, onProgress } = options;
  const duration = projectDuration(project);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(translate("时间线为空，请先添加片段"));
  const fps = project.fps || 30;
  const videoTrack = project.tracks.find(track => track.type === "video");
  const audioTrack = project.tracks.find(track => track.type === "audio");
  const subtitleTrack = project.tracks.find(track => track.type === "subtitle");
  const textTrack = project.tracks.find(track => track.type === "text");
  const videoClips = videoTrack && trackVisible(videoTrack) ? [...videoTrack.clips].sort((a, b) => a.timelineStart - b.timelineStart) : [];
  const audioClips = audioTrack && trackVisible(audioTrack) && !audioTrack.muted ? [...audioTrack.clips].sort((a, b) => a.timelineStart - b.timelineStart) : [];
  const includeVideoAudio = !!videoTrack && trackVisible(videoTrack) && !videoTrack.muted;
  const subtitleClips = subtitleTrack && trackVisible(subtitleTrack) ? subtitleTrack.clips : [];
  const textClips = textTrack && trackVisible(textTrack) ? textTrack.clips : [];
  if (!videoClips.length) throw new Error(translate("请先在视频轨添加至少一个片段"));

  const factory = await createBrowserFfmpeg(directory, signal);
  const command = factory();

  // 依次添加输入：先视频轨片段，再音频轨片段。
  const inputs: InputSpec[] = [];
  for (const clip of videoClips) inputs.push({ clip, kind: clip.kind === "image" ? "image" : "video" });
  for (const clip of audioClips) inputs.push({ clip, kind: "audio" });
  for (const input of inputs) {
    const clip = input.clip;
    command.input(clip.source);
    if (input.kind === "image") {
      command.inputOptions(["-loop", "1", "-framerate", String(fps), "-t", String(clip.timelineDuration)]);
    } else {
      const trim = clip.outPoint - clip.inPoint;
      command.inputOptions(["-ss", String(clip.inPoint), "-t", String(trim)]);
    }
  }

  const graph: string[] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];

  // 背景板：时长对齐时间线总长，片段间的空隙显示为黑场。
  graph.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${duration},format=yuv420p[bg0]`);

  inputs.forEach((input, index) => {
    const clip = input.clip;
    if (input.kind === "video" || input.kind === "image") {
      const label = `v${index}`;
      const speedShift = input.kind === "video" ? `(PTS-STARTPTS)/${clip.speed}` : "PTS-STARTPTS";
      const filters: string[] = [`fps=${fps}`];
      if (clip.crop.enabled) {
        const left = clamp(clip.crop.left, 0, 0.9);
        const right = clamp(clip.crop.right, 0, 0.9);
        const top = clamp(clip.crop.top, 0, 0.9);
        const bottom = clamp(clip.crop.bottom, 0, 0.9);
        filters.push(`crop=iw*${(1 - left - right).toFixed(4)}:ih*${(1 - top - bottom).toFixed(4)}:iw*${left.toFixed(4)}:ih*${top.toFixed(4)}`);
      }
      filters.push(`eq=brightness=${clip.filter.brightness.toFixed(3)}:contrast=${(1 + clip.filter.contrast).toFixed(3)}:saturation=${(1 + clip.filter.saturation).toFixed(3)}`);
      if (clip.filter.preset === "warm") filters.push("colorbalance=rs=.15:gs=.05:bs=-.15");
      else if (clip.filter.preset === "cold") filters.push("colorbalance=rs=-.15:gs=-.05:bs=.15");
      else if (clip.filter.preset === "mono") filters.push("hue=s=0");
      filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`, "setsar=1", "format=yuv420p");
      filters.push(`setpts=${speedShift}+${clip.timelineStart.toFixed(4)}/TB`);
      graph.push(`[${index}:v]${filters.join(",")}[${label}]`);
      videoLabels.push(label);
    } else {
      const label = `a${index}`;
      const trim = clip.outPoint - clip.inPoint;
      const filters = [
        `atrim=duration=${trim.toFixed(4)}`,
        "asetpts=PTS-STARTPTS",
        atempoChain(clip.speed),
        `volume=${clip.volume.toFixed(3)}`,
      ];
      if (clip.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`);
      if (clip.fadeOut > 0) filters.push(`afade=t=out:st=${Math.max(0, clip.timelineDuration - clip.fadeOut).toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`);
      filters.push(`adelay=${Math.round(clip.timelineStart * 1000)}:all=1`);
      graph.push(`[${index}:a]${filters.join(",")}[${label}]`);
      audioLabels.push(label);
    }
  });

  // 视频片段叠加到黑场背景（后置片段覆盖前置），空隙保留黑场。
  let background = "bg0";
  for (let index = 0; index < videoLabels.length; index++) {
    const next = `bg${index + 1}`;
    graph.push(`[${background}][${videoLabels[index]}]overlay=0:0[${next}]`);
    background = next;
  }

  // 视频片段的原始音频（若有）。
  if (includeVideoAudio) {
    inputs.forEach((input, index) => {
      if (input.kind !== "video") return;
      const clip = input.clip;
      const trim = clip.outPoint - clip.inPoint;
      const filters = [
        `atrim=duration=${trim.toFixed(4)}`,
        "asetpts=PTS-STARTPTS",
        atempoChain(clip.speed),
        `volume=${clip.volume.toFixed(3)}`,
        `adelay=${Math.round(clip.timelineStart * 1000)}:all=1`,
      ];
      graph.push(`[${index}:a]${filters.join(",")}[va${index}]`);
      audioLabels.push(`va${index}`);
    });
  }

  // 字幕 / 文字烧录进画面。
  let videoLabel = background;
  const burnIns: string[] = [];
  for (const clip of subtitleClips) {
    burnIns.push(`drawtext=text='${escapeDrawtext(clip.text)}':fontsize=48:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-th-72:enable='between(t,${clip.timelineStart.toFixed(3)},${(clip.timelineStart + clip.timelineDuration).toFixed(3)})'`);
  }
  for (const clip of textClips) {
    burnIns.push(`drawtext=text='${escapeDrawtext(clip.text)}':fontsize=72:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=96:enable='between(t,${clip.timelineStart.toFixed(3)},${(clip.timelineStart + clip.timelineDuration).toFixed(3)})'`);
  }
  if (burnIns.length) {
    graph.push(`[${videoLabel}]${burnIns.join(",")}[vout]`);
    videoLabel = "vout";
  }

  let audioLabel: string | undefined;
  if (audioLabels.length === 1) {
    audioLabel = audioLabels[0];
  } else if (audioLabels.length > 1) {
    graph.push(`[${audioLabels.join("][")}]amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`);
    audioLabel = "aout";
  }

  command.complexFilter(graph.join(";"));
  command.output(outputPath);
  command.map(`[${videoLabel}]`);
  if (audioLabel) command.map(`[${audioLabel}]`);
  command.videoCodec("libx264").videoBitrate(videoBitrate).format("mp4");
  if (audioLabel) command.audioCodec("aac").audioBitrate(192);
  command.duration(duration).outputOptions(["-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
  await runCommand(command, signal, onProgress);
}
