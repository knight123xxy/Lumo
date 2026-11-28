import { createApp, h, nextTick, ref, watch } from "vue";
import { ElButton, ElConfigProvider, ElResult } from "element-plus";
import { elementLocales } from "@lumo/i18n/elementPlus";
import { locale, translate } from "@lumo/i18n/vue";
import logoUrl from "@lumo/assets/logo.svg";
import userWeb from "@lumo/multi-tenant-user-web";
import { actualPlatform } from "@/lib/platform";
import { desktopAccountRequest, desktopAccountUser, readDesktopAccount } from "@/lib/lumoAccountService";

export async function requireDesktopAccount(showDesktop: () => Promise<void>) {
  if (!actualPlatform.isLocalDesktop || !import.meta.env.VITE_LUMO_ACCOUNT_SERVICE_URL?.trim()) return;
  const creationRoot = document.querySelector<HTMLElement>("#app")!;
  const loginRoot = document.createElement("div");
  document.body.append(loginRoot);
  const checking = ref(true);
  const error = ref("");
  const registrationEnabled = ref(false);
  const emailVerificationRequired = ref(false);
  const passwordResetEnabled = ref(false);
  let checkingAccount: Promise<void> | undefined;
  function refresh() {
    checkingAccount ??= readDesktopAccount().then(session => {
      registrationEnabled.value = session.registrationEnabled;
      emailVerificationRequired.value = session.emailVerificationRequired === true;
      passwordResetEnabled.value = session.passwordResetEnabled === true;
      error.value = "";
    }).catch(cause => {
      error.value = cause instanceof Error ? cause.message : translate("连接失败");
    }).finally(() => {
      checking.value = false;
      checkingAccount = undefined;
    });
    return checkingAccount;
  }
  const loginApp = createApp({
    render: () => desktopAccountUser.value ? null : h("div", {
      style: { position: "fixed", inset: 0, overflow: "auto", background: "var(--el-bg-color)", zIndex: 4000 },
    }, [h(ElConfigProvider, { locale: elementLocales[locale.value] }, () => {
      if (checking.value || error.value) return h(ElResult, { title: "Lumo", subTitle: error.value || translate("正在加载…") }, {
        icon: () => null,
        extra: () => error.value ? h(ElButton, { type: "primary", onClick: refresh }, () => translate("重试")) : null,
      });
      return h(userWeb, { request: desktopAccountRequest, logoUrl, registrationEnabled: registrationEnabled.value, emailVerificationRequired: emailVerificationRequired.value, passwordResetEnabled: passwordResetEnabled.value, onAuthenticated: refresh });
    })]),
  });
  loginApp.mount(loginRoot);
  try {
    await nextTick();
    await showDesktop();
    await (window as Window & { lumoDesktopAccountReady?: Promise<unknown> }).lumoDesktopAccountReady;
    void refresh();
    await new Promise<void>(resolve => {
      watch(desktopAccountUser, account => {
        creationRoot.inert = !account;
        creationRoot.style.visibility = account ? "" : "hidden";
        if (account) resolve();
      }, { immediate: true, flush: "sync" });
    });
    window.addEventListener("focus", refresh);
    setInterval(() => { if (!document.hidden && desktopAccountUser.value) void refresh(); }, 60000);
  } catch (cause) {
    loginApp.unmount();
    loginRoot.remove();
    throw cause;
  }
}
