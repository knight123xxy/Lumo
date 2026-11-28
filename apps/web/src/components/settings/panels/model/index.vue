<template>
  <section v-if="visible" class="modelSettings" :aria-label="translate('模型列表')">
    <el-segmented v-model="activeType" :options="typeOptions" :ariaLabel="translate('模型分类')" />
    <el-alert v-if="catalogError" :title="catalogError" type="error" :closable="false" showIcon>
      <el-button size="small" @click="refresh(true)">{{ translate('重试') }}</el-button>
    </el-alert>
    <el-form labelPosition="top">
      <el-form-item :label="translate('默认模型')">
        <el-select
          :modelValue="selectedKey"
          :disabled="loading || !models.length"
          :loading="loading"
          :placeholder="translate('选择模型')"
          filterable
          @update:modelValue="selectModel">
          <el-option v-for="model in models" :key="getNodeModelKey(model)" :label="modelName(model)" :value="getNodeModelKey(model)">
            <div class="modelOption">
              <span>{{ modelName(model) }}</span>
              <span v-if="model.providerId === 'multiTenant'" class="providerLabel">{{ model.discountPercent == null ? translate("未配置") : t`${model.discountPercent / 10} 折` }}</span>
               <span v-else class="providerLabel">{{ model.providerLabel }}</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
    </el-form>
    <el-empty v-if="!loading && !catalogError && !models.length" :description="translate('暂无模型')" :imageSize="56" />
    <section v-if="maintenance && !publicWeb && !multiTenantEnabled" class="providerSettings">
      <h3>{{ translate('供应商管理') }}</h3>
      <languageModel v-if="activeType === 'text'" :visible="visible" />
      <mediaModel v-else :visible="visible" />
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onScopeDispose, ref, shallowRef, watch } from "vue";
import { t, translate } from "@lumo/i18n/vue";
import { findNodeModel, getNodeModelKey, readNodeModels, subscribeNodeModels, type NodeAiModel, type NodeMediaModel } from "@lumo/nodes-scaffold/nodeAi";
import { publicWeb } from "@/stores/multiTenant";
import { multiTenantEnabled } from "@/stores/settings";
import { readDefaultModel, saveDefaultModel, type DefaultModelType } from "./defaultModels";

const props = withDefaults(defineProps<{ visible?: boolean; official?: boolean; maintenance?: boolean }>(), {
  visible: true, official: undefined, maintenance: false,
});
const official = computed(() => props.official ?? publicWeb.value);
const languageModel = defineAsyncComponent(() => import("../languageModel/index.vue"));
const mediaModel = defineAsyncComponent(() => import("../mediaModel/index.vue"));
const activeType = ref<DefaultModelType>("text");
const typeOptions = computed(() => [
  { value: "text", label: translate("文本") },
  { value: "image", label: translate("图片") },
  { value: "video", label: translate("视频") },
  { value: "audio", label: translate("音频") },
]);
const catalogType = computed(() => activeType.value === "text" ? "language" : "media");
type CatalogModel = (NodeAiModel | NodeMediaModel) & { displayName?: string; discountPercent?: number; priceLabel?: string };
const catalog = shallowRef<CatalogModel[]>([]);
const loading = ref(false);
const catalogError = ref("");
const models = computed(() => catalog.value.filter(model => (!publicWeb.value || model.providerId === "multiTenant")
  && ("type" in model ? model.type : "text") === activeType.value));
const selectedKey = computed(() => {
  const model = findNodeModel(models.value, readDefaultModel(activeType.value, official.value));
  return model ? getNodeModelKey(model) : "";
});
let request: AbortController | undefined;

async function refresh(fresh = false) {
  request?.abort();
  catalogError.value = "";
  if (!props.visible) { loading.value = false; return; }
  const controller = new AbortController();
  request = controller;
  loading.value = true;
  try {
    catalog.value = await readNodeModels<CatalogModel>(catalogType.value, controller.signal, fresh);
  } catch (error) {
    if (!controller.signal.aborted) {
      catalog.value = [];
      catalogError.value = error instanceof Error ? error.message : translate("获取模型列表失败");
    }
  } finally {
    if (request === controller) loading.value = false;
  }
}

function modelName(model: CatalogModel) {
  const suffix = model.priceLabel ? ` · ${model.priceLabel}` : "";
  return model.displayName ?? (suffix && model.label.endsWith(suffix) ? model.label.slice(0, -suffix.length) : model.label);
}

function selectModel(key: string) {
  if (loading.value || key === selectedKey.value || !findNodeModel(models.value, key)) return;
  saveDefaultModel(activeType.value, key, official.value);
}

watch([() => props.visible, official, catalogType], () => {
  catalog.value = [];
  void refresh();
}, { immediate: true });
const unsubscribe = subscribeNodeModels(type => { if (type === catalogType.value) void refresh(); });
onScopeDispose(() => { request?.abort(); unsubscribe(); });
</script>

<style lang="scss" scoped>
.modelSettings {
  display: grid;
  gap: 16px;
  min-width: 0;
  justify-items: start;

  .el-segmented { max-width: 100%; overflow: auto; }
  .el-form { width: min(100%, 420px); }
  .el-form-item { margin-bottom: 0; }
  .el-select { width: 100%; }
  .el-empty { width: 100%; }

  .providerSettings {
    width: 100%;
    min-width: 0;
    padding-top: 12px;
    border-top: 1px solid var(--el-border-color-lighter);

    h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
  }
}

.modelOption {
  display: flex;
  justify-content: space-between;
  gap: 12px;

  span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .providerLabel { color: var(--el-text-color-secondary); font-size: 12px; }
}
</style>
