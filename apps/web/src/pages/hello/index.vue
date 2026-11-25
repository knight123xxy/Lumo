<template>
  <main class="hello" :class="{ configuring: !multiTenantEnabled && view !== 'welcome' }">
    <div class="glow" aria-hidden="true"></div>
    <div class="pageLanguage"><languageSelect popover /></div>
    <section class="welcomePanel" aria-labelledby="welcomeTitle">
      <div v-if="!multiTenantEnabled && view !== 'welcome'" class="providerContent">
        <header class="providerHeader">
          <el-button text :icon="IconArrowLeft" :disabled="saving" @click="view = 'welcome'">返回</el-button>
          <h1 id="welcomeTitle">配置第三方模型</h1>
        </header>
        <div class="providerBody">
          <languageModel />
        </div>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!customProviders.some((provider) => provider.models.length)"
          @click="completeSetup">
          开始使用
        </el-button>
      </div>
      <div v-else class="welcomeContent">
        <p class="eyebrow">LUMO · 本地模式</p>
        <h1 id="welcomeTitle">让一个想法<br />变成一支片</h1>
        <template v-if="multiTenantEnabled">
          <p class="description">登录 Lumo 即可免配置快速开始，直接开启创作。</p>
          <accountPanel v-if="!loggedIn" class="accountContent" @loggedIn="startWithAccount" />
          <el-button v-else class="startButton" type="primary" :loading="saving" @click="completeSetup">开始使用</el-button>
        </template>
        <template v-else>
          <p class="description">当前为本地模式，云端账号未启用。配置模型或稍后配置都能直接开始创作。</p>
          <el-button class="startButton" type="primary" :loading="saving" @click="completeSetup">开始使用</el-button>
        </template>
        <div class="secondaryActions">
          <template v-if="!multiTenantEnabled">
            <el-button class="secondaryButton" round :disabled="saving" @click="view = 'custom'">
              <icon-key class="buttonIcon" />
              配置第三方模型
            </el-button>
            <span class="separator">或</span>
          </template>
          <el-button class="secondaryButton" round :loading="saving" @click="completeSetup">稍后配置</el-button>
        </div>
      </div>

      <footer class="pageFooter">
        <el-button class="deviceLink" size="small" :icon="IconDevices" @click="mobileConnectVisible = true">{{ mobileConnectionLabel }}</el-button>
        <p>© {{ new Date().getFullYear() }} Lumo · 保留所有权利。</p>
      </footer>
    </section>
    <mobileConnect v-model="mobileConnectVisible" />
  </main>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { IconArrowLeft, IconDevices } from "@tabler/icons-vue";
import { customProviders, multiTenantEnabled, lumoAccountToken } from "@/stores/settings";
import { useHelloStore } from "@/stores/hello";
import anonymousData from "@/lib/anonymousData";
import languageSelect from "@/components/languageSelect.vue";
import { mobileConnectionLabel } from "@/lib/mobile";

const accountPanel = defineAsyncComponent(() => import("@/components/settings/panels/account/index.vue"));
const languageModel = defineAsyncComponent(() => import("@/components/settings/panels/languageModel/index.vue"));
const mobileConnect = defineAsyncComponent(() => import("@/components/mobileConnect.vue"));
const mobileConnectVisible = ref(false);
const view = ref<"welcome" | "custom">("welcome");
const loggedIn = ref(!!lumoAccountToken.value);
const saving = ref(false);
const router = useRouter();
const hello = useHelloStore();

function startWithAccount() {
  loggedIn.value = true;
  void completeSetup();
}

