<template>
  <div class="appShell" :class="{ sidebarCollapsed, nativeTitlebar: actualPlatform.isDesktop && actualPlatform.isMac }" :inert="workspaceStore.projectLoadingVisible">
    <button
      class="sidebarToggle"
      type="button"
      :aria-label="translate(sidebarCollapsed ? '展开侧栏' : '收起侧栏')"
      :title="translate(sidebarCollapsed ? '展开侧栏' : '收起侧栏')"
      :aria-expanded="!sidebarCollapsed"
      aria-controls="workspaceSidebar"
      @click="sidebarCollapsed = !sidebarCollapsed">
      <icon-layout-sidebar-left-expand v-if="sidebarCollapsed" :size="16" aria-hidden="true" />
      <icon-layout-sidebar-left-collapse v-else :size="16" aria-hidden="true" />
    </button>
    <appSidebar
      v-show="!sidebarCollapsed"
      :disabled="!currentPage || currentPage.navigationBusy || creatingConversation"
      :activeSection="activeSection"
      @create="projectModeVisible = true"
      @createProject="projectModeVisible = true"
      @createChat="createConversation"
      @section="goSection"
      @openProject="project => currentPage?.openSidebarProject(project)"
      @openChat="openChat"
      @settings="openSettingsPanel()"
      @account="openSettingsPanel('account')"
      @update="openSettingsPanel('about')" />
    <agentColumn v-show="route.path === '/workspace' && workspaceStore.project" ref="agentRef" v-model="agentVisible" :mode="workspacePage?.agentMode ?? workspaceStore.project?.mode ?? 'canvas'" :active="route.path === '/workspace'" @command="runAgentCommand">
      <template #menuItems>
        <template v-if="workspacePage?.canvasMenu">
          <el-dropdown-item divided command="add" :disabled="workspacePage.canvasMenu.canvasBlocked">{{ translate('添加节点') }}</el-dropdown-item>
          <el-dropdown-item command="search" :disabled="workspacePage.canvasMenu.canvasBlocked">{{ translate('搜索节点') }}</el-dropdown-item>
          <el-dropdown-item command="hand">{{ workspacePage.canvasMenu.hand ? translate('切换为移动工具') : translate('切换为抓手') }}</el-dropdown-item>
          <el-dropdown-item command="sendTimeline" :disabled="workspacePage.canvasMenu.sendBlocked">{{ translate('发送到剪辑') }}</el-dropdown-item>
          <el-dropdown-item command="previs" :disabled="workspacePage.canvasMenu.previsBlocked">{{ translate('白模预演') }}</el-dropdown-item>
          <el-dropdown-item v-if="workspacePage.canvasMenu.hasScene" command="previsScene" :disabled="workspacePage.canvasMenu.sceneBlocked">{{ translate('预演当前场景') }}</el-dropdown-item>
          <el-dropdown-item v-if="workspacePage.canvasMenu.hasShot" command="shot" :disabled="workspacePage.canvasMenu.shotBlocked">{{ translate('转为视频生成节点') }}</el-dropdown-item>
          <el-dropdown-item command="help">{{ translate('帮助与反馈') }}</el-dropdown-item>
        </template>
        <template v-if="workspaceStore.project">
          <el-dropdown-item divided command="wf-drama">{{ translate('开始短剧工作流') }}</el-dropdown-item>
          <el-dropdown-item command="wf-template">{{ translate('开始整集模板') }}</el-dropdown-item>
          <el-dropdown-item command="wf-marketing">{{ translate('开始营销脚本') }}</el-dropdown-item>
          <el-dropdown-item command="wf-film">{{ translate('开始一键成片') }}</el-dropdown-item>
        </template>
      </template>
    </agentColumn>
    <div class="shellContent">
      <router-view v-slot="{ Component }">
        <component :is="Component" ref="currentPage" />
      </router-view>
    </div>
    <settingsDialog ref="settingsPanel" v-model="settingsVisible" />
    <creationDialog v-model="projectModeVisible" :busy="currentPage?.navigationBusy" @select="createProjectInMode" />
  </div>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { computed, onScopeDispose, provide, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-vue";
import type { CanvasContext } from "@lumo/tool-canvas/runtime";
import type { MentionCanvasSource } from "@lumo/server/agent/mentionSources";
import { waitForControlValue } from "@/lib/mcpControl";
import http from "@/lib/http";
import { actualPlatform } from "@/lib/platform";
import { currentUser } from "@/stores/multiTenant";
import { useWorkspaceStore, type Project, type ProjectMode } from "@/stores/workspace";
import settingsDialog from "@/components/settings/index.vue";
import appSidebar from "./home/components/appSidebar.vue";
import creationDialog from "./home/components/creationDialog.vue";
import agentColumn from "./workspace/components/agentColumn.vue";

type WorkspaceAgentPage = {
  agentReady: boolean;
  agentMode: ProjectMode;
  canvasMenu?: {
    canvasBlocked: boolean;
    hand: boolean;
    sendBlocked: boolean;
    previsBlocked: boolean;
    hasScene: boolean;
    sceneBlocked: boolean;
    hasShot: boolean;
    shotBlocked: boolean;
  };
  runCanvasCommand(command: string): void | Promise<void>;
  getCanvasContext(): CanvasContext | undefined;
  getMentionSource(): MentionCanvasSource | undefined;
  activateCanvas(): Promise<boolean>;
  openFilmTimeline(): Promise<void>;
};

const router = useRouter();
const route = useRoute();
const workspaceStore = useWorkspaceStore();
const lifetime = new AbortController();
onScopeDispose(() => lifetime.abort());

const sidebarCollapsed = ref(false);
const currentPage = shallowRef<Partial<WorkspaceAgentPage> & {
  navigationBusy: boolean;
  createSidebarProject(mode: ProjectMode): Promise<void | boolean>;
  openSidebarProject(project: Project, mode?: ProjectMode): Promise<Project | undefined>;
} | null>(null);
// ACT: 路由内容切换期间不向上一页派发工作区命令。
const workspacePage = computed(() => route.path === "/workspace" && currentPage.value?.getCanvasContext ? currentPage.value as WorkspaceAgentPage : undefined);
const agentVisible = ref(false);
const agentRef = ref<InstanceType<typeof agentColumn>>();
let enteredWorkspace = false;
watch(() => [route.path, route.query.agent, workspaceStore.project?.directory] as const, ([path, agent, directory]) => {
  if (!directory) agentVisible.value = false;
  if (path !== "/workspace" || !directory) return;
  if (agent === "1" || (!enteredWorkspace && agent !== "0")) agentVisible.value = true;
  if (agent === "0") agentVisible.value = false;
  enteredWorkspace = true;
}, { immediate: true });
watch(() => workspaceStore.pendingAgentMessage, message => {
  if (message?.directory === workspaceStore.project?.directory && message) agentVisible.value = true;
});

watch(() => workspaceStore.pendingAgentDraft, draft => {
  if (draft && draft.directory === workspaceStore.project?.directory) agentVisible.value = true;
});

provide("canvas", () => workspacePage.value?.getCanvasContext());
provide("mentionCanvas", () => workspacePage.value?.getMentionSource());
provide("canDispatchPendingAgentMessage", () => workspacePage.value?.agentReady === true);
const settingsVisible = ref(false);
const settingsPanel = ref<InstanceType<typeof settingsDialog>>();
function openSettingsPanel(id?: string) {
  if (id) return settingsPanel.value?.openPanel(id) ?? false;
  settingsVisible.value = true;
  return true;
}
provide("openSettingsPanel", openSettingsPanel);
provide("settingsVisible", settingsVisible);
provide("openFilmTimeline", async (directory: string) => {
  if (directory !== workspaceStore.project?.directory) return;
  await withWorkspace(page => page.openFilmTimeline());
});

async function withWorkspace<T>(action: (page: WorkspaceAgentPage, directory: string) => T | Promise<T>) {
  const directory = workspaceStore.project?.directory;
  if (!directory) return;
  try {
    if (route.path !== "/workspace") await router.push("/workspace");
    if (route.path !== "/workspace" || workspaceStore.project?.directory !== directory) return;
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]);
    const page = await waitForControlValue(() => workspacePage.value, signal);
    if (workspacePage.value !== page || workspaceStore.project?.directory !== directory) return;
    return await action(page, directory);
  } catch (error) {
    if (!lifetime.signal.aborted) ElMessage.error(error instanceof Error ? error.message : translate("工作区尚未就绪"));
  }
}

