<template>
  <section class="workspaceTree" :aria-label="translate('工作区')">
    <header class="workspaceTreeHeading">
      <span>{{ translate('工作区') }}</span>
      <div class="treeActions">
        <button class="treeIcon" type="button" :title="translate('搜索对话')" :aria-label="translate('搜索对话')" :aria-expanded="searchOpen" @click="searchOpen = !searchOpen"><icon-search :size="15" /></button>
        <el-dropdown trigger="click" placement="bottom-end" @command="setView">
          <button class="treeIcon" type="button" :title="translate('视图选项')" :aria-label="translate('视图选项')"><icon-adjustments-horizontal :size="15" /></button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item :command="'group:project'">{{ grouped ? '✓ ' : '' }}{{ translate('按项目分组') }}</el-dropdown-item>
            <el-dropdown-item :command="'group:list'">{{ !grouped ? '✓ ' : '' }}{{ translate('对话列表') }}</el-dropdown-item>
            <el-dropdown-item divided command="sort:created">{{ sortByCreated ? '✓ ' : '' }}{{ translate('创建时间') }}</el-dropdown-item>
            <el-dropdown-item command="sort:name">{{ !sortByCreated ? '✓ ' : '' }}{{ translate('按名称排序') }}</el-dropdown-item>
            <el-dropdown-item v-for="option in filters" :key="option.value" :command="`filter:${option.value}`" :divided="option.value === 'all'">{{ filter === option.value ? '✓ ' : '' }}{{ option.label }}</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
        <button class="treeIcon" type="button" :title="translate('新建项目')" :aria-label="translate('新建项目')" :disabled="disabled" @click="emit('createProject')"><icon-plus :size="16" /></button>
      </div>
    </header>
    <el-input v-if="searchOpen" v-model="query" class="searchInput" size="small" clearable :placeholder="translate('搜索对话名称')" :aria-label="translate('搜索对话名称')" />
    <div v-if="searchOpen || !grouped" class="chatResults">
      <p v-if="loading.size" class="workspaceEmpty" role="status">{{ translate('正在读取对话…') }}</p>
      <p v-else-if="!results.length" class="workspaceEmpty">{{ translate('没有匹配的对话') }}</p>
      <p v-if="errors.size" class="workspaceEmpty" role="status">{{ translate('部分项目的对话未能读取') }}</p>
      <div v-for="{ project, chat } in results" :key="`${project.directory}/${chat.file}`" class="workspaceFolderRow">
        <button class="workspaceChat" type="button" :title="project.name" :disabled="disabled" @click="emit('openChat', project, chat.file, chat.mode)"><icon-message :size="14" /><span>{{ chat.name }} · {{ project.name }}</span></button>
        <el-dropdown class="rowAction" trigger="click" @command="command => editChat(project, chat, command)">
          <button class="treeIcon" type="button" :aria-label="`${translate('对话操作')} · ${chat.name}`" :disabled="disabled"><icon-dots :size="15" /></button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item command="rename">{{ translate('重命名') }}</el-dropdown-item><el-dropdown-item command="remove">{{ translate('删除对话') }}</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
      </div>
    </div>
    <template v-else>
    <p v-if="!projects.length" class="workspaceEmpty">{{ translate('还没有项目') }}</p>
    <div v-for="project in projects" :key="project.directory" class="workspaceFolder">
      <div class="workspaceFolderRow">
        <button class="workspaceFolderChevron" type="button" :aria-label="translate(expanded.has(project.directory) ? '收起对话列表' : '展开对话列表')" :aria-expanded="expanded.has(project.directory)" @click="toggle(project.directory)">
          <icon-chevron-down v-if="expanded.has(project.directory)" :size="14" aria-hidden="true" />
          <icon-chevron-right v-else :size="14" aria-hidden="true" />
        </button>
        <button class="workspaceFolderToggle" type="button" :aria-label="`${translate('打开项目')} · ${project.name}`" :title="project.name" :aria-current="store.project?.directory === project.directory ? 'true' : undefined" :disabled="disabled" @click="emit('openProject', project)">
          <icon-folder :size="15" aria-hidden="true" />
          <span>{{ project.name }}</span>
        </button>
        <button class="treeIcon rowAction" type="button" :aria-label="`${translate('新建对话')} · ${project.name}`" :title="translate('新建对话')" :disabled="disabled" @click="emit('createChat', project)"><icon-plus :size="15" /></button>
        <el-dropdown class="rowAction" trigger="click" @command="command => editProject(project, command)">
          <button class="treeIcon" type="button" :aria-label="`${translate('项目操作')} · ${project.name}`" :disabled="disabled"><icon-dots :size="15" /></button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item command="open">{{ translate('打开项目') }}</el-dropdown-item><el-dropdown-item command="rename">{{ translate('重命名') }}</el-dropdown-item><el-dropdown-item command="remove">{{ translate('删除项目') }}</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
      </div>
      <div v-if="expanded.has(project.directory)" class="workspaceChats">
        <div v-for="chat in chatsFor(project.directory)" :key="chat.file" class="workspaceFolderRow">
        <button type="button" class="workspaceChat"
          :aria-current="active?.directory === project.directory && active.file === chat.file ? 'true' : undefined"
          :title="chat.name" :disabled="disabled" @click="emit('openChat', project, chat.file, chat.mode)">
          <icon-message :size="14" aria-hidden="true" />
          <span>{{ chat.name || translate('新对话') }}</span>
        </button>
        <el-dropdown class="rowAction" trigger="click" @command="command => editChat(project, chat, command)">
          <button class="treeIcon" type="button" :aria-label="`${translate('对话操作')} · ${chat.name}`" :disabled="disabled"><icon-dots :size="15" /></button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item command="rename">{{ translate('重命名') }}</el-dropdown-item><el-dropdown-item command="remove">{{ translate('删除对话') }}</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
        </div>
        <button v-if="errors.has(project.directory)" class="workspaceChat" type="button" @click="load(project.directory)">{{ translate('读取对话失败，点击重试') }}</button>
        <p v-else-if="!chats.get(project.directory)?.length" class="workspaceEmpty">{{ translate(loading.has(project.directory) ? '正在读取对话…' : '还没有对话') }}</p>
      </div>
    </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { translate } from "@lumo/i18n/vue";
