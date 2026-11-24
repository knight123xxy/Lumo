<template>
  <div class="agentWorkspace">
    <header class="agentHeader">
      <div class="agentBrand">
        <el-image class="brandLogo" :src="logoUrl" fit="contain" alt="Lumo" />
        <span class="brandName">Lumo</span>
      </div>
      <div class="agentTabs" role="tablist" :aria-label="translate('切换 Agent')">
        <button v-for="agent in agentTabs" :key="agent.id" class="agentTab" :class="{ active: activeAgent === agent.id }" type="button" role="tab" :aria-selected="activeAgent === agent.id" :disabled="filmBusy" @click="activeAgent = agent.id">{{ translate(agent.label) }}</button>
      </div>
      <h1 class="agentTitle">{{ translate(currentAgent.headline) }}</h1>
    </header>

    <section class="promptArea" :aria-label="translate(currentAgent.label)">
      <div v-if="activeAgent === 'film'" class="promptCard"><slot name="film" /></div>
      <div v-else-if="activeAgent === 'drama'" class="promptCard"><slot name="drama" /></div>
      <div v-else-if="activeAgent === 'marketing'" class="promptCard"><slot name="marketing" /></div>
      <div v-else class="promptCard"><slot name="truman" /></div>
    </section>

    <section class="agentContent">
      <template v-if="activeAgent === 'truman'">
        <div class="contentHeader">
          <h2>{{ translate('白模场景') }}</h2>
          <el-button size="small" :disabled="disabled" @click="emit('openTruman')">{{ translate('打开白模预演') }}</el-button>
        </div>
        <div v-if="scenes.length" class="sceneList">
          <button v-for="scene in scenes" :key="scene.directory" class="sceneCard" type="button" :title="scene.directory" @click="emit('openScene', scene)">
            <icon-cube :size="18" aria-hidden="true" />
            <span>{{ scene.name }}</span>
          </button>
        </div>
        <p v-else class="contentEmpty">{{ translate('还没有白模场景，打开白模预演创建第一个') }}</p>
      </template>
      <template v-else>
        <div class="contentHeader">
          <h2>{{ translate('推荐做法') }}</h2>
          <button class="moreButton" type="button" @click="emit('showSkills')">{{ translate('全部模板') }}<icon-chevron-right :size="16" aria-hidden="true" /></button>
        </div>
        <div class="cardRow">
          <button v-for="(pipeline, index) in currentAgent.pipelines" :key="pipeline.slug" class="recipeCard" type="button" :title="pipeline.summary" @click="useRecipe(pipeline)">
            <span class="recipeCover" :class="`tone${index % 5}`" aria-hidden="true"><component :is="categoryIcons[pipeline.category] ?? IconMovie" :size="24" /><em>{{ pipeline.category }}</em></span>
            <strong class="recipeName">{{ pipeline.name }}</strong>
            <span class="recipeStages">{{ pipeline.stages.map(stage => stage.name).join(' › ') }}</span>
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElButton, ElImage } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { IconCamera, IconChevronRight, IconCube, IconDeviceDesktop, IconMicrophone, IconMovie, IconSpeakerphone, IconStack2, IconWand } from "@tabler/icons-vue";
import logoUrl from "@lumo/assets/logo.svg";
import type { Project } from "@/stores/workspace";
import { pipelineCatalog, type Pipeline } from "../skills/pipelineCatalog";

type AgentId = "film" | "drama" | "marketing" | "truman";

const props = defineProps<{ disabled: boolean; loading: boolean; scenes: Project[]; modelLabel: string; filmBusy?: boolean }>();
const emit = defineEmits<{
  submit: [request: { agent: AgentId; title: string; prompt: string }];
  filmTopic: [topic: string];
  marketingRecipe: [name: string];
  showSkills: [];
  openTruman: [];
  openScene: [scene: Project];
}>();

