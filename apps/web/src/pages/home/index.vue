<template>
  <div class="home" :class="{ sidebarCollapsed }" :inert="creating || opening || workspaceStore.projectLoadingVisible">
    <bg class="pageBackground" :scrollTop="backgroundScrollTop" />
    <homeAdvertisementCarousel class="topPromotion" :advertisements="advertisements.banners" placement="banner" :mode="advertisements.bannerMode" :interval="advertisements.bannerInterval" @activate="activateAdvertisement" />
    <aside id="homeSidebar" class="homeSidebar" aria-label="首页侧栏">
      <div class="sidebarHeader">
        <div class="sidebarBrand">
          <el-image class="sidebarLogo" :src="logoUrl" fit="contain" alt="Lumo" />
          <span class="brandName">Lumo</span>
        </div>
        <button class="sidebarToggle" type="button" :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="!sidebarCollapsed" aria-controls="homeSidebar" @click="sidebarCollapsed = !sidebarCollapsed">
          <icon-layout-sidebar-left-expand v-if="sidebarCollapsed" :size="18" aria-hidden="true" />
          <icon-layout-sidebar-left-collapse v-else :size="18" aria-hidden="true" />
        </button>
      </div>
      <el-button class="sidebarCreate" type="primary" :aria-label="translate('新建项目')" :title="translate('新建项目')"
        :disabled="creating || opening || filmBusy || dramaBusy || marketingBusy" @click="selectProjectMode">
        <icon-plus :size="18" aria-hidden="true" />
        <span class="sidebarCreateLabel">{{ translate('新建') }}</span>
      </el-button>
      <nav class="sidebarNav" aria-label="主导航" :inert="filmBusy || dramaBusy || marketingBusy">
        <button class="sidebarItem" :class="{ active: activeSection === 'home' }" type="button" :aria-current="activeSection === 'home' ? 'page' : undefined" :aria-label="translate('首页')" :title="translate('首页')" @click="showSection('home')">
          <icon-home :size="18" aria-hidden="true" />
          <span class="sidebarText">{{ translate('首页') }}</span>
        </button>
        <button v-if="currentUser?.role !== 'user'" class="sidebarItem" :class="{ active: activeSection === 'assets' }" type="button" :aria-current="activeSection === 'assets' ? 'page' : undefined" :aria-label="translate('资产')" :title="translate('资产')" @click="showSection('assets')">
          <icon-library-photo :size="18" aria-hidden="true" />
          <span class="sidebarText">{{ translate('资产') }}</span>
        </button>
        <button class="sidebarItem" :class="{ active: activeSection === 'skills' }" type="button" :aria-current="activeSection === 'skills' ? 'page' : undefined" :aria-label="translate('技能')" :title="translate('技能')" @click="showSection('skills')">
          <icon-book :size="18" aria-hidden="true" />
          <span class="sidebarText">{{ translate('技能') }}</span>
        </button>
      </nav>
      <workspaceTree v-if="!sidebarCollapsed" :disabled="filmBusy || dramaBusy || marketingBusy" @openProject="project => openProject(project)" @openChat="openChat" />
      <div class="sidebarFooter">
        <homeAdvertisementCarousel class="sidebarPromotion" :advertisements="advertisements.sidebar" @activate="activateAdvertisement" />
        <homeAccount :collapsed="sidebarCollapsed" @openSettings="settingsVisible = true" @openAccount="settingsDialog?.openPanel('account')" @openUpdate="settingsDialog?.openPanel('about')" @openDeviceLink="mobileConnectVisible = true" />
      </div>
    </aside>
    <el-scrollbar v-show="activeSection !== 'assets'" ref="pageScroll" class="pageScroll" @scroll="backgroundScrollTop = $event.scrollTop">
      <div class="pageBody">
        <el-main class="pageContent">
          <homePage v-show="activeSection === 'home'" :disabled="creating || opening" :loading="creating" @create="request => request ? createProject(request) : selectProjectMode()" @open="openProject" @showSection="showSection" @enter="enterDestination" />
          <explorePage v-show="activeSection === 'explore'" :scrollElement="pageScroll?.wrapRef" />
          <trumanMapPage v-show="activeSection === 'trumanMap'" />
          <agentWorkspacePage v-model:activeAgent="agentWorkspaceTab" v-show="activeSection === 'agentWorkspace'" :disabled="creating || opening" :loading="creating" :scenes="workspaceStore.sceneList" :modelLabel="modelChoices[0]?.label ?? ''" @submit="startAgent" @showSkills="showSection('skills')" @openTruman="showSection('trumanMap')" @openScene="openStandaloneScene" :filmBusy="filmBusy || dramaBusy || marketingBusy" @filmTopic="filmTopic = $event" @marketingRecipe="marketingRecipe = $event">
            <template #film>
              <div v-if="filmDirectory">
                <p>{{ filmProject?.name }}</p>
                <filmDraft v-if="activeSection === 'agentWorkspace'" :key="filmDirectory" v-model:topic="filmTopic" :directory="filmDirectory" @busy="filmBusy = $event" @generated="openFilmDraft" />
              </div>
              <el-button v-else :loading="selectingFilmProject" @click="selectFilmProject">{{ translate('选择工作目录') }}</el-button>
            </template>
            <template #drama>
              <div v-if="filmDirectory">
                <p>{{ filmProject?.name }}</p>
                <dramaDraft v-if="activeSection === 'agentWorkspace'" :key="filmDirectory" v-model:script="dramaScript" :directory="filmDirectory" @busy="dramaBusy = $event" @saved="openShortDramaDraft" />
              </div>
              <el-button v-else :loading="selectingFilmProject" @click="selectFilmProject">{{ translate('选择工作目录') }}</el-button>
            </template>
            <template #marketing>
              <marketingDraft v-if="filmDirectory && activeSection === 'agentWorkspace'" :key="filmDirectory" :directory="filmDirectory" :recipe="marketingRecipe" @busy="marketingBusy = $event" @saved="openDramaDraft" />
              <el-button v-else-if="!filmDirectory" :loading="selectingFilmProject" @click="selectFilmProject">{{ translate('选择工作目录') }}</el-button>
            </template>
            <template #truman>
              <div class="previsComposer">
                <label for="standalonePrevisScript">{{ translate('单场剧本') }}</label>
                <el-input id="standalonePrevisScript" v-model="standaloneScript" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" :maxlength="6000" :disabled="selectingStandalone || !!standaloneScene" />
                <el-button type="primary" :loading="selectingStandalone" :disabled="!standaloneScript.trim() || !!standaloneScene" @click="generateStandalonePrevis">{{ translate('生成白模预演') }}</el-button>
              </div>
            </template>
          </agentWorkspacePage>
          <skillsPage v-show="activeSection === 'skills'" :active="activeSection === 'skills'" :disabled="creating || opening" @start="startPipeline" @openTemplate="enterDestination('template')" @manage="settingsDialog?.openPanel('pluginMarket')" />
        </el-main>
      </div>
    </el-scrollbar>
    <!-- 素材库自带内部滚动，需要确定高度，所以与滚动区占同一格，而不放进滚动区。 -->
    <assetsPage v-if="currentUser?.role !== 'user'" v-show="activeSection === 'assets'" :active="activeSection === 'assets'" />
    <settings ref="settingsDialog" v-model="settingsVisible" />
    <mobileConnect v-if="!publicWeb" v-model="mobileConnectVisible" />
    <el-dialog v-model="filmProjectVisible" :title="`${translate(destinationLabels[workspaceDestination])} · ${translate('选择工作区')}`" width="min(440px, calc(100vw - 32px))">
      <el-select v-if="workspaceStore.projectList.length" v-model="filmProjectDirectory" :placeholder="translate('选择已有项目')" :aria-label="translate('选择已有项目')">
        <el-option v-for="project in workspaceStore.projectList" :key="project.directory" :label="project.name" :value="project.directory" />
      </el-select>
      <template #footer>
        <el-button @click="startWorkspace()">{{ translate('新建项目') }}</el-button>
        <el-button v-if="workspaceStore.projectList.length" type="primary" :disabled="!filmProjectDirectory" @click="startWorkspace(filmProjectDirectory)">{{ translate('打开项目') }}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="projectModeVisible" :title="translate('新建项目')" width="min(440px, calc(100vw - 32px))">
      <el-button @click="createProjectInMode('canvas')">{{ translate('画布项目') }}</el-button>
      <el-button @click="createProjectInMode('edit')">{{ translate('剪辑项目') }}</el-button>
    </el-dialog>
    <workspacePicker ref="relocationPicker" hideTrigger />
    <standaloneSceneProject v-if="standaloneScene" :directory="standaloneScene.directory" :script="standaloneScene.script" @close="standaloneScene = undefined" />
  </div>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import axios from "axios";
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox, type ScrollbarInstance } from "element-plus";
import type { HomeAdvertisement, HomeAdvertisements } from "@lumo/server/channel";
import logoUrl from "@lumo/assets/logo.svg";
import { useWorkspaceStore, type Project, type ProjectMode } from "@/stores/workspace";
import { createEmptyProject, timelineProjectFile } from "@/pages/workspace/panels/timeline/timelineModel";
import { currentUser, publicWeb } from "@/stores/multiTenant";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import http from "@/lib/http";
import { waitForControlValue } from "@/lib/mcpControl";
import settings from "@/components/settings/index.vue";
import bg from "./bg.vue";
import workspacePicker from "./workspacePicker.vue";
import homeAdvertisementCarousel from "./homeAdvertisementCarousel.vue";
import homeAccount from "./homeAccount.vue";
import homePage from "./pages/home/index.vue";
import explorePage from "./pages/explore/index.vue";
import assetsPage from "./pages/assets/index.vue";
import trumanMapPage from "./pages/trumanMap/index.vue";
import skillsPage from "./pages/skills/index.vue";
import agentWorkspacePage from "./pages/agentWorkspace/index.vue";
import filmDraft from "./pages/agentWorkspace/filmDraft.vue";
import marketingDraft from "./pages/agentWorkspace/marketingDraft.vue";
import dramaDraft from "./pages/agentWorkspace/dramaDraft.vue";
import { modelChoices, saveSettings } from "@/stores/settings";
import workspaceTree from "./components/workspaceTree.vue";

