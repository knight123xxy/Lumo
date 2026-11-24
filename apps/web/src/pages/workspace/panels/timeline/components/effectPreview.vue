<template>
  <video v-if="src" ref="video" class="effectPreview" :src="src" muted playsinline
    :style="{ width: `min(100cqw, ${aspect * 100}cqh)`, aspectRatio: aspect, transform: `translate(-50%, -50%) scale(${zoom})` }"
    @loadeddata="sync" />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { TimelineClip } from "../timelineTypes";

const props = defineProps<{ clip: TimelineClip; directory: string; playhead: number; playing: boolean; previewSpeed: number; zoom: number; aspect: number }>();
const video = ref<HTMLVideoElement>();
const src = ref("");
watch(() => [props.directory, props.clip.source] as const, ([directory, source], _, onCleanup) => {
  src.value = "";
  const handle = useWorkspaceFiles(directory).acquireUrl(source, "video/webm");
  let active = true;
  onCleanup(() => { active = false; handle.release(); });
  void handle.url.then(url => { if (active) src.value = url; }).catch(() => {});
}, { immediate: true });

function sync() {
  const player = video.value;
  if (!player || !player.readyState) return;
  const clip = props.clip;
  const time = Math.max(clip.inPoint, Math.min(clip.outPoint, clip.inPoint + (props.playhead - clip.timelineStart) * clip.speed));
  if (Math.abs(player.currentTime - time) > (props.playing ? 0.3 : 0.02)) player.currentTime = time;
  player.playbackRate = Math.min(16, Math.max(0.1, clip.speed * props.previewSpeed));
  if (props.playing && player.paused) void player.play().catch(() => {});
  else if (!props.playing && !player.paused) player.pause();
}
watch(() => [props.playhead, props.playing, props.previewSpeed, props.clip.speed, props.clip.inPoint, props.clip.timelineStart], sync, { flush: "post" });
</script>

<style scoped>
.effectPreview { position: absolute; left: 50%; top: 50%; object-fit: contain; pointer-events: none; }
</style>
