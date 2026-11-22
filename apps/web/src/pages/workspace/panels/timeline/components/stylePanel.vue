<template>
  <aside class="stylePanel" :aria-label="translate('风格')">
    <div class="styleHeader">
      <span class="styleTitle">{{ translate("风格") }}</span>
      <span v-if="currentStyle" class="appliedBadge">{{ currentStyle.name }}</span>
    </div>

    <div class="styleList">
      <template v-for="group in styleGroups" :key="group.name">
        <div class="groupTitle">{{ group.name }}</div>
        <button
          v-for="item in group.styles"
          :key="item.slug"
          class="styleItem"
          :class="{ selected: item.slug === selectedSlug }"
          type="button"
          @click="selectedSlug = item.slug">
          <span class="styleName">{{ item.name }}</span>
          <span v-if="item.slug === currentStyle?.slug" class="appliedMark">{{ translate("已套用") }}</span>
          <span class="styleSummary">{{ item.summary }}</span>
        </button>
      </template>
    </div>

    <div v-if="selected" class="styleDetail">
      <div class="detailHead">
        <span class="detailName">{{ selected.item.name }}</span>
        <span class="detailMood">{{ selected.item.mood }}</span>
      </div>
      <p class="detailUse">{{ selected.item.use }}</p>
      <el-button class="applyButton" type="primary" size="small" @click="apply">{{ translate("套用") }}</el-button>
      <div v-for="section in detailSections" :key="section.label" class="detailSection">
        <div class="detailLabel">{{ section.label }}</div>
        <div class="detailText">{{ section.text }}</div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { styleGroups, styleSections } from "../videoStyles";
import type { ProjectStyle } from "../timelineTypes";

const props = defineProps<{ currentStyle?: ProjectStyle }>();
const emit = defineEmits<{ applyStyle: [style: ProjectStyle] }>();

const selectedSlug = ref<string>();

const selected = computed(() => {
  if (!selectedSlug.value) return undefined;
  for (const group of styleGroups) {
    const item = group.styles.find(style => style.slug === selectedSlug.value);
    if (item) return { item, group: group.name };
  }
  return undefined;
});

const detailSections = computed(() => {
  const slug = selectedSlug.value;
  if (!slug) return [];
  const sections = styleSections[slug];
  if (!sections) return [];
  return [
    { label: "本质", text: sections.essence },
    { label: "配色", text: sections.colors },
    { label: "字体", text: sections.fonts },
    { label: "运动", text: sections.motion },
  ].filter((section): section is { label: string; text: string } => !!section.text);
});

function apply() {
  const current = selected.value;
  if (!current) return;
  const sections = styleSections[current.item.slug] ?? {};
  emit("applyStyle", {
    slug: current.item.slug,
    name: current.item.name,
    group: current.group,
    summary: current.item.summary,
    essence: sections.essence,
    colors: sections.colors,
    fonts: sections.fonts,
    motion: sections.motion,
  });
}
</script>

<style scoped lang="scss">
.stylePanel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);

  .styleHeader {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    .styleTitle {
      flex: 1;
      font-size: 13px;
      font-weight: 600;
    }

    .appliedBadge {
      max-width: 120px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--el-color-primary);
      font-size: 11px;
    }
  }

  .styleList {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 6px 8px;

    .groupTitle {
      padding: 8px 4px 4px;
      color: var(--el-text-color-secondary);
      font-size: 11px;
      font-weight: 600;
    }

    .styleItem {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 6px;
      width: 100%;
      padding: 6px 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--el-text-color-primary);
      text-align: left;
      cursor: pointer;

      &:hover {
        background: var(--el-fill-color-light);
      }

      &.selected {
        background: var(--el-color-primary-light-9);
      }

      .styleName {
        font-size: 12px;
        font-weight: 600;
      }

      .appliedMark {
        color: var(--el-color-primary);
        font-size: 10px;
      }

      .styleSummary {
        width: 100%;
        overflow: hidden;
        color: var(--el-text-color-secondary);
        font-size: 11px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .styleDetail {
    flex: 0 0 auto;
    max-height: 44%;
    min-height: 0;
    overflow: auto;
    padding: 10px 12px;
    border-top: 1px solid var(--el-border-color-lighter);

    .detailHead {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;

      .detailName {
        font-size: 13px;
        font-weight: 600;
      }

      .detailMood {
        color: var(--el-text-color-secondary);
        font-size: 11px;
      }
    }

    .detailUse {
      margin: 2px 0 8px;
      color: var(--el-text-color-secondary);
      font-size: 11px;
    }

    .applyButton {
      width: 100%;
      margin-left: 0;
    }

    .detailSection {
      margin-top: 10px;

      .detailLabel {
        margin-bottom: 4px;
        color: var(--el-text-color-regular);
        font-size: 12px;
        font-weight: 600;
      }

      .detailText {
        color: var(--el-text-color-secondary);
        font-size: 11px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
    }
  }
}
</style>
