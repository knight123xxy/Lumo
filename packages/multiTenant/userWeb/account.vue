<template>
  <div class="account">
    <div class="identityRow">
      <span class="accountAvatar" aria-hidden="true">{{ Array.from(userName.trim())[0]?.toUpperCase() }}</span>
      <p class="userName">{{ userName }}</p>
    </div>
    <section v-if="role === 'user'" class="billingSection" aria-labelledby="accountBalanceTitle" :aria-busy="balanceLoading">
      <header class="sectionHeader">
        <h3 id="accountBalanceTitle">{{ translate("余额") }}</h3>
        <el-button :loading="balanceLoading" :disabled="busy || balanceLoading || redeeming" @click="refreshBalance">{{ translate("刷新") }}</el-button>
      </header>
      <el-alert v-if="balanceError" :title="balanceError" type="error" :closable="false" showIcon />
      <form class="redeemForm" @submit.prevent="submitCard">
        <label for="accountRechargeCode">{{ translate("输入充值卡密") }}</label>
        <div class="redeemFields">
          <el-input id="accountRechargeCode" v-model="cardCode" type="password" autocomplete="off" :maxlength="128" :disabled="busy || redeeming" />
          <el-button type="primary" nativeType="submit" :loading="redeeming" :disabled="busy || redeeming || !cardCode.trim()">{{ translate("兑换充值卡") }}</el-button>
        </div>
        <el-alert v-if="redeemError" :title="redeemError" type="error" :closable="false" showIcon />
      </form>
      <el-skeleton v-if="balanceLoading && !balance" :rows="4" animated />
      <template v-if="balance">
        <div class="walletList">
          <section v-if="cnyWallet" class="walletRow" :aria-label="translate('余额')">
            <dl>
              <div><dt>{{ translate("余额") }}</dt><dd>{{ moneyFormat.format(Number(cnyWallet.balance)) }}</dd></div>
              <div><dt>{{ translate("已预占") }}</dt><dd>{{ moneyFormat.format(Number(cnyWallet.reserved)) }}</dd></div>
              <div><dt>{{ translate("可用余额") }}</dt><dd>{{ moneyFormat.format(Number(cnyWallet.available)) }}</dd></div>
            </dl>
          </section>
        </div>
        <section class="transactions" aria-labelledby="accountTransactionsTitle">
          <h3 id="accountTransactionsTitle">{{ translate("最近账目") }}</h3>
          <p v-if="!balance.transactions.length" class="emptyText">{{ translate("暂无账目") }}</p>
          <div v-else class="tableScroll">
            <table>
              <thead><tr><th scope="col">{{ translate("时间") }}</th><th scope="col">{{ translate("类型") }}</th><th scope="col">{{ translate("金额") }}</th><th scope="col">{{ translate("状态") }}</th><th scope="col">{{ translate("说明") }}</th></tr></thead>
              <tbody>
                <tr v-for="transaction in balance.transactions" :key="transaction.id">
                  <td class="timeCell">{{ formatTime(transaction.createdAt) }}</td>
                  <td>{{ transaction.kind === 'credit' ? translate("增加余额") : translate("模型调用") }}</td>
                  <td class="amountCell">{{ formatAmount(transaction) }}</td>
                  <td>{{ transaction.status === 'reserved' ? translate("已预占") : transaction.status === 'released' ? translate("已释放") : translate("已结算") }}</td>
                  <td class="descriptionCell">{{ transaction.label || transaction.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </section>
    <div class="accountActions">
      <el-button class="logoutButton" :loading="busy" :disabled="busy || redeeming" @click="logout">{{ translate("退出登录") }}</el-button>
      <el-alert v-if="requestError" class="requestError" :title="requestError" type="error" :closable="false" showIcon />
    </div>
  </div>
</template>

<script lang="ts">
export type { BillingSnapshot } from "@lumo/multi-tenant-billing/config";
</script>

<script setup lang="ts">
import { locale, translate } from "@lumo/i18n/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElAlert, ElButton, ElInput, ElMessage, ElSkeleton } from "element-plus";
import type { BillingSnapshot, BillingTransaction } from "@lumo/multi-tenant-billing/config";
import type { UserRequest } from "./types";
import "element-plus/es/components/alert/style/css";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/skeleton/style/css";

const props = defineProps<{
  request: UserRequest;
  userName: string;
  role?: "admin" | "user";
  active: boolean;
  balance: BillingSnapshot | null;
  balanceLoading: boolean;
  balanceError: string;
  redeeming: boolean;
  refreshBalance: () => Promise<void>;
  redeemCard: (code: string) => Promise<boolean>;
}>();
const emit = defineEmits<{ loggedOut: [] }>();
const busy = ref(false);
const requestError = ref("");
const cardCode = ref("");
const redeemError = ref("");
const cnyWallet = computed(() => props.balance?.wallets.find(wallet => wallet.currency === "CNY"));
const moneyFormat = computed(() => new Intl.NumberFormat(locale.value, { style: "currency", currency: "CNY", maximumFractionDigits: 6 }));
const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}));
const controller = new AbortController();

