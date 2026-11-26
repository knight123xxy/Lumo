<template>
  <div class="appStorePanel">
    <section class="storeSection heroSection" aria-labelledby="latestTitle">
      <div class="sectionHeader">
        <h2 id="latestTitle">{{ translate('最新上线') }}</h2>
        <div class="heroNav">
          <button class="navButton" type="button" :aria-label="translate('上一个')" @click="stepHero(-1)">
            <icon-chevron-left :size="18" aria-hidden="true" />
          </button>
          <button class="navButton" type="button" :aria-label="translate('下一个')" @click="stepHero(1)">
            <icon-chevron-right :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="heroStage" role="list" @pointerenter="pauseHero" @pointerleave="resumeHero" @focusin="pauseHero" @focusout="resumeHero">
        <button v-for="(template, index) in templateCatalog" :key="template.id" class="heroCard" :class="heroClass(index)" type="button" role="listitem"
          :tabindex="Math.abs(index - activeHero) <= 1 ? 0 : -1" :aria-hidden="Math.abs(index - activeHero) > 1 ? 'true' : undefined"
          :disabled="disabled" @click="onHeroClick(index)">
          <video class="heroVideo" :src="template.cover" autoplay loop muted playsinline preload="metadata" aria-hidden="true" />
          <span class="heroOverlay">
            <span class="heroBadge">{{ translate('整集模板') }}</span>
            <strong class="heroName">{{ template.name }}</strong>
            <span class="heroSummary">{{ template.summary }}</span>
          </span>
        </button>
      </div>
      <div class="heroDots" role="tablist" :aria-label="translate('轮播指示')">
        <button v-for="(template, index) in templateCatalog" :key="template.id" class="heroDot" :class="{ active: index === activeHero }" type="button" role="tab" :aria-selected="index === activeHero" :aria-label="template.name" @click="gotoHero(index)" />
      </div>
    </section>

    <section class="storeSection" aria-labelledby="pipelineTitle">
      <div class="sectionHeader">
        <h2 id="pipelineTitle">{{ translate('创作流水线') }}</h2>
        <button class="viewAll" type="button" @click="expandedPipelines = !expandedPipelines">
          {{ expandedPipelines ? translate('收起') : translate('查看全部') }}<icon-chevron-right :size="15" aria-hidden="true" />
        </button>
      </div>
      <div class="appList">
        <button v-for="pipeline in visiblePipelines" :key="pipeline.slug" class="appRow" type="button" :disabled="disabled" @click="openDetail({ kind: 'pipeline', pipeline })">
          <span class="appIcon"><img :src="pipelineCovers[pipeline.slug]" :alt="pipeline.name" loading="lazy" decoding="async" /></span>
          <span class="appText">
            <strong>{{ pipeline.name }}</strong>
            <span class="appDesc">{{ pipeline.summary }}</span>
          </span>
          <icon-chevron-right class="appChevron" :size="17" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section class="storeSection" aria-labelledby="installedTitle">
      <div class="sectionHeader">
        <h2 id="installedTitle">{{ translate('我的技能') }}</h2>
        <button class="viewAll" type="button" @click="emit('manage')">{{ translate('管理插件') }}<icon-chevron-right :size="15" aria-hidden="true" /></button>
      </div>
      <p v-if="errorText" class="skillsError" role="alert">{{ errorText }}</p>
      <div v-if="skills.length" class="appList">
        <div v-for="skill in skills" :key="skill.name" class="appRow skillRow">
          <span class="appIcon"><icon-puzzle :size="20" aria-hidden="true" /></span>
          <span class="appText">
            <strong>{{ skill.displayName || skill.name }}<span v-if="skill.builtin" class="skillBadge">{{ translate('内置') }}</span><span v-if="!skill.enabled" class="skillBadge muted">{{ translate('已停用') }}</span></strong>
            <span class="appDesc">{{ skill.description || (skill.version ? `v${skill.version}` : translate('已安装技能')) }}</span>
          </span>
          <span class="skillActions">
            <el-switch :model-value="skill.enabled" size="small" :loading="busy(skill.name)" :disabled="busy(skill.name) || loading"
              :aria-label="translate(skill.enabled ? '停用技能' : '启用技能')" @update:model-value="value => void toggle(skill, Boolean(value))" />
            <el-button v-if="!skill.builtin" size="small" text type="danger" :loading="busy(skill.name)" :disabled="busy(skill.name) || loading"
              @click="remove(skill)">{{ translate('卸载') }}</el-button>
          </span>
        </div>
      </div>
      <p v-else-if="!loading" class="skillsEmpty">{{ translate('还没有安装技能包') }}</p>
      <p v-if="loading" class="skillsEmpty" role="status">{{ translate('正在读取技能…') }}</p>
    </section>


    <el-dialog v-model="detailVisible" class="appDetailDialog" width="min(760px, calc(100vw - 32px))" alignCenter appendToBody :showClose="false">
      <div v-if="detail" class="detailPanel">
        <div class="detailHero" :class="{ image: detail.cover.endsWith('.png') }">
          <video v-if="detail.cover.endsWith('.mp4')" :src="detail.cover" autoplay loop muted playsinline />
          <img v-else :src="detail.cover" :alt="detail.name" />
          <button class="detailClose" type="button" :aria-label="translate('关闭')" @click="detailVisible = false">
            <icon-x :size="18" aria-hidden="true" />
          </button>
        </div>
        <div class="detailBody">
          <span class="detailBadge">{{ detail.kind === 'pipeline' ? translate('创作流水线') : translate('整集模板') }}</span>
          <h2>{{ detail.name }}</h2>
          <p class="detailSummary">{{ detail.summary }}</p>
          <div v-if="detail.stages?.length" class="detailStages">
            <h3>{{ translate('阶段') }} <em>{{ detail.stages.length }}</em></h3>
            <ol>
              <li v-for="(stage, index) in detail.stages" :key="stage.name">
                <span class="stageIndex">{{ String(index + 1).padStart(2, '0') }}</span>
                <div><strong>{{ stage.name }}</strong><p>{{ stage.detail }}</p></div>
              </li>
            </ol>
          </div>
          <div class="detailActions">
            <el-button @click="detailVisible = false">{{ translate('返回') }}</el-button>
            <el-button type="primary" :disabled="disabled" @click="startFromDetail">
              {{ detail.kind === 'pipeline' ? translate('开始创作') : translate('使用该模板') }}
            </el-button>
          </div>
        </div>
      </div>
    </el-dialog>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { translate } from "@lumo/i18n/vue";
