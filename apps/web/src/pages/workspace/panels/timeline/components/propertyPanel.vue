<template>
  <aside class="propertyPanel" :aria-label="translate('属性面板')">
    <div class="propertyHeader">{{ translate("属性") }}</div>
    <div v-if="!clip" class="propertyEmpty">{{ translate("选中片段后编辑属性") }}</div>
    <div v-else class="propertyBody">
      <div class="propertySection">
        <div class="sectionTitle">{{ clipLabel }}</div>
        <el-button v-if="clip.kind === 'video'" class="sendToCanvas" size="small" :disabled="busy" @click="emit('sendToCanvas')">
          <icon-layout-sidebar-right :size="14" aria-hidden="true" />
          {{ translate('发送到画布') }}
        </el-button>
        <template v-if="clip.kind !== 'text'">
          <div class="field">
            <label>{{ translate("变速") }}</label>
            <el-slider v-model="form.speed" :min="0.1" :max="16" :step="0.1" @change="emitSpeed" />
            <div class="speedPresets">
              <el-button v-for="preset in speedPresets" :key="preset" size="small" :type="form.speed === preset ? 'primary' : 'default'" @click="form.speed = preset; emitSpeed()">{{ preset }}×</el-button>
            </div>
          </div>
          <template v-if="clip.kind === 'video' || clip.kind === 'audio'">
            <div class="field">
              <label>{{ translate("音量") }}</label>
              <el-slider v-model="form.volume" :min="0" :max="2" :step="0.05" @change="emitVolume" />
            </div>
            <div class="field">
              <label>{{ translate("淡入 / 淡出（秒）") }}</label>
              <div class="inlineFields">
                <el-input-number v-model="form.fadeIn" :min="0" :max="10" :step="0.1" size="small" @change="emitFade" />
                <el-input-number v-model="form.fadeOut" :min="0" :max="10" :step="0.1" size="small" @change="emitFade" />
              </div>
            </div>
          </template>
        </template>
      </div>

      <div v-if="clip.kind === 'video' || clip.kind === 'image'" class="propertySection">
        <div class="sectionTitle">{{ translate("调色") }}</div>
        <div class="field">
          <label>{{ translate("亮度") }}</label>
          <el-slider v-model="form.brightness" :min="-1" :max="1" :step="0.05" @change="emitFilter" />
        </div>
        <div class="field">
          <label>{{ translate("对比度") }}</label>
          <el-slider v-model="form.contrast" :min="-1" :max="1" :step="0.05" @change="emitFilter" />
        </div>
        <div class="field">
          <label>{{ translate("饱和度") }}</label>
          <el-slider v-model="form.saturation" :min="-1" :max="1" :step="0.05" @change="emitFilter" />
        </div>
        <div class="field">
          <label>{{ translate("预设滤镜") }}</label>
          <el-select v-model="form.preset" size="small" @change="emitFilter">
            <el-option v-for="preset in filterPresets" :key="preset.value" :label="translate(preset.label)" :value="preset.value" />
          </el-select>
        </div>
      </div>

      <div v-if="clip.kind === 'video' || clip.kind === 'image'" class="propertySection">
        <div class="sectionTitle">{{ translate("裁切") }}</div>
        <el-switch v-model="form.cropEnabled" :active-text="translate('启用裁切')" @change="emitCrop" />
        <template v-if="form.cropEnabled">
          <div v-for="edge in cropEdges" :key="edge.key" class="field">
            <label>{{ translate(edge.label) }}</label>
            <el-slider v-model="form[edge.key]" :min="0" :max="0.5" :step="0.01" @change="emitCrop" />
          </div>
        </template>
      </div>

      <div v-if="clip.kind === 'text'" class="propertySection">
        <div class="sectionTitle">{{ translate("文字内容") }}</div>
        <el-input v-model="form.text" type="textarea" :rows="4" @change="emitText" />
      </div>

      <div v-if="clip.kind !== 'text'" class="propertySection">
        <div class="sectionTitle">{{ translate("裁剪区间") }}</div>
        <div class="inlineFields">
          <el-input-number v-model="form.inPoint" :min="0" :max="form.outPoint" :step="0.1" size="small" @change="emitRange" />
          <el-input-number v-model="form.outPoint" :min="form.inPoint" :max="clip.sourceDuration || undefined" :step="0.1" size="small" @change="emitRange" />
        </div>
      </div>

      <div class="propertySection">
        <el-button v-if="clip.kind === 'video' || clip.kind === 'audio'" size="small" :loading="busy" @click="$emit('generateSubtitles', clip.id)">{{ translate("识别字幕") }}</el-button>
        <el-button size="small" @click="$emit('split')">{{ translate("在播放头切割") }}</el-button>
        <el-button size="small" type="danger" @click="$emit('removeClip', clip.id)">{{ translate("删除片段") }}</el-button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { ElButton, ElInput, ElInputNumber, ElOption, ElSelect, ElSlider, ElSwitch } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { IconLayoutSidebarRight } from "@tabler/icons-vue";
