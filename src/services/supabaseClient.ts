import {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  createClient,
} from "@supabase/supabase-js";
import {
  AuthClientAdapter,
  AuthStatus,
} from "./authClient";

export const LEARNHUB_AUTH_CHANGED_EVENT = "learnhub:auth-changed";

export interface PublicSupabaseConfig {
  supabaseUrl: string;
  publishableKey: string;
}

export interface SupabaseAuthHandle {
  client: SupabaseClient;
  adapter: AuthClientAdapter;
  dispose: () => void;
  config: PublicSupabaseConfig;
}

/** `unreachable` means the auth server itself could not be contacted (DNS, paused project, offline). */
export type GoogleProviderState = boolean | "unreachable" | null;

export const AUTH_SERVER_UNREACHABLE_MESSAGE = "로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 잠시 후 다시 시도해 주세요. 계속되면 서비스 관리자에게 알려 주세요.";

interface SupabaseAuthAdapterOptions {
  getGoogleProviderEnabled?: () => Promise<GoogleProviderState>;
}

const isSafePublicConfig = (value: unknown): value is PublicSupabaseConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (typeof config.supabaseUrl !== "string" || typeof config.publishableKey !== "string") return false;
  try {
    const url = new URL(config.supabaseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return false;
  } catch {
    return false;
  }
  if (config.publishableKey.trim().length === 0 || config.publishableKey.length > 500) return false;
  if (/(?:service_role|secret|private|password)/iu.test(config.publishableKey)) return false;
  return true;
};

export const fetchPublicSupabaseConfig = async (
  fetchImpl: typeof fetch = fetch,
): Promise<PublicSupabaseConfig | null> => {
  const response = await fetchImpl("/api/public-config", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!isSafePublicConfig(body)) return null;
  // Deployed secrets have carried a trailing CRLF before; normalize before the SDK sees it.
  return { supabaseUrl: body.supabaseUrl.trim().replace(/\/+$/u, ""), publishableKey: body.publishableKey.trim() };
};

const dispatchAuthChanged = (event: AuthChangeEvent, session: Session | null): void => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new CustomEvent(LEARNHUB_AUTH_CHANGED_EVENT, {
    detail: { event, userId: session?.user?.id || null },
  }));
};

export const createSupabaseAuthAdapter = async (
  client: SupabaseClient,
  options: SupabaseAuthAdapterOptions = {},
): Promise<{ adapter: AuthClientAdapter; dispose: () => void }> => {
  let currentSession: Session | null = null;
  const initial = await client.auth.getSession();
  if (initial.error) throw initial.error;
  currentSession = initial.data.session;

  const subscription = client.auth.onAuthStateChange((event, session) => {
    currentSession = session;
    dispatchAuthChanged(event, session);
  });

  const adapter: AuthClientAdapter = {
    getAccessToken: async () => {
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      currentSession = result.data.session;
      return currentSession?.access_token || null;
    },
    getAuthStatus: (): AuthStatus => ({
      configured: true,
      signedIn: Boolean(currentSession?.user),
      provider: typeof currentSession?.user?.app_metadata?.provider === "string" ? currentSession.user.app_metadata.provider : "supabase",
      userId: currentSession?.user?.id,
      email: currentSession?.user?.email,
      name: typeof currentSession?.user?.user_metadata?.full_name === "string"
        ? currentSession.user.user_metadata.full_name
        : typeof currentSession?.user?.user_metadata?.name === "string"
          ? currentSession.user.user_metadata.name
          : undefined,
      reason: currentSession?.user ? undefined : "signed-out",
    }),
    requestMagicLink: async (email: string) => {
      const redirectTo = typeof window === "undefined" ? undefined : window.location.origin;
      const result = await client.auth.signInWithOtp({
        email,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });
      if (result.error) throw result.error;
    },
    signInWithGoogle: async () => {
      const providerEnabled = await options.getGoogleProviderEnabled?.();
      // Redirecting to an unreachable auth host strands the user on a browser error page.
      if (providerEnabled === "unreachable") throw new Error(AUTH_SERVER_UNREACHABLE_MESSAGE);
      if (providerEnabled === false) {
        throw new Error("Google 로그인이 아직 준비되지 않았습니다. 서비스 관리자가 Google Provider를 연결해야 합니다.");
      }
      const redirectTo = typeof window === "undefined" ? undefined : window.location.origin;
      const result = await client.auth.signInWithOAuth({
        provider: "google",
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (result.error) throw result.error;
    },
    signUpWithPassword: async (email: string, password: string, name?: string) => {
      const emailRedirectTo = typeof window === "undefined" ? undefined : window.location.origin;
      const result = await client.auth.signUp({
        email,
        password,
        options: {
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
          data: name?.trim() ? { full_name: name.trim() } : {},
        },
      });
      if (result.error) throw result.error;
    },
    resendSignUpConfirmation: async (email: string) => {
      const emailRedirectTo = typeof window === "undefined" ? undefined : window.location.origin;
      const result = await client.auth.resend({
        type: "signup",
        email,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });
      if (result.error) throw result.error;
    },
    signInWithPassword: async (email: string, password: string) => {
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
    },
    requestPasswordReset: async (email: string) => {
      const redirectTo = typeof window === "undefined" ? undefined : window.location.origin;
      const result = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
      if (result.error) throw result.error;
    },
    updatePassword: async (password: string) => {
      const result = await client.auth.updateUser({ password });
      if (result.error) throw result.error;
    },
    deleteAccount: async () => {
      const result = await client.rpc("delete_my_account");
      if (result.error) throw result.error;
      await client.auth.signOut({ scope: "local" });
    },
    signOut: async () => {
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
    },
  };

  dispatchAuthChanged("INITIAL_SESSION", currentSession);
  return {
    adapter,
    dispose: () => subscription.data.subscription.unsubscribe(),
  };
};

const getGoogleProviderEnabled = async (
  config: PublicSupabaseConfig,
  fetchImpl: typeof fetch,
): Promise<GoogleProviderState> => {
  let response: Response;
  try {
    response = await fetchImpl(`${config.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: config.publishableKey, Accept: "application/json" },
    });
  } catch {
    return "unreachable";
  }
  // Any non-2xx response means the configured auth endpoint cannot be trusted for OAuth.
  // Fail closed so a stale/deleted project never strands the learner on a browser error page.
  if (!response.ok) return "unreachable";
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const external = (body as Record<string, unknown>).external;
    if (!external || typeof external !== "object" || Array.isArray(external)) return null;
    const enabled = (external as Record<string, unknown>).google;
    return typeof enabled === "boolean" ? enabled : null;
  } catch {
    return null;
  }
};

/** Initialize only from public server configuration; missing config stays fail-closed. */
export const initializeSupabaseAuth = async (
  fetchImpl: typeof fetch = fetch,
): Promise<SupabaseAuthHandle | null> => {
  const config = await fetchPublicSupabaseConfig(fetchImpl);
  if (!config) return null;
  const client = createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  const { adapter, dispose } = await createSupabaseAuthAdapter(client, {
    getGoogleProviderEnabled: () => getGoogleProviderEnabled(config, fetchImpl),
  });
  return { client, adapter, dispose, config };
};
