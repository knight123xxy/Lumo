<template>
  <section class="timelinePanel" aria-label="时间线剪辑" tabindex="0" @keydown="handleKeydown">
    <header class="topBar">
      <button class="backButton" type="button" :aria-label="translate('返回首页')" :title="translate('返回首页')" @click="router.push('/home')">
        <icon-home :size="16" aria-hidden="true" />
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
        <el-button v-if="openFilmAvailable && studioDraft" size="small" :disabled="openFilmLoading || busy" @click="requestStudio('importDraft', { draft: studioDraft })">{{ translate('发送成片草稿到 Studio') }}</el-button>
        <el-button v-if="openFilmAvailable && studioSilenceOutput" size="small" :disabled="openFilmLoading || busy" @click="sendStudioSilence">{{ translate('发送口播剪辑到 Studio') }}</el-button>
        <el-button v-if="openFilmAvailable && studioTemplate" size="small" :disabled="openFilmLoading || busy" @click="requestStudio('open', { videoPath: studioTemplate, template: true })">{{ translate('发送模板到 Studio') }}</el-button>
        <el-button v-if="openFilmAvailable && selectedClip?.kind === 'effect'" size="small" :disabled="openFilmLoading || busy" @click="sendStudioEffect">{{ translate('发送动效到 Studio') }}</el-button>
        <el-button v-if="studioClipUndo" size="small" @click="undoStudioClipEdit">{{ translate('撤销 Studio 片段修改') }}</el-button>
        <el-button v-if="openFilmAvailable && duration" size="small" :loading="preparingLegacyImport" :disabled="!timeline.ready.value || busy || openFilmLoading" @click="importStudioLegacy">{{ translate('复制旧时间线到 Studio') }}</el-button>
        <el-button v-if="openFilmAvailable" size="small" :loading="openFilmLoading" :disabled="busy" @click="openStudio()">OpenFilm Studio</el-button>
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
        <div class="emptyActions">
          <el-button type="primary" @click="openAssetPicker">{{ translate("导入素材") }}</el-button>
          <el-button :disabled="!timeline.ready.value || busy" @click="automaticFilmVisible = true">{{ translate("一键成片") }}</el-button>
          <el-button :disabled="!timeline.ready.value || busy" @click="templateVisible = true">{{ translate("整集模板") }}</el-button>
        </div>
        <p class="emptyHint">{{ translate("也可以在画布生成素材后「发送到剪辑」，或让 Agent 直接安排。") }}</p>
      </div>
    </div>

    <templateDialog v-model="templateVisible" :directory="directory" :assets="assets" :busy="busy" :importFiles="timeline.importFiles" @generated="onTemplateGenerated" />
    <automaticFilmDialog v-model="automaticFilmVisible" :directory="directory" :assets="assets" :busy="busy" :importFiles="timeline.importFiles" :createFilm="timeline.createAutomaticFilm" :currentStyle="project.style" @generated="onFilmGenerated" />
    <el-dialog v-if="openFilmUrl" :modelValue="true" title="OpenFilm Studio" fullscreen @update:modelValue="openFilmUrl = ''">
      <div class="studioTransfer">
        <span v-if="!studioEditorReady" role="status">{{ translate(studioEditorSlow ? '尚未收到 Studio 时间线就绪信号，可关闭后重试' : '正在加载 Studio 时间线…') }}</span>
        <el-button :loading="openFilmLoading && !studioClipId" :disabled="openFilmLoading" @click="requestStudio('listVideos')">{{ translate('读取 Studio 视频片段') }}</el-button>
        <el-select v-if="studioClips.length" v-model="studioClipId" :disabled="openFilmLoading" :placeholder="translate('选择视频片段')" style="width: 260px">
          <el-option v-for="clip in studioClips" :key="clip.id" :value="clip.id" :label="`${clip.name} · ${clip.at} s`" />
        </el-select>
        <el-button v-if="studioSelectedId || studioClips.length" :disabled="!(studioClipId || studioSelectedId) || openFilmLoading" @click="requestStudio('copyVideo', { clipId: studioClipId || studioSelectedId })">{{ translate('发送原素材到画布') }}</el-button>
        <el-button v-if="studioSelectedId || studioClips.length" :disabled="!(studioClipId || studioSelectedId) || openFilmLoading" @click="requestStudio('renderVideo', { clipId: studioClipId || studioSelectedId })">{{ translate('渲染片段并发送到画布') }}</el-button>
        <el-button v-if="studioSelectedIds.length || studioRange || studioRegion" :loading="capturingRegion" @click="referStudioSelection()">{{ translate('将选区加入 Agent 草稿') }}</el-button>
        <el-button v-if="studioRegion" @click="referStudioSelection(false)">{{ translate('仅将选区信息加入 Agent 草稿') }}</el-button>
        <span v-if="studioRegion">{{ translate('已框选画面') }} · {{ studioRegion.time.toFixed(2) }} s</span>
        <el-button v-if="studioRange" :disabled="openFilmLoading" @click="renderStudioRange">{{ translate('渲染选区并发送到画布') }}</el-button>
        <span v-if="studioRange">{{ translate('选中时间范围') }} {{ studioRange.start.toFixed(2) }}–{{ studioRange.end.toFixed(2) }} s</span>
      </div>
      <iframe :key="openFilmUrl" ref="studioFrame" :src="openFilmUrl" title="OpenFilm Studio" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerpolicy="no-referrer" style="display: block; width: 100%; height: calc(100dvh - 7rem); border: 0" />
    </el-dialog>
    <exportDialog v-model="exportVisible" :directory="directory" :project="project" :duration="duration" :automaticFilm="isAutomaticFilm" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import { ElButton, ElInput, ElMessage, ElMessageBox, ElOption, ElSelect, ElTooltip } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import http from "@/lib/http";
