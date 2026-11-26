<template>
  <div class="appShell" :class="{ sidebarCollapsed }" :inert="workspaceStore.projectLoadingVisible">
    <aside id="appSidebar" class="appSidebar" aria-label="应用侧栏">
      <div class="sidebarHeader">
        <div class="sidebarBrand">
          <el-image class="sidebarLogo" :src="logoUrl" fit="contain" alt="Lumo" />
          <span class="brandName">Lumo</span>
        </div>
        <button class="sidebarToggle" type="button" :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="!sidebarCollapsed" aria-controls="appSidebar" @click="sidebarCollapsed = !sidebarCollapsed">
          <icon-layout-sidebar-left-expand v-if="sidebarCollapsed" :size="18" aria-hidden="true" />
          <icon-layout-sidebar-left-collapse v-else :size="18" aria-hidden="true" />
        </button>
      </div>
      <el-button class="sidebarCreate" type="primary" :aria-label="translate('新建项目')" :title="translate('新建项目')" :disabled="currentPage?.navigationBusy" @click="projectModeVisible = true">
        <icon-plus :size="18" aria-hidden="true" />
        <span class="sidebarCreateLabel">{{ translate('新建') }}</span>
      </el-button>
      <nav class="sidebarNav" aria-label="主导航" :inert="currentPage?.navigationBusy">
        <button class="sidebarItem" :class="{ active: activeSection === 'home' }" type="button" :aria-current="activeSection === 'home' ? 'page' : undefined" :aria-label="translate('首页')" :title="translate('首页')" @click="goSection('home')">
          <icon-home :size="18" aria-hidden="true" />
          <span class="sidebarText">{{ translate('首页') }}</span>
        </button>
        <button v-if="currentUser?.role !== 'user'" class="sidebarItem" :class="{ active: activeSection === 'assets' }" type="button" :aria-current="activeSection === 'assets' ? 'page' : undefined" :aria-label="translate('资产')" :title="translate('资产')" @click="goSection('assets')">
          <icon-library-photo :size="18" aria-hidden="true" />
          <span class="sidebarText">{{ translate('资产') }}</span>
        </button>
        <button class="sidebarItem" :class="{ active: activeSection === 'skills' }" type="button" :aria-current="activeSection === 'skills' ? 'page' : undefined" :aria-label="translate('技能')" :title="translate('技能')" @click="goSection('skills')">
          <icon-book :size="18" aria-hidden="true" />
          <span class="sidebarText">{{ translate('技能') }}</span>
        </button>
      </nav>
      <workspaceTree v-if="!sidebarCollapsed" :disabled="currentPage?.navigationBusy || workspaceStore.projectLoadingVisible" @openProject="openProject" @openChat="openChat" />
      <div class="sidebarFooter">
        <homeAccount :collapsed="sidebarCollapsed" @openSettings="openSettings" @openAccount="openAccount" @openUpdate="openUpdate" @openDeviceLink="openDeviceLink" />
      </div>
    </aside>
    <div class="shellContent">
      <router-view v-slot="{ Component }">
        <component :is="Component" ref="currentPage" @create="projectModeVisible = true" />
      </router-view>
    </div>
    <el-dialog v-model="projectModeVisible" width="min(480px, calc(100vw - 32px))" alignCenter appendToBody class="lumo-modeDialog">
      <template #header>
        <header class="modeHeader">
          <h2>{{ translate('新建项目') }}</h2>
          <p>{{ translate('选一种工作方式；项目默认叫「未命名」，之后可随时重命名') }}</p>
        </header>
      </template>
      <div class="modeOptions">
        <button class="modeOption" type="button" @click="createProjectInMode('canvas')">
          <span class="modeIcon"><icon-vector :size="20" aria-hidden="true" /></span>
          <strong>{{ translate('画布项目') }}</strong>
          <span class="modeDesc">{{ translate('节点式创作：角色、分镜、素材生成与组装') }}</span>
        </button>
        <button class="modeOption" type="button" @click="createProjectInMode('edit')">
          <span class="modeIcon"><icon-movie :size="20" aria-hidden="true" /></span>
          <strong>{{ translate('剪辑项目') }}</strong>
          <span class="modeDesc">{{ translate('时间线剪辑：导入素材、配音、字幕与导出') }}</span>
        </button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconPlus, IconHome, IconLibraryPhoto, IconBook, IconVector, IconMovie } from "@tabler/icons-vue";
