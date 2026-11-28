<template>
  <div class="modelLoginGuide">
    <span>{{ translate('当前设备还没有可用的文本模型。') }}</span>
    <el-button type="primary" size="small" @click.stop="openModelSettings">{{ translate('配置模型') }}</el-button>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { translate } from "@lumo/i18n/vue";

const emit = defineEmits<{ login: [] }>();
const openSettingsPanel = inject<(id: string) => void>("openSettingsPanel");

function openModelSettings() {
  emit("login");
  openSettingsPanel?.("model");
}
</script>

<style lang="scss" scoped>
.modelLoginGuide {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  white-space: normal;
}
</style>
