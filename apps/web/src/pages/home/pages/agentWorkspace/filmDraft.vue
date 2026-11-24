<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <p v-else-if="!timeline.ready.value" role="status">{{ translate('正在读取剪辑工程…') }}</p>
  <automaticFilmForm v-else v-model:topic="topic" active inline :directory="directory" :assets="timeline.assets.value" :busy="timeline.busy.value"
    :importFiles="timeline.importFiles" :createFilm="timeline.createAutomaticFilm" :currentStyle="timeline.project.value.style" @running="emit('busy', $event)" @importing="emit('busy', $event)" @generated="emit('generated', directory)" />
</template>

<script setup lang="ts">
import { onMounted, onScopeDispose, ref } from "vue";
import { translate } from "@lumo/i18n/vue";
import automaticFilmForm from "@/pages/workspace/panels/timeline/components/automaticFilmForm.vue";
import { useTimeline } from "@/pages/workspace/panels/timeline/useTimeline";

const props = defineProps<{ directory: string; existingTimeline?: ReturnType<typeof useTimeline> }>();
const emit = defineEmits<{ generated: [directory: string]; busy: [value: boolean] }>();
const topic = defineModel<string>("topic", { required: true });
const existingTimeline = props.existingTimeline;
const timeline = existingTimeline ?? useTimeline(props.directory);
const error = ref("");
onMounted(async () => {
  try { if (!existingTimeline) await timeline.load(true); }
  catch (failure) {
    error.value = failure instanceof Error ? failure.message : translate("读取剪辑工程失败");
  }
});
if (!existingTimeline) onScopeDispose(timeline.dispose);
</script>
