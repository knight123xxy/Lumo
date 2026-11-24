<template>
  <section class="workspaceTree" :aria-label="translate('工作区')">
    <header class="workspaceTreeHeading">
      <span>{{ translate('工作区') }}</span>
      <slot name="actions" />
    </header>
    <el-select v-model="filter" size="small" class="workspaceFilter" :aria-label="translate('项目分类')">
      <el-option v-for="option in filters" :key="option.value" :label="option.label" :value="option.value" />
    </el-select>
    <p v-if="!projects.length" class="workspaceEmpty">{{ translate('还没有项目') }}</p>
    <div v-for="project in projects" :key="project.directory" class="workspaceFolder">
      <div class="workspaceFolderRow">
        <button class="workspaceFolderToggle" type="button" :aria-expanded="expanded.has(project.directory)" :title="project.name" @click="toggle(project.directory)">
          <icon-chevron-down v-if="expanded.has(project.directory)" :size="14" aria-hidden="true" />
          <icon-chevron-right v-else :size="14" aria-hidden="true" />
          <icon-folder :size="15" aria-hidden="true" />
          <span>{{ project.name }}</span>
        </button>
        <button class="workspaceFolderOpen" type="button" :aria-label="`${translate('打开项目')} · ${project.name}`" :title="translate('打开项目')" :disabled="disabled" @click="emit('openProject', project)">
          <icon-arrow-up-right :size="15" aria-hidden="true" />
        </button>
      </div>
      <div v-if="expanded.has(project.directory)" class="workspaceChats">
        <button v-for="chat in chats.get(project.directory)" :key="chat.file" type="button" class="workspaceChat"
          :aria-current="active?.directory === project.directory && active.file === chat.file ? 'true' : undefined"
          :title="chat.name" :disabled="disabled" @click="emit('openChat', project, chat.file)">
          <icon-message :size="14" aria-hidden="true" />
          <span>{{ chat.name || translate('新对话') }}</span>
        </button>
        <button v-if="errors.has(project.directory)" class="workspaceChat" type="button" @click="load(project.directory)">{{ translate('读取对话失败，点击重试') }}</button>
        <p v-else-if="!chats.get(project.directory)?.length" class="workspaceEmpty">{{ translate(loading.has(project.directory) ? '正在读取对话…' : '还没有对话') }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from "vue";
import { ElOption, ElSelect } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { IconArrowUpRight, IconChevronDown, IconChevronRight, IconFolder, IconMessage } from "@tabler/icons-vue";
import http from "@/lib/http";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import type { AgentHistory } from "@/components/agent/types";

const { disabled } = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ openProject: [project: Project]; openChat: [project: Project, file: string] }>();
const store = useWorkspaceStore();
const filter = ref<"all" | "drama" | "aiCreation" | "videoEditing" | "exported">("all");
const filters = computed(() => [
  { label: translate("全部"), value: "all" },
  { label: translate("短剧"), value: "drama" },
  { label: translate("AI创作"), value: "aiCreation" },
  { label: translate("视频剪辑"), value: "videoEditing" },
  { label: translate("已导出"), value: "exported" },
]);
const projects = computed(() => store.projectList.filter(project => {
  if (filter.value === "all") return true;
  if (filter.value === "exported") return project.status === "exported";
  return (project.category ?? (project.mode === "edit" ? "videoEditing" : "aiCreation")) === filter.value;
}));
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

watch(() => store.agentHistoryChange, directory => {
  if (directory && expanded.has(directory.directory)) void load(directory.directory);
});
</script>

<style scoped lang="scss">
.workspaceTree {
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-regular);

  .workspaceTreeHeading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; font-weight: 600; color: var(--el-text-color-secondary); }
  .workspaceFilter { width: 100%; margin-bottom: 8px; }
  .workspaceFolderRow { display: flex; align-items: center; }
  .workspaceFolderToggle, .workspaceFolderOpen, .workspaceChat {
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

    &:hover:not(:disabled), &[aria-current="true"] { background: var(--el-fill-color-light); color: var(--el-text-color-primary); }
    &:disabled { cursor: wait; }
    svg { flex-shrink: 0; }
    span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  .workspaceFolderToggle, .workspaceChat { flex: 1; min-width: 0; }
  .workspaceChat { width: 100%; }
  .workspaceChats { margin-inline-start: 17px; padding-inline-start: 4px; border-inline-start: 1px solid var(--el-border-color-lighter); }
  .workspaceEmpty { margin: 4px 6px 8px; color: var(--el-text-color-secondary); font-size: 12px; }
}
</style>
