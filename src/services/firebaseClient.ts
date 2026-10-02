import {
  browserLocalPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updatePassword as updateFirebasePassword,
  updateProfile,
  verifyPasswordResetCode,
  type Auth,
  type User,
} from "firebase/auth";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { authorizedFetch } from "./authClient";
import type { AuthClientAdapter, AuthStatus } from "./authClient";

export const LEARNHUB_AUTH_CHANGED_EVENT = "learnhub:auth-changed";
export const AUTH_SERVER_UNREACHABLE_MESSAGE = "로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요. 계속되면 서비스 관리자에게 알려 주세요.";

export interface FirebaseAuthHandle {
  auth: Auth;
  adapter: AuthClientAdapter;
  dispose: () => void;
}

const isFirebaseConfig = (value: unknown): value is FirebaseOptions => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  return typeof config.apiKey === "string" && config.apiKey.startsWith("AIza") &&
    typeof config.authDomain === "string" && config.authDomain.length > 0 &&
    typeof config.projectId === "string" && config.projectId.length > 0 &&
    typeof config.appId === "string" && config.appId.length > 0;
};

/** vite.config.ts가 빌드에 넣는 공개 Firebase 설정. 빌드 밖(테스트 등)에서는 정의되지 않습니다. */
declare const __LEARNHUB_FIREBASE_CONFIG__: unknown;

const buildTimeFirebaseConfig = (): FirebaseOptions | null => {
  const config = typeof __LEARNHUB_FIREBASE_CONFIG__ === "undefined" ? null : __LEARNHUB_FIREBASE_CONFIG__;
  return isFirebaseConfig(config) ? config : null;
};

const fetchFirebaseConfig = async (fetchImpl: typeof fetch): Promise<FirebaseOptions | null> => {
  // 빌드에 설정이 있으면 서버(콜드 스타트일 수 있음)를 기다리지 않고 바로 로그인을 복원합니다.
  const bundled = buildTimeFirebaseConfig();
  if (bundled) return bundled;
  let response: Response;
  try {
    response = await fetchImpl("/api/public-config", { headers: { Accept: "application/json" } });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const config = (body as Record<string, unknown>).firebaseConfig;
  return isFirebaseConfig(config) ? config : null;
};

const dispatchAuthChanged = (event: string, user: User | null): void => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(LEARNHUB_AUTH_CHANGED_EVENT, {
    detail: { event, userId: user?.uid || null },
  }));
};

const statusFor = (user: User | null): AuthStatus => ({
  configured: true,
  signedIn: Boolean(user),
  provider: user?.providerData.some(({ providerId }) => providerId === "google.com") ? "google" : user ? "email" : null,
  userId: user?.uid,
  email: user?.email || undefined,
  name: user?.displayName || undefined,
  reason: user ? undefined : "signed-out",
});

const isMobileBrowser = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isTouchMac || /Android|iPhone|iPad|iPod|Mobile|Tablet/iu.test(userAgent);
};

export const shouldUseGoogleRedirect = (hostname: string, mobile: boolean): boolean =>
  mobile && !["localhost", "127.0.0.1", "[::1]"].includes(hostname);

export const getEmailActionSettings = (origin: string) => ({ url: `${origin}/`, handleCodeInApp: true });

export const createFirebaseAuthAdapter = async (
  auth: Auth,
): Promise<{ adapter: AuthClientAdapter; dispose: () => void }> => {
  let currentUser: User | null = auth.currentUser;
  let pendingPasswordResetCode: string | null = null;
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    currentUser = user;
    dispatchAuthChanged(user ? "SIGNED_IN" : "SIGNED_OUT", user);
  });

  const url = typeof window === "undefined" ? null : new URL(window.location.href);
  if (url?.searchParams.get("mode") === "resetPassword") {
    const actionCode = url.searchParams.get("oobCode");
    if (actionCode) {
      pendingPasswordResetCode = actionCode;
      try {
        await verifyPasswordResetCode(auth, actionCode);
        dispatchAuthChanged("PASSWORD_RECOVERY", currentUser);
      } catch {
        pendingPasswordResetCode = null;
        dispatchAuthChanged("PASSWORD_RECOVERY_INVALID", currentUser);
      }
    }
  } else {
    try {
      await getRedirectResult(auth);
    } catch {
      dispatchAuthChanged("GOOGLE_REDIRECT_ERROR", currentUser);
    }
    if (url && isSignInWithEmailLink(auth, url.href)) {
      const email = window.localStorage.getItem("learnhub.email-link-address");
      if (email) {
        await signInWithEmailLink(auth, email, url.href);
        window.localStorage.removeItem("learnhub.email-link-address");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }

  const adapter: AuthClientAdapter = {
    getAccessToken: async () => auth.currentUser?.getIdToken() || null,
    getAuthStatus: () => statusFor(currentUser),
    requestMagicLink: async (email: string) => {
      await sendSignInLinkToEmail(auth, email, getEmailActionSettings(window.location.origin));
      window.localStorage.setItem("learnhub.email-link-address", email);
    },
    signInWithGoogle: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      if (shouldUseGoogleRedirect(window.location.hostname, isMobileBrowser())) {
        await signInWithRedirect(auth, provider);
        return;
      }
      await signInWithPopup(auth, provider);
    },
    signUpWithPassword: async (email: string, password: string, name?: string) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name?.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      await sendEmailVerification(credential.user, getEmailActionSettings(window.location.origin));
    },
    resendSignUpConfirmation: async (email: string) => {
      const user = auth.currentUser;
      if (!user || user.email?.toLowerCase() !== email.toLowerCase()) {
        throw new Error("확인 메일을 다시 보내려면 가입한 계정으로 먼저 로그인해 주세요.");
      }
      await sendEmailVerification(user, getEmailActionSettings(window.location.origin));
    },
    signInWithPassword: async (email: string, password: string) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    requestPasswordReset: async (email: string) => {
      await sendPasswordResetEmail(auth, email, getEmailActionSettings(window.location.origin));
    },
    updatePassword: async (password: string) => {
      if (pendingPasswordResetCode) {
        await confirmPasswordReset(auth, pendingPasswordResetCode, password);
        pendingPasswordResetCode = null;
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
        return;
      }
      if (!auth.currentUser) throw new Error("비밀번호를 변경하려면 먼저 로그인해 주세요.");
      await updateFirebasePassword(auth.currentUser, password);
    },
    deleteAccount: async () => {
      const response = await authorizedFetch("/api/account", { method: "DELETE" });
      if (!response.ok) throw new Error("계정과 학습 기록을 삭제하지 못했습니다.");
      await signOut(auth);
    },
    signOut: async () => { await signOut(auth); },
  };

  return { adapter, dispose: unsubscribe };
};

export const initializeFirebaseAuth = async (
  fetchImpl: typeof fetch = fetch,
): Promise<FirebaseAuthHandle | null> => {
  const config = await fetchFirebaseConfig(fetchImpl);
  if (!config) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  const { adapter, dispose } = await createFirebaseAuthAdapter(auth);
  return { auth, adapter, dispose };
};