const settingsVisible = ref(false);
const settingsDialog = ref<InstanceType<typeof settings>>();
provide("openSettingsPanel", (id: string) => settingsDialog.value?.openPanel(id));
const advertisements = ref<HomeAdvertisements>({ banner: null, banners: [], bannerMode: "carousel", bannerInterval: 5, sidebar: [] });
const mobileConnectVisible = ref(false);
const sidebarCollapsed = ref(false);
const pageScroll = ref<ScrollbarInstance>();
const backgroundScrollTop = ref(0);
const activeSection = ref("home");
const homeSectionIds = ["home", "explore", "skills", "assets", "trumanMap", "agentWorkspace"];

const mobileConnect = defineAsyncComponent(() => import("@/components/mobileConnect.vue"));
const router = useRouter();
const pageLifetime = new AbortController();
const creating = ref(false);
const opening = ref(false);
const filmProjectVisible = ref(false);
const filmProjectDirectory = ref("");
type WorkspaceDestination = "canvas" | "timeline" | "agent" | "automaticFilm" | "template" | "drama" | "previs" | "image" | "video";
type AgentTab = "film" | "drama" | "marketing" | "truman";
const agentWorkspaceTab = ref<AgentTab>("film");

// Agent 工作台：沿用首页同一套「交给 Agent 推进」的入口，有项目就直接进，没有才选目录。
async function startAgent(request: { agent: AgentTab; title: string; prompt: string }) {
  if (creating.value || opening.value) return;
  agentWorkspaceTab.value = request.agent;
  const pending = { prompt: request.prompt, attachments: [], model: modelChoices.value[0]?.value ?? "", reasoningEffort: "" };
  const current = workspaceStore.project?.directory;
  if (current) {
    workspaceStore.pendingAgentMessage = { ...pending, directory: current };
    return enterWorkspace("agent");
  }
  const directory = await relocationPicker.value?.chooseDirectory();
  if (!directory || pageLifetime.signal.aborted) return;
  await createProject({ ...pending, directory }, "agent");
}
const projectModeVisible = ref(false);
function selectProjectMode() {
  projectModeVisible.value = true;
}

