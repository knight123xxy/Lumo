<template>
  <section class="timelinePanel" aria-label="时间线剪辑" tabindex="0" @keydown="handleKeydown">
    <header class="topBar">
      <button class="backButton" type="button" :aria-label="translate('返回首页')" :title="translate('返回首页')" @click="router.push('/home')">
        <icon-arrow-left :size="17" aria-hidden="true" />
      </button>
      <div class="projectName">
        <el-input v-model="project.name" class="nameInput" size="small" :aria-label="translate('项目名')" @change="timeline.flushSave()" />
      </div>
      <div class="topActions">
        <div class="actionGroup">
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
        <el-tooltip :content="translate('按风格重新生成')" placement="bottom" :showArrow="false">
          <el-button class="barButton" text size="small" :disabled="!project.style" :aria-label="translate('按风格重新生成')" @click="regenerateWithStyle">
            <icon-refresh :size="17" />
          </el-button>
        </el-tooltip>
        </div>
        <span class="actionDivider" aria-hidden="true" />
        <div class="actionGroup">
        <el-button size="small" :disabled="!timeline.ready.value || busy" @click="templateVisible = true">{{ translate('整集模板') }}</el-button>
        <el-button size="small" :disabled="!timeline.ready.value || busy" @click="automaticFilmVisible = true">{{ translate('一键成片') }}</el-button>
        <el-button class="exportButton" type="primary" size="small" :disabled="!duration || busy" @click="exportVisible = true">
          <icon-download :size="15" />
          {{ translate("导出") }}
        </el-button>
        </div>
      </div>
    </header>

    <div class="timelineBody">
      <div class="leftPane">
        <div class="leftTabs" role="tablist" :aria-label="translate('剪辑面板')">
          <button class="leftTab" :class="{ active: leftTab === 'assets' }" type="button" role="tab" @click="leftTab = 'assets'">{{ translate("素材") }}</button>
          <button class="leftTab" :class="{ active: leftTab === 'effects' }" type="button" role="tab" @click="leftTab = 'effects'">{{ translate('效果') }}</button>
          <button class="leftTab" :class="{ active: leftTab === 'styles' }" type="button" role="tab" @click="leftTab = 'styles'">{{ translate("风格") }}</button>
        </div>
        <assetLibrary v-show="leftTab === 'assets'" ref="assetLibraryRef" class="assetPane" :assets="assets" :busy="busy" @import-files="onImportFiles" @add-clip="onAddAsset" />
        <form v-show="leftTab === 'effects'" class="effectForm assetPane" @submit.prevent="addLowerThird">
          <el-select v-model="effectId" :aria-label="translate('效果样式')" :disabled="busy">
            <el-option v-for="effect in effects" :key="effect.id" :label="effect.name" :value="effect.id" />
          </el-select>
          <p v-if="activeEffect" class="effectSummary">{{ activeEffect.summary }}</p>
          <el-input v-model="effectKicker" :aria-label="translate('栏目')" :placeholder="translate('栏目')" :maxlength="32" :disabled="busy" />
          <el-input v-model="effectName" :aria-label="translate('标题')" :placeholder="translate('标题')" :maxlength="64" :disabled="busy" />
          <el-button nativeType="submit" type="primary" :loading="busy" :disabled="!timeline.ready.value || !effectKicker.trim() || !effectName.trim()">{{ translate('添加到动效轨') }}</el-button>
        </form>
        <stylePanel v-show="leftTab === 'styles'" class="assetPane" :currentStyle="project.style" @apply-style="onApplyStyle" />
      </div>

      <div class="centerPane">
        <previewPlayer
          class="previewPane"
          :directory="directory"
          :clip="previewClip"
          :effects="previewEffects"
          :aspect="project.width / project.height"
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
          <el-tooltip :content="translate('剪沉默')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" :disabled="!canSilenceEdit" @click="onSilenceEdit('tighten')"><icon-eraser :size="16" /></el-button>
          </el-tooltip>
          <el-tooltip :content="translate('加速停顿')" placement="top" :showArrow="false">
            <el-button class="toolButton" text size="small" :disabled="!canSilenceEdit" @click="onSilenceEdit('speedUp')"><icon-player-skip-forward :size="16" /></el-button>
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
        @send-to-canvas="sendSelectedToCanvas()"
        @update-text="timeline.setText(selectedClip!.id, $event)"
        @update-range="onUpdateRange"
        @remove-clip="timeline.removeClip($event)"
        @split="timeline.splitSelected()"
        @generate-subtitles="onGenerateSubtitles" />
      <el-button v-else class="propertyToggle" text size="small" :aria-label="translate('显示属性面板')" @click="propertyVisible = true"><icon-chevron-left :size="16" /></el-button>
    </div>

    <div v-if="!hasContent && leftTab !== 'effects'" class="emptyOverlay">
      <div class="emptyCard">
        <p class="emptyTitle">{{ translate("导入素材开始剪辑") }}</p>
        <p class="emptyTip">{{ translate("上传视频、音频、图片或字幕，拖到时间线即可编排。") }}</p>
        <el-button type="primary" @click="openAssetPicker">{{ translate("导入素材") }}</el-button>
      </div>
    </div>

    <templateDialog v-model="templateVisible" :directory="directory" :assets="assets" :busy="busy" :importFiles="timeline.importFiles" @generated="onTemplateGenerated" />
    <automaticFilmDialog v-model="automaticFilmVisible" :directory="directory" :assets="assets" :busy="busy" :importFiles="timeline.importFiles" :createFilm="timeline.createAutomaticFilm" :currentStyle="project.style" @generated="onFilmGenerated" />
    <exportDialog v-model="exportVisible" :directory="directory" :project="project" :duration="duration" :automaticFilm="isAutomaticFilm" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import { ElButton, ElInput, ElMessage, ElOption, ElSelect, ElTooltip } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import http from "@/lib/http";
