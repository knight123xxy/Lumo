import { readFile, realpath, stat } from "@lumo/file";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export async function readOpenFilmLegacy(directory: string) {
  async function localFile(path: string) {
    const within = (target: string) => {
      const offset = relative(directory, target);
      return Boolean(offset) && !isAbsolute(offset) && offset.split(sep)[0] !== "..";
    };
    const candidate = resolve(directory, path);
    if (isAbsolute(path) || !within(candidate)) throw new Error("旧剪辑素材超出 Lumo 项目目录");
    const target = await realpath(candidate);
    if (!within(target) || !(await stat(target)).isFile()) {
      throw new Error("旧剪辑素材超出 Lumo 项目目录");
    }
    return target;
  }
  const project = JSON.parse(await readFile(await localFile("timeline.json"), "utf8"));
  if (project?.version !== 1 || !Array.isArray(project.tracks) || project.tracks.length > 32) throw new Error("旧剪辑工程格式无效");
  const fps = project.fps ?? 30;
  // 对齐固定版本 Studio 的工程帧率选项及广播制式容差。
  const studioFps = typeof fps === "number" && [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120].find(rate => Math.abs(rate - fps) < 0.01);
  if (!studioFps) throw new Error("旧剪辑工程帧率不在 Studio 支持范围内");
  const tracks = [];
  let count = 0;
  for (const track of project.tracks) {
    if (!track || !Array.isArray(track.clips) || (count += track.clips.length) > 200) throw new Error("旧剪辑轨道无效或超过导入上限");
    if (!track.clips.length) continue;
    const type = track.type as string;
    if (!["video", "audio", "subtitle", "text", "effect"].includes(type)) throw new Error("旧剪辑包含暂不支持的轨道");
    const clips = [];
    for (const clip of track.clips) {
      if (!clip || !Number.isFinite(clip.timelineStart) || clip.timelineStart < 0) throw new Error("旧剪辑片段位置无效");
      if (type === "subtitle" || type === "text") {
        if (clip.kind !== "text" || typeof clip.text !== "string" || !clip.text.trim() || !Number.isFinite(clip.timelineDuration) || clip.timelineDuration < 0.001) throw new Error("旧剪辑文字片段无效");
        clips.push({ at: clip.timelineStart as number, caption: { text: clip.text as string, duration: clip.timelineDuration as number } });
        continue;
      }
      const still = type === "video" && clip.kind === "image";
      const extensions = still ? /\.(png|jpe?g|webp|avif|bmp)$/i
        : type === "audio" ? /\.(wav|mp3|aac|m4a|flac|opus|ogg)$/i : type === "effect" ? /\.webm$/i : /\.(mp4|mov|m4v|webm)$/i;
      if ((!still && clip.kind !== type) || typeof clip.source !== "string" || !extensions.test(extname(clip.source))
        || (type !== "audio" && (clip.fadeIn || clip.fadeOut))) throw new Error("旧剪辑包含暂不支持的素材或淡入淡出");
      let filter: string | undefined;
      if (clip.filter !== undefined) {
        const { brightness, contrast, saturation, preset } = clip.filter ?? {};
        if (![brightness, contrast, saturation].every(value => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1)
          || !["none", "warm", "cold", "mono"].includes(preset)) throw new Error("旧剪辑滤镜参数无效");
        if (type !== "audio" && (brightness || contrast || saturation || preset !== "none")) {
          // 与旧剪辑器导出使用相同的 FFmpeg 滤镜顺序和参数精度。
          filter = `eq=brightness=${brightness.toFixed(3)}:contrast=${(1 + contrast).toFixed(3)}:saturation=${(1 + saturation).toFixed(3)}`;
          if (preset === "warm") filter += ",colorbalance=rs=.15:gs=.05:bs=-.15";
          if (preset === "cold") filter += ",colorbalance=rs=-.15:gs=-.05:bs=.15";
          if (preset === "mono") filter += ",hue=s=0";
        }
      }
      let crop: number[] | undefined;
      if (clip.crop?.enabled) {
        const edges = [clip.crop.top, clip.crop.right, clip.crop.bottom, clip.crop.left];
        if (type === "audio" || edges.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 0.9)
          || edges[0] + edges[2] >= 1 || edges[1] + edges[3] >= 1) throw new Error("旧剪辑画面裁剪范围无效");
        crop = edges;
      }
      if (still) {
        const duration = clip.timelineDuration;
        if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0.001) throw new Error("旧剪辑图片时长无效");
        clips.push({ at: clip.timelineStart as number, media: { path: await localFile(clip.source), time: [0, duration], still: true as const, crop, filter } });
        continue;
      }
      const { inPoint, outPoint, speed, volume } = clip;
      if (![inPoint, outPoint, speed, volume].every(Number.isFinite) || inPoint < 0 || outPoint - inPoint < 0.001 || speed < 0.1 || speed > 16 || volume < 0 || volume > 2) throw new Error("旧剪辑片段参数无效");
      const fadeIn = clip.fadeIn === undefined ? 0 : clip.fadeIn;
      const fadeOut = clip.fadeOut === undefined ? 0 : clip.fadeOut;
      if (![fadeIn, fadeOut].every(Number.isFinite) || fadeIn < 0 || fadeOut < 0) throw new Error("旧剪辑音频淡入淡出参数无效");
      // Studio 会压缩重叠的过渡。拒绝这种转换以保留旧工程的音量包络。
      if (fadeIn + fadeOut > (outPoint - inPoint) / speed + 1e-9) throw new Error("旧剪辑音频淡入淡出总时长超过片段长度");
      const fade: [number, number] | undefined = fadeIn || fadeOut ? [fadeIn, fadeOut] : undefined;
      clips.push({ at: clip.timelineStart as number, media: { path: await localFile(clip.source), time: [inPoint, outPoint], speed, volume: type === "effect" ? 0 : volume, fade, crop, filter } });
    }
    tracks.push({ type, name: typeof track.name === "string" ? track.name.trim().slice(0, 40) : "", hidden: track.hidden === true, muted: track.muted === true, clips });
  }
  if (!tracks.length) throw new Error("旧剪辑时间线为空");
  return { width: project.width, height: project.height, fps: studioFps, tracks: [
    // Studio 按轨道从上到下合成，字幕需要在不透明视频和动效上方。
    ...tracks.filter(track => track.type === "subtitle"),
    ...tracks.filter(track => track.type === "text").reverse(),
    ...tracks.filter(track => track.type === "effect").reverse(),
    ...tracks.filter(track => track.type !== "subtitle" && track.type !== "text" && track.type !== "effect"),
  ] };
}
