<template>
  <el-dialog :modelValue="modelValue" :title="translate('一键成片')" width="min(520px, calc(100vw - 32px))"
    :closeOnClickModal="!running" :closeOnPressEscape="!running" :showClose="!running" @update:modelValue="emit('update:modelValue', $event)">
    <automaticFilmForm :active="modelValue" :directory="props.directory" :assets="props.assets" :busy="props.busy" :importFiles="props.importFiles" :createFilm="props.createFilm" :currentStyle="props.currentStyle"
      @running="running = $event" @close="emit('update:modelValue', false)" @generated="onGenerated" />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElDialog } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import automaticFilmForm from "./automaticFilmForm.vue";
import type { AutomaticFilmDraft, AutomaticFilmInput } from "../automaticFilm";
import type { AssetItem, ProjectStyle } from "../timelineTypes";

const props = defineProps<{
  modelValue: boolean;
  directory: string;
  assets: AssetItem[];
  busy: boolean;
  importFiles: (files: File[]) => Promise<AssetItem[]>;
  createFilm: (input: AutomaticFilmInput, signal: AbortSignal, progress: (stage: string) => void, onSaving?: () => void) => Promise<AutomaticFilmDraft>;
  currentStyle?: ProjectStyle;
}>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; generated: [draft: AutomaticFilmDraft] }>();
const running = ref(false);
function onGenerated(draft: AutomaticFilmDraft) {
  emit("update:modelValue", false);
  emit("generated", draft);
}
</script>
