<template>
  <main class="workspacePage" :inert="workspaceStore.projectLoadingVisible">
    <canvasPanel
      :key="workspaceStore.project?.directory"
      v-model:selectedTool="selectedTool"
      ref="canvasPanelRef"
      class="canvasPanel"
      :class="{ backgroundPanel: activePanel !== 'canvas' }"
      :inert="activePanel !== 'canvas'"
      :aria-hidden="activePanel !== 'canvas'"
      :active="activePanel === 'canvas'"
      :settingsVisible="settingsVisible" />
    <keep-alive :key="workspaceStore.project?.directory" :max="1">
      <documentPanel
        v-if="activePanel === 'document'"
        :key="workspaceStore.project?.directory"
        :ref="setDocumentPanel"
        :readNode="readDocumentNode"
        :readNodes="readDocumentNodes"
        :focusNode="focusDocumentNode"
        :mountNode="mountDocumentNode"
        :resolveNodeFile="resolveDocumentNodeFile"
        :observeNode="observeDocumentNode"
        :flushNodes="flushDocumentNodes"
        :fileAction="performFileAction"
        :saveNode="saveDocumentNode" />
    </keep-alive>
    <keep-alive :key="workspaceStore.project?.directory" :max="1">
      <timelinePanel
        v-if="activePanel === 'timeline'"
        :key="workspaceStore.project?.directory"
        :ref="setTimelinePanel"
        :directory="workspaceStore.project?.directory ?? ''"
        :openFilmAvailable="openFilmAvailable"
        :canvasKey="canvasPanelRef?.canvasReady ? canvasPanelRef.activeKey : undefined"
        @send-to-canvas="sendClipToCanvas" />
    </keep-alive>
    <sceneProject v-if="previs" :directory="previs.directory" :projectPath="previs.path" :script="previs.script" @close="previs = undefined" />
    <el-dialog v-model="previsInputVisible" :title="translate('白模预演')" width="min(620px, calc(100vw - 32px))">
      <el-input v-model="previsScript" type="textarea" :rows="6" :maxlength="6000" :aria-label="translate('单场剧本')" />
      <template #footer>
        <el-button type="primary" :disabled="!previsScript.trim()" @click="openStandaloneWorkspacePrevis">{{ translate('生成白模预演') }}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="contactVisible" :title="contactInfo.title" width="min(360px, calc(100vw - 32px))" alignCenter appendToBody>
      <div class="contactContent">
        <q-r-code
          :value="contactInfo.url"
          :size="192"
          type="svg"
          color="#000000"
          bgColor="#ffffff"
          borderless
          role="img"
          :aria-label="`${contactInfo.title}二维码`" />
        <p class="contactTip">{{ contactInfo.tip }}</p>
      </div>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { computed, defineAsyncComponent, effectScope, inject, nextTick, onMounted, onScopeDispose, provide, ref, shallowRef, watch, type ComponentPublicInstance } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import axios from "axios";
import { ElMessage, ElMessageBox } from "element-plus";
import { QRCode } from "tdesign-vue-next";
import { useWorkspaceStore, type Project, type ProjectMode } from "@/stores/workspace";
import { registerWorkspaceControl, waitForControlValue } from "@/lib/mcpControl";
import anonymousData from "@/lib/anonymousData";
import { useProviderBalances } from "@/lib/providerBilling";
import canvasPanel from "./panels/canvas/canvasHost.vue";
import { isScriptDraftPath } from "./components/scriptBreakdown";
import { timelineProjectFile } from "./panels/timeline/timelineModel";
import { useTimeline } from "./panels/timeline/useTimeline";
import type { DocumentNodeOptions } from "./panels/canvas/canvasFiles";

const documentPanel = defineAsyncComponent(() => import("./panels/document/index.vue"));
const timelinePanel = defineAsyncComponent(() => import("./panels/timeline/index.vue"));

