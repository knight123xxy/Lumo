<template>
  <div class="workspaceLayout">
  <main class="workspacePage" :inert="workspaceStore.projectLoadingVisible" :style="{ '--agentWidth': `${agentVisible ? agentWidth : 0}px` }">
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
        :openAutomaticFilm="openAutomaticFilm"
        :openFilmAvailable="openFilmAvailable"
        :canvasKey="canvasPanelRef?.canvasReady ? canvasPanelRef.activeKey : undefined"
        @automaticFilmOpened="consumeAutomaticFilm"
        @send-to-canvas="sendClipToCanvas"
        @openAgent="agentVisible = true" />
    </keep-alive>
    <workspaceMenu class="workspaceMenu" @openSettings="settingsVisible = true" />
    <div class="workspaceTools">

      <div class="bottomTools">
        <el-card v-if="activePanel === 'canvas'" class="toolMenu" shadow="never" :bodyStyle="{ padding: '2px 4px' }">
          <div class="toolMenuContent" role="toolbar" aria-label="画布工具">
            <el-button :disabled="!canvasPanelRef?.canvasListReady" @click="dramaVisible = true">{{ translate('短剧工作流') }}</el-button>
            <el-button :disabled="!canvasPanelRef?.canvasReady" :loading="openingTemplate" @click="openCanvasTemplate">{{ translate('整集模板') }}</el-button>
            <el-button :disabled="!canvasPanelRef?.canvasListReady" @click="marketingVisible = true">{{ translate('营销脚本') }}</el-button>
            <el-button :disabled="!canvasPanelRef?.canvasListReady" @click="canvasFilmVisible = true">{{ translate('一键成片') }}</el-button>
            <el-button v-if="!selectedDramaScene" :disabled="!!previs || !canvasPanelRef?.canvasListReady" @click="previsInputVisible = true">{{ translate('白模预演') }}</el-button>
            <el-button v-if="selectedDramaScene" :disabled="openingPrevis || !!previs || settingsVisible" :loading="openingPrevis" @click="openScenePrevis">
              {{ translate('白模预演') }}
            </el-button>
            <el-button v-if="selectedDramaShot" :disabled="preparingShot || settingsVisible || !canvasPanelRef?.canvasReady" :loading="preparingShot" @click="prepareShotVideo">
              {{ translate('转为视频生成节点') }}
            </el-button>
            <el-button v-if="canvasPanelRef?.selectedVideoOutput" :loading="sendingVideo" :disabled="sendingVideo || settingsVisible" @click="sendVideoToTimeline()">
              {{ translate('发送到剪辑') }}
            </el-button>
            <el-button v-if="openFilmAvailable && canvasPanelRef?.selectedVideoOutput" :loading="sendingVideo" :disabled="sendingVideo || settingsVisible" @click="sendVideoToTimeline(true)">发送到 OpenFilm Studio</el-button>
            <el-tooltip content="添加节点" placement="top" :showArrow="false" :hideAfter="0" :enterable="false" :triggerKeys="[]">
              <el-button class="toolButton addNodeButton" :disabled="!canvasPanelRef?.canvasReady || settingsVisible" aria-label="添加节点" aria-haspopup="menu" @click="canvasPanelRef?.addNodeAtPointer()">
                <icon-plus :size="18" aria-hidden="true" />
              </el-button>
            </el-tooltip>
            <el-tooltip :content="selectedTool === 'move' ? '移动工具，点击切换为抓手' : '抓手工具，点击切换为移动'" placement="top" :showArrow="false" :hideAfter="0" :enterable="false" :triggerKeys="[]">
              <el-button
                class="toolButton"
                text
                :type="selectedTool === 'hand' ? 'primary' : 'default'"
                :aria-pressed="selectedTool === 'hand'"
                aria-label="切换抓手/移动工具"
                @click="selectedTool = selectedTool === 'move' ? 'hand' : 'move'">
                <component :is="selectedTool === 'move' ? IconPointer : IconHandStop" :size="18" aria-hidden="true" />
              </el-button>
            </el-tooltip>
            <el-tooltip content="搜索节点" placement="top" :showArrow="false" :hideAfter="0" :enterable="false" :triggerKeys="[]">
              <el-button class="toolButton" text :disabled="!canvasPanelRef?.canvasReady || settingsVisible" aria-label="搜索节点" @click="canvasPanelRef?.openNodeSearch()">
                <icon-search :size="18" aria-hidden="true" />
              </el-button>
            </el-tooltip>
            <el-tooltip :showArrow="false" content="帮助" placement="top" :hideAfter="0" :enterable="false" :triggerKeys="[]" :disabled="helpVisible">
              <span class="toolTrigger">
                <el-popover v-model:visible="helpVisible" trigger="click" placement="top-end" :width="196">
                  <template #reference>
                    <el-button class="toolButton" text aria-label="帮助">
                      <icon-help :size="18" />
                    </el-button>
                  </template>
                  <div class="helpMenu">
                    <el-button
                      class="helpAction"
                      tag="a"
                      text
                      :icon="IconBook"
                      href="https://qcn7xdsqgc4z.feishu.cn/docx/RXFqdgR2Xo0dXZxGfd0cZCGgnwf"
                      target="_blank"
                      rel="noopener noreferrer"
                      @click="helpVisible = false">
                      使用教程
                    </el-button>
                    <el-button
                      class="helpAction"
                      tag="a"
                      text
                      :icon="IconBug"
                      href="https://docs.qq.com/smartsheet/form/EmvmQBrmlPmr%2Fss_vsqk2v%2FvhiGzE?tab=ss_vsqk2v"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Lumo 需求/BUG反馈表"
                      @click="helpVisible = false">
                      汇报 BUG
                    </el-button>
                    <el-button class="helpAction" text :icon="IconBrandWechat" @click="showContact('community')">加入交流群</el-button>
                    <el-button class="helpAction" text :icon="IconBriefcase" @click="showContact('business')">商务合作</el-button>
                  </div>
                </el-popover>
              </span>
            </el-tooltip>
          </div>
        </el-card>
        <el-tooltip v-if="!agentVisible" content="Lumo Agent" placement="top" :showArrow="false" :hideAfter="0">
          <el-button
            class="agentButton"
            :class="{ standalone: activePanel !== 'canvas' }"
            :aria-expanded="agentVisible"
            aria-label="Lumo Agent"
            aria-controls="agentPanel"
            @click="agentVisible = !agentVisible"></el-button>
        </el-tooltip>
      </div>
    </div>
    <floatingAgent v-model="agentVisible" :inert="workspaceStore.projectLoadingVisible" @resize="agentWidth = $event" />
    <sceneProject v-if="previs" :directory="previs.directory" :projectPath="previs.path" :script="previs.script" @close="previs = undefined" />
    <el-dialog v-model="dramaVisible" :title="translate('短剧工作流')" width="min(620px, calc(100vw - 32px))"
      :closeOnClickModal="!dramaBusy" :closeOnPressEscape="!dramaBusy" :showClose="!dramaBusy">
      <dramaDraft v-if="dramaVisible && workspaceStore.project" :key="workspaceStore.project.directory" v-model:script="dramaScript"
        :directory="workspaceStore.project.directory" @busy="dramaBusy = $event" @saved="openWorkspaceDramaDraft" />
    </el-dialog>
    <el-dialog v-model="marketingVisible" :title="translate('营销脚本')" width="min(620px, calc(100vw - 32px))"
      :closeOnClickModal="!marketingBusy" :closeOnPressEscape="!marketingBusy" :showClose="!marketingBusy">
      <marketingDraft v-if="marketingVisible && workspaceStore.project" :key="workspaceStore.project.directory"
        :directory="workspaceStore.project.directory" @busy="marketingBusy = $event" @saved="openWorkspaceMarketingDraft" />
    </el-dialog>
    <el-dialog v-model="previsInputVisible" :title="translate('白模预演')" width="min(620px, calc(100vw - 32px))">
      <el-input v-model="previsScript" type="textarea" :rows="6" :maxlength="6000" :aria-label="translate('单场剧本')" />
      <template #footer>
        <el-button type="primary" :disabled="!previsScript.trim()" @click="openStandaloneWorkspacePrevis">{{ translate('生成白模预演') }}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="canvasFilmVisible" :title="translate('一键成片')" width="min(620px, calc(100vw - 32px))"
      :closeOnClickModal="!canvasFilmBusy" :closeOnPressEscape="!canvasFilmBusy" :showClose="!canvasFilmBusy">
      <filmDraft v-if="canvasFilmVisible && workspaceStore.project" :key="workspaceStore.project.directory" v-model:topic="canvasFilmTopic"
        :directory="workspaceStore.project.directory" :existingTimeline="timelinePanelRef?.getTemplateTimeline()" @busy="canvasFilmBusy = $event" @generated="openCanvasFilmDraft" />
    </el-dialog>
    <templateDialog v-if="canvasTemplate" :modelValue="true" canvas :directory="canvasTemplate.directory" :assets="canvasTemplate.timeline.assets.value"
      :busy="canvasTemplate.timeline.busy.value" :importFiles="canvasTemplate.timeline.importFiles" :saveVideo="saveCanvasTemplateVideo" @update:modelValue="closeCanvasTemplate" />
    <settings ref="settingsDialog" v-model="settingsVisible" />
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
  </div>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { computed, defineAsyncComponent, nextTick, onMounted, onScopeDispose, provide, ref, shallowRef, watch, type ComponentPublicInstance } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import axios from "axios";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { IconVector, IconFileText, IconMovie, IconPointer, IconHandStop, IconPlus, IconSearch, IconHelp, IconBook, IconBug, IconBrandWechat, IconBriefcase } from "@tabler/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { QRCode } from "tdesign-vue-next";
