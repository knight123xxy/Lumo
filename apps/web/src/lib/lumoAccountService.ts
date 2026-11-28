import { shallowRef } from "vue";
import type { UserIdentity, UserRequest, UserSession } from "@lumo/multi-tenant-user-web/types";
import http from "@/lib/http";

export const desktopAccountUser = shallowRef<UserIdentity | null>(null);

export const desktopAccountRequest: UserRequest = async <T>(config: Parameters<UserRequest>[0]) => {
  const action = /^\/api\/multiTenant\/user\/(session|login|register|logout|balance|redeemCard|sendRegistrationCode|sendPasswordResetCode|resetPassword)$/.exec(config.url)?.[1];
  if (!action) throw new Error("账号接口无效");
  try {
    return await http<T>({ ...config, url: `/api/desktop/account/${action}` });
  } catch (error) {
    if ((action === "balance" || action === "redeemCard") && error instanceof Error && "status" in error && error.status === 401) {
      desktopAccountUser.value = null;
    }
    throw error;
  }
};

export async function readDesktopAccount() {
  const session = await desktopAccountRequest<UserSession>({ method: "GET", url: "/api/multiTenant/user/session" });
  if (!session.publicWeb || !session.enabled) throw new Error("Lumo 账号服务暂不可用");
  desktopAccountUser.value = session.user?.role === "user" ? session.user : null;
  return session;
}
