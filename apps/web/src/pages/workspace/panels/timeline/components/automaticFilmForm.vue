<template>
  <div class="filmForm">
    <label :for="`${formId}Topic`">{{ translate('短片主题') }}</label>
    <el-input :id="`${formId}Topic`" v-model="topic" type="textarea" :maxlength="500" :disabled="running" />
    <div>
      <el-button size="small" :loading="importing" :disabled="busy || running" @click="videoInput?.click()">{{ translate('导入视频') }}</el-button>
      <input ref="videoInput" type="file" accept="video/*,.mp4,.mov,.webm,.m4v" multiple hidden @change="importVideos" />
    </div>
    <label :id="`${formId}Assets`">{{ translate('本地视频（按旁白逐句选用）') }}</label>
    <el-select v-model="selected" multiple :multipleLimit="8" :disabled="running" :aria-labelledby="`${formId}Assets`">
      <el-option v-for="asset in videos" :key="asset.id" :label="asset.name" :value="asset.id" />
    </el-select>
    <label :id="`${formId}Style`">{{ translate('成片风格') }}</label>
    <el-select v-model="styleSlug" clearable :disabled="running" :placeholder="translate('不指定，沿用工程风格')" :aria-labelledby="`${formId}Style`">
      <el-option-group v-for="group in styleGroups" :key="group.name" :label="group.name">
        <el-option v-for="item in group.styles" :key="item.slug" :label="item.name" :value="item.slug" />
      </el-option-group>
    </el-select>
    <details :open="!inline" class="filmSettings">
      <summary>{{ translate('模型设置') }}</summary>
      <div class="filmForm">
        <label :id="`${formId}Writer`">{{ translate('文案模型') }}</label>
        <el-select v-model="writerId" :loading="loading" :disabled="running" :aria-labelledby="`${formId}Writer`">
          <el-option v-for="model in writers" :key="getNodeModelKey(model)" :label="model.label" :value="getNodeModelKey(model)" />
        </el-select>
        <label :id="`${formId}Narrator`">{{ translate('配音模型') }}</label>
        <el-select v-model="narratorId" :loading="loading" :disabled="running" :aria-labelledby="`${formId}Narrator`">
          <el-option v-for="model in narrators" :key="getNodeModelKey(model)" :label="model.label" :value="getNodeModelKey(model)" />
        </el-select>
      </div>
    </details>
    <p v-if="stage" role="status">{{ stage }}</p>
    <p v-if="error" role="alert" class="filmError">{{ error }}</p>
    <p>{{ translate('生成会调用所选模型，按供应商规则计费。可编辑草稿将追加到时间线。') }}</p>
    <div class="filmActions">
      <el-button v-if="running || !inline" @click="cancel">{{ translate(running ? '取消生成' : '关闭') }}</el-button>
      <el-button type="primary" :loading="running" :disabled="loading || busy || importing || !topic.trim() || !selected.length || !writerId || !narratorId" @click="generate">{{ translate('生成草稿') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef, useId, watch } from "vue";
import { ElButton, ElInput, ElMessage, ElMessageBox, ElOption, ElOptionGroup, ElSelect } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { findNodeModel, getNodeModelIdentity, getNodeModelKey, useNodeAi, type NodeAiModel, type NodeMediaModel } from "@lumo/nodes-scaffold/nodeAi";
import http from "@/lib/http";
import type { AutomaticFilmDraft, AutomaticFilmInput } from "../automaticFilm";
import { styleGroups, styleSections } from "../videoStyles";
import type { AssetItem, ProjectStyle } from "../timelineTypes";

const props = defineProps<{
  active: boolean;
  directory: string;
  inline?: boolean;
  assets: AssetItem[];
  busy: boolean;
  importFiles: (files: File[]) => Promise<AssetItem[]>;
  createFilm: (input: AutomaticFilmInput, signal: AbortSignal, progress: (stage: string) => void) => Promise<AutomaticFilmDraft>;
  currentStyle?: ProjectStyle;
}>();
const emit = defineEmits<{ close: []; generated: []; running: [value: boolean]; importing: [value: boolean] }>();
const formId = useId();
const ai = useNodeAi();
const topic = defineModel<string>("topic", { default: "" });
const selected = ref<string[]>([]);
const styleSlug = ref(props.currentStyle?.slug ?? "");

function resolveStyle(): ProjectStyle | undefined {
  const slug = styleSlug.value;
  if (!slug) return props.currentStyle;
  for (const group of styleGroups) {
    const item = group.styles.find(style => style.slug === slug);
    if (!item) continue;
    const sections = styleSections[slug] ?? {};
    return {
      slug: item.slug, name: item.name, group: group.name, summary: item.summary,
      essence: sections.essence, colors: sections.colors, fonts: sections.fonts, motion: sections.motion,
    };
  }
  return props.currentStyle;
}
const writers = ref<NodeAiModel[]>([]);
const narrators = shallowRef<NodeMediaModel[]>([]);
const writerId = ref("");
const narratorId = ref("");
const loading = ref(false);
const running = ref(false);
const importing = ref(false);
const videoInput = ref<HTMLInputElement>();

async function importVideos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length || props.busy || running.value) return;
  importing.value = true;
  emit("importing", true);
  error.value = "";
  try {
    const added = await props.importFiles(files);
    selected.value = [...selected.value, ...added.filter(asset => asset.kind === "video").map(asset => asset.id)].slice(0, 8);
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : translate("导入失败");
  } finally {
    importing.value = false;
    emit("importing", false);
  }
}
const stage = ref("");
const error = ref("");
const videos = computed(() => props.assets.filter(asset => asset.kind === "video"));
let controller: AbortController | undefined;

