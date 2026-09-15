import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearAuthAdapter,
  configureAuthAdapter,
  authorizedFetch,
} from "../src/services/authClient";
import { fetchPublicSupabaseConfig } from "../src/services/supabaseClient";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

beforeEach(() => {
  globalThis.window = { location: { origin: "http://localhost:3000" } } as unknown as Window & typeof globalThis;
  clearAuthAdapter();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  clearAuthAdapter();
});

test("public config accepts only the browser-safe Supabase fields", async () => {
  const config = await fetchPublicSupabaseConfig(async () => new Response(JSON.stringify({
    supabaseUrl: "https://learnhub.supabase.co",
    publishableKey: "sb_publishable_test",
  }), { status: 200 }));
  assert.deepEqual(config, { supabaseUrl: "https://learnhub.supabase.co", publishableKey: "sb_publishable_test" });

  const unsafe = await fetchPublicSupabaseConfig(async () => new Response(JSON.stringify({
    supabaseUrl: "https://learnhub.supabase.co",
    publishableKey: "service_role_secret",
  }), { status: 200 }));
  assert.equal(unsafe, null);
});

test("authorizedFetch attaches a fresh bearer only to same-origin API routes", async () => {
  configureAuthAdapter({
    getAccessToken: async () => "fresh-token",
    getAuthStatus: () => ({ configured: true, signedIn: true, provider: "supabase", userId: "user-1" }),
  });
  const requests: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = (async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({ url: input.toString(), authorization: headers.get("Authorization") });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  await authorizedFetch("/api/learning-snapshot");
  await authorizedFetch("/not-api");
  await authorizedFetch("https://external.example/api/learning-snapshot");

  assert.deepEqual(requests, [
    { url: "/api/learning-snapshot", authorization: "Bearer fresh-token" },
    { url: "/not-api", authorization: null },
    { url: "https://external.example/api/learning-snapshot", authorization: null },
  ]);
});

test("authorizedFetch keeps local API usable without configured auth", async () => {
  const requests: Array<string | null> = [];
  globalThis.fetch = (async (_input, init) => {
    requests.push(new Headers(init?.headers).get("Authorization"));
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  await authorizedFetch("/api/learning-snapshot");
  assert.deepEqual(requests, [null]);
});

test("authorizedFetch sends the validated AI preference only to AI mutation routes", async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: input.toString(), headers: new Headers(init?.headers) });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  await authorizedFetch("/api/ai/tutor-chat", { method: "POST" });
  await authorizedFetch("/api/learning-snapshot", { method: "PUT" });

  assert.equal(requests[0].headers.get("x-learnhub-ai-provider"), "gemini");
  assert.equal(requests[0].headers.get("x-learnhub-ai-model"), "gemini-3.8-flash");
  assert.equal(requests[0].headers.get("x-learnhub-ai-reasoning"), "medium");
  assert.equal(requests[0].headers.get("x-learnhub-ai-max-output-tokens"), "8192");
  assert.equal(requests[1].headers.get("x-learnhub-ai-provider"), null);
});
