<template>
  <div class="appShell" :inert="workspaceStore.projectLoadingVisible">
    <appSidebar
      v-model:collapsed="sidebarCollapsed"
      :disabled="!currentPage || currentPage.navigationBusy || creatingConversation"
      :activeSection="activeSection"
      @create="selectConversationProject()"
      @createProject="projectModeVisible = true"
      @createChat="selectConversationProject"
      @section="goSection"
      @openProject="project => currentPage?.openSidebarProject(project)"
      @openChat="openChat"
      @settings="currentPage?.openSidebarSettings()"
      @account="currentPage?.openSidebarSettings('account')"
      @update="currentPage?.openSidebarSettings('about')"
      @deviceLink="currentPage?.openSidebarSettings('deviceLink')" />
    <div class="shellContent">
      <router-view v-slot="{ Component }">
        <component :is="Component" ref="currentPage" />
      </router-view>
    </div>
    <creationDialog v-model="projectModeVisible" :busy="currentPage?.navigationBusy" @select="createProjectInMode" />
    <creationDialog v-model="conversationCreationVisible" v-model:directory="conversationDirectory" conversation
      :projects="workspaceStore.projectList" :busy="creatingConversation" @select="createConversation" />
  </div>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { computed, onScopeDispose, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import http from "@/lib/http";
import { currentUser } from "@/stores/multiTenant";
import { useWorkspaceStore, type Project, type ProjectMode } from "@/stores/workspace";
import appSidebar from "./home/components/appSidebar.vue";
import creationDialog from "./home/components/creationDialog.vue";

const router = useRouter();
const route = useRoute();
const workspaceStore = useWorkspaceStore();
const lifetime = new AbortController();
onScopeDispose(() => lifetime.abort());

const sidebarCollapsed = ref(false);
const currentPage = ref<{
  navigationBusy: boolean;
  createSidebarProject(mode: ProjectMode): Promise<void | boolean>;
  openSidebarProject(project: Project, file?: string, mode?: ProjectMode): Promise<void>;
  openSidebarSettings(panel?: string): void;
} | null>(null);
const activeSection = computed(() => route.path === "/home"
  ? route.query.section === "assets" && currentUser.value?.role !== "user" ? "assets" : "skills"
  : undefined);

function goSection(section: string) {
  if (route.path === "/home") void router.replace({ query: { ...route.query, section } });
  else void router.push({ path: "/home", query: { section } });
}

const projectModeVisible = ref(false);
const conversationCreationVisible = ref(false);
const conversationDirectory = ref("");
const creatingConversation = ref(false);

function selectConversationProject(project?: Project) {
  const selected = project ?? workspaceStore.projectList.find(item => item.directory === workspaceStore.project?.directory) ?? workspaceStore.projectList[0];
  if (!selected) {
    projectModeVisible.value = true;
    return;
  }
  conversationDirectory.value = selected.directory;
  conversationCreationVisible.value = true;
}

async function createProjectInMode(mode: ProjectMode) {
  const page = currentPage.value;
  if (!page || page.navigationBusy) return;
  if (await page.createSidebarProject(mode)) projectModeVisible.value = false;
}

function openChat(project: Project, file: string, mode?: ProjectMode) {
  return currentPage.value?.openSidebarProject(project, file, mode);
}

async function createConversation(mode: ProjectMode) {
  const project = workspaceStore.projectList.find(item => item.directory === conversationDirectory.value);
  const page = currentPage.value;
  if (!project || !page || page.navigationBusy || creatingConversation.value) return;
  creatingConversation.value = true;
  try {
    const result = await http<{ file: string }>({ method: "POST", url: "/api/agent/create", data: { directory: project.directory, mode }, signal: lifetime.signal });
    lifetime.signal.throwIfAborted();
    workspaceStore.agentHistoryChange = { directory: project.directory };
    conversationCreationVisible.value = false;
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
  display: flex;
  height: 100dvh;
  overflow: hidden;

  .shellContent {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
}
</style>
