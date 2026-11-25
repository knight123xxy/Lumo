<template>
  <el-dialog v-model="visible" width="min(760px, calc(100vw - 32px))" alignCenter appendToBody class="lumo-settings">
    <template #header>
      <header class="settingsHeader">
        <h1>{{ translate('设置') }}</h1>
        <p>{{ activePanel.label }}</p>
      </header>
    </template>
    <div class="settings">
      <nav class="settingsTabs" role="tablist" :aria-label="translate('设置分类')">
        <button
          v-for="item in settingsPanels"
          :key="item.id"
          class="settingsTab"
          type="button"
          role="tab"
          :aria-selected="activePanel.id === item.id"
          :aria-label="item.id === 'about' && hasDesktopUpdate ? `${item.label}，有新版本可用` : item.label"
          :class="{ active: activePanel.id === item.id }"
          @click="activePanel = item">
          <component :is="item.icon" :size="14" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <span v-if="item.id === 'about' && hasDesktopUpdate" class="tabDot" aria-hidden="true" />
        </button>
      </nav>
      <section class="content" :aria-label="activePanel.label" tabindex="0">
        <div class="panelContent">
          <transition name="el-fade-in" mode="out-in">
            <keep-alive include="personalization">
              <userAccount v-if="publicWeb && activePanel.id === 'account'" :request="http" :userName="currentUser?.userName ?? ''" :role="currentUser?.role" @loggedOut="loggedOut" />
              <component
                v-else
                :is="activePanel.component"
                v-bind="
                  ['account', 'pluginMarket', 'languageModel', 'mediaModel', 'personalization', 'deviceLink'].includes(activePanel.id) ? { visible } : {}
                " />
            </keep-alive>
          </transition>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { computed, defineAsyncComponent, shallowRef, watch } from "vue";
import userAccount from "@lumo/multi-tenant-user-web/account";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";
import { multiTenantEnabled } from "@/stores/settings";
import { currentUser, publicWeb } from "@/stores/multiTenant";
import http from "@/lib/http";
import { isMobile } from "@/lib/platform";
import {
  IconSettings,
  IconPhotoVideo,
  IconBuildingStore,
  IconInfoCircle,
  IconCode,
  IconPlugConnected,
  IconUserCog,
  IconSubtitlesAi,
  IconDevices,
  IconNetwork,
  IconUserCircle,
  IconUsersGroup,
} from "@tabler/icons-vue";

const allSettingsPanels = [
  { id: "account", label: "账号与余额", icon: IconUserCircle, component: defineAsyncComponent(() => import("./panels/account/index.vue")) },
  { id: "general", label: "通用设置", icon: IconSettings, component: defineAsyncComponent(() => import("./panels/general/index.vue")) },
  {
    id: "languageModel",
    label: "文本模型",
    icon: IconSubtitlesAi,
    groupLabel: "模型",
    component: defineAsyncComponent(() => import("./panels/languageModel/index.vue")),
  },
  { id: "mediaModel", label: "媒体模型", icon: IconPhotoVideo, component: defineAsyncComponent(() => import("./panels/mediaModel/index.vue")) },
  {
    id: "pluginMarket",
    label: "插件市场",
    icon: IconBuildingStore,
    groupLabel: "市场",
    component: defineAsyncComponent(() => import("./panels/pluginMarket/index.vue")),
  },
  { id: "mcp", label: "MCP", icon: IconPlugConnected, groupLabel: "通讯", component: defineAsyncComponent(() => import("./panels/mcp/index.vue")) },
  { id: "network", label: "网络设置", icon: IconNetwork, component: defineAsyncComponent(() => import("./panels/network/index.vue")) },
  ...(!isMobile
    ? [{ id: "deviceLink", label: "设备互联", icon: IconDevices, component: defineAsyncComponent(() => import("./panels/deviceLink/index.vue")) }]
    : []),
  {
    id: "personalization",
    label: "个性化",
    icon: IconUserCog,
    groupLabel: "其他",
    component: defineAsyncComponent(() => import("./panels/personalization/index.vue")),
  },
  { id: "developer", label: "开发者选项", icon: IconCode, component: defineAsyncComponent(() => import("./panels/developer/index.vue")) },
  { id: "multiTenant", label: "多租户能力", icon: IconUsersGroup, component: defineAsyncComponent(() => import("./panels/multiTenant/developmentNotice.vue")) },
  { id: "about", label: "关于", icon: IconInfoCircle, component: defineAsyncComponent(() => import("./panels/about/index.vue")) },
];
const publicAccountPanel = { ...allSettingsPanels[0]!, get label() { return translate("账号"); } };
const settingsPanels = computed(() => allSettingsPanels.filter(item => {
  if (publicWeb.value && currentUser.value?.role === "user") return ["account", "general", "about"].includes(item.id);
  if (publicWeb.value && ["multiTenant", "deviceLink", "network", "mcp", "developer", "pluginMarket"].includes(item.id)) return false;
  return !multiTenantEnabled.value || !["languageModel", "mediaModel", "developer"].includes(item.id);
}).map(item => {
  if (publicWeb.value && item.id === "account") return publicAccountPanel;
  // 本地模式没有云端账号，标签不写「余额」避免误导。
  if (!multiTenantEnabled.value && item.id === "account") return { ...item, label: "账号" };
  return item;
}));
const activePanel = shallowRef(settingsPanels.value[0]!);
const visible = defineModel<boolean>({ default: false });