import { IconAdjustmentsHorizontal, IconChevronDown, IconChevronRight, IconDots, IconFolder, IconMessage, IconPlus, IconSearch } from "@tabler/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRouter } from "vue-router";
import http from "@/lib/http";
import { useWorkspaceStore, type Project, type ProjectMode } from "@/stores/workspace";
import type { AgentHistory } from "@/components/agent/types";

const { disabled } = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ openProject: [project: Project]; openChat: [project: Project, file: string, mode?: ProjectMode]; createProject: []; createChat: [project: Project] }>();
const store = useWorkspaceStore();
type ProjectFilter = "all" | "drama" | "aiCreation" | "videoEditing" | "exported";
const filter = ref<ProjectFilter>("all");
const filters = computed<{ label: string; value: ProjectFilter }[]>(() => [
  { label: translate("全部"), value: "all" },
  { label: translate("短剧"), value: "drama" },
  { label: translate("AI创作"), value: "aiCreation" },
  { label: translate("视频剪辑"), value: "videoEditing" },
  { label: translate("已导出"), value: "exported" },
]);
const matches = (project: Project, value: string) => {
  if (value === "all") return true;
  if (value === "exported") return project.status === "exported";
  return (project.category ?? (project.mode === "edit" ? "videoEditing" : "aiCreation")) === value;
};
const projects = computed(() => store.projectList.filter(project => matches(project, filter.value)));
const router = useRouter();
const grouped = ref(true);
const sortByCreated = ref(true);
const searchOpen = ref(false);
const query = ref("");
function setView(command: string) {
  if (command.startsWith("group:")) grouped.value = command === "group:project";
  else if (command.startsWith("sort:")) sortByCreated.value = command === "sort:created";
  else {
    const option = filters.value.find(option => command === `filter:${option.value}`);
    if (option) filter.value = option.value;
  }
}

async function askName(title: string, name: string) {
  const result = await ElMessageBox.prompt(translate("输入名称"), translate(title), {
    inputValue: name,
    inputValidator: value => !!value?.trim() && value.trim().length <= 80,
  }).catch(() => undefined);
  return result?.value.trim();
}

async function editProject(project: Project, command: string) {
  if (disabled) return;
  if (command === "open") return emit("openProject", project);
  if (command === "rename") {
    const name = await askName("重命名项目", project.name);
    if (name) store.renameProject(project.directory, name);
  } else if (command === "remove") {
    const confirmed = await ElMessageBox.confirm(translate("从工作区移除此项目，保留本地文件夹及对话。"), translate("删除项目"), { type: "warning" }).then(() => true, () => false);
    if (!confirmed) return;
    if (store.project?.directory === project.directory && router.currentRoute.value.path === "/workspace" && await router.push("/home")) return;
    store.removeProject(project.directory);
  }
}

