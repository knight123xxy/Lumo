<template>
  <el-dialog :model-value="modelValue" :title="translate('导出 MP4')" width="min(440px, calc(100vw - 32px))" alignCenter @update:model-value="$emit('update:modelValue', $event)" @closed="reset">
    <div class="exportForm">
      <div class="exportField">
        <label>{{ translate("分辨率") }}</label>
        <el-select v-model="resolution" size="small">
          <el-option v-for="option in resolutionOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </div>
      <div class="exportField">
        <label>{{ translate("码率") }}</label>
        <el-select v-model="bitrate" size="small">
          <el-option v-for="option in bitrateOptions" :key="option.value" :label="translate(option.label)" :value="option.value" />
        </el-select>
      </div>
      <div class="exportField">
        <label>{{ translate("格式") }}</label>
        <span class="exportStatic">MP4</span>
      </div>
      <div class="exportSize">{{ translate("输出尺寸") }}：{{ outputWidth }} × {{ outputHeight }} · {{ translate("时长") }} {{ durationLabel }}</div>
      <el-progress v-if="exporting" :percentage="progress" :stroke-width="10" />
      <p v-if="errorText" class="exportError">{{ errorText }}</p>
      <p v-if="resultPath" class="exportResult">{{ translate("已导出到") }}：{{ resultPath }}</p>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ translate("关闭") }}</el-button>
      <el-button type="primary" :loading="exporting" :disabled="!duration" @click="exportNow">{{ translate("导出") }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElDialog, ElMessage, ElOption, ElProgress, ElSelect } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { formatTime } from "../timelineModel";
import { exportTimeline } from "../timelineExport";
import type { TimelineProject } from "../timelineTypes";

const props = defineProps<{
  modelValue: boolean;
  directory: string;
  project: TimelineProject;
  duration: number;
}>();

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const resolution = ref(1080);
const bitrate = ref("8M");
const exporting = ref(false);
const progress = ref(0);
const errorText = ref("");
const resultPath = ref("");
const resolutionOptions = [
  { label: "1080P", value: 1080 },
  { label: "720P", value: 720 },
  { label: "480P", value: 480 },
];
const bitrateOptions = [
  { label: "高质量（12M）", value: "12M" },
  { label: "标准（8M）", value: "8M" },
  { label: "较小（4M）", value: "4M" },
];

const aspect = computed(() => {
  const width = props.project.width || 1920;
  const height = props.project.height || 1080;
  return width / height;
});
const outputHeight = computed(() => resolution.value);
const outputWidth = computed(() => Math.max(320, Math.round((resolution.value * aspect.value) / 2) * 2));
const durationLabel = computed(() => formatTime(props.duration));

async function exportNow() {
  if (!props.duration || exporting.value) return;
  exporting.value = true;
  errorText.value = "";
  resultPath.value = "";
  progress.value = 0;
  try {
    const files = useWorkspaceFiles(props.directory);
    await files.mkdir("exports").catch(() => {});
    const outputPath = `exports/剪辑_${Date.now()}.mp4`;
    await exportTimeline(props.project, {
      directory: props.directory,
      outputPath,
      width: outputWidth.value,
      height: outputHeight.value,
      videoBitrate: bitrate.value,
      onProgress: percent => { progress.value = Math.round(percent); },
    });
    resultPath.value = outputPath;
    const handle = files.acquireUrl(outputPath, "video/mp4");
    const url = await handle.url;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = outputPath.split("/").at(-1) ?? "剪辑.mp4";
    anchor.click();
    handle.release();
    ElMessage.success(translate("导出完成"));
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : translate("导出失败");
  } finally {
    exporting.value = false;
  }
}

function reset() {
  progress.value = 0;
  errorText.value = "";
  resultPath.value = "";
}
</script>

<style scoped lang="scss">
.exportForm {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .exportField {
    display: flex;
    align-items: center;
    gap: 12px;

    label {
      flex: 0 0 56px;
      color: var(--el-text-color-secondary);
      font-size: 13px;
    }

    .exportStatic {
      color: var(--el-text-color-primary);
      font-size: 13px;
    }
  }

  .exportSize {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .exportError {
    margin: 0;
    color: var(--el-color-danger);
    font-size: 12px;
  }

  .exportResult {
    margin: 0;
    color: var(--el-color-success);
    font-size: 12px;
    word-break: break-all;
  }
}
</style>