provide("activateCanvasPanel", async () => await withWorkspace(async (page, directory) => {
  if (!await page.activateCanvas()) return false;
  const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]);
  return await waitForControlValue(() => {
    if (workspacePage.value !== page || directory !== workspaceStore.project?.directory) return false;
    return page.getCanvasContext() ? true : undefined;
  }, signal);
}) ?? false);

function runAgentCommand(command: string) {
  const workflow = agentChips.find(item => command === `wf-${item.id}`);
  if (workflow) return insertWorkflowPrompt(workflow.prompt);
  if (workspacePage.value?.canvasMenu) return workspacePage.value.runCanvasCommand(command);
}

// 快捷创作：把画布上原来的表单入口收进对话，点击后把任务写进输入框，由 Agent 继续追问与执行。
const agentChips = [
  { id: "drama", label: "短剧工作流", prompt: "用短剧工作流做一条短剧：先按「剧本 → 分镜 → 关键画面 → 分镜视频」拆解，先给方案再逐镜生成。\n主题与要求：" },
  { id: "template", label: "整集模板", prompt: "用整集模板做一条成片。先和我确认模板结构、主题、文案与素材，再开始渲染。\n内容主题：" },
  { id: "marketing", label: "营销脚本", prompt: "写一条营销脚本。先问清产品、目标人群、卖点和投放平台，再输出脚本与分镜。\n产品与卖点：" },
  { id: "film", label: "一键成片", prompt: "用一键成片做一条 15–30 秒的短视频。先确认主题、素材与成片风格，再开始生成草稿。\n主题：" },
  { id: "previs", label: "白模预演", prompt: "把下面这段剧本做成白模预演：先拆分场景、机位和镜头时长，再生成预演。\n剧本：" },
] as const;
async function insertWorkflowPrompt(prompt: string) {
  try {
    if (await agentRef.value?.appendPrompt(prompt)) return;
    ElMessage.info(translate("对话输入区暂不可用，请稍后再试"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("无法写入对话草稿"));
  }
}

provide("agentWorkflows", agentChips.map(({ id, label, prompt }) => ({
  id, label, run: () => void insertWorkflowPrompt(prompt),
})));

const activeSection = computed(() => route.name === "marketCase" ? "skills" : route.path === "/home"
  ? route.query.section === "assets" && currentUser.value?.role !== "user" ? "assets" : "skills"
  : undefined);

function goSection(section: string) {
  if (route.path === "/home") void router.replace({ query: { ...route.query, section } });
  else void router.push({ path: "/home", query: { section } });
}

const projectModeVisible = ref(false);
const creatingConversation = ref(false);

async function createProjectInMode(mode: ProjectMode) {
  const page = currentPage.value;
  if (!page || page.navigationBusy) return;
  if (await page.createSidebarProject(mode)) {
    projectModeVisible.value = false;
    agentVisible.value = true;
  }
}

async function openChat(project: Project, file: string, mode?: ProjectMode) {
  const page = currentPage.value;
  if (!page || page.navigationBusy) return;
  const targetMode = mode ?? project.mode ?? "canvas";
  const opened = await page.openSidebarProject(project, targetMode);
  if (!opened || lifetime.signal.aborted || route.path !== "/workspace" || workspaceStore.project?.directory !== opened.directory) return;
  // 会话目标和栏位展开在应用壳内一起更新，跨页面也走同一个入口。
  workspaceStore.pendingAgentSession = { directory: opened.directory, file, mode: targetMode };
  agentVisible.value = true;
}

async function createConversation(project: Project) {
  const mode = project.mode ?? "canvas";
  const page = currentPage.value;
  if (!page || page.navigationBusy || creatingConversation.value) return;
  creatingConversation.value = true;
  try {
    const result = await http<{ file: string }>({ method: "POST", url: "/api/agent/create", data: { directory: project.directory, mode }, signal: lifetime.signal });
    lifetime.signal.throwIfAborted();
    workspaceStore.agentHistoryChange = { directory: project.directory };
    if (page === currentPage.value) await openChat(project, result.file, mode);
  } catch (error) {
    if (!lifetime.signal.aborted) ElMessage.error(error instanceof Error ? error.message : translate("新建对话失败"));
  } finally {
    creatingConversation.value = false;
  }
}

watch(() => [route.path, route.query.create], ([path, create]) => {
  if (path !== "/home" || create !== "1") return;
  projectModeVisible.value = true;
  const query = { ...route.query };
  delete query.create;
  void router.replace({ query });
}, { immediate: true });
</script>

<style scoped lang="scss">
.appShell {
  --sidebarWidth: clamp(212px, 18vw, 256px);
  --shellHeaderTop: 21px;
  --shellHeaderHeight: 28px;
  position: relative;
  display: flex;
  height: 100dvh;
  overflow: hidden;

  .sidebarToggle {
    position: absolute;
    inset-block-start: calc(var(--shellHeaderTop) + (var(--shellHeaderHeight) - 26px) / 2);
    inset-inline-start: calc(var(--sidebarWidth) - 38px);
    z-index: 20;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--el-text-color-secondary);
    background: var(--el-bg-color);
    border: 0;
    border-radius: 6px;
    cursor: pointer;

    &:hover { color: var(--el-text-color-primary); background: var(--el-fill-color-light); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
  }

  &.sidebarCollapsed {
    --shellHeaderTop: 3px;
    --agentHeaderStart: 44px;

    .sidebarToggle { inset-inline-start: 8px; }
  }

  // ACT: hiddenInset 保留原生红绿灯，开关和 Agent 共用标题栏高度。
  &.nativeTitlebar {
    --shellHeaderTop: 0px;
    --shellHeaderHeight: var(--titlebarInset);

    &.sidebarCollapsed { --agentHeaderStart: 116px; }

    .sidebarToggle {
      inset-inline-start: auto;
      left: 80px;
    }
  }

  .shellContent {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;

  }
}
</style>
