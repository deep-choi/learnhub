export interface AuthStatus {
  configured: boolean;
  signedIn: boolean;
  provider: string | null;
  userId?: string;
  reason?: "provider-selection-required" | "signed-out" | "adapter-error";
}

export interface AuthClientAdapter {
  getAccessToken: () => Promise<string | null>;
  getAuthStatus?: () => AuthStatus;
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

/** Test/app lifecycle hook; it only removes the in-memory adapter reference. */
export const clearAuthAdapter = (): void => {
  adapter = null;
};
