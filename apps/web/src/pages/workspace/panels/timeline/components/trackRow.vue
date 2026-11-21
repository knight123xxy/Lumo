<template>
  <div class="trackRow" :class="{ hidden: track.hidden }">
    <div class="trackHeader">
      <span class="trackName">{{ track.name }}</span>
      <el-button
        v-if="track.type !== 'subtitle' && track.type !== 'text'"
        class="trackAction"
        text
        size="small"
        :aria-label="track.hidden ? translate('显示轨道') : translate('隐藏轨道')"
        :title="track.hidden ? translate('显示轨道') : translate('隐藏轨道')"
        @click="$emit('toggleHidden', track.id)">
        <component :is="track.hidden ? IconEyeOff : IconEye" :size="14" />
      </el-button>
      <el-button
        v-if="track.type === 'audio' || track.type === 'video'"
        class="trackAction"
        text
        size="small"
        :aria-label="track.muted ? translate('取消静音') : translate('静音')"
        :title="track.muted ? translate('取消静音') : translate('静音')"
        @click="$emit('toggleMuted', track.id)">
        <component :is="track.muted ? IconVolumeOff : IconVolume" :size="14" />
      </el-button>
      <el-button
        v-if="track.type === 'subtitle' || track.type === 'text'"
        class="trackAction"
        text
        size="small"
        :aria-label="translate('添加文字片段')"
        :title="translate('添加文字片段')"
        @click="$emit('addTextClip', track.id)">
        <icon-plus :size="14" />
      </el-button>
      <el-button
        v-if="track.type !== 'video'"
        class="trackAction"
        text
        size="small"
        :aria-label="translate('删除轨道')"
        :title="translate('删除轨道')"
        @click="$emit('removeTrack', track.id)">
        <icon-trash :size="14" />
      </el-button>
    </div>
    <div class="trackLane" :style="{ width: `${contentWidth}px` }" @pointerdown="seekLane">
      <clipBlock
        v-for="clip in track.clips"
        :key="clip.id"
        :clip="clip"
        :trackType="track.type"
        :directory="directory"
        :selected="clip.id === selectedClipId"
        :pixelsPerSecond="pixelsPerSecond"
        @select="$emit('selectClip', $event)"
        @move="onMove"
        @editText="$emit('editText', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElButton } from "element-plus";
import { translate } from "@toonflow/i18n/vue";
import { IconEye, IconEyeOff, IconPlus, IconTrash, IconVolume, IconVolumeOff } from "@tabler/icons-vue";
import clipBlock from "./clipBlock.vue";
import type { TimelineTrack } from "../timelineTypes";

const props = defineProps<{
  track: TimelineTrack;
  directory: string;
  selectedClipId: string | null;
  pixelsPerSecond: number;
  contentWidth: number;
}>();

const emit = defineEmits<{
  selectClip: [clipId: string];
  moveClip: [clipId: string, timelineStart: number];
  editText: [clipId: string];
  toggleHidden: [trackId: string];
  toggleMuted: [trackId: string];
  removeTrack: [trackId: string];
  addTextClip: [trackId: string];
  seek: [time: number];
}>();

function seekLane(event: PointerEvent) {
  if (event.target !== event.currentTarget) return;
  const lane = event.currentTarget as HTMLElement;
  emit("seek", (event.clientX - lane.getBoundingClientRect().left) / props.pixelsPerSecond);
}

function onMove(clipId: string, timelineStart: number) {
  emit("moveClip", clipId, timelineStart);
}
</script>

<style scoped lang="scss">
.trackRow {
  display: flex;
  height: 64px;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &.hidden {
    opacity: 0.45;
  }

  .trackHeader {
    display: flex;
    flex: 0 0 132px;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    border-right: 1px solid var(--el-border-color-lighter);
    background: var(--el-fill-color-light);

    .trackName {
      flex: 1;
      overflow: hidden;
      font-size: 12px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .trackAction {
      margin-left: 0;
      padding: 3px;
    }
  }

  .trackLane {
    position: relative;
    flex: 0 0 auto;
    min-width: 0;
    overflow: hidden;
    background: var(--color-field);
  }
}
</style>