import settings from "@/components/settings/index.vue";
import modelLoginGuide from "@/components/modelLoginGuide.vue";
import { multiTenantEnabled, lumoAccountToken } from "@/stores/settings";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { registerWorkspaceControl, waitForControlValue } from "@/lib/mcpControl";
import anonymousData from "@/lib/anonymousData";
import { useProviderBalances } from "@/lib/providerBilling";
import canvasPanel from "./panels/canvas/canvasHost.vue";
import { isScriptDraftPath } from "@/pages/home/pages/agentWorkspace/scriptBreakdown";
import filmDraft from "@/pages/home/pages/agentWorkspace/filmDraft.vue";
import dramaDraft from "@/pages/home/pages/agentWorkspace/dramaDraft.vue";
import marketingDraft from "@/pages/home/pages/agentWorkspace/marketingDraft.vue";
import type { DocumentNodeOptions } from "./panels/canvas/canvasFiles";
import workspaceMenu from "./components/workspaceMenu.vue";
import floatingAgent from "./components/floatingAgent.vue";
import templateDialog from "./panels/timeline/components/templateDialog.vue";
import { useTimeline } from "./panels/timeline/useTimeline";

const documentPanel = defineAsyncComponent(() => import("./panels/document/index.vue"));
const timelinePanel = defineAsyncComponent(() => import("./panels/timeline/index.vue"));