const route = useRoute();
const router = useRouter();
const projectMode = () => useWorkspaceStore().project?.mode;
const activePanel = ref<"canvas" | "document" | "timeline">(
  route.query.panel === "timeline" || route.query.panel !== "canvas" && projectMode() === "edit" ? "timeline" : "canvas",
);
const selectedTool = ref<"move" | "hand">("move");
const sideButtonEvents = ["mousedown", "mouseup", "auxclick"] as const;
// 鼠标侧键会直接触发原生历史导航，需在 DOM 事件阶段拦截，避免生成中的工作区被误关闭。
function preventSideButtonNavigation(event: MouseEvent) {
  if (event.button === 3 || event.button === 4) event.preventDefault();
}
onMounted(() => {
  anonymousData.track(activePanel.value === "timeline" ? "workspace.timeline" : "workspace.canvas");
  for (const eventName of sideButtonEvents) window.addEventListener(eventName, preventSideButtonNavigation, true);
});
onScopeDispose(() => {
  for (const eventName of sideButtonEvents) window.removeEventListener(eventName, preventSideButtonNavigation, true);
});
const workspaceStore = useWorkspaceStore();
useProviderBalances();
function runCanvasCommand(command: string) {
  switch (command) {
    case "add": canvasPanelRef.value?.addNodeAtPointer(); break;
    case "search": canvasPanelRef.value?.openNodeSearch(); break;
    case "hand": selectedTool.value = selectedTool.value === "move" ? "hand" : "move"; break;
    case "sendTimeline": void sendVideoToTimeline(); break;
    case "previs": previsInputVisible.value = true; break;
    case "previsScene": void openScenePrevis(); break;
    case "shot": void prepareShotVideo(); break;
    case "help": helpVisible.value = true; break;
  }
}

const settingsVisible = inject("settingsVisible", ref(false));
const helpVisible = ref(false);
const contactVisible = ref(false);
const contactType = ref<"community" | "business">("community");
const contacts = {
  community: {
    title: "加入交流群",
    url: "https://work.weixin.qq.com/u/vc66e4c7f8432af0d8?v=5.0.13.84802&bb=c03c3ad130",
    tip: "Lumo 是为爱发电的开源项目。欢迎文明交流、友善反馈；回复可能需要一些时间，请避免责问或命令式沟通，感谢你的理解与尊重。",
  },
  business: {
    title: "商务合作",
    url: "https://work.weixin.qq.com/u/vc66e4c7f8432af0d8?v=5.0.13.84802&bb=c03c3ad130",
    tip: "此联系方式仅用于商务合作接洽，不提供问题答疑。使用问题欢迎在交流群交流，需求与 BUG 可通过反馈表提交。感谢理解。",
  },
};
const contactInfo = computed(() => contacts[contactType.value]);

function showContact(type: "community" | "business") {
  contactType.value = type;
  helpVisible.value = false;
  contactVisible.value = true;
}
const canvasPanelRef = ref<InstanceType<typeof canvasPanel>>();
const previsInputVisible = ref(route.query.previs === "1");
watch(previsInputVisible, visible => {
  if (visible || route.query.previs !== "1") return;
  const query = { ...route.query };
  delete query.previs;
  void router.replace({ query });
});
const previsScript = ref("");

function openStandaloneWorkspacePrevis() {
  const directory = workspaceStore.project?.directory;
  const script = previsScript.value.trim();
  if (!directory || !script || previs.value) return;
  previs.value = { directory, path: `白模预演-${crypto.randomUUID()}.json`, script };
  previsInputVisible.value = false;
}

const sceneProject = defineAsyncComponent(() => import("./components/sceneProject.vue"));
const previs = shallowRef<{ directory: string; path: string; script: string }>();
const openingPrevis = ref(false);
const selectedDramaScene = computed(() => {
  const panel = canvasPanelRef.value;
  const node = panel?.selectedTextNode;
  return isScriptDraftPath(panel?.canvasId) && node && (node.data?.scriptBreakdownKind === "scene" ||
    (node.data?.scriptBreakdownKind === undefined && /^场景(?: \d+)?$/.test(node.data?.label ?? ""))) ? node : undefined;
});

const preparingShot = ref(false);
const selectedDramaShot = computed(() => {
  const panel = canvasPanelRef.value;
  const node = panel?.selectedTextNode;
  return isScriptDraftPath(panel?.canvasId) && node && /^分镜(?: \d+)?$/.test(node.data?.label ?? "") ? node : undefined;
});