function createProjectInMode(mode: ProjectMode) {
  projectModeVisible.value = false;
  return createWorkspaceProject(mode);
}

async function createWorkspaceProject(mode: ProjectMode, destination?: WorkspaceDestination) {
  if (creating.value || opening.value) return;
  const result = await ElMessageBox.prompt(translate("给项目起个名字，会把内容放到同名文件夹里。"), translate("新建项目"), {
    confirmButtonText: translate("创建"), cancelButtonText: translate("取消"),
    inputValue: mode === "edit" ? translate("未命名剪辑") : translate("未命名画布"),
    inputValidator: value => !!value?.trim() || translate("项目名称不能为空"),
  }).catch(() => null);
  if (!result || pageLifetime.signal.aborted) return;
  creating.value = true;
  try {
    const { directory } = await http<{ directory: string; name: string }>({ method: "POST", url: "/api/workspaces/create", data: { name: result.value.trim() } });
    if (pageLifetime.signal.aborted) return;
    if (!await initializeProject(directory, true, mode)) return;
    await nextTick();
    await saveSettings();
    await enterWorkspace(destination ?? (mode === "edit" ? "timeline" : "canvas"));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("无法新建项目，请重试"));
  } finally {
    creating.value = false;
  }
}

const workspaceDestination = ref<WorkspaceDestination>("automaticFilm");
const destinationLabels: Record<WorkspaceDestination, string> = { canvas: "画布", timeline: "剪辑", agent: "Agent", automaticFilm: "一键成片", template: "整集模板", drama: "短剧工作流", previs: "白模预演", image: "图片生成", video: "视频生成" };
const sidebarProjects = computed(() => [...workspaceStore.projectList].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt).slice(0, 6));