const route = useRoute();
const router = useRouter();
const openAutomaticFilm = ref(route.query.automaticFilm === "1");
// 直接用 useWorkspaceStore()，避免在 workspaceStore 常量初始化前触发 TDZ。
const projectMode = () => useWorkspaceStore().project?.mode;
const activePanel = ref<"canvas" | "document" | "timeline">(
  openAutomaticFilm.value || route.query.panel === "timeline" || projectMode() === "edit" ? "timeline" : "canvas",
);
function consumeAutomaticFilm() {
  openAutomaticFilm.value = false;
  const query = { ...route.query };
  delete query.automaticFilm;
  void router.replace({ query });
}
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
const panelOptions = [
  { label: "画布", value: "canvas", icon: IconVector },
  { label: "剪辑", value: "timeline", icon: IconMovie },
  { label: "文档", value: "document", icon: IconFileText },
];
// ACT: Agent 面板默认收起，避免遮住预览与属性面板；一键成片流程仍自动展开。
const agentVisible = ref(openAutomaticFilm.value);
watch(() => route.query.agent, value => {
  if (value === "1") agentVisible.value = true;
});
const agentWidth = ref(0);
const settingsVisible = ref(false);
const settingsDialog = ref<InstanceType<typeof settings>>();
provide("openSettingsPanel", (id: string) => settingsDialog.value?.openPanel(id));
provide("modelLoginGuide", computed(() => !multiTenantEnabled.value && !lumoAccountToken.value ? modelLoginGuide : undefined));
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
const marketingVisible = ref(false);
const marketingBusy = ref(false);