watch(() => props.active, async (open, _, onCleanup) => {
  if (!open) return;
  const signal = new AbortController();
  onCleanup(() => signal.abort());
  loading.value = true;
  stage.value = "";
  error.value = "";
  selected.value = selected.value.filter(id => videos.value.some(asset => asset.id === id));
  try {
    const [text, media] = await Promise.all([ai.getModels(signal.signal, true), ai.getMediaModels(signal.signal, true)]);
    signal.signal.throwIfAborted();
    writers.value = text;
    narrators.value = media.filter(model => model.type === "audio");
    if (!findNodeModel(writers.value, writerId.value)) writerId.value = text[0] ? getNodeModelKey(text[0]) : "";
    if (!findNodeModel(narrators.value, narratorId.value)) narratorId.value = narrators.value[0] ? getNodeModelKey(narrators.value[0]) : "";
    if (!writerId.value || !narratorId.value) error.value = translate("请先在模型设置中配置文案和配音模型");
  } catch (failure) {
    if (!signal.signal.aborted) error.value = failure instanceof Error ? failure.message : translate("加载模型失败");
  } finally {
    if (!signal.signal.aborted) loading.value = false;
  }
}, { immediate: true });

async function generate() {
  const writer = findNodeModel(writers.value, writerId.value);
  const narrator = findNodeModel(narrators.value, narratorId.value);
  const assets = selected.value.flatMap(id => videos.value.filter(asset => asset.id === id));
  if (running.value || props.busy || !writer || !narrator || !assets.length || !topic.value.trim()) return;
  const topicSnapshot = topic.value.trim();
  const request = new AbortController();
  controller = request;
  running.value = true;
  emit("running", true);
  error.value = "";
  stage.value = translate("正在检查视频素材");
  try {
    stage.value = translate("正在读取生成报价");
    const writerModel = getNodeModelIdentity(writer);
    const narratorModel = getNodeModelIdentity(narrator);
    const details = [translate("旁白和分镜共用 1 次文案请求，分镜通过检查后按句配音 3–6 次")];
    if (writerModel.providerId === "multiTenant" && narratorModel.providerId === "multiTenant") {
      const totals = await http<{ currency: string; amount: string }[]>({ method: "POST", url: "/api/ai/filmPrice", signal: request.signal,
        data: { writerId: writerModel.modelId, narratorId: narratorModel.modelId } });
      details.push(`${translate("整单保守预估")} · ${totals.map(({ currency, amount }) => `${amount} ${currency}`).join(" + ")}`);
      details.push(translate("文案按钱包预占上限计算，配音最多六次，实扣以用量结算"));
    } else {
      // ACT: 供应商报价可能长时间不返回，超时即降级为「未提供报价」，不能把整单卡在报价阶段。
      const quoteSignal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
      const quote = await ai.getMediaPrice({ ...narratorModel, mediaType: "audio", directory: props.directory, outputDirectory: "assets/timeline", prompt: "" }, quoteSignal).catch(() => null);
      details.push(`${translate("配音报价")} · ${quote?.price ?? translate("供应商未提供报价")}`);
      details.push(translate("整单金额未知，以供应商账单为准"));
    }
    request.signal.throwIfAborted();
    const confirmed = await ElMessageBox.confirm(details.join("\n"), translate("确认生成用量与报价"), { confirmButtonText: translate("确认生成"), cancelButtonText: translate("取消") }).then(() => true, () => false);
    if (!confirmed) return;
    request.signal.throwIfAborted();
    stage.value = translate("正在检查视频素材");
    const draft = await props.createFilm({ topic: topicSnapshot, assets, writer, narrator, style: resolveStyle() }, request.signal, value => { stage.value = value; });
    if (draft.hasVideoGaps) ElMessage.warning(translate("部分镜头短于实际配音，已保留旁白和字幕，请在时间线补齐画面"));
    emit("generated");
  } catch (failure) {
    error.value = request.signal.aborted ? translate("已取消生成") : failure instanceof Error ? failure.message : translate("生成失败");
  } finally {
    running.value = false;
    emit("running", false);
    stage.value = "";
    controller = undefined;
  }
}

function cancel() {
  if (running.value) controller?.abort();
  else emit("close");
}

onScopeDispose(() => controller?.abort());
</script>

<style scoped lang="scss">
.filmForm {
  display: grid;
  gap: 8px;

  p { margin: 4px 0; }
  .filmSettings summary { cursor: pointer; margin-bottom: 6px; }
  .filmActions { display: flex; justify-content: flex-end; gap: 8px; }
  .filmError { color: var(--el-color-danger); }
}
</style>
