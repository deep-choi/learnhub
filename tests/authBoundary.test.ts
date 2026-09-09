import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearAuthAdapter,
  configureAuthAdapter,
  getAccessToken,
  getAuthStatus,
} from "../src/services/authClient";
import {
  clearAuthVerifier,
  configureAuthVerifier,
  isAuthConfigured,
  verifyAccessToken,
} from "../server/auth";
import {
  clearCloudStore,
  configureCloudStore,
  createContentReport,
} from "../server/cloudStore";

beforeEach(() => {
  clearAuthAdapter();
  clearAuthVerifier();
  clearCloudStore();
});

test("client auth fails closed without an injected provider adapter", async () => {
  assert.equal(await getAccessToken(), null);
  assert.deepEqual(getAuthStatus(), {
    configured: false,
    signedIn: false,
    provider: null,
    reason: "provider-selection-required",
  });
});

test("client auth returns only a real adapter token and never invents one", async () => {
  configureAuthAdapter({
    getAccessToken: async () => "provider-token",
    getAuthStatus: () => ({ configured: true, signedIn: true, provider: "test", userId: "user-1" }),
  });
  assert.equal(await getAccessToken(), "provider-token");
  assert.equal(getAuthStatus().userId, "user-1");

  configureAuthAdapter({ getAccessToken: async () => "   " });
  assert.equal(await getAccessToken(), null);
});

test("server auth is fail closed and accepts only injected verified identities", async () => {
  assert.equal(isAuthConfigured(), false);
  assert.equal(await verifyAccessToken("looks-like-a-jwt"), null);

  configureAuthVerifier(async (token) => token === "valid" ? { id: "user-1" } : null);
  assert.equal(isAuthConfigured(), true);
  assert.deepEqual(await verifyAccessToken("valid"), { id: "user-1" });
  assert.equal(await verifyAccessToken("invalid"), null);
});

test("cloud store does not fabricate receipts before configured persistence succeeds", async () => {
  await assert.rejects(() => createContentReport("user-1", { kind: "content" }), /configuration required/);

  let writes = 0;
  configureCloudStore(async (userId, payload) => {
    writes += 1;
    assert.equal(userId, "user-1");
    assert.deepEqual(payload, { kind: "content" });
    return { id: "report-1", status: "received" };
  });
  assert.deepEqual(await createContentReport("user-1", { kind: "content" }), { id: "report-1", status: "received" });
  assert.equal(writes, 1);

  configureCloudStore(async () => ({ id: "", status: "received" }));
  await assert.rejects(() => createContentReport("user-1", {}), /successful write/);
});
