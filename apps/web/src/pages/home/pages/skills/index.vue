<template>
  <div class="skillsPanel">
    <section class="skillsSection" aria-labelledby="pipelineTitle">
      <div class="sectionHeader">
        <div>
          <h2 id="pipelineTitle">{{ translate('整集模板') }}</h2>
          <p class="sectionHint">{{ translate('选一条流水线开始，Agent 会按阶段推进：研究、脚本、分镜、素材、剪辑、合成。') }}</p>
        </div>
      </div>
      <div class="pipelineGrid">
        <article class="pipelineCard">
          <div class="pipelineHead"><strong>{{ translate('竖屏卡点模板') }}</strong></div>
          <p class="pipelineSummary">{{ translate('替换文案、录屏与结果素材，生成竖屏卡点视频。') }}</p>
          <el-button type="primary" size="small" :disabled="disabled" @click="emit('openTemplate')">{{ translate('使用模板') }}</el-button>
        </article>
        <article v-for="pipeline in pipelineCatalog" :key="pipeline.slug" class="pipelineCard">
          <div class="pipelineHead">
            <strong>{{ pipeline.name }}</strong>
            <span v-if="pipeline.category" class="pipelineCategory">{{ pipeline.category }}</span>
          </div>
          <p class="pipelineSummary">{{ pipeline.summary }}</p>
          <p class="pipelineStages">{{ pipeline.stages.map(stage => stage.name).join(' › ') }}</p>
          <el-button type="primary" size="small" :disabled="disabled" @click="open(pipeline)">{{ translate('开始创作') }}</el-button>
        </article>
      </div>
    </section>

    <section class="skillsSection" aria-labelledby="installedTitle">
      <div class="sectionHeader">
        <div>
          <h2 id="installedTitle">{{ translate('我的技能') }}</h2>
          <p class="sectionHint">{{ translate('已安装的技能包，安装与卸载在插件市场管理。') }}</p>
        </div>
        <el-button size="small" @click="emit('manage')">{{ translate('管理技能包') }}</el-button>
      </div>
      <p v-if="errorText" class="skillsError" role="alert">{{ errorText }}</p>
      <div v-if="skills.length" class="skillList">
        <div v-for="skill in skills" :key="skill.name" class="skillRow">
          <div class="skillInfo">
            <strong>{{ skill.displayName || skill.name }}</strong>
            <span v-if="skill.description" class="skillDescription">{{ skill.description }}</span>
          </div>
          <div class="skillMeta">
            <span v-if="skill.builtin" class="skillBadge">{{ translate('内置') }}</span>
            <span v-if="!skill.enabled" class="skillBadge muted">{{ translate('已停用') }}</span>
            <span v-if="skill.version" class="skillVersion">v{{ skill.version }}</span>
          </div>
        </div>
      </div>
      <p v-else-if="!loading" class="skillsEmpty">{{ translate('还没有安装技能包') }}</p>
      <p v-if="loading" class="skillsEmpty" role="status">{{ translate('正在读取技能…') }}</p>
    </section>

    <el-dialog v-model="dialogVisible" :title="activePipeline ? `${translate('开始创作')} · ${activePipeline.name}` : translate('开始创作')" width="min(520px, calc(100vw - 32px))">
      <div class="startForm">
        <p v-if="activePipeline" class="startSummary">{{ activePipeline.summary }}</p>
        <label class="formLabel" for="pipelineTopic">{{ translate('这条片子的主题或素材说明') }}</label>
        <el-input id="pipelineTopic" v-model="topic" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" :maxlength="500" :placeholder="translate('例如：给一款降噪耳机做 60 秒产品片，主打通勤场景')" />
        <p class="startHint">{{ translate('会新建一个空项目，把这些要求交给 Agent 继续推进。') }}</p>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ translate('取消') }}</el-button>
        <el-button type="primary" :disabled="!topic.trim()" @click="start">{{ translate('新建项目并开始') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { translate } from "@lumo/i18n/vue";
import http from "@/lib/http";
import { pipelineCatalog, type Pipeline } from "./pipelineCatalog";

type InstalledSkill = { name: string; displayName: string; description: string; builtin: boolean; enabled: boolean; version: string };

const props = defineProps<{ disabled: boolean; active: boolean }>();
const emit = defineEmits<{
  start: [request: { name: string; summary: string; category: string; topic: string }];
  manage: [];
  openTemplate: [];
}>();

const skills = ref<InstalledSkill[]>([]);
const loading = ref(false);
const errorText = ref("");
const dialogVisible = ref(false);
const activePipeline = ref<Pipeline | null>(null);
const topic = ref("");
let loaded = false;

async function loadSkills() {
  if (loaded || loading.value) return;
  loading.value = true;
  errorText.value = "";
  try {
    skills.value = await http<InstalledSkill[]>({ method: "GET", url: "/api/skills/get" });
    loaded = true;
  } catch (error) {
    errorText.value = error instanceof Error && error.message ? error.message : translate("读取技能失败");
  } finally {
    loading.value = false;
  }
}

function open(pipeline: Pipeline) {
  activePipeline.value = pipeline;
  topic.value = "";
  dialogVisible.value = true;
}

function start() {
  const pipeline = activePipeline.value;
  const value = topic.value.trim();
  if (!pipeline || !value) return;
  dialogVisible.value = false;
  emit("start", { name: pipeline.name, summary: pipeline.summary, category: pipeline.category, topic: value });
}

watch(() => props.active, active => { if (active) void loadSkills(); }, { immediate: true });
</script>

<style lang="scss" scoped>
.skillsPanel {
  display: flex;
  flex-direction: column;
  gap: 36px;
  max-width: 1040px;
  margin: clamp(24px, 4vh, 48px) auto 48px;

  .skillsSection { display: flex; flex-direction: column; gap: 14px; }

  .sectionHeader {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    justify-content: space-between;

    h2 { margin: 0; font-size: 18px; font-weight: 600; }
  }

  .sectionHint { margin: 6px 0 0; color: var(--el-text-color-secondary); font-size: 13px; }

  .pipelineGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
    gap: 14px;
  }

  .pipelineCard {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--el-bg-color-overlay);
    border: 1px solid var(--el-border-color-light);
    border-radius: 12px;

    .pipelineHead { display: flex; gap: 8px; align-items: center; }
    .pipelineHead strong { font-size: 15px; }

    .pipelineCategory {
      padding: 1px 7px;
      color: var(--el-text-color-regular);
      font-size: 11px;
      background: var(--el-fill-color-light);
      border-radius: 999px;
    }

    .pipelineSummary {
      display: -webkit-box;
      flex: 1;
      margin: 0;
      overflow: hidden;
      color: var(--el-text-color-regular);
      font-size: 13px;
      line-height: 1.7;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    .pipelineStages { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }
    .el-button { align-self: flex-start; margin-top: 4px; }
  }

  .skillList { display: flex; flex-direction: column; border: 1px solid var(--el-border-color-light); border-radius: 12px; }

  .skillRow {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;

    & + .skillRow { border-top: 1px solid var(--el-border-color-lighter); }

    .skillInfo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .skillDescription { color: var(--el-text-color-secondary); font-size: 12px; }
    .skillMeta { display: flex; flex-shrink: 0; gap: 6px; align-items: center; }
    .skillBadge {
      padding: 1px 7px;
      color: var(--el-color-primary);
      font-size: 11px;
      background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
      border-radius: 999px;

      &.muted { color: var(--el-text-color-secondary); background: var(--el-fill-color-light); }
    }
    .skillVersion { color: var(--el-text-color-secondary); font-size: 12px; }
  }

  .skillsEmpty { padding: 20px 0; color: var(--el-text-color-secondary); font-size: 13px; }
  .skillsError { margin: 0; color: var(--el-color-danger); font-size: 13px; }

  .startForm {
    display: grid;
    gap: 8px;

    .startSummary { margin: 0 0 4px; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.7; }
    .formLabel { margin-top: 4px; color: var(--el-text-color-regular); font-size: 13px; }
    .startHint { margin: 4px 0 0; color: var(--el-text-color-secondary); font-size: 12px; }
  }
}
</style>
