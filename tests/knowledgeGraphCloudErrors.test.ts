import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { spawnSync } from "node:child_process";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { withCloudStoreErrors, CloudStoreUnavailableError } from "../server/cloudErrors";

test("Firestore provider catches missing ADC on both read and write paths", async t => {
  const { getFirebaseLearningSnapshot, putFirebaseLearningSnapshot } = await import("../server/firebaseProvider");
  const db = getFirestore(getApps()[0] || initializeApp({ projectId: "demo-learnhub-graph-test" }));
  const original = db.collection;
  db.collection = (() => { throw new Error("Could not load the default credentials"); }) as typeof original;
  t.after(() => { db.collection = original; });
  const check = (e: unknown) => e instanceof CloudStoreUnavailableError && e.code === "cloud_store_unavailable";
  await assert.rejects(getFirebaseLearningSnapshot("test"), check);
  await assert.rejects(putFirebaseLearningSnapshot("test", {}, null), check);
});
test("cloud wrapper preserves revision conflict and sanitizes asynchronous ADC rejection", async () => {
  await assert.rejects(withCloudStoreErrors(() => Promise.reject(new Error("Could not load the default credentials"))), (e: unknown) => e instanceof CloudStoreUnavailableError && !e.message.includes("credentials"));
  const conflict = new Error("Learning snapshot conflict");
  await assert.rejects(withCloudStoreErrors(() => Promise.reject(conflict)), (e: unknown) => e === conflict);
});
test("snapshot GET/PUT return structured 503 on ADC failure while health and later requests survive", async t => {
  process.env.NODE_ENV = "test";
  const { app } = await import("../server");
  const { configureAuthVerifier, clearAuthVerifier } = await import("../server/auth");
  const { configureCloudStore, clearCloudStore } = await import("../server/cloudStore");
  configureAuthVerifier(async () => ({ id: "verified-test-user" }));
  const unavailable = async () => { throw new Error("Could not load the default credentials"); };
  configureCloudStore({ createContentReport: async () => ({ id: "r", status: "received" }), getLearningSnapshot: unavailable, putLearningSnapshot: unavailable });
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(async () => { clearAuthVerifier(); clearCloudStore(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Authorization: "Bearer fake-test", "Content-Type": "application/json" };
  const get = await fetch(`${base}/api/learning-snapshot`, { headers });
  assert.equal(get.status, 503); assert.equal((await get.json()).code, "cloud_store_unavailable");
  const put = await fetch(`${base}/api/learning-snapshot`, { method: "PUT", headers, body: JSON.stringify({ expectedRevision: null, snapshot: { schema: "learnhub.learning-backup", version: 1, exportedAt: "2026-10-01T00:00:00Z", data: {} } }) });
  assert.equal(put.status, 503); assert.equal((await put.json()).code, "cloud_store_unavailable");
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  configureCloudStore({ createContentReport: async () => ({ id: "r", status: "received" }), getLearningSnapshot: async () => null });
  assert.equal((await fetch(`${base}/api/learning-snapshot`, { headers })).status, 404);
});
test("unhandled ADC rejection logs once and leaves the actual child process alive", () => {
  const moduleUrl = new URL("../server/runtimeSafety.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `import { installUnhandledRejectionLogger } from ${JSON.stringify(moduleUrl)}; installUnhandledRejectionLogger(); installUnhandledRejectionLogger(); Promise.reject(new Error('Could not load the default credentials')); setTimeout(() => console.log('still-alive'), 30);`], { encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0); assert.match(result.stdout, /still-alive/u); assert.match(result.stderr, /cloud_store_unavailable/u);
  assert.equal(result.stderr.match(/unhandled_rejection/gu)?.length, 1); assert.doesNotMatch(result.stderr, /Could not load/u);
});