const categoryIcons: Record<string, unknown> = {
  生成类: IconWand, 动画类: IconMovie, 定制类: IconSpeakerphone,
  录屏类: IconDeviceDesktop, 混合类: IconStack2, 电影类: IconCamera, 口播类: IconMicrophone,
};

const agentTabs = [
  { id: "film", label: "一键成片" },
  { id: "drama", label: "短剧" },
  { id: "marketing", label: "营销" },
  { id: "truman", label: "白模" },
] as const;

const findPipeline = (slug: string) => pipelineCatalog.find(pipeline => pipeline.slug === slug);
const agents: Record<AgentId, {
  label: string; headline: string; hint: string; placeholder: string; pipelines: Pipeline[]; promptPrefix: string;
}> = {
  film: {
    label: "一键成片 Agent", headline: "生成可编辑草稿", hint: "", placeholder: "描述你想做的片子，例如：给降噪耳机做 60 秒产品片，主打通勤场景",
    pipelines: ["animated-explainer", "cinematic", "avatar-spokesperson", "hybrid", "clip-factory"].map(findPipeline).filter((item): item is Pipeline => !!item),
    promptPrefix: "请做一条成片。",
  },
  drama: {
    label: "短剧 Agent", headline: "Agent 聊聊故事与剧本", hint: "先聊清楚人物、冲突和钩子，再进入分镜。", placeholder: "讲讲你的故事，例如：外卖员在暴雨夜捡到一部不断收到自己名字的手机",
    pipelines: ["animation", "character-animation", "talking-head", "localization-dub", "podcast-repurpose"].map(findPipeline).filter((item): item is Pipeline => !!item),
    promptPrefix: "请开发一个短剧。",
  },
  marketing: {
    label: "营销 Agent", headline: "Agent 聊聊商品与卖点", hint: "添加商品和角色，写下核心卖点或创意方向，让 Agent 补全方案。", placeholder: "写下核心卖点或创意方向",
    pipelines: ["clip-factory", "avatar-spokesperson", "localization-dub", "screen-demo", "hybrid"].map(findPipeline).filter((item): item is Pipeline => !!item),
    promptPrefix: "请做一条营销短视频。",
  },
  truman: {
    label: "白模 Agent", headline: "Agent 聊聊场景与走位", hint: "", placeholder: "描述场景和镜头，例如：雨夜天台，主角从左侧走到栏杆前停住",
    pipelines: [], promptPrefix: "请规划白模场景。",
  },
};

const activeAgent = defineModel<AgentId>("activeAgent", { default: "film" });
const prompt = ref("");
const currentAgent = computed(() => agents[activeAgent.value]);

function useRecipe(pipeline: Pipeline) {
  if (activeAgent.value === "film") {
    if (!props.filmBusy) emit("filmTopic", pipeline.summary);
    return;
  }
  if (activeAgent.value === "marketing") {
    if (!props.filmBusy) emit("marketingRecipe", pipeline.name);
    return;
  }
  const value = prompt.value.trim();
  emit("submit", {
    agent: activeAgent.value,
    title: pipeline.name,
    prompt: `按「${pipeline.name}」流水线制作。\n类别：${pipeline.category}\n定位：${pipeline.summary}\n${value ? `主题与要求：${value}\n` : ""}请先给出阶段计划与分镜方案，确认后再开始生成。`,
  });
}
</script>

