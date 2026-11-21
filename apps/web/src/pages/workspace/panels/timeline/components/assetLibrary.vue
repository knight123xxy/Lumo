<template>
  <aside class="assetLibrary" :aria-label="translate('素材库')">
    <div class="assetHeader">
      <span class="assetTitle">{{ translate("素材库") }}</span>
      <el-button class="importButton" size="small" type="primary" :loading="busy" @click="pickFiles">
        <icon-upload :size="14" />
        {{ translate("导入") }}
      </el-button>
      <input ref="fileInput" type="file" class="fileInput" multiple accept="video/*,audio/*,image/*,.srt" @change="onFiles" />
    </div>
    <div class="assetList">
      <button
        v-for="asset in assets"
        :key="asset.id"
        class="assetItem"
        type="button"
        draggable="true"
        :title="asset.name"
        @dragstart="startDrag($event, asset.id)"
        @click="$emit('addClip', asset)">
        <component :is="assetIcon(asset.kind)" class="assetIcon" :size="18" />
        <span class="assetName">{{ asset.name }}</span>
        <span class="assetMeta">{{ assetMeta(asset) }}</span>
      </button>
      <p v-if="!assets.length" class="assetEmpty">{{ translate("导入素材开始剪辑") }}</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElButton } from "element-plus";
import { translate } from "@toonflow/i18n/vue";
import { IconMusic, IconPhoto, IconSubtitles, IconUpload, IconVideo } from "@tabler/icons-vue";
import type { AssetItem } from "../timelineTypes";
import { timelineAssetMime } from "../timelineModel";

defineProps<{ assets: AssetItem[]; busy: boolean }>();
const emit = defineEmits<{
  importFiles: [files: File[]];
  addClip: [asset: AssetItem];
}>();

const fileInput = ref<HTMLInputElement>();

function pickFiles() {
  fileInput.value?.click();
}

defineExpose({ openPicker: pickFiles });

function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (files.length) emit("importFiles", files);
}

function startDrag(event: DragEvent, id: string) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(timelineAssetMime, id);
  event.dataTransfer.effectAllowed = "copy";
}

function assetIcon(kind: AssetItem["kind"]) {
  if (kind === "video") return IconVideo;
  if (kind === "audio") return IconMusic;
  if (kind === "srt") return IconSubtitles;
  return IconPhoto;
}

function assetMeta(asset: AssetItem) {
  if (asset.duration) return `${asset.duration.toFixed(1)}s`;
  if (asset.width && asset.height) return `${asset.width}×${asset.height}`;
  return `${(asset.size / 1024 / 1024).toFixed(1)}MB`;
}
</script>

<style scoped lang="scss">
.assetLibrary {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);

  .assetHeader {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .assetTitle {
      flex: 1;
      font-size: 13px;
      font-weight: 600;
    }

    .importButton {
      margin-left: 0;
    }

    .fileInput {
      display: none;
    }
  }

  .assetList {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px;

    .assetItem {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--el-text-color-primary);
      font-size: 12px;
      text-align: left;
      cursor: pointer;

      &:hover {
        background: var(--el-fill-color-light);
      }

      .assetIcon {
        flex: 0 0 auto;
        color: var(--el-text-color-secondary);
      }

      .assetName {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .assetMeta {
        flex: 0 0 auto;
        color: var(--el-text-color-secondary);
        font-size: 11px;
      }
    }

    .assetEmpty {
      margin: 16px 4px;
      color: var(--el-text-color-secondary);
      font-size: 12px;
      text-align: center;
    }
  }
}
</style>
