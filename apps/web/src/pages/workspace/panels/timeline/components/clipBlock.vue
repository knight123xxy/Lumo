<template>
  <div
    class="clipBlock"
    :class="{ selected, [kindClass]: true }"
    :style="clipStyle"
    role="button"
    tabindex="0"
    :aria-label="label"
    :aria-pressed="selected"
    @pointerdown="startDrag"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
    @keydown.enter.prevent="$emit('select', clip.id)"
    @dblclick="handleDoubleClick">
    <div class="clipLabel">{{ label }}</div>
    <span v-if="clip.speed !== 1" class="speedBadge">×{{ clip.speed.toFixed(1) }}</span>
    <waveform v-if="trackType === 'audio'" class="clipWaveform" :directory="directory" :path="clip.source" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { translate } from "@lumo/i18n/vue";
import waveform from "./waveform.vue";
import type { TimelineClip, TrackType } from "../timelineTypes";

const props = defineProps<{
  clip: TimelineClip;
  trackType: TrackType;
  directory: string;
  selected: boolean;
  pixelsPerSecond: number;
}>();

const emit = defineEmits<{
  select: [clipId: string];
  move: [clipId: string, timelineStart: number];
  editText: [clipId: string];
}>();

const offsetX = ref(0);
const dragging = ref(false);
let startX = 0;
let startTimelineStart = 0;

const kindClass = computed(() => `kind-${props.clip.kind}`);
const label = computed(() => {
  if (props.clip.kind === "text") return props.clip.text || translate("文字");
  return props.clip.source.split("/").at(-1) ?? translate("素材");
});
const clipStyle = computed(() => ({
  left: `${props.clip.timelineStart * props.pixelsPerSecond}px`,
  width: `${Math.max(8, props.clip.timelineDuration * props.pixelsPerSecond)}px`,
  transform: `translateX(${offsetX.value}px)`,
}));

function startDrag(event: PointerEvent) {
  if (event.button !== 0) return;
  emit("select", props.clip.id);
  startX = event.clientX;
  startTimelineStart = props.clip.timelineStart;
  dragging.value = true;
  offsetX.value = 0;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function handlePointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  offsetX.value = event.clientX - startX;
}

function handlePointerUp(event: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  const delta = offsetX.value / props.pixelsPerSecond;
  offsetX.value = 0;
  if (Math.abs(delta) < 0.001) return;
  emit("move", props.clip.id, Math.max(0, startTimelineStart + delta));
}

function handleDoubleClick() {
  if (props.clip.kind === "text") emit("editText", props.clip.id);
}
</script>

<style scoped lang="scss">
.clipBlock {
  position: absolute;
  top: 3px;
  bottom: 3px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 0 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.3;
  cursor: grab;
  user-select: none;

  &.selected {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px var(--el-color-primary);
  }

  &.kind-video {
    background: #2a3a4d;
  }

  &.kind-audio {
    background: #26433a;
  }

  &.kind-image {
    background: #2e343c;
  }

  &.kind-text {
    background: #44381f;
  }

  .clipLabel {
    position: relative;
    z-index: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .speedBadge {
    position: absolute;
    top: 2px;
    right: 4px;
    z-index: 1;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 10px;
  }

  .clipWaveform {
    position: absolute;
    inset: 0;
  }
}
</style>