import type { ClipFilter, ClipCrop, TimelineClip } from "../timelineTypes";

const props = defineProps<{ clip: TimelineClip | null; busy: boolean }>();
const emit = defineEmits<{
  sendToCanvas: [];
  updateSpeed: [speed: number];
  updateVolume: [volume: number];
  updateFade: [fadeIn: number, fadeOut: number];
  updateFilter: [filter: ClipFilter];
  updateCrop: [crop: ClipCrop];
  updateText: [text: string];
  updateRange: [inPoint: number, outPoint: number];
  removeClip: [clipId: string];
  split: [];
  generateSubtitles: [clipId: string];
}>();

const speedPresets = [0.5, 1, 1.5, 2, 4];
const filterPresets = [
  { label: "无", value: "none" },
  { label: "暖色", value: "warm" },
  { label: "冷色", value: "cold" },
  { label: "黑白", value: "mono" },
] as const;
const cropEdges = [
  { key: "left", label: "左" },
  { key: "right", label: "右" },
  { key: "top", label: "上" },
  { key: "bottom", label: "下" },
] as const;

const form = reactive({
  speed: 1,
  volume: 1,
  fadeIn: 0,
  fadeOut: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  preset: "none" as ClipFilter["preset"],
  cropEnabled: false,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  text: "",
  inPoint: 0,
  outPoint: 0,
});

watch(() => props.clip, sync, { immediate: true });

function sync() {
  const clip = props.clip;
  if (!clip) return;
  form.speed = clip.speed;
  form.volume = clip.volume;
  form.fadeIn = clip.fadeIn;
  form.fadeOut = clip.fadeOut;
  form.brightness = clip.filter.brightness;
  form.contrast = clip.filter.contrast;
  form.saturation = clip.filter.saturation;
  form.preset = clip.filter.preset;
  form.cropEnabled = clip.crop.enabled;
  form.left = clip.crop.left;
  form.right = clip.crop.right;
  form.top = clip.crop.top;
  form.bottom = clip.crop.bottom;
  form.text = clip.text;
  form.inPoint = clip.inPoint;
  form.outPoint = clip.outPoint;
}

const clipLabel = computed(() => {
  const clip = props.clip;
  if (!clip) return "";
  if (clip.kind === "text") return translate("文字片段");
  return clip.source.split("/").at(-1) ?? translate("素材");
});

function emitSpeed() { emit("updateSpeed", form.speed); }
function emitVolume() { emit("updateVolume", form.volume); }
function emitFade() { emit("updateFade", form.fadeIn, form.fadeOut); }
function emitFilter() {
  emit("updateFilter", { brightness: form.brightness, contrast: form.contrast, saturation: form.saturation, preset: form.preset });
}
function emitCrop() {
  emit("updateCrop", { enabled: form.cropEnabled, left: form.left, right: form.right, top: form.top, bottom: form.bottom });
}
function emitText() { emit("updateText", form.text); }
function emitRange() { emit("updateRange", form.inPoint, form.outPoint); }
</script>

<style scoped lang="scss">
.propertyPanel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);

  .propertyHeader {
    padding: 10px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    font-size: 13px;
    font-weight: 600;
  }

  .propertyEmpty {
    padding: 20px 12px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  .propertyBody {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 0 20px;

    .propertySection {
      padding: 10px 12px;
      margin-bottom: 10px;
      background: var(--color-panel-2);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: 10px;

      .sectionTitle {
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-regular);
      }

      .field {
        margin-bottom: 10px;

        label {
          display: block;
          margin-bottom: 4px;
          color: var(--el-text-color-secondary);
          font-size: 12px;
        }

        .speedPresets {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;

          :deep(.el-button) {
            margin-left: 0;
          }
        }
      }

      .inlineFields {
        display: flex;
        gap: 8px;
      }

      :deep(.el-select) {
        width: 100%;
      }
    }
  }
}
</style>
