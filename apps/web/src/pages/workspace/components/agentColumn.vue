<template>
  <aside
    id="agentPanel"
    ref="column"
    class="agentColumn"
    :class="{ resizing, hidden: !visible }"
    :style="{ width: `${currentWidth}px` }"
    aria-label="AI 对话">
    <div
      v-if="visible"
      class="resizeHandle"
      role="separator"
      aria-label="拖动调整对话宽度"
      aria-orientation="vertical"
      :aria-valuenow="currentWidth"
      :aria-valuemin="minWidth"
      :aria-valuemax="maxWidth"
      tabindex="0"
      @pointerdown.prevent="startResize"
      @lostpointercapture="stopResize"
      @keydown="resizeWithKeyboard" />
    <div class="agentColumnInner">
      <agent ref="agentRef" v-model="visible" :mode="mode" :workspaceActive="active" @command="emit('command', $event)">
        <template #menuItems><slot name="menuItems" /></template>
      </agent>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import agent from "@/components/agent/index.vue";

defineProps<{ mode: "canvas" | "edit"; active: boolean }>();
const visible = defineModel<boolean>({ required: true });
const emit = defineEmits<{ command: [value: string] }>();

const agentRef = ref<InstanceType<typeof agent>>();
defineExpose({ appendPrompt: (text: string) => agentRef.value?.appendPrompt(text) });

const column = ref<HTMLElement>();
const availableWidth = ref(window.innerWidth);
const maxWidth = computed(() => Math.min(600, Math.max(36, availableWidth.value - 320)));
const minWidth = computed(() => Math.min(300, maxWidth.value));
const preferredWidth = ref(380);
const currentWidth = computed(() => Math.min(maxWidth.value, preferredWidth.value));
let widthObserver: ResizeObserver | undefined;
onMounted(() => {
  const shell = column.value?.parentElement;
  const sidebar = column.value?.previousElementSibling;
  if (!shell || !sidebar) return;
  const measure = () => { availableWidth.value = shell.clientWidth - sidebar.getBoundingClientRect().width; };
  widthObserver = new ResizeObserver(measure);
  widthObserver.observe(shell);
  widthObserver.observe(sidebar);
  measure();
});
const resizing = ref(false);

let resizeState: { pointerId: number; element: HTMLElement; startX: number; startWidth: number } | undefined;

function startResize(event: PointerEvent) {
  if (event.button !== 0 || resizeState) return;
  const element = event.currentTarget as HTMLElement;
  element.setPointerCapture(event.pointerId);
  resizeState = { pointerId: event.pointerId, element, startX: event.clientX, startWidth: currentWidth.value };
  resizing.value = true;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopResize);
  window.addEventListener("pointercancel", stopResize);
}

function onPointerMove(event: PointerEvent) {
  if (!resizeState || resizeState.pointerId !== event.pointerId) return;
  const delta = event.clientX - resizeState.startX;
  preferredWidth.value = Math.min(maxWidth.value, Math.max(minWidth.value, resizeState.startWidth + delta));
}

function stopResize(event: PointerEvent) {
  if (!resizeState || resizeState.pointerId !== event.pointerId) return;
  const { element, pointerId } = resizeState;
  resizeState = undefined;
  if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  resizing.value = false;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  preferredWidth.value = Math.min(maxWidth.value, Math.max(minWidth.value, currentWidth.value + (event.key === "ArrowRight" ? 16 : -16)));
}

onBeforeUnmount(() => {
  widthObserver?.disconnect();
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", stopResize);
  window.removeEventListener("pointercancel", stopResize);
});
</script>

<style scoped lang="scss">
.agentColumn {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: row;
  min-width: 0;
  height: 100dvh;
  background: var(--el-fill-color-blank);
  border-inline-end: 1px solid var(--el-border-color-lighter);
  box-sizing: border-box;

  &.resizing { cursor: ew-resize; user-select: none; }
  // ACT: 关闭后整栏消失，由侧栏的 Agent 索引重新打开。
  &.hidden { display: none; }

  .resizeHandle {
    position: absolute;
    top: 0;
    bottom: 0;
    inset-inline-end: 0;
    width: 5px;
    z-index: 1;
    cursor: ew-resize;
    touch-action: none;

    &:hover, &:focus-visible { background: var(--el-color-primary-light-5); }
    &:focus-visible { outline: none; }
  }

  .agentColumnInner {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding-block-start: var(--shellHeaderTop);
  }

  :deep(.agent) {
    flex: 1;
    min-height: 0;
  }

  :deep(.agentMenu) {
    min-block-size: var(--shellHeaderHeight);
    padding-block: 0;
    padding-inline-start: var(--agentHeaderStart, 12px);

    .subAgentCount { top: 0; }
  }
}
</style>