import {
  IconArrowBackUp,
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
  IconHome,
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
import type { AutomaticFilmDraft } from "./automaticFilm";

type StudioClipTransfer = { inPoint: number; outPoint: number; speed: number; volume: number; fadeIn?: number; fadeOut?: number };
type StudioVideo = { path: string; name: string; mimeType: string };
type StudioClip = { id: string; name: string; at: number };
type StudioClipField = "volume" | "speed" | "time" | "disabled";
type StudioClipValue = boolean | number | [number, number] | null;
type StudioClipEdit = { clipId: string; field: StudioClipField; value: StudioClipValue; previousValue: StudioClipValue };
type OpenFilmMessage = { requestId: string; regionPng?: string; clipEdit?: StudioClipEdit; url?: string; error?: string; clips?: StudioClip[]; video?: StudioVideo };
type StudioAction = "open" | "listVideos" | "copyVideo" | "renderVideo" | "renderRange" | "importDraft" | "importLegacy" | "setClipProperty" | "captureRegion";
type StudioDraft = Pick<AutomaticFilmDraft, "video" | "audio" | "subtitles"> & { id: string };

const props = defineProps<{ directory: string; openAutomaticFilm?: boolean; openFilmAvailable?: boolean; canvasKey?: string }>();
const emit = defineEmits<{ automaticFilmOpened: []; sendToCanvas: [video?: StudioVideo, directory?: string, canvasKey?: string]; openAgent: [] }>();

const workspaceStore = useWorkspaceStore();
const router = useRouter();
const studioHost = window as Window & {
  lumoRequestOpenFilm?: (message: { directory: string; requestId: string; action: StudioAction; videoPath?: string; clipTiming?: StudioClipTransfer; clipId?: string; draft?: StudioDraft; overlayAt?: number; projectId?: string; field?: StudioClipField; value?: StudioClipValue; expectedValue?: StudioClipValue; region?: StudioRegion; range?: StudioTimeRange }) => void;
};
const openFilmAvailable = computed(() => props.openFilmAvailable === true && Boolean(studioHost.lumoRequestOpenFilm));
const openFilmLoading = ref(false);
const preparingLegacyImport = ref(false);
let legacyImportAttempt: symbol | undefined;
const openFilmUrl = ref("");
const studioEditorReady = ref(false);
const studioEditorSlow = ref(false);
let studioEditorTimer: ReturnType<typeof setTimeout> | undefined;
const studioClips = ref<StudioClip[]>([]);
const studioClipId = ref("");
const studioFrame = ref<HTMLIFrameElement>();
const studioSelectedIds = ref<string[]>([]);
type StudioClipTiming = { id: string; start: number; end: number; sourceIn: number; speed: number; disabled?: boolean };
const studioClipTimings = ref<StudioClipTiming[]>([]);
const studioSelectedId = computed(() => studioSelectedIds.value.length === 1 ? studioSelectedIds.value[0] ?? "" : "");
type StudioTimeRange = { start: number; end: number };
const studioRange = ref<StudioTimeRange>();
type StudioRegion = { time: number; box: { x: number; y: number; w: number; h: number }; stage: { w: number; h: number }; clipIds: string[] };
const studioRegion = ref<StudioRegion>();
const capturingRegion = ref(false);
function readStudioClipIds(ids: unknown) {
  return Array.isArray(ids) ? ids.slice(0, 32).filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128) : [];
}
function receiveStudioSelection(event: MessageEvent) {
  if (!openFilmUrl.value || !studioFrame.value || event.source !== studioFrame.value.contentWindow) return;
  const url = new URL(openFilmUrl.value);
  const selection = event.data;
  if (event.origin !== url.origin || typeof selection?.projectId !== "string"
    || `/projects/${encodeURIComponent(selection.projectId)}` !== url.searchParams.get("to")) return;
  if (selection.type === "lumoStudioRegion") {
    const { time, box, stage } = selection;
    if (!box || !stage || ![time, box.x, box.y, box.w, box.h, stage.w, stage.h].every(Number.isFinite)
      || time < 0 || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || stage.w <= 0 || stage.h <= 0
      || box.x + box.w > stage.w + 1 || box.y + box.h > stage.h + 1) return;
    studioRegion.value = { time, box: { x: box.x, y: box.y, w: box.w, h: box.h }, stage: { w: stage.w, h: stage.h },
      clipIds: readStudioClipIds(selection.clipIds) };
    return;
  }
  if (selection.type !== "lumoStudioSelection") return;
  studioEditorReady.value = true;
  clearTimeout(studioEditorTimer);
  const previousId = studioSelectedId.value;
  studioSelectedIds.value = readStudioClipIds(selection.clipIds);
  const timings: unknown = selection.clips;
  studioClipTimings.value = Array.isArray(timings) ? timings.slice(0, 32).flatMap(clip => {
    if (!clip || !studioSelectedIds.value.includes(clip.id)) return [];
    const { id, start, end, sourceIn, speed } = clip;
    if (![start, end, sourceIn, speed].every(Number.isFinite) || start < 0 || end <= start || sourceIn < 0 || speed <= 0) return [];
    return [{ id, start, end, sourceIn, speed, ...(typeof clip.disabled === "boolean" ? { disabled: clip.disabled } : {}) }];
  }) : [];
  const selectedId = studioSelectedId.value;
  if (selectedId !== previousId) studioClipId.value = studioClips.value.some(clip => clip.id === selectedId) ? selectedId : "";
  const range = selection.range;
  studioRange.value = range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end > range.start
    ? { start: range.start, end: range.end } : undefined;
}
const studioEditSelection = ref<{ projectId: string; clipIds: string[] }>();
const studioClipUndo = ref<(StudioClipEdit & { projectId: string })>();
function studioEditAvailable() {
  return Boolean(studioEditSelection.value?.clipIds.length);
}
type StudioHostRequest = Parameters<NonNullable<typeof studioHost.lumoRequestOpenFilm>>[0];
const pendingStudioResponses = new Set<() => void>();
function awaitStudioResponse(request: Omit<StudioHostRequest, "directory" | "requestId">, timeout: number) {
  const send = studioHost.lumoRequestOpenFilm;
  if (!openFilmAvailable.value || !send || workspaceStore.project?.directory !== props.directory) throw new Error("Studio 项目已切换");
  const directory = props.directory;
  const requestId = crypto.randomUUID();
  return new Promise<OpenFilmMessage>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("lumo:open-film-studio", receive);
      pendingStudioResponses.delete(cancel);
    };
    const cancel = () => { cleanup(); reject(new Error("Studio 项目已切换")); };
    function receive(event: Event) {
      const result = (event as CustomEvent<OpenFilmMessage>).detail;
      if (result?.requestId !== requestId) return;
      if (workspaceStore.project?.directory !== directory || props.directory !== directory) return cancel();
      cleanup();
      resolve(result);
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error("Studio 请求超时")); }, timeout);
    pendingStudioResponses.add(cancel);
    window.addEventListener("lumo:open-film-studio", receive);
    try { send({ ...request, directory, requestId }); }
    catch (error) { cleanup(); reject(error); }
  });
}
async function sendStudioClipEdit(projectId: string, clipId: string, field: StudioClipField, value: StudioClipValue, expectedValue?: StudioClipValue): Promise<StudioClipEdit> {
  const response = await awaitStudioResponse({ action: "setClipProperty", projectId, clipId, field, value, expectedValue }, 50_000);
  if (!response.clipEdit) throw new Error(response.error ?? "Studio 片段修改失败");
  return response.clipEdit;
}
async function setStudioClipProperty(field: StudioClipField, args: Record<string, unknown>, signal?: AbortSignal) {
  const selection = studioEditSelection.value;
  const { projectId, clipId } = args;
  if (!selection || projectId !== selection.projectId || typeof clipId !== "string" || !selection.clipIds.includes(clipId)) throw new Error("请先引用要修改的 Studio 片段");
  let value: StudioClipValue;
  let label: string;
  let title: string;
  if (field === "disabled") {
    if (typeof args.disabled !== "boolean") throw new Error("Studio 片段停用状态无效");
    value = args.disabled;
    label = value ? translate("停用片段") : translate("恢复片段");
    title = translate("确认修改 Studio 片段状态");
  } else if (field === "time") {
    const { start, end } = args;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error("Studio 裁切范围无效");
    value = [start, end];
    label = `${start}–${end} s`;
    title = translate("确认裁切 Studio 视频片段（源素材时间）");
  } else {
    const scalar = args[field];
    if (typeof scalar !== "number" || !Number.isFinite(scalar) || (field === "volume" ? scalar < 0 || scalar > 2 : scalar < 0.1 || scalar > 16)) throw new Error("Studio 片段参数无效");
    value = scalar;
    label = field === "volume" ? `${Math.round(value * 100)}%` : `${value}×`;
    title = field === "volume" ? translate("确认修改 Studio 片段音量") : translate("确认修改 Studio 片段倍速");
  }
  signal?.throwIfAborted();
  await ElMessageBox.confirm(`${clipId} · ${label}`, title);
  signal?.throwIfAborted();
  if (selection !== studioEditSelection.value) throw new Error("Studio 选区已切换");
  const result = await sendStudioClipEdit(selection.projectId, clipId, field, value);
  if (workspaceStore.project?.directory === props.directory) studioClipUndo.value = { ...result, projectId: selection.projectId };
  return result;
}
async function undoStudioClipEdit() {
  const edit = studioClipUndo.value;
  if (!edit) return;
  try {
    await sendStudioClipEdit(edit.projectId, edit.clipId, edit.field, edit.previousValue, edit.value);
    if (studioClipUndo.value === edit) studioClipUndo.value = undefined;
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : translate("撤销 Studio 片段修改失败")); }
}
let regionCaptureAttempt = 0;
watch(openFilmUrl, url => {
  clearTimeout(studioEditorTimer);
  studioEditorReady.value = false;
  studioEditorSlow.value = false;
  if (url) studioEditorTimer = setTimeout(() => { studioEditorSlow.value = true; }, 15_000);
  regionCaptureAttempt++;
  capturingRegion.value = false;
  studioClips.value = [];
  studioClipId.value = "";
  studioSelectedIds.value = [];
  studioClipTimings.value = [];
  studioRange.value = undefined;
  studioRegion.value = undefined;
  // 片段列表属于当前弹层，已发出的画布回传可在关闭后继续完成。
  if (openFilmRequest?.action === "listVideos") {
    openFilmRequest = undefined;
    clearTimeout(openFilmTimer);
    openFilmLoading.value = false;
  }
}, { flush: "sync" });
async function referStudioSelection(withImage = true) {
  const studioUrl = openFilmUrl.value;
  if (!studioUrl || (withImage && capturingRegion.value) || workspaceStore.project?.directory !== props.directory) return;
  const projectPath = new URL(openFilmUrl.value).searchParams.get("to");
  if (!projectPath?.startsWith("/projects/")) return;
  const clips = studioSelectedIds.value;
  const range = studioRange.value;
  const region = studioRegion.value;
  if (!clips.length && !range && !region) return;
  const context = {
    projectId: decodeURIComponent(projectPath.slice("/projects/".length)),
    clipIds: clips,
    clipTimings: studioClipTimings.value,
    ...(range ? { range } : {}),
    ...(region ? { region } : {}),
  };
  const attempt = ++regionCaptureAttempt;
  const text = `${translate("OpenFilm Studio 选区")}\n${JSON.stringify(context)}`;
  const images: File[] = [];
  if (region && withImage) {
    capturingRegion.value = true;
    try {
      const response = await awaitStudioResponse({ action: "captureRegion", projectId: context.projectId, region }, 75_000);
      if (!response.regionPng) throw new Error(response.error ?? translate("Studio 截图失败"));
      const bytes = Uint8Array.from(atob(response.regionPng), character => character.charCodeAt(0));
      images.push(new File([bytes], "Studio-region.png", { type: "image/png" }));
    } catch {
      if (attempt === regionCaptureAttempt && openFilmUrl.value === studioUrl && workspaceStore.project?.directory === props.directory) {
        ElMessage.warning(translate("Studio 截图失败，已保留选区信息"));
      }
    } finally {
      if (attempt === regionCaptureAttempt) capturingRegion.value = false;
    }
  }
  if (attempt !== regionCaptureAttempt || openFilmUrl.value !== studioUrl || workspaceStore.project?.directory !== props.directory) return;
  capturingRegion.value = false;
  studioEditSelection.value = { projectId: context.projectId, clipIds: [...clips] };
  const pending = workspaceStore.pendingAgentDraft;
  workspaceStore.pendingAgentDraft = pending?.directory === props.directory
    ? { directory: props.directory, text: `${pending.text}\n\n${text}`, images: [...(pending.images ?? []), ...images] }
    : { directory: props.directory, text, images };
  openFilmUrl.value = "";
  emit("openAgent");
}
const studioDraft = ref<StudioDraft>();
const studioTemplate = ref("");
let sendingStudioTemplate = false;
let openFilmTimer: ReturnType<typeof setTimeout> | undefined;
let openFilmRequest: { id: string; action: StudioAction; directory: string; draftId?: string; canvasKey?: string } | undefined;
function resetStudioWorkspace() {
  legacyImportAttempt = undefined;
  preparingLegacyImport.value = false;
  openFilmRequest = undefined;
  clearTimeout(openFilmTimer);
  openFilmLoading.value = false;
  openFilmUrl.value = "";
  studioClips.value = [];
  studioClipId.value = "";
  studioSelectedIds.value = [];
  studioClipTimings.value = [];
  studioRange.value = undefined;
  studioRegion.value = undefined;
  studioEditSelection.value = undefined;
  studioClipUndo.value = undefined;
  studioDraft.value = undefined;
  studioTemplate.value = "";
  for (const cancel of pendingStudioResponses) cancel();
}
watch(() => workspaceStore.project?.directory, resetStudioWorkspace, { flush: "sync" });
function receiveOpenFilm(event: Event) {
  const result = (event as CustomEvent<OpenFilmMessage>).detail;
  const request = openFilmRequest;
  if (!request || result?.requestId !== request.id) return;
  if (request.directory !== props.directory || request.directory !== workspaceStore.project?.directory) {
    resetStudioWorkspace();
    return;
  }
  openFilmRequest = undefined;
  clearTimeout(openFilmTimer);
  openFilmLoading.value = false;
  if (result.url) {
    if (request.draftId && studioDraft.value?.id === request.draftId) studioDraft.value = undefined;
    if (sendingStudioTemplate) studioTemplate.value = "";
    openFilmUrl.value = result.url;
  } else if (result.clips) {
    studioClips.value = result.clips;
    const preferredId = studioClipId.value || studioSelectedId.value;
    studioClipId.value = result.clips.some(clip => clip.id === preferredId) ? preferredId : "";
    if (!result.clips.length) ElMessage.info(translate("Studio 时间线没有可发送的视频"));
  } else if (result.video) {
    emit("sendToCanvas", result.video, request.directory, request.canvasKey);
  } else ElMessage.error(result.error ?? translate("OpenFilm Studio 请求失败"));
}
function openStudio(videoPath?: string) {
  requestStudio("open", { videoPath });
}
async function importStudioLegacy() {
  const directory = props.directory;
  if (legacyImportAttempt || !timeline.ready.value || busy.value || openFilmLoading.value || workspaceStore.project?.directory !== directory) return;
  const attempt = Symbol();
  legacyImportAttempt = attempt;
  preparingLegacyImport.value = true;
  const isCurrent = () => legacyImportAttempt === attempt && props.directory === directory && workspaceStore.project?.directory === directory;
  try {
    const confirmed = await ElMessageBox.confirm(translate("先保存当前旧时间线，再复制到空白 Studio 工程。原工程仍可在旧剪辑器中打开。"), translate("复制旧时间线到 Studio")).then(() => true, () => false);
    if (!confirmed || !isCurrent() || busy.value || openFilmLoading.value) return;
    await timeline.flushSave();
    if (isCurrent() && !busy.value) requestStudio("importLegacy");
  } catch (error) {
    if (isCurrent()) ElMessage.error(error instanceof Error ? error.message : translate("保存旧时间线失败"));
  } finally {
    if (legacyImportAttempt === attempt) {
      legacyImportAttempt = undefined;
      preparingLegacyImport.value = false;
    }
  }
}
function renderStudioRange() {
  const range = studioRange.value;
  if (!openFilmUrl.value || !range) return;
  const route = new URL(openFilmUrl.value).searchParams.get("to");
  if (!route?.startsWith("/projects/")) return;
  requestStudio("renderRange", { projectId: decodeURIComponent(route.slice("/projects/".length)), range: { ...range } });
}
function requestStudio(action: StudioAction, { template = false, ...options }: { videoPath?: string; clipTiming?: StudioClipTransfer; clipId?: string; draft?: StudioDraft; overlayAt?: number; template?: boolean; projectId?: string; range?: StudioTimeRange } = {}) {
  const directory = props.directory;
  if (!openFilmAvailable.value || openFilmLoading.value || !directory || workspaceStore.project?.directory !== directory) return;
  if (action === "listVideos" || action === "copyVideo" || action === "renderVideo") {
    const route = openFilmUrl.value && new URL(openFilmUrl.value).searchParams.get("to");
    if (!route?.startsWith("/projects/")) return;
    options.projectId = decodeURIComponent(route.slice("/projects/".length));
  }
  const returnsVideo = action === "copyVideo" || action === "renderVideo" || action === "renderRange";
  const canvasKey = returnsVideo ? props.canvasKey : undefined;
  if (returnsVideo && !canvasKey) {
    ElMessage.error(translate("画布尚未就绪"));
    return;
  }
  const requestId = crypto.randomUUID();
  openFilmRequest = { id: requestId, action, directory, draftId: options.draft?.id, canvasKey };
  sendingStudioTemplate = template;
  openFilmLoading.value = true;
  openFilmTimer = setTimeout(() => {
    openFilmRequest = undefined;
    openFilmLoading.value = false;
    ElMessage.error(translate("OpenFilm Studio 请求超时"));
  }, options.draft || action === "importLegacy" ? 450_000 : (action === "renderVideo" || action === "renderRange") ? 210_000 : options.videoPath ? 150_000 : 50_000);
  try {
    studioHost.lumoRequestOpenFilm?.({ directory, requestId, action, ...options });
  } catch (error) {
    if (openFilmRequest?.id !== requestId) return;
    openFilmRequest = undefined;
    clearTimeout(openFilmTimer);
    openFilmLoading.value = false;
    ElMessage.error(error instanceof Error ? error.message : translate("OpenFilm Studio 请求失败"));
  }
}
onMounted(() => {
  window.addEventListener("lumo:open-film-studio", receiveOpenFilm);
  window.addEventListener("message", receiveStudioSelection);
});
onScopeDispose(() => {
  clearTimeout(studioEditorTimer);
  resetStudioWorkspace();
  window.removeEventListener("lumo:open-film-studio", receiveOpenFilm);
  window.removeEventListener("message", receiveStudioSelection);
});
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