async function prepareShotVideo() {
  const panel = canvasPanelRef.value;
  const directory = workspaceStore.project?.directory;
  const node = selectedDramaShot.value;
  if (!panel?.canvasReady || !directory || !node || preparingShot.value) return;
  preparingShot.value = true;
  try {
    await panel.addShotVideoNode(directory, panel.canvasId, node.id);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("创建视频生成节点失败"));
  } finally {
    preparingShot.value = false;
  }
}

async function openScenePrevis() {
  const directory = workspaceStore.project?.directory;
  const panel = canvasPanelRef.value;
  const node = selectedDramaScene.value;
  if (!directory || !panel || !node || openingPrevis.value || previs.value) return;
  const canvasPath = panel.canvasId;
  openingPrevis.value = true;
  try {
    const scene = await panel.readDocumentNode(directory, canvasPath, node.id);
    const script = scene.outputs.find(output => output.id === "text")?.text.trim();
    if (!script || script.length > 20000) throw new Error(translate("场景正文须为 1 至 20000 字"));
    if (workspaceStore.project?.directory !== directory || panel.canvasId !== canvasPath) return;
    previs.value = { directory, path: `白模预演-${crypto.randomUUID()}.json`, script };
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("打开白模预演失败"));
  } finally {
    openingPrevis.value = false;
  }
}
watch(() => canvasPanelRef.value?.canvasListReady, async ready => {
  const path = route.query.scriptDraft;
  if (!ready || !(isScriptDraftPath(path) || typeof path === "string" && /^营销脚本-[0-9a-f-]{36}\.json$/.test(path))) return;
  try { await canvasPanelRef.value?.activateCanvas(path); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : translate("打开分镜草稿失败")); }
}, { flush: "post" });
let openingGeneration = false;
watch([() => route.query.generation, () => canvasPanelRef.value?.canvasReady], async ([kind, ready]) => {
  if ((kind !== "image" && kind !== "video") || !ready || activePanel.value !== "canvas" || openingGeneration) return;
  openingGeneration = true;
  try {
    if (!await canvasPanelRef.value?.addGenerationNode(kind)) return;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("创建生成节点失败"));
  } finally {
    if (route.query.generation === kind) {
      const query = { ...route.query };
      delete query.generation;
      await router.replace({ query });
    }
    openingGeneration = false;
  }
}, { flush: "post" });
// ACT: 画布自身的加载态就地显示，不再触发全屏加载页遮挡侧栏与对话框。
onScopeDispose(() => { workspaceStore.projectLoading = false; });
const documentPanelCache = shallowRef<{ directory: string; instance: InstanceType<typeof documentPanel> }>();
const documentPanelRef = computed(() => documentPanelCache.value?.directory === workspaceStore.project?.directory ? documentPanelCache.value?.instance : undefined);
watch(() => workspaceStore.project?.directory, () => {
  documentPanelCache.value?.instance.cancelSave();
  documentPanelCache.value = undefined;
}, { flush: "sync" });
function setDocumentPanel(value: Element | ComponentPublicInstance | null) {
  const directory = workspaceStore.project?.directory;
  // KeepAlive 失活会清空模板 ref，保留同一工作区实例以协调后台文档保存和文件操作。
  if (value && directory) documentPanelCache.value = { directory, instance: value as InstanceType<typeof documentPanel> };
}
const timelinePanelCache = shallowRef<{ directory: string; instance: InstanceType<typeof timelinePanel> }>();
const timelinePanelRef = computed(() => timelinePanelCache.value?.directory === workspaceStore.project?.directory ? timelinePanelCache.value?.instance : undefined);
watch(() => workspaceStore.project?.directory, () => {
  timelinePanelCache.value = undefined;
}, { flush: "sync" });
function setTimelinePanel(value: Element | ComponentPublicInstance | null) {
  const directory = workspaceStore.project?.directory;
  if (value && directory) timelinePanelCache.value = { directory, instance: value as InstanceType<typeof timelinePanel> };
}
function getCanvasContext() {
  const canvas = canvasPanelRef.value?.getCanvasContext();
  const timeline = timelinePanelRef.value;
  const directory = workspaceStore.project?.directory;
  const studioSelection = activePanel.value === "timeline" && timeline?.studioEditAvailable() === true;
  if (!directory || (!canvas && activePanel.value !== "timeline")) return canvas;
  return {
    ...canvas,
    id: canvas?.id ?? "",
    tools: canvas?.tools ?? [],
    studioSelection,
    embeddedTimeline: activePanel.value === "timeline" && timeline?.embeddedTimelineAvailable() === true,
    automaticFilm: true,
    call(request: { name: string; args: Record<string, unknown> }, signal?: AbortSignal) {
      controlLifetime.signal.throwIfAborted();
      if (directory !== workspaceStore.project?.directory) throw new Error(translate("工作目录已切换"));
      if (request.name === "createAutomaticFilm") {
        const { topic, videoPaths } = request.args;
        if (typeof topic !== "string" || !Array.isArray(videoPaths) || !videoPaths.length || !videoPaths.every((path): path is string => typeof path === "string")) {
          throw new Error(translate("成片主题或视频素材无效"));
        }
        return createFilmFromConversation(directory, topic, videoPaths, signal);
      }
      if (["readTimeline", "trimTimelineClip", "setTimelineClipVolume", "tightenTimelineSpeech", "subtitleTimelineSpeech", "subtitleTimelineFromScript", "exportTimelineMp4"].includes(request.name)) {
        if (activePanel.value !== "timeline" || !timeline || timeline !== timelinePanelRef.value) throw new Error("内置时间线已切换");
        return timeline.callEmbeddedTimeline(request, signal);
      }
      if (timeline && request.name === "setStudioClipVolume") return timeline.setStudioClipProperty("volume", request.args, signal);
      if (timeline && request.name === "setStudioClipSpeed") return timeline.setStudioClipProperty("speed", request.args, signal);
      if (timeline && request.name === "trimStudioClip") return timeline.setStudioClipProperty("time", request.args, signal);
      if (timeline && request.name === "setStudioClipDisabled") return timeline.setStudioClipProperty("disabled", request.args, signal);
      if (!canvas) throw new Error("画布尚未就绪");
      return canvas.call(request, signal);
    },
  };
}
let generatingFilm = false;
async function createFilmFromConversation(directory: string, topic: string, videoPaths: string[], signal?: AbortSignal) {
  if (generatingFilm) throw new Error(translate("已有成片任务正在运行"));
  const timeline = timelinePanelRef.value?.getTemplateTimeline();
  const scope = timeline ? undefined : effectScope();
  const target = timeline ?? scope!.run(() => useTimeline(directory))!;
  const lifetimeSignal = signal ? AbortSignal.any([controlLifetime.signal, signal]) : controlLifetime.signal;
  generatingFilm = true;
  try {
    if (!target.ready.value) {
      if (timeline) await waitForControlValue(() => timeline.ready.value || undefined, lifetimeSignal);
      else await target.load(true);
    }
    const draft = await target.createFilmFromConversation(topic, videoPaths, lifetimeSignal);
    return { timeline: timelineProjectFile, duration: draft.duration, hasVideoGaps: draft.hasVideoGaps };
  } finally {
    if (scope) {
      target.dispose();
      scope.stop();
    }
    generatingFilm = false;
  }
}
const getMentionSource = () => canvasPanelRef.value?.mentionSource;
provide("performWorkspaceFileAction", (directory: string, action: "copy" | "rename" | "move" | "delete", path: string, target?: string, entryType: "canvas" | "directory" = "canvas") =>
  documentPanelRef.value ? documentPanelRef.value.performFileAction(directory, action, path, target, entryType) : performFileAction(directory, action, path, target));

