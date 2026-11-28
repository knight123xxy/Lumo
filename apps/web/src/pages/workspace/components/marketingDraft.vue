<template>
  <form class="marketingDraft" @submit.prevent="generate">
    <p v-if="recipe">{{ recipe }}</p>
    <label :for="`${formId}Product`">{{ translate('商品图') }}</label>
    <input :id="`${formId}Product`" type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="selectImage($event, 'product')" />
    <label :for="`${formId}Character`">{{ translate('角色参考图（可选）') }}</label>
    <input :id="`${formId}Character`" type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="selectImage($event, 'character')" />
    <label :for="`${formId}Platform`">{{ translate('投放平台') }}</label>
    <el-input :id="`${formId}Platform`" v-model="platform" :maxlength="60" :disabled="busy" />
    <label :for="`${formId}Pitch`">{{ translate('商品卖点') }}</label>
    <el-input :id="`${formId}Pitch`" v-model="pitch" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" :maxlength="2000" :disabled="busy" />
    <label :id="`${formId}Model`">{{ translate('支持图片输入的模型') }}</label>
    <el-select v-model="modelKey" :aria-labelledby="`${formId}Model`" :loading="loading" :disabled="busy">
      <el-option v-for="model in models" :key="getNodeModelKey(model)" :label="model.label" :value="getNodeModelKey(model)" />
    </el-select>
    <p v-if="error" class="draftError" role="alert">{{ error }}</p>
    <div class="draftActions">
      <el-button v-if="busy" @click="request?.abort()">{{ translate('取消') }}</el-button>
      <el-button type="primary" nativeType="submit" :loading="busy" :disabled="busy || loading || !product || !platform.trim() || !pitch.trim() || !modelKey">{{ translate('生成广告脚本') }}</el-button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { onMounted, onScopeDispose, ref, shallowRef, useId } from "vue";
import { ElButton, ElInput, ElOption, ElSelect } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { findNodeModel, getNodeModelIdentity, getNodeModelKey, useNodeAi, type NodeAiModel } from "@lumo/nodes-scaffold/nodeAi";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import axios from "axios";
import saveTextCanvas from "./saveTextCanvas";

const props = defineProps<{ directory: string; recipe?: string }>();
const emit = defineEmits<{ busy: [value: boolean]; saved: [directory: string, path: string] }>();
const formId = useId();
const ai = useNodeAi();
const models = shallowRef<NodeAiModel[]>([]);
const modelKey = ref("");
const platform = ref("");
const pitch = ref("");
const product = shallowRef<File>();
const character = shallowRef<File>();
const busy = ref(false);
const loading = ref(true);
const error = ref("");
const lifetime = new AbortController();
let request: AbortController | undefined;
const imageSuffix: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const uploaded = new WeakMap<File, string>();

onScopeDispose(() => { lifetime.abort(); request?.abort(); });
onMounted(async () => {
  try {
    models.value = await ai.getModels(lifetime.signal);
    if (!models.value.length) error.value = translate("请先配置支持图片输入的模型");
  } catch (failure) {
    if (!lifetime.signal.aborted) showError(failure);
  } finally { loading.value = false; }
});

function showError(failure: unknown) {
  error.value = failure instanceof Error ? failure.message : translate("生成广告脚本失败");
}

function selectImage(event: Event, kind: "product" | "character") {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const target = kind === "product" ? product : character;
  error.value = "";
  if (file && (!Object.hasOwn(imageSuffix, file.type) || !file.size || file.size > 5 * 1024 * 1024)) {
    target.value = undefined;
    input.value = "";
    error.value = translate("请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片");
    return;
  }
  target.value = file;
}

async function generate() {
  const model = findNodeModel(models.value, modelKey.value);
  if (busy.value || !model || !product.value || !platform.value.trim() || !pitch.value.trim()) return;
  const directory = props.directory;
  const files = useWorkspaceFiles(directory);
  const images = [product.value, ...(character.value ? [character.value] : [])];
  const brief = `${props.recipe ? `参考模板：${props.recipe}\n` : ""}投放平台：${platform.value.trim()}\n商品卖点：${pitch.value.trim()}\n第一张图片是商品图。${character.value ? "第二张图片是角色参考，只用来构思出镜方式。" : "没有指定出镜角色。"}`;
  const controller = request = new AbortController();
  busy.value = true;
  emit("busy", true);
  error.value = "";
  try {
    await files.mkdir("assets").catch(failure => {
      if (!axios.isAxiosError<{ data?: { code?: string } }>(failure) || failure.response?.data?.data?.code !== "EEXIST") throw failure;
    });
    const references = [];
    for (const image of images) {
      controller.signal.throwIfAborted();
      let url = uploaded.get(image);
      if (!url) {
        url = `assets/marketing-${crypto.randomUUID()}.${imageSuffix[image.type]}`;
        await files.write(url, image, true, controller.signal);
        uploaded.set(image, url);
      }
      references.push({ dataType: "IMAGE" as const, value: { url, mimeType: image.type } });
    }
    const { text } = await ai.generate({ ...getNodeModelIdentity(model), directory, signal: controller.signal, references, prompt: brief,
      systemPrompt: "根据商品图、用户提供的卖点和平台，写一份中文短视频广告脚本草稿。只输出可编辑的 Markdown，包含开场钩子、按镜头列出的画面和台词、结尾行动提示。只使用可从图或用户描述确认的商品信息，不能编造认证、销量、价格、功效和承诺。遇到缺失信息用待确认标记。" });
    if (!text.trim() || text.length > 18000) throw new Error(translate("模型没有返回有效的广告脚本，请重试"));
    const path = await saveTextCanvas(directory, "营销脚本", [
      { label: "营销需求", items: [brief + "\n\n" + references.map(({ value }, index) => `${index ? "角色参考" : "商品图"}：${value.url}`).join("\n")] },
      { label: "广告脚本", items: [text.trim()] },
    ], controller.signal);
    if (!lifetime.signal.aborted) emit("saved", directory, path);
  } catch (failure) {
    if (controller.signal.aborted) error.value = translate("已取消生成");
    else showError(failure);
  } finally {
    busy.value = false;
    request = undefined;
    emit("busy", false);
  }
}
</script>

<style scoped>
.marketingDraft { display: grid; gap: 10px; }
.draftActions { display: flex; justify-content: flex-end; gap: 8px; }
.draftError { margin: 0; color: var(--el-color-danger); }
</style>