import { IconChevronLeft, IconChevronRight, IconPuzzle, IconX } from "@tabler/icons-vue";
import http from "@/lib/http";
import { pipelineCatalog, type Pipeline } from "./pipelineCatalog";
import { templateCatalog } from "./templateCatalog";

type InstalledSkill = { name: string; displayName: string; description: string; builtin: boolean; enabled: boolean; version: string };

const props = defineProps<{ disabled: boolean; active: boolean }>();
const emit = defineEmits<{
  start: [request: { name: string; summary: string; category: string; topic: string }];
  manage: [];
  openTemplate: [];
}>();

// 流水线封面图（gpt-image 预生成，存于 public/covers/），按 slug 映射。
const pipelineCovers: Record<string, string> = {
  "animated-explainer": "/covers/animated-explainer.png",
  "animation": "/covers/animation.png",
  "avatar-spokesperson": "/covers/avatar-spokesperson.png",
  "character-animation": "/covers/character-animation.png",
  "cinematic": "/covers/cinematic.png",
  "clip-factory": "/covers/clip-factory.png",
  "hybrid": "/covers/hybrid.png",
  "localization-dub": "/covers/localization-dub.png",
  "podcast-repurpose": "/covers/podcast-repurpose.png",
  "screen-demo": "/covers/screen-demo.png",
  "talking-head": "/covers/talking-head.png",
};

// 最新上线：整集模板作为主推卡片。中间一张放大，两侧向中间倾斜（coverflow），点两侧切到该卡。
const activeHero = ref(0);

// ACT: 主推位自动轮播并循环；用环形偏移让首尾相邻，箭头与自动播放都不会卡在两端。
const heroCount = templateCatalog.length;
const heroPaused = ref(false);
let heroTimer: ReturnType<typeof setInterval> | undefined;

function heroClass(index: number) {
  const offset = (index - activeHero.value + heroCount) % heroCount;
  if (offset === 0) return "is-center";
  if (offset === heroCount - 1) return "is-prev";
  if (offset === 1) return "is-next";
  return "is-hidden";
}
function gotoHero(index: number) {
  activeHero.value = ((index % heroCount) + heroCount) % heroCount;
}
function stepHero(direction: number) {
  gotoHero(activeHero.value + direction);
}
function startHeroTimer() {
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => { if (!heroPaused.value) stepHero(1); }, 5000);
}
function pauseHero() { heroPaused.value = true; }
function resumeHero() { heroPaused.value = false; }