const controlLifetime = new AbortController();
onScopeDispose(() => {
  controlLifetime.abort(new Error("工作区已关闭"));
  // 离开守卫已完成保存，先释放文档观察者，避免画布卸载被当成节点删除。
  documentPanelRef.value?.cancelSave();
});
registerWorkspaceControl({
  getState: () => ({
    directory: workspaceStore.project?.directory ?? null,
    canvasId: canvasPanelRef.value?.canvasId || null,
    panel: activePanel.value,
    tools: canvasPanelRef.value?.canvasReady ? canvasPanelRef.value.getCanvasContext()?.tools ?? [] : [],
    document: documentPanelRef.value?.getDocument(false),
  }),
  flushSave,
  async call(request, signal) {
    const directory = workspaceStore.project?.directory;
    if (!directory) throw new Error("请先打开工作区");
    const callSignal = AbortSignal.any([signal, controlLifetime.signal]);
    const checkDirectory = () => {
      callSignal.throwIfAborted();
      if (directory !== workspaceStore.project?.directory) throw new Error("工作区已切换，本次调用已停止");
    };
    checkDirectory();
    if (request.name === "switchPanel") {
      if (request.args.panel !== "canvas" && request.args.panel !== "document" && request.args.panel !== "timeline") throw new Error("未知面板");
      if (!(await switchPanel(request.args.panel))) throw new Error("面板切换失败，请检查文档是否保存成功");
      if (request.args.panel === "document") await waitForControlValue(() => documentPanelRef.value?.ready ? documentPanelRef.value : undefined, callSignal);
      checkDirectory();
      return { panel: activePanel.value };
    }
    if (["getDocument", "openDocument", "writeDocument"].includes(request.name)) {
      if (!(await switchPanel("document"))) throw new Error("文档面板无法打开");
      const panel = await waitForControlValue(() => documentPanelRef.value?.ready ? documentPanelRef.value : undefined, callSignal);
      checkDirectory();
      if (request.name === "openDocument") await panel.openDocument(request.args, callSignal);
      if (request.name === "writeDocument") await panel.writeDocument(request.args, callSignal);
      checkDirectory();
      return panel.getDocument();
    }
    if (!(await switchPanel("canvas"))) throw new Error("画布面板无法打开");
    const context = await waitForControlValue(
      () => (canvasPanelRef.value?.canvasReady || (!canvasPanelRef.value?.canvasId && canvasPanelRef.value?.canvasListReady) ? canvasPanelRef.value.getCanvasContext() : undefined),
      callSignal
    );
    checkDirectory();
    return context.call({ name: request.name, args: request.args }, callSignal);
  },
});

