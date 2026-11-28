import { computed, ref, shallowRef, watch } from "vue";
import { translate } from "@lumo/i18n/vue";
import type { BillingSnapshot } from "@lumo/multi-tenant-user-web/account";
import http from "@/lib/http";
import { desktopAccountUser, desktopAccountRequest } from "@/lib/lumoAccountService";
import { currentUser, publicWeb } from "./multiTenant";

const userId = computed(() => desktopAccountUser.value?.id ?? (publicWeb.value && currentUser.value?.role === "user" ? currentUser.value.id : undefined));
const balance = shallowRef<BillingSnapshot | null>(null);
const balanceError = ref("");
const balanceLoading = ref(false);
const redeeming = ref(false);
let balanceRequest: AbortController | undefined;
let redeemRequest: AbortController | undefined;

function clearExpiredBalance(error: unknown) {
  if (error instanceof Error && "status" in error && error.status === 401) {
    balance.value = null;
    balanceError.value = error.message;
  }
}

function cancelBalanceRequest() {
  balanceRequest?.abort();
  balanceRequest = undefined;
  balanceLoading.value = false;
}

watch(userId, () => {
  cancelBalanceRequest();
  redeemRequest?.abort();
  redeemRequest = undefined;
  redeeming.value = false;
  balance.value = null;
  balanceError.value = "";
}, { flush: "sync" });

async function refreshBalance() {
  if (!userId.value || balanceRequest || redeemRequest) return;
  const request = new AbortController();
  balanceRequest = request;
  balanceLoading.value = true;
  balanceError.value = "";
  try {
    const snapshot = await (desktopAccountUser.value ? desktopAccountRequest : http)<BillingSnapshot>({ method: "GET", url: "/api/multiTenant/user/balance", signal: request.signal });
    if (balanceRequest === request) balance.value = snapshot;
  } catch (error) {
    if (balanceRequest === request) {
      clearExpiredBalance(error);
      balanceError.value = error instanceof Error ? error.message : translate("读取余额失败，请重试");
    }
  } finally {
    if (balanceRequest === request) {
      balanceRequest = undefined;
      balanceLoading.value = false;
    }
  }
}

async function redeemCard(code: string) {
  if (!userId.value || redeemRequest) return false;
  const request = new AbortController();
  redeemRequest = request;
  redeeming.value = true;
  const interruptedRefresh = !!balanceRequest;
  cancelBalanceRequest();
  try {
    const snapshot = await (desktopAccountUser.value ? desktopAccountRequest : http)<BillingSnapshot>({ method: "POST", url: "/api/multiTenant/user/redeemCard", data: { code }, signal: request.signal });
    if (redeemRequest !== request) return false;
    balance.value = snapshot;
    balanceError.value = "";
    return true;
  } catch (error) {
    if (redeemRequest !== request) return false;
    clearExpiredBalance(error);
    throw error;
  } finally {
    if (redeemRequest === request) {
      redeemRequest = undefined;
      redeeming.value = false;
      if (interruptedRefresh && !balance.value) void refreshBalance();
    }
  }
}

export const userAccount = { balance, balanceError, balanceLoading, redeeming, refreshBalance, redeemCard };
