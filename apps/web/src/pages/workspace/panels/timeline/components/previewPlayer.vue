<template>
  <div class="previewPlayer">
    <div class="previewStage" :style="{ '--previewZoom': zoom }">
      <video
        v-if="currentClip"
        ref="videoRef"
        class="previewVideo"
        :src="src"
        :style="{ transform: `scale(${zoom})` }"
        @loadedmetadata="seekToPlayhead"
        @timeupdate="onTimeUpdate"
        @play="$emit('updatePlaying', true)"
        @pause="$emit('updatePlaying', false)"
        @ended="$emit('updatePlaying', false)" />
      <div v-else class="previewEmpty">{{ translate("导入视频片段后在此预览") }}</div>
    </div>
    <div class="previewControls">
      <el-button class="controlButton" text size="small" :aria-label="playing ? translate('暂停') : translate('播放')" @click="togglePlay">
        <component :is="playing ? IconPlayerPause : IconPlayerPlay" :size="18" />
      </el-button>
      <span class="timeIndicator">{{ timeLabel }}</span>
      <el-segmented v-model="previewSpeed" class="speedSwitcher" size="small" :options="speedOptions" :aria-label="translate('预览倍速')" />
      <el-button class="controlButton" text size="small" :aria-label="translate('缩小画面')" @click="zoom = Math.max(0.25, zoom - 0.25)">
        <icon-zoom-out :size="16" />
      </el-button>
      <el-button class="controlButton" text size="small" :aria-label="translate('放大画面')" @click="zoom = Math.min(3, zoom + 0.25)">
        <icon-zoom-in :size="16" />
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElButton, ElSegmented } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { IconPlayerPause, IconPlayerPlay, IconZoomIn, IconZoomOut } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { formatTime } from "../timelineModel";

export interface PreviewClip {
  id: string;
  source: string;
  inPoint: number;
  timelineStart: number;
  speed: number;
}

const props = defineProps<{
  directory: string;
  clip: PreviewClip | null;
  playhead: number;
  playing: boolean;
}>();

const emit = defineEmits<{ updatePlayhead: [seconds: number]; updatePlaying: [playing: boolean] }>();

const videoRef = ref<HTMLVideoElement>();
const src = ref("");
const zoom = ref(1);
const previewSpeed = ref(1);
const speedOptions = [1, 2, 4].map(value => ({ label: `${value}×`, value }));
let releaseUrl: (() => void) | undefined;

const currentClip = computed(() => props.clip);
const timeLabel = computed(() => formatTime(props.playhead));

watch(() => props.clip?.source, () => {
  releaseUrl?.();
  releaseUrl = undefined;
  if (!props.clip) {
    src.value = "";
    return;
  }
  const files = useWorkspaceFiles(props.directory);
  const handle = files.acquireUrl(props.clip.source);
  releaseUrl = handle.release;
  void handle.url.then(url => { src.value = url; });
}, { immediate: true });

watch(previewSpeed, value => {
  if (videoRef.value) videoRef.value.playbackRate = value;
});

watch(() => props.playing, playing => {
  const video = videoRef.value;
  if (!video || !currentClip.value) return;
  if (playing) void video.play();
  else video.pause();
});

watch(() => props.playhead, () => {
  const video = videoRef.value;
  const clip = currentClip.value;
  if (!video || !clip || props.playing) return;
  const sourceTime = clip.inPoint + Math.max(0, props.playhead - clip.timelineStart) * clip.speed;
  if (Math.abs(video.currentTime - sourceTime) > 0.05) video.currentTime = sourceTime;
});

function seekToPlayhead() {
  const video = videoRef.value;
  const clip = currentClip.value;
  if (!video || !clip) return;
  const sourceTime = clip.inPoint + Math.max(0, props.playhead - clip.timelineStart) * clip.speed;
  video.currentTime = sourceTime;
}

function onTimeUpdate() {
  const video = videoRef.value;
  const clip = currentClip.value;
  if (!video || !clip || !props.playing) return;
  emit("updatePlayhead", clip.timelineStart + (video.currentTime - clip.inPoint) / clip.speed);
}

function togglePlay() {
  if (!currentClip.value) return;
  emit("updatePlaying", !props.playing);
}
</script>

<style scoped lang="scss">
.previewPlayer {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  background: #000;

  .previewStage {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    .previewVideo {
      max-width: 100%;
      max-height: 100%;
      transition: transform 120ms ease;
    }

    .previewEmpty {
      color: var(--color-text-3);
      font-size: 13px;
    }
  }

  .previewControls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 44px;
    padding: 0 12px;
    border-top: 1px solid var(--color-border);
    color: var(--color-text);

    .controlButton {
      margin-left: 0;
      color: var(--color-text);
    }

    .timeIndicator {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .speedSwitcher {
      margin-left: auto;
    }
  }
}
</style>
