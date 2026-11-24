<template>
  <el-dialog :modelValue="modelValue" :title="translate('整集模板')" width="min(560px, calc(100vw - 32px))"
    :closeOnClickModal="!working" :closeOnPressEscape="!working" :showClose="!working" @update:modelValue="emit('update:modelValue', $event)">
    <div class="templateForm">
      <p class="templateTip">{{ translate('竖屏模板固定镜头顺序与版式，只需换文案和素材。') }}</p>
      <label :for="`${formId}Theme`">{{ translate('视觉主题') }}</label>
      <el-select :id="`${formId}Theme`" v-model="themeId" :disabled="working">
        <el-option v-for="theme in themes" :key="theme.id" :label="theme.name" :value="theme.id" />
      </el-select>
      <label :for="`${formId}Title`">{{ translate('主标题') }}</label>
      <el-input :id="`${formId}Title`" v-model="title" :maxlength="60" showWordLimit :disabled="running" />
      <label :for="`${formId}Subtitle`">{{ translate('副标题') }}</label>
      <el-input :id="`${formId}Subtitle`" v-model="subtitle" :maxlength="80" :disabled="running" />
      <label :for="`${formId}Claim`">{{ translate('一句话主张') }}</label>
      <el-input :id="`${formId}Claim`" v-model="claim" :maxlength="40" :disabled="running" />
      <label :for="`${formId}Cta`">{{ translate('结尾行动号召') }}</label>
      <el-input :id="`${formId}Cta`" v-model="cta" :maxlength="30" :disabled="running" />
      <label :id="`${formId}Screen`">{{ translate('录屏素材') }}</label>
      <div class="templateSlot">
        <el-select v-model="screenPath" clearable :disabled="working" :aria-labelledby="`${formId}Screen`" :placeholder="translate('可选，从工程素材中选择视频')">
          <el-option v-for="asset in videos" :key="asset.id" :label="asset.name" :value="asset.path" />
        </el-select>
        <el-button :disabled="working || busy" :loading="uploading === 'screen'" @click="screenInput?.click()">{{ translate('上传录屏') }}</el-button>
        <input ref="screenInput" type="file" accept="video/*,.mp4,.mov,.webm,.m4v" hidden @change="upload($event, 'screen')" />
      </div>
      <label :id="`${formId}TitleCard`">{{ translate('纸片标题卡') }}</label>
      <div class="templateTitleCard">
        <el-checkbox v-model="titleCardEnabled" :disabled="working">{{ translate('插入一段纸片标题卡') }}</el-checkbox>
        <span class="templateHint">{{ translate(titleCardEnabled ? '+2 秒，接在录屏之后、「一句话主张」之前' : '可选，默认不加') }}</span>
      </div>
      <el-input v-if="titleCardEnabled" :id="`${formId}TitleCardText`" v-model="titleCardText" :maxlength="180" showWordLimit
        :disabled="running" :placeholder="translate('卡片文案，1-180 字')" :aria-labelledby="`${formId}TitleCard`" />
      <label :id="`${formId}Result`">{{ translate('结果素材') }}</label>
      <div class="templateSlot">
        <el-select v-model="resultPath" clearable :disabled="working" :aria-labelledby="`${formId}Result`" :placeholder="translate('可选，视频或图片')">
          <el-option v-for="asset in media" :key="asset.id" :label="asset.name" :value="asset.path" />
        </el-select>
        <el-button :disabled="working || busy" :loading="uploading === 'result'" @click="resultInput?.click()">{{ translate('上传结果素材') }}</el-button>
        <input ref="resultInput" type="file" accept="video/*,.mp4,.mov,.webm,.m4v,.jpg,.jpeg,.png,.webp,.bmp" hidden @change="upload($event, 'result')" />
      </div>
      <p v-if="titleCardMissing" class="templateError" role="alert">{{ translate('纸片标题卡需要 1-180 字文案') }}</p>
      <p v-if="error" role="alert" class="templateError">{{ error }}</p>
      <div class="templateActions">
        <el-button :disabled="working" @click="emit('update:modelValue', false)">{{ translate('关闭') }}</el-button>
        <el-button type="primary" :loading="running" :disabled="working || !title.trim() || titleCardMissing || props.busy" @click="render">{{ translate(props.canvas ? '渲染并加入画布' : '渲染并加入时间线') }}</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { ElButton, ElCheckbox, ElDialog, ElInput, ElOption, ElSelect } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import http from "@/lib/http";
