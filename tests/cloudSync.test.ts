import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearAuthAdapter,
  configureAuthAdapter,
} from "../src/services/authClient";
import {
  LEARNHUB_CLOUD_DATA_OWNER_KEY,
  SnapshotConflictError,
  assertLearningSnapshotUploadOwner,
  getLearningSnapshot,
  restoreLearningSnapshot,
  saveCurrentLearningSnapshot,
} from "../src/services/cloudSync";
import { createLearningBackup } from "../src/services/learningBackup";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class OwnerWriteFailureStorage extends MemoryStorage {
  failOwnerWrites = false;
  setItem(key: string, value: string) {
    if (this.failOwnerWrites && key === LEARNHUB_CLOUD_DATA_OWNER_KEY) throw new Error("owner marker unavailable");
    super.setItem(key, value);
  }
}

class PartialImportRollbackFailureStorage extends MemoryStorage {
  failImport = false;
  private rollbackStarted = false;

  setItem(key: string, value: string) {
    if (this.failImport && key === "ai_learnhub_skills_v2") {
      this.rollbackStarted = true;
      throw new Error("simulated partial import failure");
    }
    if (this.rollbackStarted && key === "ai_learnhub_courses_v2") {
      throw new Error("simulated rollback failure");
    }
    super.setItem(key, value);
  }
}

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const installStorage = <T extends MemoryStorage>(storage: T): T => {
  globalThis.localStorage = storage as unknown as Storage;
  return storage;
};
const setAuthUser = (userId: string) => configureAuthAdapter({
  getAccessToken: async () => `token-${userId}`,
  getAuthStatus: () => ({ configured: true, signedIn: true, provider: "supabase", userId }),
});
const emptySnapshot = (storage: MemoryStorage) => createLearningBackup(storage);

beforeEach(() => {
  installStorage(new MemoryStorage());
  globalThis.window = { location: { origin: "http://localhost:3000" } } as unknown as Window & typeof globalThis;
  clearAuthAdapter();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  clearAuthAdapter();
});

test("snapshot GET accepts the first revision and treats 404 as empty", async () => {
  setAuthUser("user-1");
  const snapshot = emptySnapshot(globalThis.localStorage as unknown as MemoryStorage);
  globalThis.fetch = (async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token-user-1");
    return new Response(JSON.stringify({ snapshot, revision: 0, updatedAt: "2026-09-09T00:00:00.000Z" }), { status: 200 });
  }) as typeof fetch;
  const loaded = await getLearningSnapshot();
  assert.equal(loaded?.revision, 0);

  globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
  assert.equal(await getLearningSnapshot(), null);
});

test("snapshot conflict exposes the current revision without overwriting it", async () => {
  setAuthUser("user-1");
  const snapshot = emptySnapshot(globalThis.localStorage as unknown as MemoryStorage);
  globalThis.fetch = (async () => new Response(JSON.stringify({ snapshot, revision: 4, updatedAt: "2026-09-09T00:00:00.000Z" }), { status: 409 })) as typeof fetch;

  await assert.rejects(
    () => import("../src/services/cloudSync").then(({ putLearningSnapshot }) => putLearningSnapshot(snapshot, 3)),
    (error: unknown) => error instanceof SnapshotConflictError && error.current?.revision === 4,
  );
});

test("owner marker binds before upload and blocks another account", async () => {
  setAuthUser("user-1");
  let writes = 0;
  globalThis.fetch = (async () => {
    writes += 1;
    const snapshot = emptySnapshot(globalThis.localStorage as unknown as MemoryStorage);
    return new Response(JSON.stringify({ snapshot, revision: 1, updatedAt: "2026-09-09T00:00:00.000Z" }), { status: 200 });
  }) as typeof fetch;

  await saveCurrentLearningSnapshot("user-1", null, { confirmed: true, localOwnerId: "local-user-old", allowExplicitGuestMigration: true });
  assert.equal(localStorage.getItem(LEARNHUB_CLOUD_DATA_OWNER_KEY), "user-1");
  setAuthUser("user-2");
  await assert.rejects(
    () => saveCurrentLearningSnapshot("user-2", 1, { confirmed: true, localOwnerId: "local-user-old", allowExplicitGuestMigration: true }),
    /다른 계정에 연결/,
  );
  assert.equal(writes, 1);
});

