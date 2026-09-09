import assert from "node:assert/strict";
import test from "node:test";
import { clearAuthAdapter } from "../src/services/authClient";
import { getContentReportDrafts, submitContentReport } from "../src/services/contentReports";

const context = { category: "unclear" as const, description: "설명이 모호합니다.", courseId: "course-1", lessonId: "lesson-1", stepId: "step-1" };

const installStorage = (setItem: (key: string, value: string) => void = () => undefined) => {
  let stored: string | null = null;
  (globalThis as any).localStorage = {
    getItem: () => stored,
    setItem: (key: string, value: string) => {
      setItem(key, value);
      stored = value;
    },
  };
};

test("no auth stores a local draft without making a network request", async () => {
  clearAuthAdapter();
  installStorage();
  const result = await submitContentReport(context);
  assert.deepEqual(result, { status: "draft", savedLocally: true });
  assert.equal(getContentReportDrafts(context).length, 1);
});

test("local storage quota failure is distinct from a saved draft", async () => {
  clearAuthAdapter();
  installStorage(() => { throw new Error("quota"); });
  const result = await submitContentReport(context);
  assert.deepEqual(result, { status: "save_failed", savedLocally: false });
});

test("a malformed successful response does not produce a receipt", async () => {
  installStorage();
  const result = await submitContentReport(context, {
    getAccessToken: async () => "test-token",
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: "received" }) } as Response),
  });
  assert.equal(result.status, "draft");
  assert.equal(result.savedLocally, true);
  assert.equal(result.id, undefined);
});

test("a verified receipt requires both received status and an id", async () => {
  installStorage();
  let requestBody = "";
  const result = await submitContentReport(context, {
    getAccessToken: async () => "test-token",
    fetchImpl: async (_input, init) => {
      requestBody = String(init?.body || "");
      return { ok: true, json: async () => ({ id: "report-1", status: "received" }) } as Response;
    },
  });
  assert.deepEqual(result, { status: "received", id: "report-1", savedLocally: false });
  assert.equal(JSON.parse(requestBody).description, context.description);
  assert.equal(JSON.parse(requestBody).stepId, context.stepId);
  assert.equal(JSON.parse(requestBody).answer, undefined);
});
