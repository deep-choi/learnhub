import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearAuthAdapter, configureAuthAdapter, getAuthStatus } from "../src/services/authClient";
import {
  clearPendingSync,
  getLearningSnapshot,
  getPendingSyncOwnerId,
  markPendingSync,
  syncCurrentLearningSnapshot,
} from "../src/services/cloudSync";
import { captureLocalCacheForAccount, reconcileAccountSnapshot } from "../src/services/accountSync";
import { carryNewerLocalRecords, createLearningBackup, type LearningBackupDocument } from "../src/services/learningBackup";
import { LEARNHUB_DATA_CHANGED_EVENT, StorageService } from "../src/services/storage";
import { listNotes, saveNote } from "../src/services/noteStore";
import { getLessonProgress, saveLessonProgress } from "../src/services/lessonProgressStore";
import { createChatSession, listChatSessions } from "../src/services/chatSessionStore";
import type { LearningNote } from "../src/types/learningNotes";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

/** /api/learning-snapshot 하나를 흉내 내는 서버. 리비전이 다르면 409를 돌려준다. */
class FakeSnapshotServer {
  record: { snapshot: LearningBackupDocument; revision: number; updatedAt: string } | null = null;
  puts = 0;
  fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method || "GET") === "GET") {
      return this.record ? new Response(JSON.stringify(this.record), { status: 200 }) : new Response("", { status: 404 });
    }
    const body = JSON.parse(String(init?.body));
    const currentRevision = this.record?.revision ?? null;
    if (body.expectedRevision !== currentRevision) return new Response(JSON.stringify(this.record), { status: 409 });
    this.puts += 1;
    this.record = { snapshot: body.snapshot, revision: (currentRevision ?? 0) + 1, updatedAt: new Date().toISOString() };
    return new Response(JSON.stringify(this.record), { status: 200 });
  }) as typeof fetch;
}

const USER = "user-1";
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
let server: FakeSnapshotServer;
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const signIn = () => {
  configureAuthAdapter({
    getAccessToken: async () => `token-${USER}`,
    getAuthStatus: () => ({ configured: true, signedIn: true, provider: "email", userId: USER }),
  });
  StorageService.setUser({ id: USER, name: "학습자", isGuest: false, isLocalOnly: false, provider: "email", createdAt: new Date().toISOString() });
};

/** App의 LEARNHUB_DATA_CHANGED_EVENT 처리처럼, 바뀔 때마다 미동기화 표시만 남기고 업로드는 800ms 뒤로 미룬다. */
const startSession = () => {
  const onChange = () => markPendingSync(USER);
  window.addEventListener(LEARNHUB_DATA_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(LEARNHUB_DATA_CHANGED_EVENT, onChange);
};

/** 새로고침 뒤 App의 로그인 처리와 같은 순서로 서버 기록을 맞춘다. */
const reloadAndSignIn = async () => {
  const local = captureLocalCacheForAccount(USER);
  if (!local.snapshot) StorageService.clearLearningData();
  signIn();
  const remote = await getLearningSnapshot(USER);
  const result = await reconcileAccountSnapshot(USER, local, remote, () => getAuthStatus().userId === USER);
  assert.ok(result, "로그인 처리가 끝까지 진행돼야 합니다.");
  return result;
};

/** 대화 하나를 서버에 올려 둔 상태(예전 세션)에서 시작한다. */
const seedSyncedAccount = async () => {
  signIn();
  assert.ok(createChatSession("분수 덧셈이 뭐예요?"));
  await syncCurrentLearningSnapshot(USER, null);
  clearPendingSync(USER);
  await tick();
};

const writeNoteAndAdvanceLesson = () => {
  const note = saveNote({ body: "통분은 분모를 같게 만드는 것", conceptId: "통분", courseId: "course-1", lessonId: "lesson-1" });
  assert.ok(note.ok);
  assert.ok(saveLessonProgress({ courseId: "course-1", lessonId: "lesson-1", stepIndex: 2, phase: "steps" }));
};

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  const target = new EventTarget();
  globalThis.window = Object.assign(target, { location: { origin: "http://localhost:3000" } }) as unknown as Window & typeof globalThis;
  server = new FakeSnapshotServer();
  globalThis.fetch = server.fetch;
  clearAuthAdapter();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  clearAuthAdapter();
});

test("새로고침 전에 올리지 못한 메모·레슨 진행은 미동기화 표시가 남아 있으면 로그인 복원 뒤에도 남는다", async () => {
  await seedSyncedAccount();
  const stop = startSession();
  writeNoteAndAdvanceLesson();
  stop(); // 800ms 디바운스가 돌기 전에 새로고침

  await reloadAndSignIn();

  assert.equal(listNotes()[0]?.body, "통분은 분모를 같게 만드는 것");
  assert.equal(getLessonProgress("course-1", "lesson-1")?.stepIndex, 2);
  assert.equal(listChatSessions().length, 1);
  assert.equal(server.record?.snapshot.data.learningNotes?.length, 1);
  assert.equal(getPendingSyncOwnerId(), null);
});