async function flushSave() {
  await documentPanelRef.value?.flushSave();
  await timelinePanelRef.value?.flushSave();
  await canvasPanelRef.value?.flushSave();
}

const switchingProject = ref(false);
async function changeSidebarProject<T>(action: () => Promise<T>) {
  if (switchingProject.value) return;
  switchingProject.value = true;
  try {
    return await action();
  } catch (error) {
    if (!controlLifetime.signal.aborted) ElMessage.error(error instanceof Error ? error.message : translate("无法打开项目，请重试"));
  } finally {
    switchingProject.value = false;
  }
}

async function prepareProjectSwitch() {
  if (canvasPanelRef.value?.saveBusy || sendingVideo.value || generatingFilm || previs.value) {
    throw new Error(translate("项目正在处理，请稍后再切换"));
  }
  await flushSave();
}

async function showOpenedProject(mode: ProjectMode | undefined) {
  const panel = mode === "edit" ? "timeline" : "canvas";
  activePanel.value = panel;
  await router.replace({ query: { panel } });
}

function openSidebarProject(project: Project, mode?: ProjectMode) {
  return changeSidebarProject(async () => {
    const current = workspaceStore.project;
    if (current?.directory !== project.directory) {
      await prepareProjectSwitch();
      const opened = await workspaceStore.openProject(project.directory, project.directory, controlLifetime.signal, project.mode);
      await showOpenedProject(mode ?? opened.mode);
      return opened;
    }
    // 点击当前项目名也应回到项目默认工具。打开指定会话时，以会话模式为准。
    const panel = (mode ?? current.mode) === "edit" ? "timeline" : "canvas";
    if (!await switchPanel(panel)) return;
    await router.replace({ query: { panel } });
    return current;
  });
}

function createSidebarProject(mode: ProjectMode) {
  return changeSidebarProject(async () => {
    await prepareProjectSwitch();
    const opened = await workspaceStore.createProject(mode, controlLifetime.signal);
    await showOpenedProject(opened.mode);
    return true;
  });
}

