<template>
  <div class="homeAccount" :class="{ collapsed }">
    <el-dropdown class="accountDropdown" :trigger="['hover', 'click']" :hideTimeout="180" placement="top-start" popperClass="homeAccountMenu" @command="handleCommand" @visibleChange="(opened: boolean) => { if (opened) refreshBalance(); }">
      <button class="accountTrigger" type="button" :aria-label="loggedIn ? '账号与余额' : '更多'" aria-haspopup="menu">
        <icon-user-circle :size="20" aria-hidden="true" />
        <span v-if="loggedIn" class="accountInfo">
          <span class="accountName">{{ shortAccountName }}</span>
          <span v-if="showBalance" class="accountBalance">{{ compactBalance || '—' }}</span>
        </span>
        <span v-else class="moreLabel">{{ translate('更多') }}</span>
      </button>
      <template #dropdown>
        <div v-if="loggedIn" class="accountSummary">
          <div class="summaryName">{{ accountName }}</div>
          <div v-if="showBalance" class="summaryBalance">{{ translate('可用余额') }} {{ balanceError || compactBalance || '—' }}</div>
          <div v-if="!publicWeb && mobileConnection.mode === 'remote' && mobileConnection.online === true" class="summaryDevice">
            {{ mobileConnectionLabel }}<template v-if="mobileConnection.name"> · {{ mobileConnection.name }}</template>
          </div>
        </div>
        <el-dropdown-menu>
          <el-dropdown-item v-if="desktopAccount || (publicWeb && currentUser?.role === 'user')" class="accountMenuItem" :icon="IconUserCircle" command="account">{{ translate('账号与积分') }}</el-dropdown-item>
          <el-dropdown-item v-else-if="loggedIn || !publicWeb" class="accountMenuItem" :icon="IconUserCircle" command="account">{{ translate('账号') }}</el-dropdown-item>
          <el-dropdown-item v-if="desktopAccount || (publicWeb && currentUser?.role === 'user')" class="accountMenuItem" :icon="IconCreditCard" command="redeem" :disabled="redeeming || loggingOut">{{ translate('兑换充值卡') }}</el-dropdown-item>
          <el-dropdown-item class="accountMenuItem" :icon="IconSettings" command="settings">{{ translate('设置') }}</el-dropdown-item>
          <el-dropdown-item v-if="loggedIn" divided class="accountMenuItem" :icon="IconLogout" command="logout" :disabled="loggingOut || redeeming">{{ translate('退出登录') }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <button v-if="hasDesktopUpdate" class="updateButton" type="button" :title="translate('有新版本可用')" :aria-label="translate('有新版本可用')" @click="emit('openUpdate')">
      <icon-download :size="16" aria-hidden="true" />
      <span class="updateDot" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconCreditCard, IconDownload, IconLogout, IconSettings, IconUserCircle } from "@tabler/icons-vue";
import { locale, translate } from "@lumo/i18n/vue";
import type { Login, PreviewData } from "@lumo/server/channel";
import http from "@/lib/http";
import { desktopAccountUser, desktopAccountRequest } from "@/lib/lumoAccountService";
import { multiTenantEnabled, saveSettings, settings, lumoAccountToken } from "@/stores/settings";
import { currentUser, publicWeb } from "@/stores/multiTenant";
import { userAccount } from "@/stores/userAccount";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";
import { mobileConnection, mobileConnectionLabel } from "@/lib/mobile";

defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ openSettings: []; openAccount: []; openUpdate: [] }>();
const desktopAccount = desktopAccountUser;
const loggedIn = computed(() => publicWeb.value ? !!currentUser.value : !!(desktopAccount.value || lumoAccountToken.value));
const accountName = computed(() => (publicWeb.value ? currentUser.value?.userName : desktopAccount.value?.userName ?? (settings.value.lumoAccount as Partial<Login> | null)?.info?.userName) || translate("未登录"));
const shortAccountName = computed(() => {
  const name = accountName.value;
  const prefix = name.includes("@") ? name.split("@")[0] || name : name;
  const characters = Array.from(prefix);
  return characters.length > 10 ? `${characters.slice(0, 10).join("")}…` : prefix;
});
const showBalance = computed(() => loggedIn.value && (publicWeb.value ? currentUser.value?.role === "user" : !!desktopAccount.value || !multiTenantEnabled.value));
const { redeeming, redeemCard } = userAccount;
const desktopBalanceText = ref("");
const desktopBalanceError = ref("");
const compactBalance = computed(() => {
  if (!publicWeb.value && !desktopAccount.value) return desktopBalanceText.value;
  const wallet = userAccount.balance.value?.wallets.find(item => item.currency === "CNY");
  return wallet ? moneyFormat.value.format(Number(wallet.available)) : "";
});
const balanceError = computed(() => publicWeb.value || desktopAccount.value ? userAccount.balanceError.value : desktopBalanceError.value);
const loggingOut = ref(false);
const moneyFormat = computed(() => new Intl.NumberFormat(locale.value, { style: "currency", currency: "CNY", minimumFractionDigits: 0, maximumFractionDigits: 2 }));
let controller: AbortController | undefined;