import type { AssetItem } from "../timelineTypes";

const props = defineProps<{
  modelValue: boolean;
  directory: string;
  assets: AssetItem[];
  busy: boolean;
  canvas?: boolean;
  saveVideo?: (video: { path: string; name: string; mimeType: string }) => Promise<void>;
  importFiles: (files: File[], allowedKinds: readonly AssetItem["kind"][]) => Promise<AssetItem[]>;
}>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; generated: [video: { path: string; name: string; mimeType: string }] }>();
const formId = useId();
const themes = [
  { id: "coral-noir", name: "珊瑚暗夜" },
  { id: "claude-light", name: "橙光白" },
  { id: "amber-noir", name: "琥珀黑金" },
  { id: "blueprint-stone", name: "蓝图纸" },
  { id: "celadon-paper", name: "青瓷白" },
  { id: "graphite-signal", name: "石墨信号" },
] as const;
const themeId = ref<(typeof themes)[number]["id"]>("coral-noir");
const title = ref("");
const subtitle = ref("");
const claim = ref("");
const cta = ref("");
const screenPath = ref("");
const resultPath = ref("");
const titleCardEnabled = ref(false);
const titleCardText = ref("");
const running = ref(false);
const screenInput = ref<HTMLInputElement>();
const resultInput = ref<HTMLInputElement>();
const uploading = ref<"screen" | "result">();
const working = computed(() => running.value || !!uploading.value);
const titleCardMissing = computed(() => titleCardEnabled.value && !titleCardText.value.trim());
watch(titleCardEnabled, enabled => { if (enabled && !titleCardText.value.trim()) titleCardText.value = title.value.trim(); });
const stage = ref("");
const error = ref("");

const videos = computed(() => props.assets.filter(asset => asset.kind === "video"));
const media = computed(() => props.assets.filter(asset => asset.kind === "video" || asset.kind === "image"));

async function upload(event: Event, slot: "screen" | "result") {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || working.value || props.busy) return;
  uploading.value = slot;
  error.value = "";
  try {
    const [asset] = await props.importFiles([file], slot === "screen" ? ["video"] : ["video", "image"]);
    if (!asset) return;
    if (slot === "screen") screenPath.value = asset.path;
    else resultPath.value = asset.path;
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : translate("导入失败");
  } finally {
    uploading.value = undefined;
  }
}

async function render() {
  if (working.value || props.busy || !title.value.trim()) return;
  running.value = true;
  error.value = "";
  stage.value = translate("正在渲染模板");
  const output = `exports/模板成片-${Date.now()}.mp4`;
  try {
    const result = await http<{ output: string; seconds: number }>({
      method: "POST", url: "/api/template/render", timeout: 600000,
      data: {
        directory: props.directory, output,
        slots: {
          title: title.value.trim(),
          themeId: themeId.value,
          subtitle: subtitle.value.trim() || undefined,
          claim: claim.value.trim() || undefined,
          cta: cta.value.trim() || undefined,
          screenPath: screenPath.value || undefined,
          resultPath: resultPath.value || undefined,
          titleCard: titleCardEnabled.value && titleCardText.value.trim()
            ? { shotId: "paper-title-card" as const, text: titleCardText.value.trim() }
            : undefined,
        },
      },
    });
    stage.value = translate(props.canvas ? "正在加入画布" : "正在加入时间线");
    const video = { path: result.output, name: result.output.split("/").at(-1) ?? "模板成片.mp4", mimeType: "video/mp4" };
    if (props.saveVideo) await props.saveVideo(video);
    else emit("generated", video);
    emit("update:modelValue", false);
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : translate("模板渲染失败");
  } finally {
    running.value = false;
    stage.value = "";
  }
}
</script>

<style scoped lang="scss">
.templateForm {
  display: grid;
  gap: 8px;

  .templateTip { margin: 0 0 4px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
  .templateSlot {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }
  .templateError { color: var(--el-color-danger); margin: 0; }
  .templateTitleCard { display: flex; align-items: center; gap: 8px; }
  .templateHint { color: var(--el-text-color-secondary); font-size: 12px; }
  .templateActions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
}
</style>
