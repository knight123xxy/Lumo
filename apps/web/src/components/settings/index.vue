<template>
  <el-dialog v-model="visible" width="min(960px, calc(100vw - 32px))" alignCenter appendToBody class="lumo-settings">
    <template #header>
      <header class="settingsHeader">
        <h1>{{ translate('设置') }}</h1>
      </header>
    </template>
    <div class="settings">
      <nav class="settingsNav" :aria-label="translate('设置分类')">
        <div v-for="group in panelGroups" :key="group.label" class="settingsGroup" role="group" :aria-label="translate(group.label)">
          <span class="groupName" aria-hidden="true">{{ translate(group.label) }}</span>
          <button v-for="item in group.panels" :key="item.id" class="settingsItem" type="button"
            :aria-current="activePanel.id === item.id ? 'page' : undefined"
            :aria-label="item.id === 'about' && hasDesktopUpdate ? `${translate(item.label)}，${translate('有新版本可用')}` : undefined"
            @click="activePanel = item">
            <component :is="item.icon" :size="16" aria-hidden="true" />
            <span>{{ translate(item.label) }}</span>
            <span v-if="item.id === 'about' && hasDesktopUpdate" class="updateDot" aria-hidden="true" />
          </button>
        </div>
      </nav>
      <section class="content" :aria-label="translate(activePanel.label)">
        <h2 class="panelTitle">{{ translate(activePanel.label) }}</h2>
        <div class="panelContent">
            <keep-alive include="personalization">
              <userAccount v-if="publicWeb && activePanel.id === 'account'" :request="http" :userName="currentUser?.userName ?? ''" :role="currentUser?.role" @loggedOut="loggedOut" />
              <component
                v-else
                :is="activePanel.component"
                v-bind="
                  ['account', 'pluginMarket', 'languageModel', 'mediaModel', 'personalization', 'deviceLink'].includes(activePanel.id) ? { visible } : {}
                " />
            </keep-alive>
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
    component: defineAsyncComponent(() => import("./panels/languageModel/index.vue")),
  },
  { id: "mediaModel", label: "媒体模型", icon: IconPhotoVideo, component: defineAsyncComponent(() => import("./panels/mediaModel/index.vue")) },
  {
    id: "pluginMarket",
    label: "插件管理",
    icon: IconBuildingStore,
    component: defineAsyncComponent(() => import("./panels/pluginMarket/index.vue")),
  },
  { id: "mcp", label: "MCP", icon: IconPlugConnected, component: defineAsyncComponent(() => import("./panels/mcp/index.vue")) },
  { id: "network", label: "网络设置", icon: IconNetwork, component: defineAsyncComponent(() => import("./panels/network/index.vue")) },
  ...(!isMobile
    ? [{ id: "deviceLink", label: "设备互联", icon: IconDevices, component: defineAsyncComponent(() => import("./panels/deviceLink/index.vue")) }]
    : []),
  {
    id: "personalization",
    label: "个性化",
    icon: IconUserCog,
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
const settingsGroups = [
  { label: "偏好设置", ids: ["general", "personalization"] },
  { label: "账号与模型", ids: ["account", "languageModel", "mediaModel"] },
  { label: "扩展与连接", ids: ["pluginMarket", "mcp", "deviceLink", "network"] },
  { label: "系统", ids: ["about", "developer", "multiTenant"] },
];
const panelGroups = computed(() => settingsGroups.map(group => ({
  label: group.label,
  panels: group.ids.flatMap(id => settingsPanels.value.filter(panel => panel.id === id)),
})).filter(group => group.panels.length));
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
.settingsHeader h1 { margin: 0; font-size: 19px; font-weight: 600; }

.settings {
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  height: min(680px, 74dvh);
  border-top: 1px solid var(--el-border-color-lighter);

  .settingsNav {
    min-height: 0;
    padding: 14px 10px;
    background: var(--color-panel-2);
    border-inline-end: 1px solid var(--el-border-color-lighter);
    overflow: auto;
  }

  .settingsGroup + .settingsGroup { margin-block-start: 16px; }
  .groupName {
    display: block;
    padding: 0 8px 6px;
    font-size: 11px;
    color: var(--el-text-color-secondary);
  }

  .settingsItem {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 6px 8px;
    color: var(--el-text-color-regular);
    font: inherit;
    font-size: 13px;
    text-align: start;
    background: transparent;
    border: 0;
    border-radius: 8px;
    cursor: pointer;

    svg { flex-shrink: 0; }
    &:hover { background: var(--el-fill-color-light); }
    &[aria-current="page"] { background: var(--color-accent-soft); color: var(--el-text-color-primary); font-weight: 600; }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
  }

  .updateDot {
    width: 6px;
    height: 6px;
    margin-inline-start: auto;
    border-radius: 50%;
    background: var(--el-color-danger);
  }

  .content {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;

    .panelTitle { margin: 0; padding: 18px 20px 12px; font-size: 16px; font-weight: 600; }
    .panelContent { flex: 1; min-height: 0; padding: 0 20px 16px; overflow: auto; overscroll-behavior: contain; }
  }
}

@media (max-width: 600px) {
  .settings {
    grid-template-columns: 104px minmax(0, 1fr);
    .settingsNav { padding-inline: 4px; }
    .settingsItem { gap: 5px; padding-inline: 5px; font-size: 12px; }
    .content .panelTitle, .content .panelContent { padding-inline: 10px; }
  }
}
</style>

<style lang="scss">
.lumo-settings {
  border-radius: 16px;
  padding: 0;
  overflow: hidden;

  .el-dialog__header { padding: 16px 20px; margin: 0; }
  .el-dialog__body { padding: 0; }
  .el-dialog__headerbtn { top: 8px; inset-inline-end: 8px; }
}
</style>