test("owner marker persistence failure fails closed before any upload request", async () => {
  const storage = installStorage(new OwnerWriteFailureStorage());
  storage.failOwnerWrites = true;
  setAuthUser("user-1");
  let requests = 0;
  globalThis.fetch = (async () => { requests += 1; return new Response("unexpected", { status: 500 }); }) as typeof fetch;
  await assert.rejects(
    () => saveCurrentLearningSnapshot("user-1", null, { confirmed: true, localOwnerId: "guest-user", allowExplicitGuestMigration: true }),
    /소유자 표시를 저장하지 못해 업로드를 중단/,
  );
  assert.equal(requests, 0);
  assertLearningSnapshotUploadOwner("user-1", "local-user-existing", true);
  void storage;
});

test("restore blocks mixed data and fails closed when owner binding is unavailable", async () => {
  const storage = installStorage(new MemoryStorage());
  const snapshot = emptySnapshot(storage);
  storage.setItem(LEARNHUB_CLOUD_DATA_OWNER_KEY, "user-1");
  setAuthUser("user-2");
  await assert.rejects(
    async () => restoreLearningSnapshot("user-2", snapshot, "preserve", { confirmed: true, storage }),
    /다른 계정에 연결/,
  );

  const failingStorage = new OwnerWriteFailureStorage();
  failingStorage.failOwnerWrites = true;
  installStorage(failingStorage);
  setAuthUser("user-1");
  await assert.rejects(
    async () => restoreLearningSnapshot("user-1", snapshot, "overwrite", { confirmed: true, storage: globalThis.localStorage as unknown as Storage }),
    /소유자 표시를 저장하지 못해/,
  );
});

test("restore keeps the captured owner after a partial import rollback fails", () => {
  const storage = installStorage(new PartialImportRollbackFailureStorage());
  storage.setItem("ai_learnhub_courses_v2", "[]");
  storage.setItem("ai_learnhub_skills_v2", "[]");
  const snapshot = emptySnapshot(storage);
  storage.failImport = true;
  setAuthUser("user-1");

  const result = restoreLearningSnapshot("user-1", snapshot, "overwrite", { confirmed: true, storage });

  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, false);
  assert.equal(result.rollbackStatus, "failed");
  assert.equal(result.recoveryRequired, true);
  assert.ok(result.safetyBackup);
  assert.equal(storage.getItem(LEARNHUB_CLOUD_DATA_OWNER_KEY), "user-1");
  assert.match(result.error || "", /소유자 표시를 유지/);
});

test("a user switch during save rejects the late response", async () => {
  setAuthUser("user-1");
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = (async () => {
    await pending;
    return new Response(JSON.stringify({ snapshot: emptySnapshot(globalThis.localStorage as unknown as MemoryStorage), revision: 1, updatedAt: "2026-09-09T00:00:00.000Z" }), { status: 200 });
  }) as typeof fetch;
  const request = saveCurrentLearningSnapshot("user-1", null, { confirmed: true, localOwnerId: "guest-user", allowExplicitGuestMigration: true });
  setAuthUser("user-2");
  release?.();
  await assert.rejects(request, /계정이 바뀌어/);
});

test("a user switch while acquiring a token aborts before network", async () => {
  let releaseToken: ((token: string) => void) | undefined;
  const token = new Promise<string>((resolve) => { releaseToken = resolve; });
  configureAuthAdapter({
    getAccessToken: async () => token,
    getAuthStatus: () => ({ configured: true, signedIn: true, provider: "supabase", userId: "user-1" }),
  });
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response("unexpected", { status: 200 });
  }) as typeof fetch;

  const request = getLearningSnapshot("user-1");
  setAuthUser("user-2");
  releaseToken?.("token-user-1");

  await assert.rejects(request, /계정이 바뀌어 요청/);
  assert.equal(requests, 0);
});