async function openWorkspaceMarketingDraft(directory: string, path: string) {
  const panel = canvasPanelRef.value;
  if (!panel || workspaceStore.project?.directory !== directory) return;
  try {
    await panel.activateCanvas(path);
    marketingVisible.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("打开营销脚本失败"));
  }
}

const canvasFilmVisible = ref(route.query.film === "1");
const canvasFilmTopic = ref("");
const canvasFilmBusy = ref(false);
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

async function openCanvasFilmDraft(directory: string) {
  if (workspaceStore.project?.directory !== directory) return;
  canvasFilmVisible.value = false;
  await switchPanel("timeline");
}
watch(canvasFilmVisible, visible => {
  if (visible || route.query.film !== "1") return;
  const query = { ...route.query };
  delete query.film;
  void router.replace({ query });
});

const dramaVisible = ref(route.query.drama === "1");
const dramaScript = ref("");
const dramaBusy = ref(false);

async function openWorkspaceDramaDraft(directory: string, path: string) {
  if (workspaceStore.project?.directory !== directory) return;
  workspaceStore.updateProjectMetadata(directory, { category: "drama" });
  try {
    await canvasPanelRef.value?.activateCanvas(path);
    dramaVisible.value = false;
    dramaScript.value = "";
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("打开分镜草稿失败"));
  }
}

watch(dramaVisible, visible => {
  if (visible || route.query.drama !== "1") return;
  const query = { ...route.query };
  delete query.drama;
  void router.replace({ query });
});
const openingTemplate = ref(false);
const canvasTemplate = shallowRef<{ directory: string; canvasPath: string; timeline: ReturnType<typeof useTimeline>; ownsTimeline: boolean }>();

function closeCanvasTemplate() {
  if (canvasTemplate.value?.ownsTimeline) canvasTemplate.value.timeline.dispose();
  canvasTemplate.value = undefined;
}
onScopeDispose(closeCanvasTemplate);

async function openCanvasTemplate() {
  const directory = workspaceStore.project?.directory;
  const panel = canvasPanelRef.value;
  if (!directory || !panel?.canvasReady || canvasTemplate.value || openingTemplate.value) return;
  const canvasPath = panel.canvasId;
  openingTemplate.value = true;
  const existingTimeline = timelinePanelRef.value?.getTemplateTimeline();
  const timeline = existingTimeline ?? useTimeline(directory);
  try {
    if (existingTimeline) {
      await waitForControlValue(() => timeline.ready.value || undefined, controlLifetime.signal);
    } else {
      await timeline.load(true);
    }
    if (!controlLifetime.signal.aborted && workspaceStore.project?.directory === directory && canvasPanelRef.value?.canvasId === canvasPath) {
      canvasTemplate.value = { directory, canvasPath, timeline, ownsTimeline: !existingTimeline };
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("读取剪辑工程失败"));
  } finally {
    if (!existingTimeline && canvasTemplate.value?.timeline !== timeline) timeline.dispose();
    openingTemplate.value = false;
  }
}

