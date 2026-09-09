export interface VerifiedUser {
  id: string;
}

export type AccessTokenVerifier = (token: string) => Promise<VerifiedUser | null>;

export interface AuthVerifierAdapter {
  verifyAccessToken: AccessTokenVerifier;
}

let verifier: AccessTokenVerifier | null = null;

/** Configure a real verifier at the server composition boundary. */
export const configureAuthVerifier = (adapter: AuthVerifierAdapter | AccessTokenVerifier | null): void => {
  verifier = typeof adapter === "function" ? adapter : adapter?.verifyAccessToken || null;
};

export const isAuthConfigured = (): boolean => verifier !== null;

/**
 * Fail closed until a provider-specific verifier is injected. This function
 * intentionally does not decode JWTs or compare a static secret.
 */
export const verifyAccessToken = async (token: string): Promise<VerifiedUser | null> => {
  if (!verifier || typeof token !== "string" || token.trim().length === 0) return null;
  try {
    const verified = await verifier(token);
    return verified && typeof verified.id === "string" && verified.id.trim().length > 0
      ? { id: verified.id }
      : null;
  } catch {
    return null;
  }
};

export const clearAuthVerifier = (): void => {
  verifier = null;
};