function formatTime(value: number) {
  const date = new Date(value);
  return value > 0 && Number.isFinite(date.getTime()) ? timeFormat.value.format(date) : translate("未记录");
}

function formatAmount(transaction: BillingTransaction) {
  if (transaction.status === "reserved") return translate("待结算");
  const prefix = transaction.kind === "credit" ? "+"
    : transaction.status === "settled" && !/^0(?:\.0+)?$/.test(transaction.amount) ? "-" : "";
  return `${prefix}${transaction.amount} ${transaction.currency}`;
}

async function submitCard() {
  if (!props.active || props.role !== "user" || props.redeeming || busy.value) return;
  const code = cardCode.value.trim();
  if (!/^[a-f0-9]{32}$/i.test(code)) {
    redeemError.value = translate("请输入有效的充值卡密");
    return;
  }
  redeemError.value = "";
  try {
    if (await props.redeemCard(code)) {
      cardCode.value = "";
      ElMessage.success(translate("充值卡已兑换"));
    }
  } catch (cause) {
    if (props.active && cardCode.value.trim() === code) {
      redeemError.value = cause instanceof Error ? cause.message : translate("兑换失败，请重试");
    }
  }
}

watch(() => props.active, active => {
  if (active && props.role === "user") void props.refreshBalance();
  if (!active) {
    cardCode.value = "";
    redeemError.value = "";
  }
}, { immediate: true });

async function logout() {
  if (busy.value || props.redeeming) return;
  busy.value = true;
  requestError.value = "";
  try {
    await props.request({ method: "POST", url: "/api/multiTenant/user/logout", signal: controller.signal });
    emit("loggedOut");
  } catch (cause) {
    if (!controller.signal.aborted) requestError.value = cause instanceof Error ? cause.message : translate("退出登录失败，请重试");
  } finally { busy.value = false; }
}

onBeforeUnmount(() => controller.abort());
</script>

<style lang="scss" scoped>
.account {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  min-width: 0;

  .identityRow {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    padding: 4px 0;

    .accountAvatar {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: var(--el-border-radius-base);
      background: var(--el-color-primary-light-9);
      color: var(--el-color-primary);
      font-size: 18px;
      font-weight: 600;
      line-height: 1;
    }

    .userName { min-width: 0; margin: 0; color: var(--el-text-color-primary); font-size: 15px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
  }

  .accountActions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding-top: 24px;
    border-top: 1px solid var(--el-border-color-light);

    .logoutButton { min-height: 40px; margin-left: 0; }
    .requestError {
      align-items: flex-start;

      :deep(.el-alert__title) { line-height: 1.5; overflow-wrap: anywhere; }
    }
  }

  .billingSection {
    display: grid;
    gap: 20px;
    min-width: 0;
    padding-top: 24px;
    border-top: 1px solid var(--el-border-color-light);

    h3 { margin: 0; color: var(--el-text-color-primary); font-size: 15px; font-weight: 600; line-height: 1.6; }

    .sectionHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;

      .el-button { min-height: 40px; margin: 0; }
    }

    .redeemForm {
      display: grid;
      gap: 8px;

      .redeemFields {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;

        .el-input { flex: 1 1 180px; min-width: 0; }
        .el-button { margin: 0; }
      }
    }

    .walletList {
      .walletRow {
        padding: 16px 0;
        border-bottom: 1px solid var(--el-border-color-lighter);

        &:first-child { padding-top: 0; }
        h4 { margin: 0 0 12px; font-size: 14px; font-weight: 600; line-height: 1.6; }
        dl {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin: 0;

          dt { color: var(--el-text-color-regular); font-size: 13px; line-height: 1.6; }
          dd { margin: 6px 0 0; font-size: 14px; line-height: 1.6; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
        }
      }
    }

    .transactions {
      min-width: 0;

      .emptyText { margin: 12px 0 0; color: var(--el-text-color-regular); font-size: 14px; line-height: 1.7; }
      .tableScroll {
        max-width: 100%;
        margin-top: 12px;
        overflow-x: auto;

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          line-height: 1.6;

          th, td { padding: 12px; border-bottom: 1px solid var(--el-border-color-lighter); text-align: start; }
          th { color: var(--el-text-color-regular); font-weight: 500; white-space: nowrap; }
          td { color: var(--el-text-color-primary); }
          .timeCell, .amountCell { white-space: nowrap; font-variant-numeric: tabular-nums; }
          .descriptionCell { min-width: 120px; max-width: 240px; overflow-wrap: anywhere; }
        }
      }
    }

    @media (max-width: 480px) {
      .walletList .walletRow dl { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    }
  }
}
</style>