async function refreshBalance() {
  controller?.abort();
  if (!showBalance.value || document.hidden) return;
  if (publicWeb.value || desktopAccount.value) return userAccount.refreshBalance();
  if (!lumoAccountToken.value) return;
  const request = new AbortController();
  controller = request;
  desktopBalanceError.value = "";
  try {
    const token = lumoAccountToken.value;
    const result = await http<PreviewData>({ method: "GET", url: "/api/channel/account/getPreviewData", signal: request.signal, headers: { Authorization: `Bearer ${token}` } });
    if (!request.signal.aborted && lumoAccountToken.value === token) desktopBalanceText.value = moneyFormat.value.format(result.totalPoints);
  } catch (error) {
    if (!request.signal.aborted) desktopBalanceError.value = error instanceof Error ? error.message : translate("加载余额失败，请刷新重试");
  }
}

async function handleCommand(command: string) {
  if (command === "settings") emit("openSettings");
  if (command === "account") emit("openAccount");
  if (command === "redeem") {
    const accountId = (desktopAccount.value ?? currentUser.value)?.id;
    if (!(desktopAccount.value || (publicWeb.value && currentUser.value?.role === "user")) || redeeming.value || loggingOut.value) return;
    await ElMessageBox.prompt(translate("输入充值卡密"), translate("兑换充值卡"), {
      inputType: "password", inputPattern: /^\s*[a-f0-9]{32}\s*$/i,
      inputErrorMessage: translate("请输入有效的充值卡密"),
      confirmButtonText: translate("兑换"), cancelButtonText: translate("取消"),
      beforeClose: async (action, instance, done) => {
        if (instance.confirmButtonLoading) return;
        if (action !== "confirm" || (desktopAccount.value ?? currentUser.value)?.id !== accountId || !showBalance.value) { done(); return; }
        instance.confirmButtonLoading = true;
        try {
          if (await redeemCard(instance.inputValue.trim())) {
            ElMessage.success(translate("充值卡已兑换"));
            done();
          }
        } catch (error) {
          ElMessage.error(error instanceof Error ? error.message : translate("兑换失败，请重试"));
        } finally { instance.confirmButtonLoading = false; }
      },
    }).catch(() => null);
    return;
  }
  if (command !== "logout" || loggingOut.value || redeeming.value) return;
  loggingOut.value = true;
  try {
    if (desktopAccount.value) {
      await desktopAccountRequest({ method: "POST", url: "/api/multiTenant/user/logout" });
      window.location.reload();
    } else if (publicWeb.value) {
      await http({ method: "POST", url: "/api/multiTenant/user/logout" });
      window.location.reload();
    } else {
      const token = lumoAccountToken.value;
      const saved = await saveSettings(() => lumoAccountToken.value === token ? { lumoAccount: null } : undefined);
      if (saved) ElMessage.success("已退出登录");
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : translate("退出登录失败"));
  } finally {
    loggingOut.value = false;
  }
}

watch([publicWeb, currentUser, desktopAccount, lumoAccountToken, multiTenantEnabled, locale], () => {
  controller?.abort();
  desktopBalanceText.value = "";
  desktopBalanceError.value = "";
  void refreshBalance();
}, { immediate: true, flush: "sync" });
window.addEventListener("focus", refreshBalance);
document.addEventListener("visibilitychange", refreshBalance);
onBeforeUnmount(() => {
  controller?.abort();
  window.removeEventListener("focus", refreshBalance);
  document.removeEventListener("visibilitychange", refreshBalance);
});
</script>

<style lang="scss" scoped>
.homeAccount {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;

  .accountDropdown { flex: 1; min-width: 0; }

  .accountTrigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: 8px;
    border: 0;
    border-radius: var(--ui-radius);
    background: transparent;
    color: var(--el-text-color-primary);
    font: inherit;
    font-size: 13px;
    text-align: start;
    cursor: pointer;

    > svg { flex-shrink: 0; }
    .accountInfo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 1;
      min-width: 0;
      gap: 8px;

      .accountName, .accountBalance { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .accountName { min-width: 0; font-weight: 500; }
      .accountBalance { flex-shrink: 0; max-width: 55%; color: var(--el-text-color-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
    }
    .moreLabel { color: var(--el-text-color-regular); font-size: 14px; }
    &:hover { background: var(--el-fill-color-light); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
  }

  .updateButton {
    position: relative;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--ui-radius);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    cursor: pointer;

    &:hover { background: var(--el-color-primary-light-8); }
    &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
    .updateDot { position: absolute; inset-block-start: 5px; inset-inline-end: 5px; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  }

  &.collapsed {
    flex-direction: column;
    .accountDropdown { width: 100%; }
    .accountTrigger {
      justify-content: center;
      min-height: 42px;
      padding: 0;
      .accountInfo, .moreLabel { display: none; }
    }
  }
}
</style>

<style lang="scss">
.homeAccountMenu {
  min-width: 216px;
  max-width: calc(100vw - 24px);

  .accountSummary {
    max-width: min(320px, calc(100vw - 24px));
    padding: 12px 16px 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    overflow-wrap: anywhere;
    .summaryName { font-weight: 600; color: var(--el-text-color-primary); }
    .summaryBalance, .summaryDevice { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); }
  }

  .el-dropdown-menu { padding: 6px; }

  .accountMenuItem {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 8px 12px;
    border-radius: var(--ui-radius);
    font-size: 14px;

    > .el-icon { margin-right: 0; }
  }
}
</style>
