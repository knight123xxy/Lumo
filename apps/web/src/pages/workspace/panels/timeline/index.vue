<template>
  <section class="timelinePanel" aria-label="时间线剪辑" tabindex="0" @keydown="handleKeydown">
    <header class="topBar">
      <div class="projectName">
        <el-input v-model="project.name" class="nameInput" size="small" :aria-label="translate('项目名')" @change="timeline.flushSave()" />
      </div>
      <div class="topActions">
        <el-tooltip :content="translate('撤销')" placement="bottom" :showArrow="false">
          <el-button class="barButton" text size="small" :disabled="!canUndo" :aria-label="translate('撤销')" @click="timeline.undo()">
            <icon-arrow-back-up :size="17" />
          </el-button>
        </el-tooltip>
        <el-tooltip :content="translate('重做')" placement="bottom" :showArrow="false">
          <el-button class="barButton" text size="small" :disabled="!canRedo" :aria-label="translate('重做')" @click="timeline.redo()">
            <icon-arrow-forward-up :size="17" />
          </el-button>
        </el-tooltip>
        <el-tooltip :content="snapEnabled ? translate('吸附：开（Shift+S）') : translate('吸附：关（Shift+S）')" placement="bottom" :showArrow="false">
          <el-button class="barButton" text size="small" :type="snapEnabled ? 'primary' : 'default'" :aria-label="translate('吸附开关')" @click="timeline.toggleSnap()">
            <icon-magnet :size="17" />
          </el-button>
        </el-tooltip>
        <el-button class="exportButton" type="primary" size="small" :disabled="!duration" @click="exportVisible = true">
          <icon-download :size="15" />
          {{ translate("导出") }}
        </el-button>
      </div>
    </header>

    <div class="timelineBody">
      <assetLibrary ref="assetLibraryRef" class="assetPane" :assets="assets" :busy="busy" @import-files="onImportFiles" @add-clip="onAddAsset" />

      <div class="centerPane">
        <previewPlayer
          class="previewPane"
          :directory="directory"
          :clip="previewClip"
          :playhead="playhead"
          :playing="playing"
          @update-playhead="setPlayhead"
          @update-playing="setPlaying" />

        <div class="toolbar" role="toolbar" aria-label="剪辑工具">
          <el-tooltip :content="translate('选择')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" @click="timeline.clearSelection()"><icon-pointer :size="16" /></el-button>
          </el-tooltip>
          <el-tooltip :content="translate('切割（Cmd/Ctrl+K）')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" :disabled="!selectedClip" @click="timeline.splitSelected()"><icon-scissors :size="16" /></el-button>
          </el-tooltip>
          <el-tooltip :content="translate('变速')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" @click="propertyVisible = true"><icon-gauge :size="16" /></el-button>
          </el-tooltip>
          <el-tooltip :content="translate('字幕')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" :disabled="!selectedClip || (selectedClip.kind !== 'video' && selectedClip.kind !== 'audio')" @click="onGenerateSubtitles"><icon-subtitles :size="16" /></el-button>
          </el-tooltip>
          <el-tooltip :content="translate('调色')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" @click="propertyVisible = true"><icon-palette :size="16" /></el-button>
          </el-tooltip>
          <el-tooltip :content="translate('配音')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" @click="propertyVisible = true"><icon-microphone :size="16" /></el-button>
          </el-tooltip>
          <el-tooltip :content="translate('删除（Delete）')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" :disabled="!selectedClip" @click="timeline.removeSelected()"><icon-trash :size="16" /></el-button>
          </el-tooltip>
        </div>

        <div class="timelineScroll" ref="timelineScrollRef" @dragover.prevent @drop.prevent="onDrop">
          <div ref="timelineInnerRef" class="timelineInner" :style="{ width: `${trackGutter + contentWidth}px` }">
            <timelineRuler :duration="duration" :pixels-per-second="pixelsPerSecond" :gutter="trackGutter" @seek="seek" />
            <trackRow
              v-for="track in tracks"
              :key="track.id"
              :track="track"
              :directory="directory"
              :selected-clip-id="selection?.clipId ?? null"
              :pixels-per-second="pixelsPerSecond"
              :content-width="contentWidth"
              @select-clip="timeline.select(track.id, $event)"
              @move-clip="onMoveClip"
              @edit-text="editText"
              @toggle-hidden="timeline.toggleTrackHidden($event)"
              @toggle-muted="timeline.toggleTrackMuted($event)"
              @remove-track="timeline.removeTrack($event)"
              @add-text-clip="timeline.addTextClip(track.type)"
              @seek="seek" />
            <div class="playheadLine" :style="{ left: `${playheadLeft}px` }">
              <div class="playheadHandle" />
            </div>
          </div>
        </div>
      </div>

      <propertyPanel
        v-if="propertyVisible"
        class="propertyPane"
        :clip="selectedClip ?? null"
        :busy="busy"
        @update-speed="timeline.setSpeed(selectedClip!.id, $event)"
        @update-volume="timeline.setVolume(selectedClip!.id, $event)"
        @update-fade="onUpdateFade"
        @update-filter="timeline.setFilter(selectedClip!.id, $event)"
        @update-crop="timeline.setCrop(selectedClip!.id, $event)"
        @update-text="timeline.setText(selectedClip!.id, $event)"
        @update-range="onUpdateRange"
        @remove-clip="timeline.removeClip($event)"
        @split="timeline.splitSelected()"
        @generate-subtitles="onGenerateSubtitles" />
      <el-button v-else class="propertyToggle" text size="small" :aria-label="translate('显示属性面板')" @click="propertyVisible = true"><icon-chevron-left :size="16" /></el-button>
    </div>

    <div v-if="!hasContent" class="emptyOverlay">
      <div class="emptyCard">
        <p class="emptyTitle">{{ translate("导入素材开始剪辑") }}</p>
        <p class="emptyTip">{{ translate("上传视频、音频、图片或字幕，拖到时间线即可编排。") }}</p>
        <el-button type="primary" @click="assetLibraryRef?.openPicker()">{{ translate("导入素材") }}</el-button>
      </div>
    </div>

    <exportDialog v-model="exportVisible" :directory="directory" :project="project" :duration="duration" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref } from "vue";