test("미동기화 표시가 지워졌어도(다른 탭의 동기화 완료 등) 서버보다 새 메모·레슨 진행은 로그인 복원에서 지워지지 않는다", async () => {
  await seedSyncedAccount();
  const stop = startSession();
  writeNoteAndAdvanceLesson();
  // 다른 탭이 자기 변경을 올린 뒤 같은 계정의 표시를 지운다. 이 탭의 메모·진행은 아직 서버에 없다.
  clearPendingSync(USER);
  stop(); // 디바운스 전에 새로고침

  await reloadAndSignIn();

  // 대화는 서버에 있던 것이라 원래도 살아남는다.
  assert.equal(listChatSessions().length, 1);
  assert.equal(listNotes()[0]?.body, "통분은 분모를 같게 만드는 것", "서버 기록으로 덮어쓰면서 메모가 사라졌습니다.");
  assert.equal(getLessonProgress("course-1", "lesson-1")?.stepIndex, 2, "서버 기록으로 덮어쓰면서 레슨 진행이 사라졌습니다.");
  // 살려 낸 기록은 곧바로 서버에도 올라가야 다음 기기·새로고침에서도 남는다.
  assert.equal(server.record?.snapshot.data.learningNotes?.[0]?.body, "통분은 분모를 같게 만드는 것");
  assert.equal(server.record?.snapshot.data.lessonProgress?.[0]?.stepIndex, 2);
  assert.equal(getPendingSyncOwnerId(), null);
});

test("이미 올라간 기록은 서버 기록을 따르므로 다른 기기에서 지운 메모가 되살아나지 않는다", async () => {
  signIn();
  assert.ok(saveNote({ body: "다른 기기에서 지울 메모", conceptId: "통분" }).ok);
  assert.ok(saveLessonProgress({ courseId: "course-1", lessonId: "lesson-1", stepIndex: 1, phase: "steps" }));
  await syncCurrentLearningSnapshot(USER, null);
  await tick();
  // 다른 기기: 메모를 지우고 같은 레슨을 더 진행해 올린다.
  const remote = structuredClone(server.record!);
  remote.snapshot.data.learningNotes = [];
  remote.snapshot.data.lessonProgress = [{ courseId: "course-1", lessonId: "lesson-1", stepIndex: 3, phase: "steps", updatedAt: new Date().toISOString() }];
  remote.snapshot.exportedAt = new Date().toISOString();
  server.record = { ...remote, revision: remote.revision + 1 };
  const putsBefore = server.puts;

  await reloadAndSignIn();

  assert.equal(listNotes().length, 0);
  assert.equal(getLessonProgress("course-1", "lesson-1")?.stepIndex, 3);
  assert.equal(server.puts, putsBefore, "올릴 새 기록이 없으면 다시 업로드하지 않습니다.");
});

test("carryNewerLocalRecords는 updatedAt이 더 늦은 기기 기록만 서버 기록에 얹는다", () => {
  const note = (id: string, updatedAt: string, body = id): LearningNote => ({ id, title: body, body, links: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt });
  const remote: LearningBackupDocument = {
    ...createLearningBackup(new MemoryStorage() as unknown as Storage),
    exportedAt: "2026-09-10T00:00:00.000Z",
    data: {
      learningNotes: [note("same", "2026-09-05T00:00:00.000Z", "서버 본문"), note("remote-only", "2026-09-05T00:00:00.000Z")],
      lessonProgress: [{ courseId: "c", lessonId: "l", stepIndex: 1, phase: "steps", updatedAt: "2026-09-09T00:00:00.000Z" }],
    },
  };
  const local: LearningBackupDocument = {
    ...remote,
    exportedAt: "2026-09-11T00:00:00.000Z",
    data: {
      learningNotes: [
        note("same", "2026-09-10T12:00:00.000Z", "기기에서 고친 본문"),
        note("new-local", "2026-09-10T12:00:00.000Z"),
        note("deleted-elsewhere", "2026-09-04T00:00:00.000Z"),
      ],
      lessonProgress: [{ courseId: "c", lessonId: "l", stepIndex: 0, phase: "steps", updatedAt: "2026-09-08T00:00:00.000Z" }],
    },
  };

  const { snapshot, carried } = carryNewerLocalRecords(remote, local);

  assert.equal(carried, 2);
  const byId = new Map(snapshot.data.learningNotes?.map((item) => [item.id, item]));
  assert.equal(byId.get("same")?.body, "기기에서 고친 본문");
  assert.ok(byId.has("new-local"));
  assert.ok(byId.has("remote-only"));
  assert.ok(!byId.has("deleted-elsewhere"));
  assert.equal(snapshot.data.lessonProgress?.[0]?.stepIndex, 1);
  assert.equal(carryNewerLocalRecords(remote, remote).carried, 0);
});