// ACT: 画布/剪辑/Agent 等优先直接进入——已打开的项目、或最近一个项目都不再追问目录；一个项目都没有时才让用户选文件夹。
async function enterDestination(destination: WorkspaceDestination) {
  if (creating.value || opening.value) return;
  workspaceDestination.value = destination;
  const current = workspaceStore.project;
  if (current) return openProject(current, destination);
  const recent = sidebarProjects.value[0];
  if (recent) return openProject(recent, destination);
  filmProjectDirectory.value = "";
  filmProjectVisible.value = true;
}

function startWorkspace(directory?: string) {
  filmProjectVisible.value = false;
  const project = workspaceStore.projectList.find(item => item.directory === directory);
  if (project) return openProject(project, workspaceDestination.value);
  if (!directory) return createWorkspaceProject(workspaceDestination.value === "timeline" ? "edit" : "canvas", workspaceDestination.value);
}
const relocationPicker = ref<InstanceType<typeof workspacePicker>>();
const workspaceStore = useWorkspaceStore();
const standaloneSceneProject = defineAsyncComponent(() => import("./pages/trumanMap/sceneProject.vue"));
const standaloneScript = ref("");
const selectingStandalone = ref(false);
const standaloneScene = ref<{ directory: string; script?: string }>();

function openStandaloneScene(scene: Project) {
  if (!standaloneScene.value && !selectingStandalone.value) standaloneScene.value = { directory: scene.directory };
}

async function generateStandalonePrevis() {
  const script = standaloneScript.value.trim();
  if (!script || selectingStandalone.value || standaloneScene.value || creating.value || opening.value) return;
  selectingStandalone.value = true;
  try {
    const path = await relocationPicker.value?.chooseDirectory();
    if (!path || pageLifetime.signal.aborted) return;
    const { directory, empty } = await useWorkspaceFiles(path).list();
    if (!empty) return void ElMessage.warning(translate("请选择空文件夹保存新的白模场景"));
    if (!pageLifetime.signal.aborted) standaloneScene.value = { directory, script };
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("无法打开白模预演"));
  } finally {
    selectingStandalone.value = false;
  }
}

const filmProject = computed(() => workspaceStore.project ?? sidebarProjects.value[0]);
const filmDirectory = computed(() => filmProject.value?.directory ?? "");
const filmTopic = ref("");
const filmBusy = ref(false);
const dramaScript = ref("");
const dramaBusy = ref(false);
const marketingBusy = ref(false);
const marketingRecipe = ref("");
const selectingFilmProject = ref(false);

async function selectFilmProject() {
  if (selectingFilmProject.value || creating.value || opening.value) return;
  selectingFilmProject.value = true;
  try {
    const path = await relocationPicker.value?.chooseDirectory();
    if (path && !pageLifetime.signal.aborted) await initializeProject(path);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("无法打开或创建项目，请重试"));
  } finally {
    selectingFilmProject.value = false;
  }
}

function openShortDramaDraft(directory: string, path: string) {
  return openDramaDraft(directory, path, true);
}

async function openDramaDraft(directory: string, path: string, shortDrama = false) {
  try {
    if (workspaceStore.project?.directory !== directory) await workspaceStore.openProject(directory, directory, pageLifetime.signal, "canvas");
    if (shortDrama) workspaceStore.updateProjectMetadata(directory, { category: "drama" });
    await router.push({ path: "/workspace", query: { panel: "canvas", scriptDraft: path } });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("分镜已保存，请从项目中打开画布"));
  }
}

async function openFilmDraft(directory: string) {
  try {
    if (workspaceStore.project?.directory !== directory) await workspaceStore.openProject(directory);
    await router.push({ path: "/workspace", query: { panel: "timeline" } });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("草稿已保存，请从项目中打开剪辑"));
  }
}


onMounted(() => {
  void loadAdvertisements();
});

onUnmounted(() => {
  pageLifetime.abort();
  if (router.currentRoute.value.path !== "/workspace") workspaceStore.projectLoading = false;
});
watch([creating, opening], ([creating, opening]) => {
  if (creating || opening) {
    workspaceStore.projectLoadingDrawn = false;
    workspaceStore.projectLoading = true;
  } else if (router.currentRoute.value.path !== "/workspace") {
    workspaceStore.projectLoading = false;
  }
}, { flush: "sync" });
// 在设置里切换为子账号后素材库入口会隐藏，停留在素材库会让右侧空白。
watch(() => currentUser.value?.role, role => {
  if (role === "user" && activeSection.value === "assets") showSection("home");
});