import { ElButton, ElInput, ElMessage, ElTooltip } from "element-plus";
import { translate } from "@toonflow/i18n/vue";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronLeft,
  IconDownload,
  IconGauge,
  IconMagnet,
  IconMicrophone,
  IconPalette,
  IconPointer,
  IconScissors,
  IconSubtitles,
  IconTrash,
} from "@tabler/icons-vue";
import { useTimeline } from "./useTimeline";
import { pixelsPerSecond, timelineAssetMime, trackGutter } from "./timelineModel";
import assetLibrary from "./components/assetLibrary.vue";
import previewPlayer, { type PreviewClip } from "./components/previewPlayer.vue";
import trackRow from "./components/trackRow.vue";
import timelineRuler from "./components/timelineRuler.vue";
import propertyPanel from "./components/propertyPanel.vue";
import exportDialog from "./components/exportDialog.vue";
import type { AssetItem, TrackType } from "./timelineTypes";

const props = defineProps<{ directory: string }>();

const timeline = useTimeline(props.directory);
const {
  project,
  tracks,
  assets,
  duration,
  selectedClip,
  selection,
  playhead,
  snapEnabled,
  playing,
  busy,
  canUndo,
  canRedo,
} = timeline;

const propertyVisible = ref(true);
const exportVisible = ref(false);
const assetLibraryRef = ref<InstanceType<typeof assetLibrary>>();
const timelineScrollRef = ref<HTMLElement>();
const timelineInnerRef = ref<HTMLElement>();

const contentWidth = computed(() => Math.max(600, duration.value * pixelsPerSecond + 200));
const playheadLeft = computed(() => trackGutter + playhead.value * pixelsPerSecond);
const hasContent = computed(() => assets.value.length > 0 || tracks.value.some(track => track.clips.length > 0));

const previewClip = computed<PreviewClip | null>(() => {
  const track = project.value.tracks.find(item => item.type === "video" && !item.hidden);
  if (!track) return null;
  const clip = track.clips.find(item => item.kind === "video" && playhead.value >= item.timelineStart && playhead.value <= item.timelineStart + item.timelineDuration);
  if (!clip) return null;
  return { id: clip.id, source: clip.source, inPoint: clip.inPoint, timelineStart: clip.timelineStart, speed: clip.speed };
});

function onImportFiles(files: File[]) {
  void timeline.importFiles(files).catch(error => ElMessage.error(error instanceof Error ? error.message : translate("导入失败")));
}

function onAddAsset(asset: AssetItem) {
  timeline.addClip(asset, asset.kind === "audio" ? "audio" : "video");
}

function setPlayhead(value: number) {
  playhead.value = value;
}

function setPlaying(value: boolean) {
  playing.value = value;
}

function seek(time: number) {
  playhead.value = Math.max(0, Math.min(duration.value, time));
  playing.value = false;
  timeline.clearSelection();
}

