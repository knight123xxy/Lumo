<template>
  <section class="workspaceTree" :aria-label="translate('工作区')">
    <header class="workspaceTreeHeading">
      <span>{{ translate('工作区') }}</span>
      <slot name="actions" />
    </header>
    <div ref="filterRoot" class="workspaceFilter">
      <button class="filterTrigger" type="button" :aria-label="translate('项目分类')" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
        <icon-filter :size="13" aria-hidden="true" />
        <span class="filterLabel">{{ activeFilterLabel }}</span>
        <span class="filterCount">{{ projects.length }}</span>
        <icon-chevron-down :size="13" class="filterCaret" :class="{ open: menuOpen }" aria-hidden="true" />
      </button>
      <transition name="filterMenu">
        <ul v-if="menuOpen" class="filterMenu" role="listbox" :aria-label="translate('项目分类')">
          <li v-for="option in filtersWithCount" :key="option.value">
            <button type="button" role="option" :aria-selected="filter === option.value"
              :class="{ selected: filter === option.value, empty: !option.count }"
              @click="pickFilter(option.value)">
              <icon-check v-if="filter === option.value" :size="13" class="filterTick" aria-hidden="true" />
              <span v-else class="filterTick" aria-hidden="true" />
              <span class="filterOptionName">{{ option.label }}</span>
              <span class="filterOptionCount">{{ option.count }}</span>
            </button>
          </li>
        </ul>
      </transition>
    </div>
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
import { computed, onBeforeUnmount, onMounted, onScopeDispose, reactive, ref, watch } from "vue";
import { translate } from "@lumo/i18n/vue";
import { IconArrowUpRight, IconCheck, IconChevronDown, IconChevronRight, IconFilter, IconFolder, IconMessage } from "@tabler/icons-vue";
import http from "@/lib/http";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import type { AgentHistory } from "@/components/agent/types";

const { disabled } = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ openProject: [project: Project]; openChat: [project: Project, file: string] }>();
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
const filtersWithCount = computed(() => filters.value.map(option => ({
  ...option,
  count: store.projectList.filter(project => matches(project, option.value)).length,
})));
const activeFilterLabel = computed(() => filters.value.find(option => option.value === filter.value)?.label ?? filters.value[0]!.label);

// 轻量下拉：点击外部或按 Esc 关闭，不引入额外浮层依赖。
const filterRoot = ref<HTMLElement>();
const menuOpen = ref(false);
function pickFilter(value: ProjectFilter) {
  filter.value = value;
  menuOpen.value = false;
}
const onDocumentPointer = (event: PointerEvent) => {
  if (!menuOpen.value) return;
  if (!filterRoot.value?.contains(event.target as Node)) menuOpen.value = false;
};
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape" && menuOpen.value) { menuOpen.value = false; event.stopPropagation(); }
};
onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointer);
  document.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointer);
  document.removeEventListener("keydown", onKeydown);
});
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
  // 分类筛选：28px 触发器 + 自定义浮层，行高/字号/徽标对齐 8px 网格。
  .workspaceFilter { position: relative; width: 100%; margin: 2px 0 8px; }

  .filterTrigger {
    display: flex;
    gap: 6px;
    align-items: center;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    color: var(--el-text-color-regular);
    font: inherit;
    font-size: 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color .15s ease, border-color .15s ease, color .15s ease;

    &:hover { background: var(--el-fill-color-light); color: var(--el-text-color-primary); }
    &:focus-visible { outline: none; border-color: var(--color-border-2); background: var(--el-fill-color-light); }
  }

  .filterLabel { font-weight: 500; }
  .filterCount {
    padding: 1px 5px;
    color: var(--el-text-color-secondary);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    background: var(--el-fill-color);
    border-radius: 5px;
  }
  .filterCaret { margin-left: auto; opacity: .55; transition: transform .18s ease; }
  .filterCaret.open { transform: rotate(180deg); }

  .filterMenu {
    position: absolute;
    inset-inline: 0;
    top: calc(100% + 4px);
    z-index: 30;
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: 4px;
    overflow: hidden;
    list-style: none;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgb(0 0 0 / 10%);

    button {
      display: flex;
      gap: 6px;
      align-items: center;
      width: 100%;
      height: 30px;
      padding: 0 8px 0 7px;
      color: var(--el-text-color-regular);
      font: inherit;
      font-size: 12px;
      background: transparent;
      border: 0;
      border-radius: 7px;
      cursor: pointer;

      &:hover { background: var(--el-fill-color-light); color: var(--el-text-color-primary); }
      &.selected { color: var(--el-text-color-primary); font-weight: 500; }
      &.empty { color: var(--el-text-color-secondary); }
    }
  }

  .filterTick { width: 13px; flex-shrink: 0; opacity: .9; }
  .filterOptionName { flex: 1; min-width: 0; overflow: hidden; text-align: start; text-overflow: ellipsis; white-space: nowrap; }
  .filterOptionCount { color: var(--el-text-color-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }

  .filterMenu-enter-active, .filterMenu-leave-active { transition: opacity .14s ease, transform .14s ease; }
  .filterMenu-enter-from, .filterMenu-leave-to { opacity: 0; transform: translateY(-4px); }

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
