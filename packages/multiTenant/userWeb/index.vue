<template>
  <div class="userWeb">
    <div class="authContent">
      <header class="authHeader">
        <div class="brand">
          <img v-if="logoUrl" class="brandLogo" :src="logoUrl" alt="Lumo" />
          <span class="brandName">Lumo</span>
        </div>
      </header>
      <main class="authMain">
        <section class="authPanel" aria-labelledby="authTitle">
          <header class="panelHeader">
            <h1 id="authTitle">{{ mode === "reset" ? translate("重设密码") : mode === "login" ? translate("登录") : translate("注册") }}</h1>
            <el-button v-if="mode !== 'login'" class="modeButton" link type="primary" :disabled="busy || sending" @click="switchMode('login')">{{ translate('返回登录') }}</el-button>
          </header>
          <el-form class="authForm" labelPosition="top" hideRequiredAsterisk :disabled="busy" :aria-busy="busy" @submit.prevent="submit">
            <el-form-item :label="emailRegistration ? translate('邮箱') : translate('账号')" for="userAccount" :error="userNameError" required>
              <el-input id="userAccount" ref="userNameInput" v-model="userName" name="username" :autocomplete="emailRegistration ? 'email' : 'username'" :inputmode="emailRegistration ? 'email' : undefined" aria-required="true" :maxlength="64" />
            </el-form-item>
            <el-form-item v-if="emailRegistration" :label="translate('邮箱验证码')" for="registrationCode" required>
              <div class="codeFields">
                <el-input id="registrationCode" v-model="verificationCode" inputmode="numeric" autocomplete="one-time-code" :maxlength="6" />
                <el-button nativeType="button" :loading="sending" :disabled="remaining > 0" @click="sendCode">{{ remaining ? `${remaining}s` : translate('发送验证码') }}</el-button>
              </div>
            </el-form-item>
            <el-form-item :label="translate(mode === 'reset' ? '新密码' : '密码')" for="userPassword" :error="passwordError" required>
              <el-input id="userPassword" ref="passwordInput" v-model="password" name="password" type="password" showPassword aria-required="true" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :minlength="8" :maxlength="128" />
            </el-form-item>
            <el-form-item v-if="mode !== 'login'" :label="translate('确认密码')" for="userPasswordConfirm" :error="confirmationError" required>
              <el-input id="userPasswordConfirm" ref="confirmationInput" v-model="passwordConfirm" type="password" showPassword autocomplete="new-password" aria-required="true" :minlength="8" :maxlength="128" />
            </el-form-item>
            <el-form-item v-if="mode === 'register'" :label="translate('推荐码（选填）')" for="userReferralCode">
              <el-input id="userReferralCode" v-model="referralCode" autocomplete="off" :maxlength="128" />
            </el-form-item>
            <el-alert v-if="notice" class="formNotice" :title="notice" type="success" :closable="false" showIcon />
            <el-alert v-if="requestError" class="requestError" :title="requestError" type="error" :closable="false" showIcon />
            <el-button class="submitButton" type="primary" nativeType="submit" :loading="busy" :disabled="busy">{{ mode === "reset" ? translate("重设密码") : mode === "login" ? translate("登录") : translate("注册") }}</el-button>
          </el-form>
          <footer v-if="mode === 'login' && (registrationEnabled || passwordResetEnabled)" class="accountSwitch">
            <el-button v-if="registrationEnabled" class="modeButton" link type="primary" :disabled="busy" @click="switchMode('register')">{{ translate('注册账号') }}</el-button>
            <el-button v-if="passwordResetEnabled" class="modeButton" link type="primary" :disabled="busy" @click="switchMode('reset')">{{ translate('忘记密码') }}</el-button>
          </footer>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { translate } from "@lumo/i18n/vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ElAlert, ElButton, ElForm, ElFormItem, ElInput, type InputInstance } from "element-plus";
import type { UserIdentity, UserRequest } from "./types";
import "element-plus/es/components/alert/style/css";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/form-item/style/css";
import "element-plus/es/components/input/style/css";