provide("openWorkspaceTemplate", async () => {
  try {
    if (!await switchPanel("canvas")) return;
    await waitForControlValue(() => canvasPanelRef.value?.canvasReady || undefined, AbortSignal.any([controlLifetime.signal, AbortSignal.timeout(10000)]));
    await openCanvasTemplate();
  } catch (error) {
    if (!controlLifetime.signal.aborted) ElMessage.error(error instanceof Error ? error.message : translate("画布尚未就绪"));
  }
});

async function saveCanvasTemplateVideo(video: { path: string; name: string; mimeType: string }) {
  const target = canvasTemplate.value;
  const panel = canvasPanelRef.value;
  if (!target || !panel) throw new Error(translate("画布尚未就绪"));
  await panel.addTemplateVideo(target.directory, target.canvasPath, video);
}

const sceneProject = defineAsyncComponent(() => import("@/pages/home/pages/trumanMap/sceneProject.vue"));
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
watch([() => route.query.template, () => canvasPanelRef.value?.canvasReady], async ([template, ready]) => {
  if (template !== "1" || !ready || activePanel.value !== "canvas") return;
  await openCanvasTemplate();
  if (canvasTemplate.value && route.query.template === "1") {
    const query = { ...route.query };
    delete query.template;
    await router.replace({ query });
  }
}, { flush: "post" });
watch(() => canvasPanelRef.value?.canvasListReady, ready => {
  workspaceStore.projectLoading = !ready;
}, { immediate: true });
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
provide("canvas", () => {
  const canvas = canvasPanelRef.value?.getCanvasContext();
  const timeline = timelinePanelRef.value;
  const studioSelection = timeline?.studioEditAvailable() === true;
  if (!studioSelection || !timeline) return canvas;
  return {
    ...canvas,
    id: canvas?.id ?? "",
    tools: canvas?.tools ?? [],
    studioSelection,
    call(request: { name: string; args: Record<string, unknown> }, signal?: AbortSignal) {
      if (request.name === "setStudioClipVolume") return timeline.setStudioClipProperty("volume", request.args, signal);
      if (request.name === "setStudioClipSpeed") return timeline.setStudioClipProperty("speed", request.args, signal);
      if (request.name === "trimStudioClip") return timeline.setStudioClipProperty("time", request.args, signal);
      if (request.name === "setStudioClipDisabled") return timeline.setStudioClipProperty("disabled", request.args, signal);
      if (!canvas) throw new Error("画布尚未就绪");
      return canvas.call(request, signal);
    },
  };
});
provide("mentionCanvas", () => canvasPanelRef.value?.mentionSource);
provide("activateCanvasPanel", () => switchPanel("canvas"));
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
async function openSidebarProject(project: Project, file?: string) {
  if (switchingProject.value) return;
  switchingProject.value = true;
  try {
    if (workspaceStore.project?.directory !== project.directory) {
      if (canvasPanelRef.value?.saveBusy || sendingVideo.value || openingTemplate.value || canvasTemplate.value || canvasFilmBusy.value || dramaBusy.value || marketingBusy.value || previs.value) {
        throw new Error(translate("项目正在处理，请稍后再切换"));
      }
      await flushSave();
      const signal = controlLifetime.signal;
      const mode = project.mode ?? ((await useWorkspaceFiles(project.directory).list("", signal)).entries.some(entry => entry.type === "file" && entry.name === "timeline.json") ? "edit" : "canvas");
      await workspaceStore.openProject(project.directory, project.directory, signal, mode);
      const panel = workspaceStore.project?.mode === "edit" ? "timeline" : "canvas";
      activePanel.value = panel;
      await router.replace({ query: { panel } });
    }
    const directory = workspaceStore.project?.directory;
    if (directory && file) {
      workspaceStore.pendingAgentSession = { directory, file };
      agentVisible.value = true;
    }
  } catch (error) {
    if (!controlLifetime.signal.aborted) ElMessage.error(error instanceof Error ? error.message : translate("无法打开项目，请重试"));
  } finally {
    switchingProject.value = false;
  }
}

