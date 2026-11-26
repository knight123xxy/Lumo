<template>
  <el-dialog v-model="visible" :title="translate(conversation ? '新建对话' : '新建项目')"
    width="min(440px, calc(100vw - 32px))" alignCenter appendToBody
    :showClose="!busy" :closeOnClickModal="!busy" :closeOnPressEscape="!busy">
    <div class="creationOptions">
      <label v-if="conversation" class="projectField">
        <span>{{ translate('所属项目') }}</span>
        <el-select v-model="directory" :disabled="busy" :aria-label="translate('所属项目')" :placeholder="translate('选择项目')">
          <el-option v-for="project in projects" :key="project.directory" :label="project.name" :value="project.directory" />
        </el-select>
      </label>
      <button class="modeOption" type="button" :disabled="busy || (conversation && !directory)" @click="emit('select', 'canvas')">
        <span class="modeIcon"><icon-vector :size="18" aria-hidden="true" /></span>
        <span>{{ translate(conversation ? '画布对话' : '画布项目') }}</span>
        <icon-chevron-right class="modeArrow" :size="15" aria-hidden="true" />
      </button>
      <button class="modeOption" type="button" :disabled="busy || (conversation && !directory)" @click="emit('select', 'edit')">
        <span class="modeIcon"><icon-movie :size="18" aria-hidden="true" /></span>
        <span>{{ translate(conversation ? '剪辑对话' : '剪辑项目') }}</span>
        <icon-chevron-right class="modeArrow" :size="15" aria-hidden="true" />
      </button>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { IconChevronRight, IconMovie, IconVector } from "@tabler/icons-vue";
import type { Project, ProjectMode } from "@/stores/workspace";

const visible = defineModel<boolean>({ required: true });
const directory = defineModel<string>("directory", { default: "" });
defineProps<{ conversation?: boolean; projects?: Project[]; busy?: boolean }>();
const emit = defineEmits<{ select: [mode: ProjectMode] }>();
</script>

<style scoped lang="scss">
.creationOptions {
  display: grid;
  gap: 8px;

  .projectField {
    display: grid;
    gap: 6px;
    margin-bottom: 6px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .modeOption {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 54px;
    padding: 8px 12px;
    color: var(--el-text-color-primary);
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--ui-radius);
    font: inherit;
    text-align: start;
    cursor: pointer;

    &:hover:not(:disabled) { background: var(--el-fill-color-light); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); }
    &:disabled { opacity: .55; cursor: default; }

    .modeIcon {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 7px;
      background: var(--el-fill-color-light);
    }

    .modeArrow { margin-inline-start: auto; color: var(--el-text-color-secondary); }
  }
}
</style>