async function loadAdvertisements() {
  // ACT: 默认读取后台配置；开发环境显式指定预览模式时才使用临时预览。
  const preview = router.currentRoute.value.query.advertisementPreview;
  if (import.meta.env.DEV && typeof preview === "string" && ["text", "image", "web", "carousel", "stack"].includes(preview)) {
    const now = Date.now();
    const previewSlides: { title: string; subtitle: string; color: string; actionType: HomeAdvertisement["actionType"]; actionTarget: string }[] = [
      { title: "探索创作灵感", subtitle: "从一个想法，开始你的下一个作品", color: "#273442", actionType: preview === "web" ? "web" : "path", actionTarget: preview === "web" ? "https://github.com/knight123xxy/Lumo" : "/home?section=explore" },
      { title: "搭建你的工作流", subtitle: "前往插件市场，发现更多创作工具", color: "#2c303b", actionType: "settings", actionTarget: "pluginMarket" },
      { title: "一起创造更多", subtitle: "在 GitHub 了解 Lumo 的新进展", color: "#243734", actionType: "web", actionTarget: "https://github.com/knight123xxy/Lumo" },
    ];
    const sidebar = previewSlides.map((slide, index): HomeAdvertisement => ({
      title: slide.title,
      content: "",
      imageUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <defs><linearGradient id="background" x2="1" y2="1"><stop stop-color="${slide.color}"/><stop offset="1" stop-color="#13202f"/></linearGradient></defs>
        <rect width="640" height="360" fill="url(#background)"/>
        <circle cx="562" cy="60" r="150" fill="#409eff" opacity=".15"/>
        <path d="M330 235H400V160H485" fill="none" stroke="#6db5ff" stroke-width="4"/>
        <rect x="280" y="205" width="100" height="64" rx="12" fill="#337ecc"/>
        <rect x="450" y="125" width="110" height="70" rx="12" fill="#409eff"/>
        <circle cx="330" cy="237" r="12" fill="#fff" opacity=".85"/>
        <path d="m495 146 25 14-25 14z" fill="#fff"/>
        <g fill="#fff" font-family="Arial, Microsoft YaHei, sans-serif">
          <text x="40" y="58" font-size="17" letter-spacing="3" opacity=".7">LUMO · PREVIEW</text>
          <text x="40" y="136" font-size="38" font-weight="bold">${slide.title}</text>
          <text x="40" y="177" font-size="19" opacity=".7">${slide.subtitle}</text>
          <text x="40" y="303" font-size="16" opacity=".6">侧栏轮播预览 · ${index + 1} / 3</text>
        </g>
      </svg>`)}`,
      buttonText: "",
      actionType: slide.actionType,
      actionTarget: slide.actionTarget,
      endsAt: null,
      updatedAt: now,
    }));
    const bannerImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="40" viewBox="0 0 1000 40">
        <rect width="1000" height="40" rx="4" fill="#23262b"/>
        <g fill="#d8dce3" font-family="Arial, Microsoft YaHei, sans-serif">
          <text x="12" y="25" font-size="14" font-weight="500">创作灵感，从这里开始</text>
          <text x="178" y="25" font-size="12" opacity=".65">探索更多工具，开始你的下一个作品</text>
        </g>
      </svg>`)}`;
    const banner: HomeAdvertisement = {
      title: "创作灵感，从这里开始",
      content: "探索 **节点与技能**，开始你的下一个作品。\n[创作灵感](/home?section=explore) · [插件市场](settings:pluginMarket) · [项目主页](https://github.com/knight123xxy/Lumo)",
      imageUrl: preview === "image" ? bannerImage : "",
      buttonText: "发现工具",
      actionType: "settings",
      actionTarget: "pluginMarket",
      endsAt: now + 2 * 86400000 + 3 * 3600000,
      updatedAt: now,
      appearance: { mode: preview === "image" ? "image" : "text", backgroundColor: "", backgroundEndColor: "", textColor: "", buttonColor: "", buttonTextColor: "" },
    };
    const banners = preview === "carousel" || preview === "stack"
      ? previewSlides.map((slide, index): HomeAdvertisement => ({ ...banner, title: slide.title, content: index === 0 ? banner.content : slide.subtitle, buttonText: "立即查看", actionType: slide.actionType, actionTarget: slide.actionTarget }))
      : [banner];
    advertisements.value = {
      banner: banners[0] ?? null,
      banners,
      bannerMode: preview === "stack" ? "stack" : "carousel",
      bannerInterval: 5,
      sidebar,
    };
    return;
  }
  try {
    const result = await http<HomeAdvertisements>({ method: "GET", url: "/api/channel/community/getAdvertisements", signal: pageLifetime.signal });
    if (!pageLifetime.signal.aborted) advertisements.value = result;
  } catch (error) {
    if (!pageLifetime.signal.aborted) console.warn("加载首页广告失败", error);
  }
}