onMounted(startHeroTimer);
onBeforeUnmount(() => { if (heroTimer) clearInterval(heroTimer); });
function onHeroClick(index: number) {
  if (index === activeHero.value) openDetail({ kind: "template", template: templateCatalog[index]! });
  else gotoHero(index);
}

const expandedPipelines = ref(false);
const visiblePipelines = computed(() => expandedPipelines.value ? pipelineCatalog : pipelineCatalog.slice(0, 6));

const skills = ref<InstalledSkill[]>([]);
const loading = ref(false);
const pending = ref<Set<string>>(new Set());
const errorText = ref("");
const dialogVisible = ref(false);
const activePipeline = ref<Pipeline | null>(null);
const topic = ref("");
let loaded = false;

const busy = (name: string) => pending.value.has(name);
function mark(name: string, on: boolean) {
  const next = new Set(pending.value);
  if (on) next.add(name); else next.delete(name);
  pending.value = next;
}
const describe = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

async function toggle(skill: InstalledSkill, enabled: boolean) {
  if (busy(skill.name) || skill.enabled === enabled) return;
  mark(skill.name, true);
  try {
    await http({ method: "PUT", url: "/api/skills/setEnabled", data: { name: skill.name, enabled } });
    skill.enabled = enabled;
    ElMessage.success(enabled ? translate("已启用") : translate("已停用"));
  } catch (error) {
    ElMessage.error(describe(error, translate("操作失败")));
  } finally {
    mark(skill.name, false);
  }
}

async function remove(skill: InstalledSkill) {
  if (busy(skill.name)) return;
  const label = skill.displayName || skill.name;
  try {
    await ElMessageBox.confirm(
      translate("卸载") + `「${label}」？` + translate("卸载后需要重新安装才能使用。"),
      translate("卸载技能包"),
      { type: "warning", confirmButtonText: translate("卸载"), cancelButtonText: translate("取消") },
    );
  } catch {
    return;
  }
  mark(skill.name, true);
  try {
    await http({ method: "DELETE", url: "/api/skills/uninstall", data: { name: skill.name } });
    skills.value = skills.value.filter(item => item.name !== skill.name);
    ElMessage.success(translate("技能已卸载"));
  } catch (error) {
    ElMessage.error(describe(error, translate("卸载失败")));
  } finally {
    mark(skill.name, false);
  }
}

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

type Detail = {
  kind: "pipeline" | "template";
  name: string;
  summary: string;
  cover: string;
  stages?: { name: string; detail: string }[];
  pipeline?: Pipeline;
  templateId?: string;
};
const detailVisible = ref(false);
const detail = ref<Detail | null>(null);

function openDetail(input: { kind: "pipeline"; pipeline: Pipeline } | { kind: "template"; template: (typeof templateCatalog)[number] }) {
  if (input.kind === "pipeline") {
    const pipeline = input.pipeline;
    detail.value = { kind: "pipeline", name: pipeline.name, summary: pipeline.summary, cover: pipelineCovers[pipeline.slug] ?? "", stages: pipeline.stages, pipeline };
  } else {
    const template = input.template;
    detail.value = { kind: "template", name: template.name, summary: template.summary, cover: template.cover, templateId: template.id };
  }
  detailVisible.value = true;
}