const studioSilenceOutput = computed(() => {
  const clip = selectedClip.value;
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return "";
  // 已保存的口播成品使用固定文件名格式，兼容此前写入的时间线。
  const output = /^assets\/timeline\/(?:tighten|speedUp)-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(mp4|mp3)$/i.exec(clip.source);
  return output?.[1]?.toLowerCase() === (clip.kind === "video" ? "mp4" : "mp3") ? clip.source : "";
});

function sendStudioEffect() {
  const clip = selectedClip.value;
  if (clip?.kind !== "effect") return;
  const { source, timelineStart, inPoint, outPoint, speed } = clip;
  requestStudio("open", { videoPath: source, overlayAt: timelineStart, clipTiming: { inPoint, outPoint, speed, volume: 0 } });
}

function sendStudioSilence() {
  const clip = selectedClip.value;
  const track = tracks.value.find(item => item.id === selection.value?.trackId);
  if (!clip || !track || !studioSilenceOutput.value) return;
  const { inPoint, outPoint, speed } = clip;
  const clipTiming: StudioClipTransfer = { inPoint, outPoint, speed, volume: track.muted ? 0 : clip.volume };
  if (clip.kind === "audio") {
    clipTiming.fadeIn = clip.fadeIn;
    clipTiming.fadeOut = clip.fadeOut;
  }
  requestStudio("open", { videoPath: studioSilenceOutput.value, clipTiming });
}

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
    .then(() => {
      if (openFilmAvailable.value) studioTemplate.value = video.path;
      ElMessage.success(translate("模板成片已加入时间线"));
    })
    .catch(error => ElMessage.error(error instanceof Error ? error.message : translate("加入时间线失败")));
}

