<template>
  <div class="timelineRuler" :style="{ width: `${gutter + rulerContentWidth}px` }" @pointerdown="seek">
    <div class="rulerGutter" :style="{ width: `${gutter}px` }" />
    <div v-for="tick in ticks" :key="tick.seconds" class="tick" :class="{ major: tick.major }" :style="{ left: `${gutter + tick.seconds * pixelsPerSecond}px` }">
      <span v-if="tick.major" class="tickLabel">{{ tick.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { formatTime } from "../timelineModel";

const props = defineProps<{ duration: number; pixelsPerSecond: number; gutter: number }>();
const emit = defineEmits<{ seek: [time: number] }>();

const rulerContentWidth = computed(() => Math.max(600, props.duration * props.pixelsPerSecond + 200));

const ticks = computed(() => {
  const seconds = Math.max(Math.ceil(props.duration), 30);
  const result: { seconds: number; major: boolean; label: string }[] = [];
  for (let second = 0; second <= seconds; second++) {
    result.push({ seconds: second, major: second % 5 === 0, label: formatTime(second) });
  }
  return result;
});

function seek(event: PointerEvent) {
  const ruler = event.currentTarget as HTMLElement;
  const time = (event.clientX - ruler.getBoundingClientRect().left - props.gutter) / props.pixelsPerSecond;
  emit("seek", Math.max(0, time));
}
</script>

<style scoped lang="scss">
.timelineRuler {
  position: relative;
  display: flex;
  flex: 0 0 28px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  cursor: text;

  .rulerGutter {
    flex: 0 0 auto;
    border-right: 1px solid var(--el-border-color-lighter);
  }

  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--el-border-color);

    &.major {
      background: var(--el-text-color-secondary);
    }

    .tickLabel {
      position: absolute;
      top: 4px;
      left: 4px;
      color: var(--el-text-color-secondary);
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
    }
  }
}
</style>
