export type UserIdentity = { id: string; userName: string; role: "admin" | "user" };
export type UserSession = { user: UserIdentity | null; enabled: boolean; publicWeb: boolean; host: boolean; registrationEnabled: boolean; emailVerificationRequired?: boolean; passwordResetEnabled?: boolean };
export type UserRequest = <T>(config: {
  method: "GET" | "POST";
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}) => Promise<T>;