import {
  IconArrowBackUp,
  IconArrowLeft,
  IconArrowForwardUp,
  IconChevronLeft,
  IconDownload,
  IconEraser,
  IconGauge,
  IconMagnet,
  IconMicrophone,
  IconPalette,
  IconPlayerSkipForward,
  IconPointer,
  IconRefresh,
  IconScissors,
  IconSubtitles,
  IconTrash,
} from "@tabler/icons-vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import { modelChoices } from "@/stores/settings";
import { useTimeline } from "./useTimeline";
import { pixelsPerSecond, timelineAssetMime, trackGutter } from "./timelineModel";
import { buildStyleConstraint } from "./stylePrompt";
import assetLibrary from "./components/assetLibrary.vue";
import previewPlayer, { type PreviewClip } from "./components/previewPlayer.vue";
import trackRow from "./components/trackRow.vue";
import timelineRuler from "./components/timelineRuler.vue";
import propertyPanel from "./components/propertyPanel.vue";
import exportDialog from "./components/exportDialog.vue";
import automaticFilmDialog from "./components/automaticFilmDialog.vue";
import templateDialog from "./components/templateDialog.vue";
import stylePanel from "./components/stylePanel.vue";
import { type SilenceEditMode } from "./timelineSilence";
import type { AssetItem, ProjectStyle, TrackType } from "./timelineTypes";

const props = defineProps<{ directory: string; openAutomaticFilm?: boolean }>();
const emit = defineEmits<{ automaticFilmOpened: []; sendToCanvas: [] }>();

const workspaceStore = useWorkspaceStore();
const router = useRouter();
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
const automaticFilmVisible = ref(false);
const templateVisible = ref(false);
const isAutomaticFilm = ref(false);
watch([() => props.openAutomaticFilm, timeline.ready], ([open, ready]) => {
  if (!open || !ready) return;
  automaticFilmVisible.value = true;
  emit("automaticFilmOpened");
}, { immediate: true });

