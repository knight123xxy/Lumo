<template>
  <div class="assetsPanel">
    <div class="assetsTabs" role="tablist" :aria-label="translate('资产类型')">
      <button class="assetsTab" :class="{ active: tab === 'assets' }" type="button" role="tab" :aria-selected="tab === 'assets'" @click="tab = 'assets'">{{ translate('素材') }}</button>
      <button class="assetsTab" :class="{ active: tab === 'characters' }" type="button" role="tab" :aria-selected="tab === 'characters'" @click="tab = 'characters'">{{ translate('角色') }}</button>
    </div>
    <assetLibrary v-if="tab === 'assets'" class="assetsContent" :modelValue="active" expanded />
    <characterLibrary v-else :active="active" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { translate } from "@lumo/i18n/vue";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
import characterLibrary from "./characterLibrary.vue";

// 显示面板时加载素材，切走后清理预览与新建状态，与原弹窗打开、关闭一致。
defineProps<{ active: boolean }>();
const tab = ref<"assets" | "characters">("assets");
</script>

<style lang="scss" scoped>
.assetsPanel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;

  .assetsTabs {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    padding: 12px 16px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .assetsTab {
    padding: 6px 14px;
    color: var(--el-text-color-regular);
    font-size: 13px;
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    cursor: pointer;

    &.active {
      color: var(--el-color-primary);
      border-bottom-color: var(--el-color-primary);
    }
  }

  .assetsContent { display: flex; flex: 1; min-height: 0; }
}
</style>
