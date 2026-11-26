<template>
  <teleport to="body">
    <div v-if="visible" class="loadingPage" :class="{ leaving: filling }" role="status" aria-label="正在加载项目">
      <div class="loadingMark">
        <img class="loadingLogo" :src="logoUrl" alt="" aria-hidden="true" />
        <span class="loadingDots" aria-hidden="true"><i v-for="index in 3" :key="index" /></span>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import logoUrl from "@lumo/assets/logo.svg";

const props = defineProps<{ active: boolean }>();
const visible = defineModel<boolean>("visible", { default: false });
const drawn = defineModel<boolean>("drawn", { default: false });
const filling = ref(false);
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const reducedMotion = ref(motionPreference.matches);
let readyTimer: ReturnType<typeof setTimeout> | undefined;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;

function updateMotionPreference(event: MediaQueryListEvent) {
  reducedMotion.value = event.matches;
}
motionPreference.addEventListener("change", updateMotionPreference);
onBeforeUnmount(() => {
  motionPreference.removeEventListener("change", updateMotionPreference);
  if (readyTimer) clearTimeout(readyTimer);
  if (leaveTimer) clearTimeout(leaveTimer);
});

// ACT: 用简洁的 Logo 淡入替代旧描边动画；ready 阶段由定时器推进，保持 visible/drawn/active 三个对外状态不变。
function markReady() {
  drawn.value = true;
  if (!props.active) filling.value = true;
}

watch([() => props.active, reducedMotion], ([active, reduce]) => {
  if (readyTimer) clearTimeout(readyTimer);
  if (active) {
    if (!visible.value) {
      drawn.value = false;
      visible.value = true;
    }
    filling.value = false;
    if (reduce) markReady();
    else readyTimer = setTimeout(markReady, 700);
  } else if (visible.value) {
    drawn.value = true;
    if (reduce) {
      filling.value = false;
      visible.value = false;
    } else {
      filling.value = true;
    }
  }
}, { immediate: true });

watch(filling, leaving => {
  if (leaveTimer) clearTimeout(leaveTimer);
  if (!leaving || !visible.value) return;
  leaveTimer = setTimeout(() => {
    if (!props.active) visible.value = false;
  }, 320);
});
</script>

<style lang="scss" scoped>
.loadingPage {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  background: var(--el-bg-color);
  transition: opacity 0.3s ease;

  &.leaving { opacity: 0; }

  .loadingMark {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
  }

  .loadingLogo {
    width: 72px;
    height: 72px;
    animation: logoIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;

    .dark & { filter: invert(1); }
  }

  .loadingDots {
    display: flex;
    gap: 6px;

    i {
      width: 5px;
      height: 5px;
      background: var(--el-text-color-secondary);
      border-radius: 50%;
      animation: dotBreathe 1.1s ease-in-out infinite;

      &:nth-child(2) { animation-delay: 0.15s; }
      &:nth-child(3) { animation-delay: 0.3s; }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    .loadingLogo { animation: none; }
    .loadingDots i { animation: none; }
  }
}

@keyframes logoIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes dotBreathe {
  0%, 100% { opacity: 0.25; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}
</style>
