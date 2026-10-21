import { authorizedFetchForUser, getAuthStatus } from "./authClient";

export class AdminRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export const adminRequest = async <T>(path: string, body?: unknown, method = body === undefined ? "GET" : "PUT"): Promise<T> => {
  const uid = getAuthStatus().userId;
  if (!uid) throw new AdminRequestError(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
  const response = await authorizedFetchForUser(`/api/admin/${path}`, {
    method, cache: "no-store", headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, uid);
  if (getAuthStatus().userId !== uid) throw new AdminRequestError(401, "ACCOUNT_CHANGED", "계정이 바뀌었습니다. 다시 확인해 주세요.");
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new AdminRequestError(response.status, data?.code || "ADMIN_UNAVAILABLE", data?.error || "운영 요청을 처리하지 못했습니다.");
  return data as T;
};