const canvasMenu = computed(() => activePanel.value === "canvas" && workspaceStore.project ? {
  canvasBlocked: !canvasPanelRef.value?.canvasReady || settingsVisible.value,
  hand: selectedTool.value === "hand",
  sendBlocked: !canvasPanelRef.value?.selectedVideoOutput || sendingVideo.value,
  previsBlocked: !!previs.value || !canvasPanelRef.value?.canvasListReady,
  hasScene: !!selectedDramaScene.value,
  sceneBlocked: openingPrevis.value || !!previs.value || settingsVisible.value,
  hasShot: !!selectedDramaShot.value,
  shotBlocked: preparingShot.value || settingsVisible.value || !canvasPanelRef.value?.canvasReady,
} : undefined);

defineExpose({
  agentMode: computed(() => activePanel.value === "timeline" ? "edit" as const : "canvas" as const),
  agentReady: computed(() => activePanel.value === "timeline" ? !!timelinePanelRef.value?.ready : !!getCanvasContext()),
  canvasMenu,
  runCanvasCommand,
  getCanvasContext,
  getMentionSource,
  activateCanvas: () => switchPanel("canvas"),
  async openFilmTimeline() {
    if (!await switchPanel("timeline")) return;
    await router.replace({ query: { ...route.query, panel: "timeline" } });
  },
  navigationBusy: switchingProject,
  openSidebarProject,
  createSidebarProject,
});

onBeforeRouteLeave(async () => {
  if (switchingProject.value || generatingFilm || canvasPanelRef.value?.saveBusy) {
    ElMessage.warning("画布操作尚未完成，请稍后退出");
    return false;
  }
  try {
    await flushSave();
    return true;
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error
      ? error.message
      : translate("项目保存失败");
    const leave = await ElMessageBox.confirm(`无法保存项目：${message}。文件或目录可能已被移动或删除。仍然退出将丢弃尚未保存的修改。`, "项目未保存", {
      type: "warning",
      confirmButtonText: "仍然退出",
      cancelButtonText: "留在项目",
      closeOnClickModal: false,
    }).then(
      () => true,
      () => false
    );
    if (leave) {
      documentPanelRef.value?.cancelSave();
      canvasPanelRef.value?.cancelSave();
    }
    return leave;
  }
});

const sendingVideo = ref(false);

// 剪辑→画布：选中片段直接在画布上生成视频节点，不切换面板。
async function sendClipToCanvas(studioVideo?: { path: string; name: string; mimeType: string }, studioDirectory?: string, studioCanvasKey?: string) {
  const directory = workspaceStore.project?.directory;
  if (studioVideo && (!studioDirectory || studioDirectory !== directory)) return;
  const canvas = canvasPanelRef.value;
  const timeline = timelinePanelRef.value;
  if (!directory || !canvas || !timeline) return;
  const video = studioVideo ?? timeline.getSelectedVideo();
  if (!video) return;
  try {
    if (studioVideo) {
      if (!studioCanvasKey) throw new Error(translate("画布尚未就绪"));
      await canvas.addStudioVideo(directory, studioCanvasKey, video);
    } else {
      if (!canvas.canvasId) throw new Error(translate("画布尚未就绪"));
      await canvas.addTemplateVideo(directory, canvas.canvasId, video);
    }
    ElMessage.success(translate("片段已作为视频节点添加到画布"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("发送到画布失败"));
  }
}

const openFilmAvailable = ref(false);
function updateStudioAvailability() {
  openFilmAvailable.value = (window as Window & { lumoOpenFilmAvailable?: boolean }).lumoOpenFilmAvailable === true;
}
window.addEventListener("lumo:open-film-available", updateStudioAvailability);
updateStudioAvailability();
onScopeDispose(() => window.removeEventListener("lumo:open-film-available", updateStudioAvailability));

async function sendVideoToTimeline() {
  const video = canvasPanelRef.value?.selectedVideoOutput;
  const directory = workspaceStore.project?.directory;
  if (!video || !directory || sendingVideo.value) return;
  sendingVideo.value = true;
  try {
    if (!await switchPanel("timeline")) return;
    const signal = AbortSignal.any([controlLifetime.signal, AbortSignal.timeout(20000)]);
    const timeline = await waitForControlValue(() => timelinePanelRef.value?.ready ? timelinePanelRef.value : undefined, signal);
    if (workspaceStore.project?.directory !== directory) throw new Error(translate("工作目录已切换"));
    if (openFilmAvailable.value) {
      if (!timeline.openStudio(video.path)) ElMessage.warning(translate("未能发送到剪辑，请稍后重试"));
      return;
    }
    await timeline.appendCanvasVideo(video);
    ElMessage.success(translate("视频已追加到时间线"));
  } catch (error) {
    if (!controlLifetime.signal.aborted) ElMessage.error(error instanceof Error ? error.message : translate("发送到剪辑失败"));
  } finally {
    sendingVideo.value = false;
  }
}

async function switchPanel(value: string | number | boolean) {
  if (value !== "canvas" && value !== "document" && value !== "timeline") return false;
  if (value === "timeline" && generatingFilm && !timelinePanelRef.value) {
    ElMessage.info(translate("成片时间线正在生成，请完成后打开"));
    return false;
  }
  try {
    if (activePanel.value === "document") await documentPanelRef.value?.flushSave();
    const changed = activePanel.value !== value;
    activePanel.value = value;
    await nextTick();
    if (changed) anonymousData.track(value === "canvas" ? "workspace.canvas" : value === "timeline" ? "workspace.timeline" : "workspace.document");
    return true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "文本保存失败");
    return false;
  }
}