onBeforeRouteLeave(async () => {
  if (canvasPanelRef.value?.saveBusy) {
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

async function sendVideoToTimeline(openFilm = false) {
  const video = canvasPanelRef.value?.selectedVideoOutput;
  const directory = workspaceStore.project?.directory;
  if (!video || !directory || sendingVideo.value) return;
  sendingVideo.value = true;
  try {
    if (!await switchPanel("timeline")) return;
    const signal = AbortSignal.any([controlLifetime.signal, AbortSignal.timeout(20000)]);
    const timeline = await waitForControlValue(() => timelinePanelRef.value?.ready ? timelinePanelRef.value : undefined, signal);
    if (workspaceStore.project?.directory !== directory) throw new Error(translate("工作目录已切换"));
    if (openFilm) {
      timeline.openStudio(video.path);
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
.workspaceLayout {
  height: 100dvh;
  .workspacePage { flex: 1; min-width: 0; }
}
.workspacePage {
  position: relative;
  width: 100%;
  height: 100dvh;
  background-color: var(--el-bg-color);

  :deep(.workspaceMenu > .el-card),
  :deep(.canvasMenu),
  :deep(.balanceCard),
  :deep(.canvasControlsCard),
  .toolMenu {
    background: color-mix(in srgb, var(--el-bg-color-overlay) 70%, transparent);
    backdrop-filter: blur(6px);
    border-color: var(--el-border-color-light);
    box-shadow: var(--el-box-shadow-light);
  }

  .canvasPanel {
    position: absolute;
    inset: 0;
    width: calc(100% - var(--agentWidth, 0px));
    container: canvasWorkspace / inline-size;

    &.backgroundPanel {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
  }

  .workspaceMenu {
    position: absolute;
    top: 15px;
    left: 15px;
    z-index: 5;
  }

  .workspaceTools {
    position: absolute;
    inset: 0;
    width: calc(100% - var(--agentWidth, 0px));
    container: workspaceTools / inline-size;
    pointer-events: none;

    .bottomTools {
      position: absolute;
      bottom: 15px;
      left: 50%;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 8px;
      transform: translateX(-50%);
      pointer-events: auto;

      .toolMenu {
        flex-shrink: 0;
        transition: none;

        .toolMenuContent {
          display: flex;
          align-items: center;
          gap: 2px;

          .toolButton {
            width: 28px;
            height: 28px;
            margin: 0;
            padding: 0;

            &.addNodeButton {
              margin-right: 6px;
              color: var(--el-bg-color);
              background: var(--el-text-color-primary);
              border-color: transparent;

              &:hover { opacity: 0.85; }
              &.is-disabled { opacity: 0.45; }
            }
          }

          .toolTrigger { display: inline-flex; }

          .el-divider { margin: 0; }
        }
      }

      .agentButton {
        position: absolute;
        left: calc(100% + 8px);
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        margin: 0;
        padding: 0;
        border: 1px solid var(--color-border-2);
        border-radius: 50%;
        background: var(--color-panel-2);
        color: var(--color-accent);
        transition: transform 180ms ease, border-color 180ms ease, background-color 180ms ease;

        &.standalone {
          position: relative;
          left: auto;
        }

        &:hover {
          transform: translateY(-1px);
          border-color: var(--color-accent);
          background: var(--color-accent-soft);
        }

        &:active {
          transform: scale(0.95);
        }

        &:focus-visible {
          outline: 2px solid var(--el-color-primary);
          outline-offset: 3px;
        }

        .agentLogo {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          background: currentColor;
          mask-size: contain;
          mask-position: center;
          mask-repeat: no-repeat;
        }

        @media (prefers-reduced-motion: reduce) {
          transition: none;
        }
      }
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
