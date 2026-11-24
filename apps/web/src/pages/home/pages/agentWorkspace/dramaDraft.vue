<template>
  <div class="dramaDraft">
    <label :for="scriptId">{{ translate('剧本原文') }}</label>
    <el-input :id="scriptId" v-model="script" type="textarea" :autosize="{ minRows: 6, maxRows: 14 }" :maxlength="scriptLimit" showWordLimit :disabled="busy" />
    <label :id="modelLabelId">{{ translate('文案模型') }}</label>
    <el-select v-model="modelId" :aria-labelledby="modelLabelId" :loading="loading" :disabled="busy">
      <el-option v-for="model in models" :key="getNodeModelKey(model)" :label="model.label" :value="getNodeModelKey(model)" />
    </el-select>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="draftActions">
      <el-button v-if="busy" @click="request?.abort()">{{ translate('取消') }}</el-button>
      <el-button type="primary" :loading="busy" :disabled="!script.trim() || !modelId || loading" @click="generate">{{ translate('拆解剧本') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, shallowRef, useId, watch } from "vue";
import { translate } from "@lumo/i18n/vue";
import { findNodeModel, getNodeModelKey, useNodeAi, type NodeAiModel } from "@lumo/nodes-scaffold/nodeAi";
import { saveScriptBreakdown, scriptLimit } from "./scriptBreakdown";

const props = defineProps<{ directory: string }>();
const emit = defineEmits<{ busy: [value: boolean]; saved: [directory: string, path: string] }>();
const script = defineModel<string>("script", { required: true });
const scriptId = useId();
const modelLabelId = useId();
const ai = useNodeAi();
const models = shallowRef<NodeAiModel[]>([]);
const modelId = ref("");
const loading = ref(false);
const busy = ref(false);
const error = ref("");
let request: AbortController | undefined;
const lifetime = new AbortController();
onScopeDispose(() => { lifetime.abort(); request?.abort(); });

watch(() => props.directory, async () => {
  loading.value = true;
  try {
    models.value = await ai.getModels(lifetime.signal);
    modelId.value = models.value[0] ? getNodeModelKey(models.value[0]) : "";
    if (!modelId.value) error.value = translate("请先在模型设置中配置文案模型");
  } catch (failure) {
    if (!lifetime.signal.aborted) error.value = failure instanceof Error ? failure.message : translate("读取模型失败");
  } finally { loading.value = false; }
}, { immediate: true });

async function generate() {
  const model = findNodeModel(models.value, modelId.value);
  if (busy.value || !model || !script.value.trim()) return;
  const directory = props.directory;
  const source = script.value;
  const controller = request = new AbortController();
  busy.value = true;
  emit("busy", true);
  error.value = "";
  try {
    const path = await saveScriptBreakdown(directory, source, model, ai, controller.signal);
    if (!lifetime.signal.aborted) emit("saved", directory, path);
  } catch (failure) {
    error.value = controller.signal.aborted ? translate("已取消拆解") : failure instanceof Error ? failure.message : translate("拆解剧本失败");
  } finally {
    request = undefined;
    busy.value = false;
    emit("busy", false);
  }
}
</script>

<style scoped>
.dramaDraft { display: grid; gap: 10px; }
.draftActions { display: flex; justify-content: flex-end; gap: 8px; }
.dramaDraft [role="alert"] { margin: 0; color: var(--el-color-danger); }
</style>
