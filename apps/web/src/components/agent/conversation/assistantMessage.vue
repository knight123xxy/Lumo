<template>
  <messageMarkdown v-if="before" :content="before" :streaming="streaming && !plan.length" :directory="directory" />
  <details v-if="plan.length" class="creationPlan" open>
    <summary>{{ translate('创作计划') }}</summary>
    <ol>
      <li v-for="(step, index) in plan" :key="index">{{ step }}</li>
    </ol>
  </details>
  <messageMarkdown v-if="after" :content="after" :streaming="streaming" :directory="directory" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { translate } from "@lumo/i18n/vue";
import messageMarkdown from "@/components/messageMarkdown.vue";

const { content, streaming, directory } = defineProps<{ content: string; streaming: boolean; directory?: string }>();
const templateMarker = /(?:^|\r?\n)\[\[lumo-open-template\]\][\t \r\n]*$/;
const parsed = computed(() => {
  const text = content.replace(templateMarker, "");
  const match = /^(?:\uFEFF)?[\t\r\n ]*(`{3,}|~{3,})lumo-plan[\t ]*\r?\n([\s\S]*?)^\1[\t ]*(?:\r?\n|$)/m.exec(text);
  if (!match || match.index !== 0) return { before: text, plan: [], after: "" };
  const lines = match[2]!.trim().split(/\r?\n/).map(line => line.trim());
  if (lines.length < 2 || lines.length > 8 || lines.some(line => !/^- \S/.test(line) || line.length > 242)) {
    return { before: text, plan: [], after: "" };
  }
  return { before: "", plan: lines.map(line => line.slice(2)), after: text.slice(match[0].length) };
});
const before = computed(() => parsed.value.before);
const plan = computed(() => parsed.value.plan);
const after = computed(() => parsed.value.after);
</script>

<style scoped lang="scss">
.creationPlan {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--ui-radius);
  background: var(--el-fill-color-lighter);

  summary { cursor: pointer; font-weight: 600; }
  ol { margin: 8px 0 0; padding-inline-start: 1.45em; }
  li { overflow-wrap: anywhere; }
  li + li { margin-top: 4px; }
}
</style>