function onFilmGenerated(draft: AutomaticFilmDraft) {
  if (workspaceStore.project?.directory !== props.directory) return;
  isAutomaticFilm.value = true;
  if (openFilmAvailable.value) {
    const { video, audio, subtitles } = draft;
    studioDraft.value = { id: crypto.randomUUID(), video, audio, subtitles };
  }
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
  const directory = props.directory;
  const isCurrent = () => props.directory === directory && workspaceStore.project?.directory === directory;
  void timeline.silenceEdit(mode)
    .then(result => {
      if (!isCurrent()) return;
      if (!result.silenceCount) {
        ElMessage.info(translate("未检测到静音"));
        return;
      }
      ElMessage.success(translate("口播剪辑完成"));
    })
    .catch(error => {
      if (isCurrent()) ElMessage.error(error instanceof Error ? error.message : translate("口播剪辑失败"));
    });
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
defineExpose({ flushSave: timeline.flushSave, ready: timeline.ready, appendCanvasVideo: timeline.appendCanvasVideo, getTemplateTimeline: () => timeline, getSelectedVideo, openStudio, setStudioClipProperty, studioEditAvailable });
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
    position: relative;
    z-index: 7;
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
    pointer-events: none;

    .emptyCard {
      pointer-events: auto;
      padding: 28px 34px;
      border: 1px dashed var(--el-border-color);
      border-radius: 12px;
      text-align: center;

      .emptyTitle {
        margin: 0 0 6px;
        font-size: 16px;
        font-weight: 600;
      }
    .emptyActions {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 12px;
    }

    .emptyHint {
      margin: 10px 0 0;
      color: var(--el-text-color-secondary);
      font-size: 12px;
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