function readDocumentNode(directory: string, canvasPath: string, nodeId: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.readDocumentNode(directory, canvasPath, nodeId);
}

function readDocumentNodes(directory: string, options?: DocumentNodeOptions) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.readDocumentNodes(directory, options);
}

async function focusDocumentNode(directory: string, canvasPath: string, nodeId: string) {
  if (!directory || workspaceStore.project?.directory !== directory) throw new Error("工作目录已切换，请重新选择节点");
  if (!await switchPanel("canvas")) throw new Error("画布面板无法打开");
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  await canvasPanelRef.value.focusDocumentNode(directory, canvasPath, nodeId);
}

function mountDocumentNode(directory: string, canvasPath: string, nodeId: string, target: HTMLElement) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.mountDocumentNode(directory, canvasPath, nodeId, target);
}

function resolveDocumentNodeFile(directory: string, path: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.resolveDocumentNodeFile(directory, path);
}

function observeDocumentNode(directory: string, canvasPath: string, nodeId: string, onState: (state: { dirty: boolean; error: string; deleted: boolean }) => void) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.observeDocumentNode(directory, canvasPath, nodeId, onState);
}

async function flushDocumentNodes() {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  await canvasPanelRef.value.flushSave();
}

function performFileAction(directory: string, action: "copy" | "rename" | "move" | "delete", path: string, target?: string, nodeId?: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.performFileAction(directory, action, path, target, nodeId);
}

function saveDocumentNode(directory: string, canvasPath: string, nodeId: string, handleId: string, text: string, expectedText?: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.saveDocumentNode(directory, canvasPath, nodeId, handleId, text, expectedText);
}
</script>

<style scoped lang="scss">
.workspacePage {
  position: relative;
  width: 100%;
  height: 100dvh;
  background-color: var(--el-bg-color);

  :deep(.canvasMenu),
  :deep(.balanceCard),
  :deep(.canvasControlsCard) {
    background: color-mix(in srgb, var(--el-bg-color-overlay) 70%, transparent);
    backdrop-filter: blur(6px);
    border-color: var(--el-border-color-light);
    box-shadow: var(--el-box-shadow-light);
  }

  .canvasPanel {
    position: absolute;
    inset: 0;
    width: 100%;
    container: canvasWorkspace / inline-size;

    &.backgroundPanel {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
  }


}

.helpMenu {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .helpAction {
    justify-content: flex-start;
    margin-left: 0;
  }
}

.contactContent {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;

  .contactTip {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    line-height: 1.7;
  }
}
</style>