function onDrop(event: DragEvent) {
  const id = event.dataTransfer?.getData(timelineAssetMime);
  if (!id) return;
  const asset = assets.value.find(item => item.id === id);
  if (!asset) return;
  const rect = timelineInnerRef.value?.getBoundingClientRect();
  if (!rect) return;
  const time = Math.max(0, (event.clientX - rect.left + (timelineScrollRef.value?.scrollLeft ?? 0) - trackGutter) / pixelsPerSecond);
  timeline.addClip(asset, asset.kind === "audio" ? "audio" : "video", time);
}

function editText(clipId: string) {
  timeline.select("", clipId);
  propertyVisible.value = true;
}

function onMoveClip(clipId: string, timelineStart: number) {
  timeline.moveClipTo(clipId, timelineStart);
}

function onUpdateFade(fadeIn: number, fadeOut: number) {
  const clip = selectedClip.value;
  if (clip) timeline.setFade(clip.id, fadeIn, fadeOut);
}

function onUpdateRange(inPoint: number, outPoint: number) {
  const clip = selectedClip.value;
  if (clip) timeline.setClipRange(clip.id, inPoint, outPoint);
}

function onGenerateSubtitles() {
  const clip = selectedClip.value;
  if (!clip) return;
  void timeline.generateSubtitles(clip.id).catch(error => ElMessage.error(error instanceof Error ? error.message : translate("识别字幕失败")));
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function handleKeydown(event: KeyboardEvent) {
  if (isEditableTarget(event.target)) return;
  const command = event.metaKey || event.ctrlKey;
  if (event.code === "Space") {
    event.preventDefault();
    playing.value = !playing.value;
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    timeline.removeSelected();
    return;
  }
  if (command && !event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    timeline.undo();
    return;
  }
  if (command && event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    timeline.redo();
    return;
  }
  if (event.shiftKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    timeline.toggleSnap();
    return;
  }
  if ((command && event.key.toLowerCase() === "k") || (!command && event.key.toLowerCase() === "s")) {
    event.preventDefault();
    timeline.splitSelected();
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    playhead.value = 0;
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    playhead.value = duration.value;
    return;
  }
  if (event.key === "Escape") {
    timeline.clearSelection();
  }
}

onMounted(() => { void timeline.load(); });
onScopeDispose(() => timeline.dispose());

defineExpose({ flushSave: timeline.flushSave, ready: timeline.ready });
</script>

<style scoped lang="scss">
.timelinePanel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--el-bg-color);

  .topBar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 48px;
    padding: 0 14px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .projectName {
      flex: 1;
      max-width: 360px;

      .nameInput :deep(.el-input__inner) {
        font-weight: 600;
      }
    }

    .topActions {
      display: flex;
      align-items: center;
      gap: 2px;

      .barButton {
        margin-left: 0;
      }

      .exportButton {
        margin-left: 10px;
      }
    }
  }

  .timelineBody {
    display: flex;
    flex: 1;
    min-height: 0;

    .assetPane {
      flex: 0 0 240px;
      min-width: 0;
    }

    .centerPane {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;

      .previewPane {
        flex: 1;
        min-height: 180px;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: 2px;
        flex: 0 0 36px;
        padding: 0 8px;
        border-top: 1px solid var(--el-border-color-lighter);
        border-bottom: 1px solid var(--el-border-color-lighter);

        .toolButton {
          margin-left: 0;
          padding: 5px;
        }
      }

      .timelineScroll {
        flex: 0 0 300px;
        min-height: 0;
        overflow: auto;
        background: var(--color-dark);

        .timelineInner {
          position: relative;
          min-height: 100%;

          .playheadLine {
            position: absolute;
            top: 0;
            bottom: 0;
            z-index: 4;
            width: 0;
            border-left: 2px solid var(--color-accent);
            pointer-events: none;

            .playheadHandle {
              position: absolute;
              top: 0;
              left: -6px;
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 7px solid var(--color-accent);
            }
          }
        }
      }
    }

    .propertyPane {
      flex: 0 0 260px;
      min-width: 0;
    }

    .propertyToggle {
      position: absolute;
      top: 50%;
      right: 0;
      z-index: 3;
      margin-left: 0;
    }
  }

  .emptyOverlay {
    position: absolute;
    inset: 0;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--el-bg-color) 72%, transparent);
    backdrop-filter: blur(2px);

    .emptyCard {
      padding: 28px 34px;
      border: 1px dashed var(--el-border-color);
      border-radius: 12px;
      text-align: center;

      .emptyTitle {
        margin: 0 0 6px;
        font-size: 16px;
        font-weight: 600;
      }

      .emptyTip {
        margin: 0 0 16px;
        color: var(--el-text-color-secondary);
        font-size: 13px;
      }
    }
  }
}
</style>