async function activateAdvertisement(advertisement: HomeAdvertisement) {
  if (advertisement.actionType === "settings") {
    if (!settingsDialog.value?.openPanel(advertisement.actionTarget)) ElMessage.warning("当前设备不支持该设置项");
    return;
  }
  if (advertisement.actionType !== "path") return;
  const target = advertisement.actionTarget;
  if (!target.startsWith("/") || target.startsWith("//") || /[\\\u0000-\u0020]/.test(target)) return;
  const resolved = router.resolve(target);
  if (!resolved.matched.length) {
    ElMessage.warning("当前版本不支持该页面");
    return;
  }
  if (resolved.matched.some(route => ["/workspace", "/canvas"].includes(route.path)) && !workspaceStore.project?.directory) {
    ElMessage.info("请先打开一个项目");
    return;
  }
  try {
    await router.push(target);
    if (resolved.matched.some(route => route.path === "/home")) {
      const section = typeof resolved.query.section === "string" ? resolved.query.section : resolved.hash.slice(1);
      showSection(homeSectionIds.includes(section) ? section : "home");
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "无法打开页面");
  }
}

function showSection(section: string) {
  activeSection.value = section;
  pageScroll.value?.setScrollTop(0);
}

async function enterWorkspace(destination?: WorkspaceDestination) {
  await waitForControlValue(() => workspaceStore.projectLoadingDrawn || undefined, pageLifetime.signal).catch(error => {
    if (!pageLifetime.signal.aborted) throw error;
  });
  if (pageLifetime.signal.aborted) return;
  if (!document.hidden) await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (pageLifetime.signal.aborted) return;
  await router.push({
    path: "/workspace",
    query: destination === "automaticFilm" ? { panel: "canvas", film: "1" }
      : destination === "template" ? { panel: "canvas", template: "1" }
      : destination === "drama" ? { panel: "canvas", drama: "1" }
      : destination === "previs" ? { panel: "canvas", previs: "1" }
      : destination === "image" || destination === "video" ? { panel: "canvas", generation: destination }
      : destination === "agent" ? { panel: workspaceStore.project?.mode === "edit" ? "timeline" : "canvas", agent: "1" }
      : destination ? { panel: destination } : {},
  });
}

async function openProject(project: Project, destination?: WorkspaceDestination, sessionFile?: string) {
  if (creating.value || opening.value) return;
  opening.value = true;
  try {
    const directory = project.directory;
    try { await openRegisteredProject(directory, project); }
    catch (err) {
      if (!axios.isAxiosError(err) || err.response?.status !== 404) throw err;
      const reselect = await ElMessageBox.confirm(`项目“${project.name}”的文件夹不存在，是否重新选择文件夹？`, "工作目录不存在", {
        confirmButtonText: "重新选择", cancelButtonText: "取消", type: "warning",
      }).then(() => true, () => false);
      if (!reselect) return;
      const directory = await relocationPicker.value?.chooseDirectory();
      if (!directory) return;
      await openRegisteredProject(directory, project);
    }
    const opened = workspaceStore.project;
    workspaceStore.pendingAgentSession = opened && sessionFile ? { directory: opened.directory, file: sessionFile } : null;
    await enterWorkspace(destination ?? (opened?.mode === "edit" ? "timeline" : "canvas"));
  } catch (err) {
    ElMessage.error(axios.isAxiosError<{ message?: string }>(err)
      ? err.response?.data.message || "无法打开项目，请重试"
      : err instanceof Error ? err.message : "无法打开项目，请重试");
  } finally { opening.value = false; }
}

function openChat(project: Project, file: string) {
  return openProject(project, "agent", file);
}

// 整集模板：把流水线定位和用户主题拼成创作要求，走与首页输入框相同的新建项目入口。
async function startPipeline(request: { name: string; summary: string; category: string; topic: string }) {
  if (creating.value || opening.value) return;
  const directory = await relocationPicker.value?.chooseDirectory();
  if (!directory || pageLifetime.signal.aborted) return;
  await createProject({
    directory,
    prompt: `按「${request.name}」流水线制作。\n类别：${request.category}\n定位：${request.summary}\n主题与要求：${request.topic}\n请先给出阶段计划与分镜方案，确认后再开始生成。`,
    attachments: [],
    model: modelChoices.value[0]?.value ?? "",
    reasoningEffort: "",
  });
}

function inferProjectMode(entries: { name: string; type: string }[]): ProjectMode {
  return entries.some(entry => entry.type === "file" && entry.name === timelineProjectFile) ? "edit" : "canvas";
}

async function openRegisteredProject(path: string, project: Project) {
  const signal = pageLifetime.signal;
  const mode = project.mode ?? inferProjectMode((await useWorkspaceFiles(path).list("", signal)).entries);
  await workspaceStore.openProject(path, project.directory, signal, mode);
}

