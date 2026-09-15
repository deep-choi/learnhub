import { applyAiPreferenceHeaders } from "./aiPreferences";

export interface AuthStatus {
  configured: boolean;
  signedIn: boolean;
  provider: string | null;
  userId?: string;
  email?: string;
  name?: string;
  reason?: "provider-selection-required" | "signed-out" | "adapter-error";
}

export interface AuthClientAdapter {
  getAccessToken: () => Promise<string | null>;
  getAuthStatus?: () => AuthStatus;
  requestMagicLink?: (email: string) => Promise<void>;
  signInWithGoogle?: () => Promise<void>;
  signUpWithPassword?: (email: string, password: string, name?: string) => Promise<void>;
  resendSignUpConfirmation?: (email: string) => Promise<void>;
  signInWithPassword?: (email: string, password: string) => Promise<void>;
  requestPasswordReset?: (email: string) => Promise<void>;
  updatePassword?: (password: string) => Promise<void>;
  deleteAccount?: () => Promise<void>;
  signOut?: () => Promise<void>;
}

let adapter: AuthClientAdapter | null = null;

/**
 * Install a real provider adapter at the application boundary once a provider
 * is selected. This module never discovers a provider or persists a token.
 */
export const configureAuthAdapter = (nextAdapter: AuthClientAdapter | null): void => {
  adapter = nextAdapter;
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!adapter) return null;
  try {
    const token = await adapter.getAccessToken();
    return typeof token === "string" && token.trim().length > 0 ? token : null;
  } catch {
    return null;
  }
};

export const getAuthStatus = (): AuthStatus => {
  if (!adapter) {
    return {
      configured: false,
      signedIn: false,
      provider: null,
      reason: "provider-selection-required",
    };
  }
  try {
    const status = adapter.getAuthStatus?.();
    return status && typeof status === "object"
      ? status
      : { configured: true, signedIn: false, provider: null, reason: "signed-out" };
  } catch {
    return { configured: true, signedIn: false, provider: null, reason: "adapter-error" };
  }
};

export const requestMagicLink = async (email: string): Promise<void> => {
  if (!adapter?.requestMagicLink) throw new Error("인증 공급자가 아직 연결되지 않았습니다.");
  await adapter.requestMagicLink(email);
};

export const signInWithGoogle = async (): Promise<void> => {
  if (!adapter?.signInWithGoogle) throw new Error("Google 로그인이 아직 연결되지 않았습니다.");
  await adapter.signInWithGoogle();
};

export const signUpWithPassword = async (email: string, password: string, name?: string): Promise<void> => {
  if (!adapter?.signUpWithPassword) throw new Error("이메일 회원가입이 아직 연결되지 않았습니다.");
  await adapter.signUpWithPassword(email, password, name);
};

export const resendSignUpConfirmation = async (email: string): Promise<void> => {
  if (!adapter?.resendSignUpConfirmation) throw new Error("가입 확인 메일 재전송 기능이 아직 연결되지 않았습니다.");
  await adapter.resendSignUpConfirmation(email);
};

export const signInWithPassword = async (email: string, password: string): Promise<void> => {
  if (!adapter?.signInWithPassword) throw new Error("이메일 로그인이 아직 연결되지 않았습니다.");
  await adapter.signInWithPassword(email, password);
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  if (!adapter?.requestPasswordReset) throw new Error("비밀번호 재설정 기능이 아직 연결되지 않았습니다.");
  await adapter.requestPasswordReset(email);
};

export const updatePassword = async (password: string): Promise<void> => {
  if (!adapter?.updatePassword) throw new Error("비밀번호 변경 기능이 아직 연결되지 않았습니다.");
  await adapter.updatePassword(password);
};

export const deleteAccount = async (): Promise<void> => {
  if (!adapter?.deleteAccount) throw new Error("회원 탈퇴 기능이 아직 연결되지 않았습니다.");
  await adapter.deleteAccount();
};

export const signOut = async (): Promise<void> => {
  if (!adapter?.signOut) throw new Error("인증 공급자가 아직 연결되지 않았습니다.");
  await adapter.signOut();
};

const isSameOriginApiRequest = (input: RequestInfo | URL): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const requestUrl = new URL(
      typeof Request !== "undefined" && input instanceof Request ? input.url : input.toString(),
      window.location.origin,
    );
    return requestUrl.origin === window.location.origin &&
      (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/"));
  } catch {
    return false;
  }
};

const isAiMutationRequest = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const requestUrl = new URL(
      typeof Request !== "undefined" && input instanceof Request ? input.url : input.toString(),
      window.location.origin,
    );
    const method = (init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    return requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith("/api/ai/") && method !== "GET";
  } catch {
    return false;
  }
};

const fetchWithOptionalExpectedUser = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  expectedUserId?: string,
): Promise<Response> => {
  if (!isSameOriginApiRequest(input)) return fetch(input, init);
  const token = await getAccessToken();
  if (expectedUserId && getAuthStatus().userId !== expectedUserId) {
    throw new Error("계정이 바뀌어 요청을 중단했습니다.");
  }
  const inputHeaders = typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined;
  const headers = new Headers(inputHeaders || init?.headers);
  if (isAiMutationRequest(input, init)) applyAiPreferenceHeaders(headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
};

/** Fetch local API routes with a fresh provider token, never external URLs. */
export const authorizedFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => fetchWithOptionalExpectedUser(input, init);

/** Like authorizedFetch, but closes the token-to-user race before network I/O. */
export const authorizedFetchForUser = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  expectedUserId: string,
): Promise<Response> => fetchWithOptionalExpectedUser(input, init, expectedUserId);

/** Test/app lifecycle hook; it only removes the in-memory adapter reference. */
export const clearAuthAdapter = (): void => {
  adapter = null;
};
