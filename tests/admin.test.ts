import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { createAdminRouter } from "../server/admin";
import { adminStore, settingsFromData } from "../server/adminStore";
import { defaultOperationsSettings, enforceOperationsPolicy, OperationsError, reserveGlobalAiUsage, validateOperationsSettings, validDocumentId } from "../server/operationsPolicy";
import { AiGateway, type AiGatewayLoggerEvent } from "../server/aiGateway";
import { DEFAULT_AI_SELECTION } from "../src/domain/aiModels";

test("legacy quota settings retain operator limits; malformed values and unknown models fail closed", () => {
  const settings = settingsFromData({ requestLimit: 37, outputTokenLimit: 12000, updatedAt: "legacy" });
  assert.equal(settings.requestLimit, 37);
  assert.equal(settings.outputTokenLimit, 12000);
  assert.equal(settings.revision, 0);
  for (const override of [{ requestLimit: 0 }, { requestLimit: 1.2 }, { outputTokenLimit: Infinity }, { disabledModels: ["made-up-model"] }, { revision: -1 }, { aiPaused: "true" }, { extra: true }]) {
    assert.throws(() => validateOperationsSettings({ ...defaultOperationsSettings(), ...override }), OperationsError);
  }
  assert.equal(validDocumentId("../other"), false);
  assert.equal(validDocumentId("owner"), true);
});

test("admin HTTP boundary denies missing, invalid and ordinary-user tokens before any data read; validates mutations and surfaces conflicts", async () => {
  let reads = 0;
  let current = defaultOperationsSettings();
  let reportWrites = 0;
  const store = { ...adminStore,
    getSettings: async () => { reads++; return current; },
    saveSettings: async (_actor: string, value: unknown) => {
      const next = validateOperationsSettings(value);
      if (next.revision !== current.revision) throw new OperationsError(409, "SETTINGS_CONFLICT", "설정 충돌");
      current = { ...next, revision: next.revision + 1 }; return current;
    },
    updateReport: async () => { reportWrites++; },
  };
  const app = express(); app.use(express.json());
  app.use("/api/admin", createAdminRouter(store, async token => {
    if (token === "invalid") throw new OperationsError(401, "AUTH_INVALID", "인증 오류");
    return token === "admin" ? { id: "owner" } : null;
  }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin`;
  const request = (url: string, token?: string, method = "GET", body?: unknown) => fetch(`${base}${url}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    assert.equal((await request("/settings")).status, 401);
    assert.equal((await request("/settings", "invalid")).status, 401);
    assert.equal((await request("/settings", "learner")).status, 403);
    assert.equal((await request("/settings", "learner", "PUT", current)).status, 403);
    assert.equal(reads, 0);
    const settings = await request("/settings", "admin");
    assert.equal(settings.headers.get("cache-control"), "no-store");
    assert.equal((await settings.json()).settings.requestLimit, current.requestLimit);
    const saved = await request("/settings", "admin", "PUT", { ...current, aiPaused: true });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).settings.revision, 1);
    assert.equal((await request("/settings", "admin", "PUT", { ...current, revision: 0 })).status, 409);
    assert.equal((await request("/settings", "admin", "PUT", { ...current, requestLimit: 0 })).status, 400);
    assert.equal((await request("/reports/u/r", "admin", "PATCH", { status: "resolved", note: "ok", revision: 0, admin: true })).status, 400);
    assert.equal(reportWrites, 0);
    assert.equal((await request("/reports/u/r", "admin", "PATCH", { status: "resolved", note: "ok", revision: 0 })).status, 200);
    assert.equal(reportWrites, 1);
    assert.equal((await request("/billing", "admin")).status, 200);
    assert.equal((await request("/billing/refund", "admin", "POST", {})).status, 404);
  } finally { server.close(); server.closeAllConnections(); }
});

test("shared daily reservation honors changed limits, preserves usage, and rejects malformed counters", () => {
  const settings = { ...defaultOperationsSettings(), limitsEnabled: true, globalRequestLimit: 2, globalOutputTokenLimit: 100 };
  const first = reserveGlobalAiUsage(settings, {}, 40);
  const second = reserveGlobalAiUsage(settings, first, 60);
  assert.deepEqual(second, { admittedRequests: 2, reservedOutputTokens: 100 });
  assert.throws(() => reserveGlobalAiUsage(settings, second, 1), OperationsError);
  assert.throws(() => reserveGlobalAiUsage({ ...settings, globalRequestLimit: 1 }, first, 1), OperationsError);
  assert.deepEqual(reserveGlobalAiUsage({ ...settings, globalRequestLimit: 3, globalOutputTokenLimit: 200 }, second, 50), { admittedRequests: 3, reservedOutputTokens: 150 });
  assert.deepEqual(reserveGlobalAiUsage({ ...settings, limitsEnabled: false }, second, 50), { admittedRequests: 3, reservedOutputTokens: 150 });
  for (const current of [{ admittedRequests: -1 }, { admittedRequests: "3" }, { reservedOutputTokens: NaN }]) assert.throws(() => reserveGlobalAiUsage(settings, current, 1), OperationsError);
});

test("gateway obeys live pause, model and user blocks before provider I/O and awaits metadata persistence", async () => {
  let settings = defaultOperationsSettings(); let blocked = false; let calls = 0; let persisted = 0;
  const events: AiGatewayLoggerEvent[] = [];
  const gateway = new AiGateway({ client: { models: { async generateContent() { calls++; return { text: '{"ok":true}', usageMetadata: { totalTokenCount: 20 } } as never; } } },
    beforeGenerate: async (_request, selection) => enforceOperationsPolicy(settings, selection.model, blocked),
    logger: async event => { await Promise.resolve(); events.push(event); persisted++; },
  });
  const request = { endpoint: "tutor", requestId: "r", clientKey: "user:u", prompt: "PRIVATE_LEARNING_INPUT", config: {}, maxOutputTokens: 1000, selection: DEFAULT_AI_SELECTION, validate: () => [] };
  for (const configure of [() => { settings.aiPaused = true; }, () => { settings.aiPaused = false; settings.disabledModels = [DEFAULT_AI_SELECTION.model]; }, () => { settings.disabledModels = []; blocked = true; }]) {
    configure(); await assert.rejects(() => gateway.generateJson(request), OperationsError);
  }
  assert.equal(calls, 0);
  blocked = false; await gateway.generateJson(request);
  assert.equal(calls, 1); assert.equal(persisted, 4);
  assert.equal(JSON.stringify(events).includes("PRIVATE_LEARNING_INPUT"), false);
  assert.equal(events.at(-1)?.status, "success");
});