<style lang="scss" scoped>
.agentWorkspace {
  display: flex;
  flex-direction: column;
  gap: 22px;
  max-width: 1040px;
  margin: clamp(16px, 3vh, 32px) auto 48px;

  .agentHeader {
    display: flex;
    gap: 14px;
    align-items: center;
    flex-wrap: wrap;

    .agentBrand {
      display: flex;
      gap: 8px;
      align-items: center;

      .brandLogo { width: 26px; height: 26px; .dark & { filter: invert(1); } }
      .brandName { font-size: 17px; font-weight: 600; letter-spacing: -0.2px; }
    }

    .agentTabs {
      display: flex;
      gap: 2px;
      padding: 3px;
      background: var(--el-fill-color-light);
      border-radius: 999px;
    }

    .agentTab {
      padding: 5px 14px;
      color: var(--el-text-color-regular);
      font: inherit;
      font-size: 13px;
      background: transparent;
      border: 0;
      border-radius: 999px;
      cursor: pointer;

      &.active { color: var(--el-text-color-primary); background: var(--el-bg-color-overlay); font-weight: 500; }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    }

    .agentTitle { margin: 0; font-size: clamp(18px, 2.2vw, 24px); font-weight: 500; letter-spacing: -0.3px; }
  }

  .promptArea {
    .promptCard {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px 18px 12px;
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color-light);
      border-radius: 16px;

      &:focus-within { border-color: var(--el-color-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 8%, transparent); }

      .promptHint { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }

      :deep(.el-textarea__inner) {
        padding: 4px 0;
        font-size: 14px;
        line-height: 1.8;
        background: transparent;
        box-shadow: none;
      }

      .slotRow { display: flex; gap: 8px; }

      .slotCard {
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: center;
        width: 92px;
        padding: 10px 8px;
        color: var(--el-text-color-secondary);
        font: inherit;
        font-size: 12px;
        background: var(--el-fill-color-lighter);
        border: 1px dashed var(--el-border-color);
        border-radius: 10px;
        cursor: pointer;

        &:hover:not(:disabled) { color: var(--el-color-primary); border-color: var(--el-color-primary); }
        &:disabled { opacity: .55; cursor: default; }
      }

      .promptToolbar {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;

        .toolbarLeft, .toolbarRight { display: flex; gap: 8px; align-items: center; }
        .modeHint, .modelHint { color: var(--el-text-color-secondary); font-size: 12px; }
      }
    }
  }

  .agentContent {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .contentHeader {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;

      h2 { margin: 0; font-size: 15px; font-weight: 600; }
    }

    .moreButton {
      display: inline-flex;
      gap: 2px;
      align-items: center;
      padding: 0;
      color: var(--el-text-color-secondary);
      font: inherit;
      font-size: 12px;
      background: transparent;
      border: 0;
      cursor: pointer;

      &:hover { color: var(--el-color-primary); }
    }

    .cardRow {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;

      @media (max-width: 900px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      @media (max-width: 640px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    .recipeCard {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 0 0 12px;
      overflow: hidden;
      color: var(--el-text-color-primary);
      text-align: start;
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color-light);
      border-radius: 12px;
      cursor: pointer;

      .recipeCover {
        position: relative;
        display: grid;
        place-items: center;
        height: 88px;
        color: #fff;

        em { position: absolute; inset-block-end: 6px; inset-inline-end: 8px; font-size: 10px; font-style: normal; opacity: .82; }

        &.tone0 { background: linear-gradient(135deg, #3b4a6b, #6f7ea3); }
        &.tone1 { background: linear-gradient(135deg, #4a3b5f, #8a6fa3); }
        &.tone2 { background: linear-gradient(135deg, #2f4f4a, #5f9a8f); }
        &.tone3 { background: linear-gradient(135deg, #5b3d33, #a37a5f); }
        &.tone4 { background: linear-gradient(135deg, #2d3f52, #5f8aa3); }
      }

      .recipeName { padding: 0 12px; font-size: 13px; font-weight: 500; }

      .recipeStages {
        padding: 0 12px;
        overflow: hidden;
        color: var(--el-text-color-secondary);
        font-size: 11px;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      &:hover { border-color: var(--el-color-primary); }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    }

    .sceneList { display: flex; flex-wrap: wrap; gap: 8px; }

    .sceneCard {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      padding: 8px 12px;
      color: var(--el-text-color-primary);
      font: inherit;
      font-size: 13px;
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color-light);
      border-radius: 10px;
      cursor: pointer;

      &:hover { border-color: var(--el-color-primary); }
    }

    .contentEmpty { margin: 0; padding: 24px 0; color: var(--el-text-color-secondary); font-size: 13px; }
  }
}
</style>