import logoUrl from "@lumo/assets/logo.svg";
import { currentUser } from "@/stores/multiTenant";
import { useWorkspaceStore, type Project, type ProjectMode } from "@/stores/workspace";
import workspaceTree from "@/pages/home/components/workspaceTree.vue";
import homeAccount from "@/pages/home/homeAccount.vue";

const router = useRouter();
const route = useRoute();
const workspaceStore = useWorkspaceStore();

// ACT: sidebarCollapsed 只影响侧栏宽度，不影响功能。
const sidebarCollapsed = ref(false);
const currentPage = ref<{
  navigationBusy: boolean;
  createSidebarProject(mode: ProjectMode): Promise<void>;
  openSidebarProject(project: Project, file?: string): Promise<void>;
  openSidebarSettings(panel?: string): void;
}>();

// 当前选中的导航分区——由路由 query 驱动，home 页面解读
const activeSection = computed(() => {
  if (route.path === "/workspace") return undefined;
  const section = route.query.section;
  return typeof section === "string" ? section : "home";
});

// 导航到首页的某个分区
function goSection(section: string) {
  if (route.path === "/home") {
    void router.replace({ path: "/home", query: { ...route.query, section } });
  } else {
    void router.push({ path: "/home", query: { section } });
  }
}

const projectModeVisible = ref(false);
function createProjectInMode(mode: ProjectMode) {
  if (currentPage.value?.navigationBusy) return;
  projectModeVisible.value = false;
  void currentPage.value?.createSidebarProject(mode);
}

watch(() => route.query.create, create => {
  if (route.path !== "/home" || create !== "1") return;
  projectModeVisible.value = true;
  const query = { ...route.query };
  delete query.create;
  void router.replace({ query });
}, { immediate: true });

function openSettings() {
  currentPage.value?.openSidebarSettings();
}
function openAccount() {
  currentPage.value?.openSidebarSettings("account");
}
function openUpdate() {
  currentPage.value?.openSidebarSettings("about");
}
function openDeviceLink() {
  currentPage.value?.openSidebarSettings("deviceLink");
}

function openProject(project: Project) {
  return currentPage.value?.openSidebarProject(project);
}

function openChat(project: Project, file: string) {
  return currentPage.value?.openSidebarProject(project, file);
}
</script>