async function completeSetup() {
  if (saving.value) return;
  saving.value = true;
  try {
    await hello.complete();
    anonymousData.track(view.value === "custom" || lumoAccountToken.value ? "onboarding.complete" : "onboarding.skip");
    await router.replace("/home");
  } catch {
    ElMessage.error("保存引导状态失败，请重试");
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.hello {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 100svh;
  padding: 8px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family);

  .pageLanguage {
    position: fixed;
    top: 16px;
    inset-inline-end: calc(50% + 8px);
    z-index: 2;
    max-width: calc(50% - 24px);
  }

  .welcomePanel {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 32px;
    min-width: 0;
    min-height: 544px;
    padding: 48px clamp(24px, 4.4vw, 64px);

    .providerContent {
      grid-row: 1;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 24px;
      min-width: 0;
      min-height: 0;
      overflow: hidden;

      .providerHeader {
        h1 {
          margin: 16px 0 0;
          font-size: 28px;
          font-weight: 650;
        }
      }

      .providerBody {
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 2px;
      }
    }

    .welcomeContent {
      grid-row: 1;
      align-self: center;
      justify-self: center;
      width: 100%;
      max-width: 420px;

      h1 {
        margin: 0 0 12px;
        font-size: clamp(32px, 3.4vw, 40px);
        font-weight: 650;
        line-height: 1.35;
        letter-spacing: -0.8px;
        text-align: center;
      }

      .description {
        margin: 0 0 24px;
        color: var(--el-text-color-secondary);
        font-size: 14px;
        line-height: 1.8;
        text-align: center;
      }

      .accountContent {
        padding: 0;

        :deep(.authHeader) {
          display: block;

          .authLogo, .authInfo {
            display: none;
          }

          .authTabs {
            width: 100%;
          }
        }
      }

      .startButton {
        width: 100%;
        min-height: 42px;
      }

      .buttonIcon {
        width: 18px;
        height: 18px;
        margin-inline-end: 8px;
      }

      .secondaryActions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 20px;

        .separator {
          color: var(--el-text-color-secondary);
          font-size: 13px;
        }

        .secondaryButton {
          height: auto;
          min-height: 36px;
          margin: 0;
          padding: 8px 16px;
          white-space: normal;
          font-size: 13px;
        }
      }
    }

    .pageFooter {
      grid-row: 2;
      align-self: end;
      color: var(--el-text-color-secondary);
      font-size: 12px;

      .deviceLink {
        margin: 0;
        padding: 6px 10px;
        color: var(--el-text-color-secondary);

        &:hover {
          color: var(--el-color-primary);
        }
      }

      p {
        margin: 10px 0 0;
        line-height: 1.6;
      }
    }
  }

  &.configuring {
    height: 100dvh;
    min-height: 0;
    overflow: hidden;

    .welcomePanel {
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 24px;
      min-height: 0;

      .pageFooter {
        grid-row: 2;
      }
    }
  }

  .artPanel {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 28px;
    border-radius: calc(var(--ui-radius) * 1.125);
    overflow: hidden;
    background: var(--color-dark);

    .artBg {
      z-index: 0;
    }

    .artBrand {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #fff;

      .artLogo {
        width: 44px;
        height: 44px;
        line-height: 0;

        :deep(svg) {
          display: block;
          width: 100%;
          height: 100%;
        }

        :deep(path) {
          fill: #fff;
        }
      }

      .artName {
        font-size: 30px;
        font-weight: 600;
        letter-spacing: 0.4px;
      }
    }
  }

  @media (max-width: 700px) {
    grid-template-columns: 1fr;

    .pageLanguage {
      inset-inline-end: 16px;
      max-width: calc(100% - 32px);
    }

    .welcomePanel {
      padding: 32px 20px;
    }

    .artPanel {
      display: none;
    }
  }
}

// Lumo 品牌化首屏：单栏居中 + 网格底纹 + 顶部蓝青光晕，去掉 Toonflow 的双栏海报感。
.hello {
  grid-template-columns: 1fr;
  place-items: center;
  padding: 0;
  overflow: hidden;
  background-color: var(--color-bg);
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--color-text) 5%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--color-text) 5%, transparent) 1px, transparent 1px);
  background-size: 44px 44px;

  .glow {
    position: absolute;
    inset: -24% -12% auto -12%;
    height: 66vh;
    pointer-events: none;
    background: radial-gradient(52% 62% at 50% 0%, color-mix(in srgb, var(--color-text) 8%, transparent) 0%, transparent 68%);
  }

  .pageLanguage { inset-inline-end: 24px; max-width: none; }

  .welcomePanel {
    position: relative;
    z-index: 1;
    grid-template-rows: auto;
    gap: 0;
    width: min(560px, 90vw);
    min-width: 0;
    min-height: 0;
    padding: 0 0 24px;
    text-align: center;
  }

  .welcomeContent {
    max-width: 100%;

    .eyebrow {
      margin: 0 0 18px;
      color: var(--color-text-3);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.32em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0 0 18px;
      font-size: clamp(36px, 5vw, 56px);
      font-weight: 800;
      line-height: 1.14;
      letter-spacing: -0.025em;
    }

    .description {
      max-width: 420px;
      margin: 0 auto 28px;
      color: var(--el-text-color-regular);
      font-size: 15px;
      line-height: 1.7;
    }

    .startButton {
      width: 100%;
      max-width: 320px;
      height: 52px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 14px;
    }

    .accountContent { text-align: left; }
    .secondaryActions { justify-content: center; margin-top: 16px; }
  }

  .pageFooter {
    position: relative;
    inset: auto;
    gap: 10px;
    margin-top: 40px;
    color: var(--el-text-color-secondary);
  }
}
</style>