function onTemplateGenerated(video: { path: string; name: string; mimeType: string }) {
  void timeline.appendCanvasVideo(video)
    .then(() => ElMessage.success(translate("模板成片已加入时间线")))
    .catch(error => ElMessage.error(error instanceof Error ? error.message : translate("加入时间线失败")));
}

function onFilmGenerated() {
  isAutomaticFilm.value = true;
  exportVisible.value = true;
}
const leftTab = ref<"assets" | "styles" | "effects">("assets");
const assetLibraryRef = ref<InstanceType<typeof assetLibrary>>();
const timelineScrollRef = ref<HTMLElement>();
const timelineInnerRef = ref<HTMLElement>();

const contentWidth = computed(() => Math.max(600, duration.value * pixelsPerSecond + 200));
const playheadLeft = computed(() => trackGutter + playhead.value * pixelsPerSecond);
const hasContent = computed(() => assets.value.length > 0 || tracks.value.some(track => track.clips.length > 0));
const canSilenceEdit = computed(() => !!selectedClip.value && (selectedClip.value.kind === "video" || selectedClip.value.kind === "audio"));

const previewClip = computed<PreviewClip | null>(() => {
  const track = project.value.tracks.find(item => item.type === "video" && !item.hidden);
  if (!track) return null;
  const clip = track.clips.find(item => item.kind === "video" && playhead.value >= item.timelineStart && playhead.value <= item.timelineStart + item.timelineDuration);
  if (!clip) return null;
  return { id: clip.id, source: clip.source, inPoint: clip.inPoint, timelineStart: clip.timelineStart, speed: clip.speed };
});

const previewEffects = computed(() => tracks.value.filter(track => track.type === "effect" && !track.hidden)
  .flatMap(track => track.clips).filter(clip => playhead.value >= clip.timelineStart && playhead.value < clip.timelineStart + clip.timelineDuration));
type EffectOption = { id: string; name: string; category: string; summary: string; seconds: number };
const effects = ref<EffectOption[]>([]);
const effectId = ref("lt-kicker-name");
const activeEffect = computed(() => effects.value.find(effect => effect.id === effectId.value));
const effectKicker = ref("");
const effectName = ref("");

async function loadEffects() {
  try {
    const list = await http<EffectOption[]>({ method: "GET", url: "/api/effect/render" });
    effects.value = list;
    if (list.length && !list.some(effect => effect.id === effectId.value)) effectId.value = list[0]!.id;
  } catch { /* 目录读不到时保留默认两项，添加仍可用 */ }
}

async function addLowerThird() {
  if (!effectKicker.value.trim() || !effectName.value.trim()) return;
  try { await timeline.addLowerThird(effectId.value, effectKicker.value.trim(), effectName.value.trim()); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : translate("动效生成失败")); }
}

function onImportFiles(files: File[]) {
  void timeline.importFiles(files).catch(error => ElMessage.error(error instanceof Error ? error.message : translate("导入失败")));
}

function onAddAsset(asset: AssetItem) {
  timeline.addClip(asset, asset.kind === "audio" ? "audio" : "video");
}

function onApplyStyle(style: ProjectStyle) {
  timeline.setStyle(style);
  void timeline.flushSave();
}

// 按已套用风格走 Agent 重新生成：把风格约束拼进 prompt，走 pendingAgentMessage 推给已打开的 Agent。
function regenerateWithStyle() {
  const style = project.value.style;
  if (!style) return;
  // ACT: 模型沿用「节点回退首个可用模型」的约定，选第一个语言模型；无可用模型时留空，由 Agent 提示选择。
  const model = modelChoices.value[0]?.value ?? "";
  workspaceStore.pendingAgentMessage = {
    directory: props.directory,
    prompt: `请按以下风格约束重新生成：\n\n${buildStyleConstraint(style)}`,
    model,
    reasoningEffort: "",
  };
}

