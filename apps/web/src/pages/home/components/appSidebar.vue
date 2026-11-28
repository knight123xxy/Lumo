<template>
  <aside id="workspaceSidebar" class="appSidebar" aria-label="工作区侧栏">
    <div class="sidebarHeader">
      <div class="sidebarBrand">
        <el-image class="sidebarLogo" :src="logoUrl" fit="contain" alt="Lumo" />
        <span class="brandName">Lumo</span>
      </div>
    </div>
    <el-button class="sidebarCreate" type="primary" :aria-label="translate('新建项目')" :title="translate('新建项目')" :disabled="disabled" @click="emit('create')">
      <icon-plus :size="18" aria-hidden="true" />
      <span class="sidebarCreateLabel">{{ translate('新建项目') }}</span>
    </el-button>
    <nav class="sidebarNav" aria-label="主导航" :inert="disabled">
      <button class="sidebarItem" :class="{ active: activeSection === 'skills' }" type="button" :aria-current="activeSection === 'skills' ? 'page' : undefined" :aria-label="translate('应用市场')" :title="translate('应用市场')" @click="emit('section', 'skills')">
        <icon-apps :size="18" aria-hidden="true" />
        <span class="sidebarText">{{ translate('应用市场') }}</span>
      </button>
      <button v-if="currentUser?.role !== 'user'" class="sidebarItem" :class="{ active: activeSection === 'assets' }" type="button" :aria-current="activeSection === 'assets' ? 'page' : undefined" :aria-label="translate('资产')" :title="translate('资产')" @click="emit('section', 'assets')">
        <icon-library-photo :size="18" aria-hidden="true" />
        <span class="sidebarText">{{ translate('资产') }}</span>
      </button>
    </nav>
    <workspaceTree class="sidebarTree" :disabled="disabled" @openProject="project => emit('openProject', project)" @openChat="(project, file, mode) => emit('openChat', project, file, mode)" @createProject="emit('createProject')" @createChat="project => emit('createChat', project)" />
    <div class="sidebarFooter">
      <homeAccount :collapsed="false" @openSettings="emit('settings')" @openAccount="emit('account')" @openUpdate="emit('update')" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { IconApps, IconLibraryPhoto, IconPlus } from "@tabler/icons-vue";
import logoUrl from "@lumo/assets/logo.svg";
import { currentUser } from "@/stores/multiTenant";
import type { Project, ProjectMode } from "@/stores/workspace";
import workspaceTree from "./workspaceTree.vue";
import homeAccount from "../homeAccount.vue";

const { disabled = false, activeSection } = defineProps<{ disabled?: boolean; activeSection?: string }>();
const emit = defineEmits<{
  create: [];
  section: [value: string];
  openProject: [project: Project];
  openChat: [project: Project, file: string, mode?: ProjectMode];
  createProject: [];
  createChat: [project: Project];
  settings: [];
  account: [];
  update: [];
}>();
</script>

<style scoped lang="scss">
.appSidebar {
  position: relative;
  display: flex;
  flex: 0 0 var(--sidebarWidth);
  flex-direction: column;
  width: var(--sidebarWidth);
  min-width: 0;
  height: 100dvh;
  padding: calc(20px + var(--titlebarInset, 0px)) 12px 16px;
  overflow-x: hidden;
  overflow-y: auto;
  background: color-mix(in srgb, var(--el-fill-color) 55%, var(--el-bg-color));
  border-inline-end: 1px solid var(--el-border-color-lighter);

  .sidebarHeader {
    position: relative;
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    height: 30px;
    margin-bottom: 24px;
    padding: 0 8px;

    .sidebarBrand {
      display: flex;
      gap: 9px;
      align-items: center;
      min-width: 0;
      overflow: hidden;
      transition: gap .18s ease;

      .sidebarLogo {
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        transition: opacity .18s ease;

        .dark & { filter: invert(1); }
      }

      .brandName {
        overflow: hidden;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.01em;
        white-space: nowrap;
        transition: max-width .18s ease, opacity .18s ease;
      }
    }


  }

  .sidebarCreate {
    flex-shrink: 0;
    width: 100%;
    min-height: 38px;
    margin-bottom: 18px;
    border-radius: 10px;

    .sidebarCreateLabel { margin-inline-start: 6px; }
  }

  .sidebarNav {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 2px;
  }

  .sidebarItem {
    display: flex;
    gap: 11px;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    color: var(--el-text-color-regular);
    font: inherit;
    font-size: 14px;
    text-align: start;
    background: transparent;
    border: 0;
    border-radius: 9px;
    cursor: pointer;
    transition: background-color .15s ease, color .15s ease;

    &:hover { background: var(--el-fill-color-light); color: var(--el-text-color-primary); }
    &.active { background: var(--el-fill-color); color: var(--el-text-color-primary); font-weight: 550; }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }

    .sidebarText {
      overflow: hidden;
      white-space: nowrap;
      transition: max-width .18s ease, opacity .18s ease;
    }
  }

  .sidebarTree { margin-top: 16px; padding-bottom: 8px; }

  .sidebarFooter {
    margin-top: auto;
    padding-top: 16px;
  }
}
</style>
