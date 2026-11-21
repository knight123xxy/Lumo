<template>
  <canvas ref="canvasRef" class="waveform" aria-hidden="true" />
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { computeWaveform } from "../useWaveform";

const props = defineProps<{ directory: string; path: string }>();
const canvasRef = ref<HTMLCanvasElement>();

async function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  const peaks = await computeWaveform(props.directory, props.path, Math.max(16, Math.floor(width / 3)));
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(123, 131, 247, 0.55)";
  const barWidth = width / peaks.length;
  for (let index = 0; index < peaks.length; index++) {
    const barHeight = Math.max(2, peaks[index]! * (height - 2));
    context.fillRect(index * barWidth, (height - barHeight) / 2, Math.max(1, barWidth - 1), barHeight);
  }
}

onMounted(draw);
watch(() => [props.directory, props.path], draw);
</script>

<style scoped lang="scss">
.waveform {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