watch(settingsPanels, panels => {
  activePanel.value = panels.find(item => item.id === activePanel.value.id) ?? panels[0]!;
});

function loggedOut() { window.location.reload(); }

function openPanel(id: string) {
  const panel = settingsPanels.value.find(item => item.id === id);
  if (!panel) return false;
  activePanel.value = panel;
  visible.value = true;
  return true;
}

defineExpose({ openPanel });
</script>

<style lang="scss" scoped>
// 设置改为「顶部横向分段 + 单列内容」，去掉 Toonflow 的左侧分组树。
.settingsHeader {
  display: flex;
  align-items: baseline;
  gap: 10px;

  h1 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }
}

.settings {
  display: flex;
  flex-direction: column;
  max-height: min(64vh, calc(100dvh - 200px));
  overflow: hidden;

  .settingsTabs {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 2px 2px;
    padding-bottom: 1px;
    border-bottom: 1px solid var(--color-border);
  }

  .settingsTab {
    position: relative;
    display: flex;
    flex-shrink: 0;
    gap: 6px;
    align-items: center;
    height: 32px;
    padding: 0 9px;
    color: var(--el-text-color-secondary);
    font: inherit;
    font-size: 12.5px;
    white-space: nowrap;
    background: transparent;
    border: 0;
    border-radius: 8px 8px 0 0;
    cursor: pointer;
    transition: color .15s ease, background-color .15s ease;

    &:hover { color: var(--el-text-color-primary); background: var(--el-fill-color-light); }
    &:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--color-border-2); }
    // 换行后底部指示条会错位，选中态改用实心 pill。
    &.active {
      color: var(--el-text-color-primary);
      font-weight: 500;
      background: var(--el-fill-color);
    }
  }

  .tabDot {
    width: 5px;
    height: 5px;
    background: var(--el-color-danger);
    border-radius: 50%;
  }

  .content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding-top: 16px;
    overflow: hidden;

    .panelContent {
      flex: 1;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0 2px 4px;
    }
  }
}

@media (max-width: 640px) {
  .settings { height: min(72vh, calc(100dvh - 160px)); }
}
</style>

<style lang="scss">
// 弹窗外壳不受 scoped 约束：统一圆角与内边距，避免 Element 默认 header 留白过大。
.lumo-settings {
  border-radius: 16px;

  .el-dialog__header { padding: 18px 22px 6px; margin: 0; }
  .el-dialog__body { padding: 0 22px 18px; }
  .el-dialog__headerbtn { top: 16px; inset-inline-end: 14px; }
}
</style>
