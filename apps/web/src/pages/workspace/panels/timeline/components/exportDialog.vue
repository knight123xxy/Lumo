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
      <el-checkbox v-if="hasSubtitles" v-model="embedSubtitles" :disabled="exporting">{{ translate("将字幕作为可切换的 MP4 字幕轨") }}</el-checkbox>
      <div class="exportSize">{{ translate("输出尺寸") }}：{{ outputWidth }} × {{ outputHeight }} · {{ translate("时长") }} {{ durationLabel }}</div>
      <el-progress v-if="exporting" :percentage="progress" :stroke-width="10" />
      <p v-if="errorText" class="exportError">{{ errorText }}</p>
      <p v-if="resultPath" class="exportResult">{{ translate("已导出到") }}：{{ resultPath }}</p>
      <p v-if="creditsPath" class="exportResult">{{ translate("素材署名") }}：{{ creditsPath }}</p>
      <el-button v-if="creditsPath" :loading="downloadingCredits" @click="downloadCredits">{{ translate('下载素材署名') }}</el-button>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ translate("关闭") }}</el-button>
      <el-button type="primary" :loading="exporting" :disabled="!duration" @click="exportNow">{{ translate("导出") }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElButton, ElCheckbox, ElDialog, ElMessage, ElOption, ElProgress, ElSelect } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { useWorkspaceStore } from "@/stores/workspace";
import { formatTime } from "../timelineModel";
import { exportTimeline } from "../timelineExport";
import type { TimelineProject } from "../timelineTypes";

const props = defineProps<{
  modelValue: boolean;
  directory: string;
  project: TimelineProject;
  duration: number;
  automaticFilm?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const workspaceStore = useWorkspaceStore();
const embedSubtitles = ref(false);
watch(() => props.modelValue, open => {
  if (open) embedSubtitles.value = props.automaticFilm === true;
});
const hasSubtitles = computed(() => props.project.tracks.some(track => track.type === "subtitle" && !track.hidden && track.clips.some(clip => clip.text.trim())));
const resolution = ref(1080);
const bitrate = ref("8M");
const exporting = ref(false);
const progress = ref(0);
const errorText = ref("");
const resultPath = ref("");
const creditsPath = ref("");
const creditsDirectory = ref("");
const downloadingCredits = ref(false);
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
const outputHeight = computed(() => aspect.value < 1 ? Math.round(resolution.value / aspect.value / 2) * 2 : resolution.value);
const outputWidth = computed(() => aspect.value < 1 ? resolution.value : Math.round(resolution.value * aspect.value / 2) * 2);
const durationLabel = computed(() => formatTime(props.duration));

async function exportNow() {
  if (!props.duration || exporting.value) return;
  exporting.value = true;
  errorText.value = "";
  resultPath.value = "";
  creditsPath.value = "";
  progress.value = 0;
  try {
    const directory = props.directory;
    const project = JSON.parse(JSON.stringify(props.project)) as TimelineProject;
    const files = useWorkspaceFiles(directory);
    await files.mkdir("exports").catch(() => {});
    const style = project.style;
    const slug = style?.slug.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "";
    const baseName = `剪辑${slug ? `_${slug}` : ""}_${Date.now()}`;
    const outputPath = `exports/${baseName}.mp4`;
    const credits = await exportTimeline(project, {
      directory,
      outputPath,
      width: outputWidth.value,
      height: outputHeight.value,
      videoBitrate: bitrate.value,
      embedSubtitles: hasSubtitles.value && embedSubtitles.value,
      normalizeAudio: props.automaticFilm === true,
      onProgress: percent => { progress.value = Math.round(percent); },
    });
    // 附带风格元数据：导出的 MP4 旁写一份同名 .style.json，保留 slug/name/essence/colors/fonts/motion。
    if (style) await files.writeJson(`exports/${baseName}.style.json`, style);
    if (credits.length) {
      const path = `exports/${baseName}.credits.json`;
      await files.writeJson(path, credits);
      creditsDirectory.value = directory;
      creditsPath.value = path;
    }
    resultPath.value = outputPath;
    const handle = files.acquireUrl(outputPath, "video/mp4");
    const url = await handle.url;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = outputPath.split("/").at(-1) ?? "剪辑.mp4";
    anchor.click();
    handle.release();
    workspaceStore.updateProjectMetadata(directory, { status: "exported" });
    ElMessage.success(translate("导出完成"));
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : translate("导出失败");
  } finally {
    exporting.value = false;
  }
}

async function downloadCredits() {
  if (!creditsPath.value || downloadingCredits.value) return;
  const path = creditsPath.value;
  const handle = useWorkspaceFiles(creditsDirectory.value).acquireUrl(path, "application/json");
  downloadingCredits.value = true;
  try {
    const anchor = document.createElement("a");
    anchor.href = await handle.url;
    anchor.download = path.split("/").at(-1) ?? "素材署名.json";
    anchor.click();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("下载素材署名失败"));
  } finally {
    handle.release();
    downloadingCredits.value = false;
  }
}

function reset() {
  progress.value = 0;
  errorText.value = "";
  resultPath.value = "";
  creditsPath.value = "";
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