function startFromDetail() {
  const current = detail.value;
  if (!current) return;
  detailVisible.value = false;
  if (current.kind === "pipeline" && current.pipeline) open(current.pipeline);
  else emit("openTemplate");
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

// 首屏定位由 activeHero 初始值决定，无需额外滚动同步。
watch(() => props.active, active => { if (active) void loadSkills(); }, { immediate: true });
</script>

<style lang="scss" scoped>
.appStorePanel {
  --storeIconBg: #111111;
  display: flex;
  flex-direction: column;
  gap: clamp(36px, 5vh, 56px);
  max-width: 1240px;
  margin: 0 auto;
  padding: 8px 0 56px;

  .storeSection { display: flex; flex-direction: column; gap: 16px; }

  .sectionHeader {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;

    h2 {
      margin: 0;
      color: var(--color-text);
      font-size: clamp(20px, 2vw, 25px);
      font-weight: 700;
      letter-spacing: -0.02em;
    }
  }

  .viewAll {
    display: inline-flex;
    flex-shrink: 0;
    gap: 2px;
    align-items: center;
    padding: 4px 2px;
    color: var(--color-text-3);
    font: inherit;
    font-size: 13px;
    background: transparent;
    border: 0;
    cursor: pointer;
    transition: color .15s ease;

    &:hover { color: var(--color-text); }
    &:focus-visible { outline: 2px solid var(--color-border-2); outline-offset: 2px; border-radius: 6px; }
    &:dir(rtl) svg { transform: scaleX(-1); }
  }

  // ---------- 最新上线 ----------
  .heroNav { display: flex; flex-shrink: 0; gap: 8px; }

  .navButton {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    color: var(--color-text-2);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 50%;
    cursor: pointer;
    transition: color .15s ease, border-color .15s ease;

    &:hover:not(:disabled) { color: var(--color-text); border-color: var(--color-border-2); }
    &:focus-visible { outline: 2px solid var(--color-border-2); outline-offset: 2px; }
    &:disabled { opacity: .35; cursor: default; }
    &:dir(rtl) svg { transform: scaleX(-1); }
  }

  .heroStage {
    position: relative;
    height: clamp(220px, 27vw, 360px);
    perspective: 1600px;
    perspective-origin: 50% 44%;
  }

  .heroCard {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    width: clamp(240px, 44%, 520px);
    aspect-ratio: 16 / 9;
    padding: 0;
    overflow: hidden;
    text-align: start;
    background: var(--color-panel-2);
    border: 1px solid var(--color-border);
    border-radius: 18px;
    transform: translate(-50%, -50%);
    transform-style: preserve-3d;
    backface-visibility: hidden;
    cursor: pointer;
    transition: transform .5s cubic-bezier(.22, .61, .36, 1), opacity .35s ease, border-color .3s ease, box-shadow .4s ease;

    // 中间一张放大前突，两侧缩小并向中间倾斜（coverflow）。
    &.is-center {
      z-index: 3;
      border-color: var(--color-border-2);
      box-shadow: 0 28px 64px rgb(0 0 0 / 30%);
      transform: translate(-50%, -50%) translateY(-6px) scale(1.06);
    }

    &.is-prev {
      z-index: 2;
      opacity: .8;
      transform: translate(-50%, -50%) translateX(-66%) translateY(16px) rotateY(20deg) scale(.86);
    }

    &.is-next {
      z-index: 2;
      opacity: .8;
      transform: translate(-50%, -50%) translateX(66%) translateY(16px) rotateY(-20deg) scale(.86);
    }

    &.is-hidden {
      z-index: 1;
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, -50%) scale(.7);
    }

    @media (prefers-reduced-motion: reduce) { transition: none; }

    .heroVideo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      background: #0d0d0d;
    }

    .heroOverlay {
      position: absolute;
      inset: auto 0 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 44px 20px 18px;
      color: #fff;
      background: linear-gradient(to top, rgb(0 0 0 / 86%), rgb(0 0 0 / 0%));
    }

    .heroBadge {
      align-self: flex-start;
      padding: 2px 8px;
      color: rgb(255 255 255 / 78%);
      font-size: 11px;
      background: rgb(255 255 255 / 12%);
      border-radius: 6px;
    }

    .heroName {
      overflow: hidden;
      font-size: clamp(16px, 1.5vw, 20px);
      font-weight: 700;
      letter-spacing: -0.01em;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .heroSummary {
      display: -webkit-box;
      overflow: hidden;
      color: rgb(255 255 255 / 66%);
      font-size: 12.5px;
      line-height: 1.55;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
    }

    &:hover:not(:disabled) { border-color: var(--color-border-2); }
    &:focus-visible { outline: 2px solid var(--color-border-2); outline-offset: 2px; }
    &:disabled { cursor: wait; opacity: .6; }
  }

  .heroDots {
    display: flex;
    gap: 6px;
    align-items: center;
    justify-content: center;
  }

  .heroDot {
    width: 6px;
    height: 6px;
    padding: 0;
    background: var(--color-border-2);
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    transition: width .2s ease, background-color .2s ease;

    &.active { width: 18px; background: var(--color-text); }
    &:focus-visible { outline: 2px solid var(--color-border-2); outline-offset: 2px; }
  }

  // ---------- 列表 ----------
  .appList {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px 40px;

    @media (max-width: 900px) { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  }

  .appRow {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 13px 12px;
    color: inherit;
    font: inherit;
    text-align: start;
    background: transparent;
    border: 0;
    border-radius: 12px;
    cursor: pointer;
    transition: background-color .15s ease;

    &:hover:not(:disabled) { background: var(--color-panel-2); }
    &:focus-visible { outline: 2px solid var(--color-border-2); outline-offset: 2px; }
    &:disabled { cursor: wait; opacity: .55; }

    .appIcon {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 48px;
      height: 48px;
      overflow: hidden;
      color: #fff;
      background: var(--storeIconBg);
      border-radius: 12px;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .appText {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 4px;
      min-width: 0;

      strong {
        display: flex;
        gap: 6px;
        align-items: center;
        overflow: hidden;
        color: var(--color-text);
        font-size: 15px;
        font-weight: 600;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }

    .appDesc {
      overflow: hidden;
      color: var(--color-text-3);
      font-size: 13px;
      line-height: 1.5;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .appChevron { flex-shrink: 0; color: var(--color-text-3); }
  }

  .skillRow { cursor: default; }
  .skillActions { display: flex; flex-shrink: 0; gap: 8px; align-items: center; }

  .skillBadge {
    padding: 1px 7px;
    color: var(--color-text-2);
    font-size: 11px;
    font-weight: 500;
    background: var(--color-panel-2);
    border-radius: 999px;

    &.muted { color: var(--color-text-3); }
  }

  .skillsEmpty { padding: 16px 0; color: var(--color-text-3); font-size: 13px; }
  .skillsError { margin: 0; color: var(--el-color-danger); font-size: 13px; }

  .startForm {
    display: grid;
    gap: 8px;

    .startSummary { margin: 0 0 4px; color: var(--color-text-2); font-size: 13px; line-height: 1.7; }
    .formLabel { margin-top: 4px; color: var(--color-text-2); font-size: 13px; }
    .startHint { margin: 4px 0 0; color: var(--color-text-3); font-size: 12px; }
  }
}

:global(html.dark) .appStorePanel { --storeIconBg: #1f1f1f; }

@media (max-width: 760px) {
  .appStorePanel {
    .heroStage { height: clamp(180px, 52vw, 260px); }
    .heroCard {
      width: min(78%, 360px);

      &.is-prev { transform: translate(-50%, -50%) translateX(-58%) translateY(12px) rotateY(16deg) scale(.84); }
      &.is-next { transform: translate(-50%, -50%) translateX(58%) translateY(12px) rotateY(-16deg) scale(.84); }
    }
  }
}

:global(.appDetailDialog) {
  border-radius: 18px;
  overflow: hidden;
}

:global(.appDetailDialog .el-dialog__header) { display: none; }

:global(.appDetailDialog .el-dialog__body) { padding: 0; }

.detailPanel {
  display: flex;
  flex-direction: column;

  .detailHero {
    position: relative;
    aspect-ratio: 16 / 7;
    overflow: hidden;
    background: #0d0d0d;

    video, img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &.image img { object-fit: cover; }

    .detailClose {
      position: absolute;
      inset-block-start: 12px;
      inset-inline-end: 12px;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      padding: 0;
      color: #fff;
      background: rgb(0 0 0 / 45%);
      border: 0;
      border-radius: 50%;
      cursor: pointer;

      &:hover { background: rgb(0 0 0 / 65%); }
    }
  }

  .detailBody {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 24px 22px;

    .detailBadge {
      align-self: flex-start;
      padding: 2px 8px;
      color: var(--color-text-3);
      font-size: 11px;
      background: var(--color-panel-2);
      border-radius: 6px;
    }

    h2 {
      margin: 0;
      color: var(--color-text);
      font-size: 21px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .detailSummary {
      margin: 0;
      color: var(--color-text-2);
      font-size: 13.5px;
      line-height: 1.7;
    }

    .detailStages {
      margin-top: 6px;

      h3 {
        margin: 0 0 10px;
        color: var(--color-text-2);
        font-size: 13px;
        font-weight: 600;

        em { color: var(--color-text-3); font-style: normal; font-weight: 400; }
      }

      ol {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0;
        padding: 0;
        max-height: 260px;
        overflow-y: auto;
        list-style: none;
      }

      li {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 9px 10px;
        border-radius: 10px;

        &:hover { background: var(--color-panel-2); }

        .stageIndex {
          flex-shrink: 0;
          width: 22px;
          color: var(--color-text-3);
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }

        strong { display: block; color: var(--color-text); font-size: 13.5px; font-weight: 600; }
        p { margin: 2px 0 0; color: var(--color-text-3); font-size: 12.5px; line-height: 1.6; }
      }
    }

    .detailActions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 12px;
    }
  }
}
</style>
