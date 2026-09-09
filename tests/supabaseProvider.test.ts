import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createSupabaseContentReport,
  getSupabaseLearningSnapshot,
  getSupabasePublicConfig,
  putSupabaseLearningSnapshot,
  verifySupabaseAccessToken,
} from "../server/supabaseProvider";

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;

const withFakeConfig = (callback: () => Promise<void> | void) => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test-key";
  return Promise.resolve(callback()).finally(() => {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
  });
};

test("only a known public publishable key configures Supabase", async () => {
  await withFakeConfig(() => {
    assert.deepEqual(getSupabasePublicConfig(), { supabaseUrl: "https://example.supabase.co", publishableKey: "sb_publishable_test-key" });
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_secret_not-allowed";
    assert.equal(getSupabasePublicConfig(), null);
    process.env.SUPABASE_PUBLISHABLE_KEY = "service_role_not-allowed";
    assert.equal(getSupabasePublicConfig(), null);
  });
});

test("verified bearer is reused for auth and user-scoped PostgREST calls", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = (async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({ url: String(input), headers });
    const url = String(input);
    const body = url.includes("/auth/v1/user")
      ? { user: { id: "user-1" } }
      : url.includes("/content_reports")
        ? { id: "report-1" }
        : { snapshot: { schema: "learnhub.learning-backup", version: 1, data: {} }, revision: 1, updated_at: "2026-09-09T00:00:00.000Z" };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await withFakeConfig(async () => {
      assert.deepEqual(await verifySupabaseAccessToken("bearer-token"), { id: "user-1" });
      assert.deepEqual(await createSupabaseContentReport("user-1", { category: "other", description: "설명" }, "bearer-token"), { id: "report-1", status: "received" });
      const snapshot = await getSupabaseLearningSnapshot("user-1", "bearer-token");
      assert.equal(snapshot?.revision, 1);
      assert.ok(requests.length >= 3);
      assert.equal(requests.every((request) => request.headers.get("authorization") === "Bearer bearer-token"), true);
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("snapshot RPC uses the verified bearer and maps its returned revision", async () => {
  const previousFetch = globalThis.fetch;
  let rpcRequest: { url: string; headers: Headers; body: string } | null = null;
  globalThis.fetch = (async (input, init) => {
    rpcRequest = { url: String(input), headers: new Headers(init?.headers), body: String(init?.body || "") };
    return new Response(JSON.stringify([{ revision: 2, updated_at: "2026-09-09T01:00:00.000Z" }]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await withFakeConfig(async () => {
      const result = await putSupabaseLearningSnapshot("user-1", { schema: "learnhub.learning-backup", version: 1, data: {} }, 1, "bearer-token");
      assert.deepEqual(result, { snapshot: { schema: "learnhub.learning-backup", version: 1, data: {} }, revision: 2, updatedAt: "2026-09-09T01:00:00.000Z" });
      assert.ok(rpcRequest);
      assert.equal(rpcRequest.headers.get("authorization"), "Bearer bearer-token");
      assert.match(rpcRequest.url, /rpc\/put_learning_snapshot$/);
      assert.match(rpcRequest.body, /p_expected_revision/);
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("migration is transaction-wrapped and keeps the atomic revision branches", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260909_learnhub_initial.sql", import.meta.url), "utf8");
  assert.match(sql, /\bbegin;[\s\S]*commit;\s*$/);
  assert.match(sql, /octet_length\(snapshot::text\) <= 8000000/);
  assert.match(sql, /snapshot->'version' = '1'::jsonb/);
  assert.match(sql, /jsonb_typeof\(snapshot->'data'\) = 'object'/);
  assert.match(sql, /if p_expected_revision is null/);
  assert.match(sql, /on conflict \(owner_id\) do nothing/);
  assert.match(sql, /update public\.learning_snapshots as ls/);
  assert.match(sql, /where ls\.owner_id = auth\.uid\(\)[\s\S]*ls\.revision = p_expected_revision/);
  assert.match(sql, /revoke all on table public\.learning_snapshots from authenticated/);
  assert.match(sql, /revoke all on table public\.content_reports from authenticated/);
  assert.match(sql, /force row level security/);
});