async function initializeProject(path: string, requireEmpty = false, mode?: ProjectMode) {
  const { directory, empty, entries } = await useWorkspaceFiles(path).list("", pageLifetime.signal);
  if (requireEmpty && !empty) {
    ElMessage.warning("该文件夹不为空，请重新选择空文件夹；已有项目请从项目列表打开。");
    return false;
  }
  const projectMode = empty ? mode ?? "canvas" : inferProjectMode(entries);
  if (empty) {
    const files = useWorkspaceFiles(directory);
    if (projectMode === "edit") await files.writeJson(timelineProjectFile, createEmptyProject(), true);
    else await files.writeJson("画布1.json", { lumoCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
  }
  await workspaceStore.openProject(directory, directory, pageLifetime.signal, projectMode);
  return true;
}

async function createProject(request?: NonNullable<typeof workspaceStore.pendingAgentMessage>, destination?: WorkspaceDestination, mode?: ProjectMode) {
  if (creating.value || opening.value) return;
  const path = request ? request.directory : await relocationPicker.value?.chooseDirectory();
  if (!path || creating.value || opening.value || pageLifetime.signal.aborted) return;
  creating.value = true;
  try {
    if (!await initializeProject(path, !!request || !!mode, mode ?? (destination === "timeline" ? "edit" : undefined))) return;
    if (request && (request.prompt.trim() || request.attachments?.length)) {
      workspaceStore.pendingAgentMessage = { ...request, directory: workspaceStore.project!.directory };
    }
    await enterWorkspace(destination ?? (workspaceStore.project?.mode === "edit" ? "timeline" : undefined));
  } catch (err) {
    ElMessage.error(axios.isAxiosError<{ message?: string }>(err)
      ? err.response?.data.message || "无法打开或创建项目，请重试"
      : err instanceof Error ? err.message : "无法打开或创建项目，请重试");
  } finally {
    creating.value = false;
  }
}
</script>

<style lang="scss" scoped>
.previsComposer { display: grid; gap: 10px; }
.previsComposer .el-button { justify-self: end; }

.home {
  --sidebarWidth: 240px;
  --sidebarMotion: 220ms;
  --sidebarFade: 140ms;
  position: relative;
  display: grid;
  grid-template-columns: var(--sidebarWidth) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  height: 100dvh;
  overflow: hidden;
  color: var(--el-text-color-primary);
  background: color-mix(in srgb, var(--el-bg-color) 96%, var(--el-text-color-primary));
  transition: grid-template-columns var(--sidebarMotion) ease;

  @media (prefers-reduced-motion: reduce) { transition: none; }

  .topPromotion { grid-column: 1 / -1; grid-row: 1; z-index: 1; }

  .pageBackground {
    position: absolute;
    inset-block: 0;
    inset-inline-start: var(--sidebarWidth);
    width: calc(100% - var(--sidebarWidth));
    transition: inset-inline-start var(--sidebarMotion) ease, width var(--sidebarMotion) ease;

    @media (prefers-reduced-motion: reduce) { transition: none; }
  }

  &.sidebarCollapsed {
    --sidebarWidth: 72px;

    .homeSidebar {
      .sidebarPromotion, .sidebarCreateLabel { display: none; }
      .sidebarHeader {
        .sidebarBrand {
          gap: 0;

          .brandName { max-width: 0; opacity: 0; }
        }

        .sidebarToggle { inset-inline-start: 9px; opacity: 0; }

        @media (min-width: 901px) {
          &:hover, &:has(.sidebarToggle:focus-visible) {
            .sidebarLogo { opacity: 0; }
            .sidebarToggle { opacity: 1; }
          }
        }
      }

      .sidebarItem {
        gap: 0;
        padding-inline: 14px;

        .sidebarText { max-width: 0; opacity: 0; }
      }
    }
  }

  .homeSidebar {
    position: relative;
    grid-column: 1;
    grid-row: 2;
    min-height: 0;
    display: flex;
    flex: 0 0 var(--sidebarWidth);
    flex-direction: column;
    width: var(--sidebarWidth);
    padding: 20px 12px 16px;
    overflow-x: hidden;
    overflow-y: auto;
    border-inline-end: 1px solid var(--el-border-color-lighter);
    background: inherit;
    transition: flex-basis var(--sidebarMotion) ease, width var(--sidebarMotion) ease;

    .sidebarHeader {
      position: relative;
      display: flex;
      align-items: center;
      flex-shrink: 0;
      height: 30px;
      gap: 8px;
      margin-bottom: 24px;
      padding: 0 8px;

      .sidebarBrand {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 9px;
        overflow: hidden;
        transition: gap var(--sidebarMotion) ease;

        .sidebarLogo {
          flex-shrink: 0;
          width: 30px;
          height: 30px;
          transition: opacity var(--sidebarFade) ease;

          .dark & { filter: invert(1); }
        }

        .brandName {
          max-width: 150px;
          overflow: hidden;
          font-size: 20px;
          font-weight: 600;
          letter-spacing: -0.5px;
          white-space: nowrap;
          transition: max-width var(--sidebarMotion) ease, opacity var(--sidebarFade) ease;
        }
      }

      .sidebarToggle {
        position: absolute;
        top: 1px;
        inset-inline-start: calc(100% - 32px);
        display: grid;
        flex-shrink: 0;
        place-items: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-radius: var(--ui-radius);
        background: transparent;
        color: var(--el-text-color-secondary);
        cursor: pointer;
        transition: inset-inline-start var(--sidebarMotion) ease, opacity var(--sidebarFade) ease;

        &:hover { background: var(--color-panel-2); color: var(--color-text); }
        &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
        &:dir(rtl) svg { transform: scaleX(-1); }
      }
    }

    .sidebarItem {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      min-height: 42px;
      width: 100%;
      gap: 10px;
      padding: 10px 12px;
      border: 0;
      border-radius: var(--ui-radius);
      background: transparent;
      color: var(--el-text-color-regular);
      font: inherit;
      font-size: 14px;
      line-height: 1.5;
      text-align: start;
      text-decoration: none;
      cursor: pointer;
      transition: gap var(--sidebarMotion) ease, padding var(--sidebarMotion) ease;

      > svg { flex-shrink: 0; }
      .sidebarText {
        min-width: 0;
        max-width: 180px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        transition: max-width var(--sidebarMotion) ease, opacity var(--sidebarFade) ease;
      }

      &:hover:not(:disabled) { background: var(--color-panel-2); color: var(--color-text); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
      &:disabled { cursor: wait; opacity: 0.6; }
      &.active { background: var(--color-panel-2); color: var(--color-accent); font-weight: 500; }
    }

    .sidebarGroup {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 12px 2px;

      .sidebarGroupTitle { color: var(--el-text-color-secondary); font-size: 12px; letter-spacing: .02em; }

      .sidebarGroupAction {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        padding: 0;
        color: var(--el-text-color-secondary);
        background: transparent;
        border: 0;
        border-radius: 6px;
        cursor: pointer;

        &:hover:not(:disabled) { color: var(--color-text); background: var(--color-panel-2); }
        &:disabled { cursor: wait; opacity: .6; }
      }
    }

    .sidebarGroupTitleSpaced { display: block; padding: 4px 12px 2px; }

    .sidebarChat { min-height: 34px; padding: 6px 12px; font-size: 13px; color: var(--el-text-color-secondary); }
    .sidebarProject { min-height: 34px; padding: 6px 12px; font-size: 13px; color: var(--el-text-color-secondary); }
    .sidebarEmpty { margin: 2px 12px 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }

    .sidebarCreate {
      flex-shrink: 0;
      width: 100%;
      min-height: 40px;
      margin: 0 0 12px;
      padding-inline: 0;
      .sidebarCreateLabel { margin-inline-start: 6px; }
    }

    .sidebarNav, .sidebarFooter { display: flex; flex-direction: column; gap: 4px; }
    .sidebarNav {
      .sidebarDivider { margin: 12px 8px; border: 0; border-top: 1px solid var(--el-border-color-lighter); }
    }
    .sidebarFooter { margin-top: auto; padding-top: 24px; }

    @media (prefers-reduced-motion: reduce) {
      --sidebarMotion: 0ms;
      --sidebarFade: 0ms;
    }
  }

  .projectChatHeader { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-weight: 600; }
  .projectChatButton { display: inline-flex; align-items: center; gap: 6px; margin: 0 6px 6px 0; padding: 5px 8px; color: inherit; background: var(--el-fill-color-light); border: 0; border-radius: var(--ui-radius); cursor: pointer; }
  .projectChatEmpty { margin: 0; color: var(--el-text-color-secondary); }

  .pageScroll {
    grid-column: 2;
    grid-row: 2;
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;

    :deep(.el-scrollbar__view) { min-height: 100%; }

    .pageBody {
      position: relative;
      min-height: 100%;

      .pageContent {
        padding: 24px clamp(20px, 4vw, 56px) 56px;
      }
    }
  }

  .assetsPanel {
    position: relative;
    grid-column: 2;
    grid-row: 2;
    padding: 24px clamp(20px, 4vw, 56px);
  }

  @media (max-width: 900px) {
    --sidebarWidth: 72px;

    .homeSidebar {
      .sidebarPromotion, .sidebarCreateLabel { display: none; }
      .sidebarHeader {
        .sidebarBrand {
          gap: 0;

          .brandName { max-width: 0; opacity: 0; }
        }

        .sidebarToggle { display: none; }
      }

      .sidebarItem {
        gap: 0;
        padding-inline: 14px;

        .sidebarText { max-width: 0; opacity: 0; }
      }
    }
  }

  @media (max-width: 560px) {
    .pageScroll .pageBody .pageContent { padding: 24px 16px 40px; }
    .assetsPanel { padding: 16px; }
    .homeSidebar .sidebarItem { min-height: 44px; }
  }
}
</style>
