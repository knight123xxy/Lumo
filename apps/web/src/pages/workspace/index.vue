<template>
  <div class="workspaceLayout" :class="{ agentOpen: agentVisible }">
    <appSidebar
      v-model:collapsed="railCollapsed"
      :disabled="workspaceStore.projectLoadingVisible || switchingProject"
      @create="selectConversationProject()"
      @createProject="creationVisible = true"
      @createChat="selectConversationProject"
      @section="goHomeSection"
      @openProject="project => openSidebarProject(project)"
      @openChat="openSidebarProject"
      @settings="settingsVisible = true"
      @account="settingsDialog?.openPanel('account')"
      @update="settingsDialog?.openPanel('about')"
      @deviceLink="settingsDialog?.openPanel('deviceLink')" />
    <aside v-show="agentVisible" :inert="workspaceStore.projectLoadingVisible" id="agentDock" class="agentDock" :aria-label="translate('Lumo Agent')">
      <agent ref="agentRef" v-model="agentVisible" @command="runCanvasCommand">
        <template #menuItems>
          <template v-if="activePanel === 'canvas'">
            <el-dropdown-item divided command="add" :disabled="!canvasPanelRef?.canvasReady || settingsVisible">{{ translate('添加节点') }}</el-dropdown-item>
            <el-dropdown-item command="search" :disabled="!canvasPanelRef?.canvasReady || settingsVisible">{{ translate('搜索节点') }}</el-dropdown-item>
            <el-dropdown-item command="hand">{{ selectedTool === 'hand' ? translate('切换为移动工具') : translate('切换为抓手') }}</el-dropdown-item>
            <el-dropdown-item command="sendTimeline" :disabled="!canvasPanelRef?.selectedVideoOutput || sendingVideo">{{ translate('发送到剪辑') }}</el-dropdown-item>
            <el-dropdown-item command="previs" :disabled="!!previs || !canvasPanelRef?.canvasListReady">{{ translate('白模预演') }}</el-dropdown-item>
            <el-dropdown-item divided command="wf-drama">{{ translate('短剧工作流表单') }}</el-dropdown-item>
            <el-dropdown-item command="wf-template">{{ translate('整集模板表单') }}</el-dropdown-item>
            <el-dropdown-item command="wf-marketing">{{ translate('营销脚本表单') }}</el-dropdown-item>
            <el-dropdown-item command="wf-film">{{ translate('一键成片表单') }}</el-dropdown-item>
            <el-dropdown-item command="previsScene" v-if="selectedDramaScene" :disabled="openingPrevis || !!previs || settingsVisible">{{ translate('预演当前场景') }}</el-dropdown-item>
            <el-dropdown-item command="shot" v-if="selectedDramaShot" :disabled="preparingShot || settingsVisible || !canvasPanelRef?.canvasReady">{{ translate('转为视频生成节点') }}</el-dropdown-item>
            <el-dropdown-item command="help">{{ translate('帮助与反馈') }}</el-dropdown-item>
          </template>
        </template>
      </agent>
    </aside>
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
        :openAutomaticFilm="openAutomaticFilm"
        @automaticFilmOpened="consumeAutomaticFilm"
        @send-to-canvas="sendClipToCanvas" />
    </keep-alive>
    <div v-if="!agentVisible" class="panelReopen">
      <el-tooltip v-if="!agentVisible" :content="translate('展开 Lumo Agent')" placement="bottom" :showArrow="false">
      <el-button class="agentReopen" :aria-expanded="false" :aria-label="translate('展开 Lumo Agent')" aria-controls="agentDock" @click="agentVisible = true">
          <icon-layout-sidebar-left-expand :size="17" aria-hidden="true" />
        </el-button>
      </el-tooltip>
    </div>
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
    <creationDialog v-model="conversationCreationVisible" v-model:directory="conversationDirectory" conversation
      :projects="workspaceStore.projectList" :busy="creatingConversation" @select="createConversation" />
    <creationDialog v-model="creationVisible" :busy="switchingProject" @select="createProjectHere" />
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
import http from "@/lib/http";
import { createEmptyProject, timelineProjectFile } from "./panels/timeline/timelineModel";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import appSidebar from "@/pages/home/components/appSidebar.vue";
import { IconVector, IconFileText, IconMovie, IconLayoutSidebarLeftExpand } from "@tabler/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { QRCode } from "tdesign-vue-next";
import creationDialog from "@/pages/home/components/creationDialog.vue";
import settings from "@/components/settings/index.vue";
import modelLoginGuide from "@/components/modelLoginGuide.vue";
import { multiTenantEnabled, lumoAccountToken } from "@/stores/settings";
import { useWorkspaceStore, type Project, type ProjectMode } from "@/stores/workspace";
import { registerWorkspaceControl, waitForControlValue } from "@/lib/mcpControl";
import anonymousData from "@/lib/anonymousData";
import { useProviderBalances } from "@/lib/providerBilling";
import canvasPanel from "./panels/canvas/canvasHost.vue";
import { isScriptDraftPath } from "@/pages/home/pages/agentWorkspace/scriptBreakdown";
import filmDraft from "@/pages/home/pages/agentWorkspace/filmDraft.vue";
import dramaDraft from "@/pages/home/pages/agentWorkspace/dramaDraft.vue";
import marketingDraft from "@/pages/home/pages/agentWorkspace/marketingDraft.vue";
import type { DocumentNodeOptions } from "./panels/canvas/canvasFiles";
import agent from "@/components/agent/index.vue";
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
  openAutomaticFilm.value || route.query.panel === "timeline" || route.query.panel !== "canvas" && projectMode() === "edit" ? "timeline" : "canvas",
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
// ACT: 直接带 ?agent=1 打开工作区时不会触发下面的 watch，需要在初始化时就读一次查询参数。
const railCollapsed = ref(false);
const agentVisible = ref(route.query.agent !== "0");
watch(() => route.query.agent, value => {
  if (value === "1") agentVisible.value = true;
});
const agentRef = ref<InstanceType<typeof agent>>();
// 快捷创作：把画布上原来的表单入口收进对话，点击后把任务写进输入框，由 Agent 继续追问与执行。
const agentChips = [
  { id: "drama", label: "短剧工作流", prompt: "用短剧工作流做一条短剧：先按「剧本 → 分镜 → 关键画面 → 分镜视频」拆解，先给方案再逐镜生成。\n主题与要求：" },
  { id: "template", label: "整集模板", prompt: "用整集模板做一条成片。先和我确认模板结构、主题、文案与素材，再开始渲染。\n内容主题：" },
  { id: "marketing", label: "营销脚本", prompt: "写一条营销脚本。先问清产品、目标人群、卖点和投放平台，再输出脚本与分镜。\n产品与卖点：" },
  { id: "film", label: "一键成片", prompt: "用一键成片做一条 15–30 秒的短视频。先确认主题、素材与成片风格，再开始生成草稿。\n主题：" },
  { id: "previs", label: "白模预演", prompt: "把下面这段剧本做成白模预演：先拆分场景、机位和镜头时长，再生成预演。\n剧本：" },
] as const;
function runCanvasCommand(command: string) {
  if (command.startsWith("wf-")) return openWorkflowSettings(command.slice(3));
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

function openWorkflowSettings(id: string) {
  switch (id) {
    case "drama": dramaVisible.value = true; break;
    case "template": void openCanvasTemplate(); break;
    case "marketing": marketingVisible.value = true; break;
    case "film": canvasFilmVisible.value = true; break;
    case "previs": previsInputVisible.value = true; break;
  }
}
// 创作流程收进输入框的加号菜单，面板本身只保留对话与输入。
provide("agentWorkflows", agentChips.map(chip => ({
  id: chip.id,
  label: chip.label,
  run: () => useAgentChip(chip),
})));
function useAgentChip(chip: (typeof agentChips)[number]) {
  agentVisible.value = true;
  void agentRef.value?.appendPrompt(chip.prompt);
}
const conversationCreationVisible = ref(false);
const conversationDirectory = ref("");
const creatingConversation = ref(false);
function selectConversationProject(project?: Project) {
  if (!workspaceStore.projectList.length && !project) return void (creationVisible.value = true);
  conversationDirectory.value = (project ?? workspaceStore.project ?? workspaceStore.projectList[0])?.directory ?? "";
  conversationCreationVisible.value = true;
}
async function createConversation(mode: ProjectMode) {
  const project = workspaceStore.projectList.find(item => item.directory === conversationDirectory.value);
  if (!project || creatingConversation.value) return;
  creatingConversation.value = true;
  try {
    const result = await http<{ file: string }>({ method: "POST", url: "/api/agent/create", data: { directory: project.directory, mode } });
    workspaceStore.agentHistoryChange = { directory: project.directory };
    conversationCreationVisible.value = false;
    await openSidebarProject(project, result.file, mode);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("新建对话失败"));
  } finally { creatingConversation.value = false; }
}
const creationVisible = ref(false);
async function createProjectHere(mode: ProjectMode) {
  if (switchingProject.value) return;
  switchingProject.value = true;
  try {
    const name = mode === "edit" ? translate("未命名剪辑") : translate("未命名画布");
    const project = await http<{ directory: string; name: string }>({ method: "POST", url: "/api/workspaces/create", data: { name } });
    const files = useWorkspaceFiles(project.directory);
    if (mode === "edit") await files.writeJson(timelineProjectFile, createEmptyProject(), true);
    else await files.writeJson("画布1.json", { lumoCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    switchingProject.value = false;
    await openSidebarProject({ ...project, lastOpenedAt: Date.now(), mode });
    creationVisible.value = false;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("无法新建项目，请重试"));
  } finally { switchingProject.value = false; }
}
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
provide("canvas", () => canvasPanelRef.value?.getCanvasContext());
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
function goHome() {
  void router.push("/home");
}

function goHomeSection(section: string) {
  void router.push({ path: "/home", query: { section } });
}
async function openSidebarProject(project: Project, file?: string, sessionMode?: ProjectMode) {
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
    if (directory && file && sessionMode) {
      const panel = sessionMode === "edit" ? "timeline" : "canvas";
      if (!await switchPanel(panel)) return;
      await router.replace({ query: { panel } });
    }
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
async function sendClipToCanvas() {
  const directory = workspaceStore.project?.directory;
  const canvas = canvasPanelRef.value;
  const timeline = timelinePanelRef.value;
  if (!directory || !canvas || !timeline) return;
  const video = timeline.getSelectedVideo();
  if (!video) return;
  try {
    if (!canvas.canvasId || !canvas.canvasReady) throw new Error(translate("画布尚未就绪"));
    await canvas.addTemplateVideo(directory, canvas.canvasId, video);
    ElMessage.success(translate("片段已作为视频节点添加到画布"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("发送到画布失败"));
  }
}

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
  position: relative;
  display: flex;
  height: 100dvh;

  .agentDock {
    display: flex;
    flex: 0 0 clamp(320px, 26vw, 400px);
    flex-direction: column;
    min-width: 0;
    height: 100dvh;
    padding-block-start: var(--titlebarInset, 0px);
    overflow: hidden;
    background: var(--el-bg-color);
    border-inline-end: 1px solid var(--el-border-color-light);

    :deep(.agent) { flex: 1; min-height: 0; }
  }

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

  // 侧栏/Agent 收起后，统一在画布左上角提供展开入口，避开画布菜单。
  .panelReopen {
    position: absolute;
    top: calc(59px + var(--titlebarInset, 0px));
    left: 15px;
    z-index: 6;
    display: flex;
    gap: 6px;

    .el-button {
      width: 32px;
      height: 32px;
      margin: 0;
      padding: 0;
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