async function editChat(project: Project, chat: AgentHistory, command: string) {
  if (disabled || !/^[\w-]+\.jsonl$/.test(chat.file)) return;
  const directory = project.directory;
  try {
    let renamed: string | undefined;
    if (command === "rename") {
      const name = await askName("重命名对话", chat.name);
      if (!name || name === chat.name) return;
      await http({ method: "PATCH", url: "/api/agent/rename", data: { directory, sessionFile: chat.file, name } });
      renamed = name;
    } else if (command === "remove") {
      const confirmed = await ElMessageBox.confirm(translate("确定删除此对话？"), translate("删除对话"), { type: "warning" }).then(() => true, () => false);
      if (!confirmed) return;
      await http({ method: "DELETE", url: "/api/agent/remove", data: { directory, sessionFile: chat.file } });
    } else return;
    store.sidebarSessionChange = { directory, file: chat.file, removed: command === "remove", name: renamed };
    store.agentHistoryChange = { directory };
    await load(directory);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("操作失败"));
  }
}

const active = computed(() => store.activeAgentSession);
const expanded = reactive(new Set<string>());
const chats = reactive(new Map<string, AgentHistory[]>());
const loading = reactive(new Set<string>());
const errors = reactive(new Set<string>());
const lifetime = new AbortController();
onScopeDispose(() => lifetime.abort());

async function load(directory: string) {
  if (loading.has(directory)) return;
  loading.add(directory);
  errors.delete(directory);
  try {
    chats.set(directory, await http<AgentHistory[]>({ method: "GET", url: "/api/agent/list", params: { directory }, signal: lifetime.signal }));
  } catch {
    if (!lifetime.signal.aborted) errors.add(directory);
  } finally {
    loading.delete(directory);
  }
}

function compareChats(a: AgentHistory, b: AgentHistory) {
  // 会话文件名以创建时间开头，文件名在继续对话或重命名时保持不变。
  if (sortByCreated.value) return b.file.localeCompare(a.file);
  return a.name.localeCompare(b.name) || b.file.localeCompare(a.file);
}
function chatsFor(directory: string) {
  return [...(chats.get(directory) ?? [])].sort(compareChats);
}
const results = computed(() => {
  const text = query.value.trim().toLowerCase();
  return projects.value.flatMap(project => chatsFor(project.directory)
    .filter(chat => !searchOpen.value || chat.name.toLowerCase().includes(text))
    .map(chat => ({ project, chat }))).sort((a, b) => compareChats(a.chat, b.chat));
});
watch([searchOpen, grouped, projects], ([search, group, list]) => {
  if (search || !group) for (const project of list) void load(project.directory);
});

function toggle(directory: string) {
  if (expanded.delete(directory)) return;
  expanded.add(directory);
  void load(directory);
}

watch(() => store.project?.directory, directory => {
  if (!directory) return;
  expanded.add(directory);
  void load(directory);
}, { immediate: true });

watch(() => store.agentHistoryChange, change => {
  if (!change) return;
  // ACT: 新 Agent 一启动就展开所属项目并刷新，索引立即可见。
  if (grouped.value) expanded.add(change.directory);
  void load(change.directory);
});
</script>

<style scoped lang="scss">
.workspaceTree {
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);

  .workspaceTreeHeading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; font-weight: 600; color: var(--el-text-color-secondary); }
  .treeActions { display: flex; gap: 2px; }
  .treeIcon { display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
  .treeIcon:hover, .treeIcon:focus-visible { background: var(--el-fill-color-light); }
  .rowAction { opacity: 0; flex-shrink: 0; }
  .workspaceFolderRow:hover .rowAction, .workspaceFolderRow:focus-within .rowAction { opacity: 1; }
  @media (hover: none) { .rowAction { opacity: 1; } }
  .searchInput { margin-bottom: 6px; }
  .workspaceFolderRow {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-inline-end: 3px;
    border-radius: 8px;

    &:hover, &:focus-within { background: var(--el-fill-color-light); }
    &:has(> [aria-current="true"]) { background: var(--el-fill-color); }
    &:has(> .workspaceChat[aria-current="true"]) { background: var(--el-color-primary-light-9); }
  }
  .workspaceFolderToggle, .workspaceChat {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 4px 6px;
    border: 0;
    border-radius: var(--ui-radius);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;

    &:hover:not(:disabled), &[aria-current="true"] { color: var(--el-text-color-primary); }
    &.workspaceChat[aria-current="true"] { color: var(--el-color-primary); }
    &:disabled { cursor: wait; }
    svg { flex-shrink: 0; }
    span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  .workspaceFolderChevron {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 18px;
    height: 28px;
    padding: 0;
    color: var(--el-text-color-secondary);
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;

    &:hover { color: var(--el-text-color-primary); background: var(--el-fill-color-light); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
  }

  .workspaceFolderToggle, .workspaceChat { flex: 1; min-width: 0; }
  .workspaceChat { width: 100%; }
  .workspaceChats { margin-inline-start: 17px; padding-inline-start: 4px; border-inline-start: 1px solid var(--el-border-color-lighter); }
  .workspaceEmpty { margin: 4px 6px 8px; color: var(--el-text-color-secondary); font-size: 12px; }
}
</style>