<style scoped lang="scss">
.appShell {
  --sidebarWidth: clamp(212px, 18vw, 256px);
  --sidebarMotion: 220ms;
  display: grid;
  grid-template-columns: var(--sidebarWidth) minmax(0, 1fr);
  height: 100dvh;
  overflow: hidden;
  transition: grid-template-columns var(--sidebarMotion) ease;

  @media (prefers-reduced-motion: reduce) { transition: none; }

  &.sidebarCollapsed {
    --sidebarWidth: 72px;

    .sidebarCreateLabel { display: none; }
    .sidebarHeader .sidebarBrand .brandName { max-width: 0; opacity: 0; }
    .sidebarHeader .sidebarToggle { inset-inline-start: 9px; opacity: 0; }

    @media (min-width: 901px) {
      .sidebarHeader:hover, .sidebarHeader:has(.sidebarToggle:focus-visible) {
        .sidebarLogo { opacity: 0; }
        .sidebarToggle { opacity: 1; }
      }
    }

    .sidebarItem {
      gap: 0;
      padding-inline: 14px;
      .sidebarText { max-width: 0; opacity: 0; }
    }

    .sidebarFooter :deep(.accountLabel) { display: none; }
  }

  .appSidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100dvh;
    padding: calc(20px + var(--titlebarInset, 0px)) 12px 16px;
    overflow-x: hidden;
    overflow-y: auto;
    background: var(--el-bg-color);
    border-inline-end: 1px solid var(--el-border-color-lighter);

    .sidebarHeader {
      position: relative;
      display: flex;
      flex-shrink: 0;
      gap: 8px;
      align-items: center;
      height: 30px;
      margin-bottom: 24px;
      padding: 0 8px;

      .sidebarBrand {
        display: flex;
        gap: 9px;
        align-items: center;
        min-width: 0;
        overflow: hidden;
        transition: gap .18s ease;

        .sidebarLogo {
          flex-shrink: 0;
          width: 30px;
          height: 30px;
          transition: opacity .18s ease;
          .dark & { filter: invert(1); }
        }

        .brandName {
          overflow: hidden;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.01em;
          white-space: nowrap;
          transition: max-width .18s ease, opacity .18s ease;
        }
      }

      .sidebarToggle {
        position: absolute;
        inset-inline-end: 0;
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        padding: 0;
        color: var(--el-text-color-secondary);
        background: transparent;
        border: 0;
        border-radius: 7px;
        cursor: pointer;

        &:hover { color: var(--el-text-color-primary); background: var(--el-fill-color-light); }
        &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
      }
    }

    .sidebarCreate {
      flex-shrink: 0;
      width: 100%;
      min-height: 38px;
      margin-bottom: 18px;
      border-radius: 10px;

      .sidebarCreateLabel { margin-inline-start: 6px; }
    }

    .sidebarNav {
      display: flex;
      flex-shrink: 0;
      flex-direction: column;
      gap: 2px;
    }

    .sidebarItem {
      display: flex;
      gap: 11px;
      align-items: center;
      width: 100%;
      padding: 8px 10px;
      color: var(--el-text-color-regular);
      font: inherit;
      font-size: 14px;
      text-align: start;
      background: transparent;
      border: 0;
      border-radius: 9px;
      cursor: pointer;
      transition: background-color .15s ease, color .15s ease;

      &:hover { background: var(--el-fill-color-light); color: var(--el-text-color-primary); }
      &.active { background: var(--el-fill-color); color: var(--el-text-color-primary); font-weight: 550; }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }

      .sidebarText {
        overflow: hidden;
        white-space: nowrap;
        transition: max-width .18s ease, opacity .18s ease;
      }
    }

    .sidebarFooter {
      margin-top: auto;
      padding-top: 16px;
    }
  }

  .shellContent {
    min-width: 0;
    overflow: hidden;
  }
}
.modeHeader {
  h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 12.5px; }
}

.modeOptions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 4px 0 2px;
}

.modeOption {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  padding: 16px;
  color: inherit;
  font: inherit;
  text-align: start;
  background: var(--color-panel-2);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color .15s ease, background-color .15s ease, transform .15s ease;

  &:hover { border-color: var(--color-border-2); background: var(--el-fill-color-light); transform: translateY(-1px); }
  &:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--color-border-2); }

  strong { font-size: 14px; font-weight: 600; }

  .modeIcon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--el-text-color-primary);
    background: var(--el-fill-color);
    border-radius: 10px;
  }

  .modeDesc { color: var(--el-text-color-secondary); font-size: 12.5px; line-height: 1.6; }
}
</style>

<style lang="scss">
// 新建项目弹窗外壳：圆角与内边距与设置弹窗一致。
.lumo-modeDialog {
  border-radius: 16px;

  .el-dialog__header { padding: 18px 22px 6px; margin: 0; }
  .el-dialog__body { padding: 0 22px 20px; }
  .el-dialog__headerbtn { top: 16px; inset-inline-end: 14px; }
}
</style>