function openAssetPicker() {
  leftTab.value = "assets";
  assetLibraryRef.value?.openPicker();
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
  const rect = timelineInnerRef.value?.getBoundingClientRect();
  if (!rect) return;
  const time = Math.max(0, (event.clientX - rect.left - trackGutter) / pixelsPerSecond);
  const id = event.dataTransfer?.getData(timelineAssetMime);
  const asset = id ? assets.value.find(item => item.id === id) : undefined;
  if (asset) timeline.addClip(asset, asset.kind === "audio" ? "audio" : "video", time);
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

function onSilenceEdit(mode: SilenceEditMode) {
  void timeline.silenceEdit(mode)
    .then(result => { if (result.silenceCount) ElMessage.success(translate("口播剪辑完成")); else ElMessage.info(translate("未检测到静音")); })
    .catch(error => ElMessage.error(error instanceof Error ? error.message : translate("口播剪辑失败")));
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

onMounted(() => { void timeline.load(); void loadEffects(); });
onScopeDispose(() => timeline.dispose());

// 剪辑→画布：把选中的视频片段交给画布建节点，不切换面板。
function getSelectedVideo() {
  const clip = selectedClip.value;
  if (!clip || clip.kind !== "video" || !clip.source) return null;
  const name = clip.source.split("/").pop() || clip.source;
  const mimeType = /\.webm$/i.test(name) ? "video/webm" : "video/mp4";
  return { path: clip.source, name, mimeType };
}
function sendSelectedToCanvas() {
  emit("sendToCanvas");
}
defineExpose({ flushSave: timeline.flushSave, ready: timeline.ready, appendCanvasVideo: timeline.appendCanvasVideo, getTemplateTimeline: () => timeline, getSelectedVideo });
</script>

<style scoped lang="scss">
.effectForm { display: grid; align-content: start; gap: 8px; padding: 10px; }
.effectSummary { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
.timelinePanel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding-top: 52px;
  overflow: hidden;
  background: var(--el-bg-color);

  .topBar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 48px;
    padding: 0 14px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .backButton {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 28px;
      height: 28px;
      color: var(--el-text-color-regular);
      background: transparent;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color .15s ease, color .15s ease;

      &:hover { color: var(--el-text-color-primary); background: var(--el-fill-color-light); }
      &:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--color-border-2); }
    }

    .projectName {
      flex: 1;
      max-width: 360px;

      .nameInput :deep(.el-input__wrapper) {
        padding: 0 6px;
        background: transparent;
        box-shadow: none;
        transition: background-color .15s ease, box-shadow .15s ease;
      }

      .nameInput :deep(.el-input__inner) {
        height: 26px;
        font-size: 13px;
        font-weight: 600;
      }

      .nameInput :deep(.el-input__wrapper:hover) { background: var(--el-fill-color-light); }
      .nameInput :deep(.el-input__wrapper.is-focus) {
        background: var(--el-bg-color);
        box-shadow: 0 0 0 1px var(--color-border-2) inset;
      }
    }

    .topActions {
      display: flex;
      align-items: center;
      gap: 10px;

      .actionGroup {
        display: flex;
        gap: 2px;
        align-items: center;
      }

      .actionDivider {
        width: 1px;
        height: 16px;
        background: var(--el-border-color);
      }

      // 图标按钮统一 28×28 / 8px 圆角，hover 才出色块
      .barButton {
        width: 28px;
        height: 28px;
        margin: 0;
        padding: 0;
        border-radius: 8px;
      }

      .exportButton { margin: 0; }
    }
  }

  .timelineBody {
    display: flex;
    flex: 1;
    min-height: 0;

    .leftPane {
      display: flex;
      flex-direction: column;
      flex: 0 0 240px;
      min-width: 0;

      .leftTabs {
        display: flex;
        flex: 0 0 32px;
        border-bottom: 1px solid var(--el-border-color-lighter);

        .leftTab {
          flex: 1;
          border: 0;
          background: transparent;
          color: var(--el-text-color-secondary);
          font-size: 12px;
          cursor: pointer;

          &.active {
            color: var(--el-color-primary);
            box-shadow: inset 0 -2px 0 var(--el-color-primary);
          }
        }
      }

      .assetPane {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }
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