const props = defineProps<{ request: UserRequest; logoUrl?: string; registrationEnabled: boolean; emailVerificationRequired?: boolean; passwordResetEnabled?: boolean }>();
const emit = defineEmits<{ authenticated: [user: UserIdentity] }>();
type Mode = "login" | "register" | "reset";
const mode = ref<Mode>("login");
const notice = ref("");
const userName = ref("");
const password = ref("");
const passwordConfirm = ref("");
const referralCode = ref("");
const busy = ref(false);
const emailRegistration = computed(() => mode.value === "reset" || (mode.value === "register" && props.emailVerificationRequired));
const verificationCode = ref("");
const sending = ref(false);
const remaining = ref(0);
let countdown: ReturnType<typeof setInterval> | undefined;
const userNameError = ref("");
const passwordError = ref("");
const confirmationError = ref("");
const requestError = ref("");
const userNameInput = ref<InputInstance>();
const passwordInput = ref<InputInstance>();
const confirmationInput = ref<InputInstance>();
const controller = new AbortController();

watch([userName, password, passwordConfirm, referralCode, verificationCode], () => {
  userNameError.value = "";
  passwordError.value = "";
  confirmationError.value = "";
  requestError.value = "";
});

function emailAddress() {
  const email = userName.value.trim();
  if (email.length <= 64 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email;
  userNameError.value = translate("请输入有效的邮箱地址");
  userNameInput.value?.focus();
}

async function sendCode() {
  if (sending.value || remaining.value || busy.value || !emailRegistration.value) return;
  if (mode.value === "reset" ? !props.passwordResetEnabled : !props.registrationEnabled) return;
  const email = emailAddress();
  if (!email) return;
  sending.value = true;
  requestError.value = "";
  try {
    const result = await props.request<{ retryAfter: number }>({ method: "POST", url: mode.value === "reset" ? "/api/multiTenant/user/sendPasswordResetCode" : "/api/multiTenant/user/sendRegistrationCode", data: { email }, signal: controller.signal });
    startCountdown(result.retryAfter);
    if (mode.value === "reset") notice.value = translate("如果该邮箱支持找回密码，你将收到验证码");
  } catch (cause) {
    if (controller.signal.aborted) return;
    if (cause instanceof Error && "retryAfter" in cause && typeof cause.retryAfter === "number") startCountdown(cause.retryAfter);
    requestError.value = cause instanceof Error ? cause.message : translate("账号操作失败，请重试");
  } finally { sending.value = false; }
}

function startCountdown(seconds: number) {
  clearInterval(countdown);
  const retryAt = Date.now() + seconds * 1000;
  remaining.value = seconds;
  countdown = setInterval(() => {
    remaining.value = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    if (!remaining.value) clearInterval(countdown);
  }, 1000);
}

async function switchMode(next: Mode) {
  if (busy.value || sending.value) return;
  if (next === "register" && !props.registrationEnabled || next === "reset" && !props.passwordResetEnabled) return;
  setMode(next);
  await nextTick();
  userNameInput.value?.focus();
}

function setMode(next: Mode) {
  mode.value = next;
  notice.value = "";
  clearInterval(countdown);
  remaining.value = 0;
  password.value = "";
  passwordConfirm.value = "";
  referralCode.value = "";
  verificationCode.value = "";
  userNameError.value = "";
  passwordError.value = "";
  confirmationError.value = "";
  requestError.value = "";
}

async function submit() {
  if (busy.value || sending.value) return;
  if (mode.value === "register" && !props.registrationEnabled || mode.value === "reset" && !props.passwordResetEnabled) return;
  const name = emailRegistration.value ? emailAddress() : userName.value.trim();
  if (name === undefined) return;
  if (emailRegistration.value && !/^\d{6}$/.test(verificationCode.value.trim())) {
    requestError.value = translate("请输入六位邮箱验证码");
    return;
  }
  if (!name || name.length > 64) {
    userNameError.value = translate("账号长度应为 1 到 64 个字符");
    userNameInput.value?.focus();
    return;
  }
  if (/[\s\u0000-\u001f\u007f]/.test(name)) {
    userNameError.value = translate("账号不能包含空白或控制字符");
    userNameInput.value?.focus();
    return;
  }
  if (password.value.length < 8 || password.value.length > 128) {
    passwordError.value = translate("密码长度应为 8 到 128 个字符");
    passwordInput.value?.focus();
    return;
  }
  if (mode.value !== "login" && password.value !== passwordConfirm.value) {
    confirmationError.value = translate("两次输入的密码不一致");
    confirmationInput.value?.focus();
    return;
  }
  const code = mode.value === "register" ? referralCode.value.trim() : "";
  if (code && !/^[0-9a-f]{32}$/i.test(code)) {
    requestError.value = translate("推荐码无效");
    return;
  }
  busy.value = true;
  requestError.value = "";
  try {
    if (mode.value === "reset") {
      await props.request({ method: "POST", url: "/api/multiTenant/user/resetPassword", data: { email: name, code: verificationCode.value.trim(), password: password.value }, signal: controller.signal });
      setMode("login");
      notice.value = translate("密码已重设，请使用新密码登录");
      await nextTick();
      passwordInput.value?.focus();
      return;
    }
    const result = await props.request<{ user: UserIdentity }>({
      method: "POST", url: `/api/multiTenant/user/${mode.value}`,
      data: { userName: name, password: password.value, ...(code ? { referralCode: code } : {}),
        ...(emailRegistration.value ? { code: verificationCode.value.trim() } : {}) }, signal: controller.signal,
    });
    password.value = "";
    passwordConfirm.value = "";
    referralCode.value = "";
    emit("authenticated", result.user);
  } catch (cause) {
    if (!controller.signal.aborted) requestError.value = cause instanceof Error ? cause.message : translate("账号操作失败，请重试");
  } finally { busy.value = false; }
}

onBeforeUnmount(() => {
  clearInterval(countdown);
  controller.abort();
  password.value = "";
  passwordConfirm.value = "";
});
</script>

<style lang="scss" scoped>
.userWeb {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 100svh;
  background: radial-gradient(ellipse at 50% 0%, var(--el-color-primary-light-9), transparent 65%), var(--el-bg-color-page);
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family), "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;

  .authContent {
    display: flex;
    flex-direction: column;
    min-width: 0;

    .authHeader {
      display: flex;
      align-items: center;
      padding: 28px clamp(24px, 4.4vw, 64px);

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;

        .brandLogo { width: 30px; height: 30px; object-fit: contain; .dark & { filter: invert(1); } }
        .brandName { font-size: 20px; font-weight: 600; line-height: 1.4; letter-spacing: -0.5px; }
      }
    }

    .authMain {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      min-width: 0;
      padding: 12px clamp(16px, 4.4vw, 64px) 24px;

      .authPanel {
        width: 100%;
        max-width: 448px;
        padding: clamp(24px, 5vw, 40px);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: 20px;
        background: var(--el-bg-color);
        box-shadow: var(--el-box-shadow-light);
        min-width: 0;

        .panelHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;

          .modeButton { min-height: 44px; margin-left: 0; }

          h1 { margin: 0; font-size: 32px; font-weight: 650; line-height: 1.35; letter-spacing: -0.6px; overflow-wrap: anywhere; }
        }

        .authForm {
          width: 100%;

          :deep(.el-form-item) { margin-bottom: 24px; }
          :deep(.el-form-item__label) { height: auto; padding-bottom: 8px; color: var(--el-text-color-regular); font-weight: 500; line-height: 1.5; }
          :deep(.el-input__wrapper) { min-height: 46px; padding: 1px 14px; }
          :deep(.el-input__inner) { height: 44px; line-height: 44px; }
          :deep(.el-form-item__error) { position: static; padding-top: 6px; line-height: 1.5; overflow-wrap: anywhere; }

          .codeFields { display: flex; gap: 8px; width: 100%; }

          .formNotice { margin-bottom: 16px; }

          .requestError {
            align-items: flex-start;
            margin-bottom: 20px;

            :deep(.el-alert__title) { line-height: 1.5; overflow-wrap: anywhere; }
          }

          .submitButton { width: 100%; min-height: 46px; margin-left: 0; font-weight: 600; }
        }

        .accountSwitch {
          margin-top: 24px;
          text-align: center;

          .modeButton { min-height: 44px; margin-left: 0; padding: 10px 16px; white-space: normal; }
        }
      }
    }
  }

  @media (max-width: 600px) {
    .authContent {
      .authHeader { padding: 24px; }
      .authMain { padding: 8px 16px 20px; }
    }
  }
}
</style>
