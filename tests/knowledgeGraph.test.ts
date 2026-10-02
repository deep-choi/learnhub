import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Course } from "../src/types/learning";
import type { KnowledgeGraph } from "../src/types/knowledgeGraph";
import { emptyKnowledgeGraph, findMatchingConcept, getLocalGraph, isKnowledgeGraph, mergeCourseGraph, mergeKnowledgeGraphs, normalizeConceptKey, recommendNextSteps } from "../src/domain/knowledgeGraph";
import { addCuriosity, disputeEdge, getKnowledgeGraph, getResumeContext, markKnown, markPracticalDone, mergeCourseIntoGraph, setDepthReached, setLastPosition } from "../src/services/knowledgeGraphStore";
import { LEARNHUB_STORAGE_KEYS as keys, StorageService } from "../src/services/storage";
import { createLearningBackup, importLearningBackup, validateLearningBackup } from "../src/services/learningBackup";
import { clearAuthAdapter, configureAuthAdapter } from "../src/services/authClient";
import { CloudSnapshotRequestError, getLearningSnapshot, putLearningSnapshot, restoreLearningSnapshot, syncCurrentLearningSnapshot } from "../src/services/cloudSync";

class MemoryStorage {
  values = new Map<string, string>();
  failKey?: string;
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (key === this.failKey) throw new Error("full"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  clear() { this.values.clear(); }
}
const now = "2026-10-01T00:00:00.000Z";
function course(id = "course-a", concepts = ["통분", "분수 덧셈", "분수 곱셈"]): Course {
  return { id, title: "분수 배우기", subject: "수학", learningType: "concept", learningTypeExplanation: "쉽게 배웁니다.", summary: "분수를 이해합니다.", level: "beginner", goal: "이해", dailyMinutes: 10, createdAt: now, updatedAt: now,
    chapters: [{ id: `${id}-chapter`, title: "분수", description: "개념", lessons: concepts.map((name, i) => ({ id: `${id}-lesson-${i}`, courseId: id, chapterId: `${id}-chapter`, title: name, description: name, estimatedMinutes: 10, conceptId: `${id}-concept-${i}`, conceptName: name, isCompleted: false })) }] };
}
let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); globalThis.localStorage = storage as unknown as Storage; });

test("normalization merges Unicode and spacing without merging C/C++/C#", () => {
  assert.equal(normalizeConceptKey("  Ｌｉｎｅａｒ Algebra "), "linearalgebra");
  assert.equal(normalizeConceptKey("분수-덧셈"), normalizeConceptKey("분수 덧셈"));
  assert.notEqual(normalizeConceptKey("C++"), normalizeConceptKey("C"));
  assert.notEqual(normalizeConceptKey("C#"), normalizeConceptKey("C++"));
});
test("course merge reuses aliases across courses and preserves evidence and disputes", () => {
  const first = mergeCourseGraph(emptyKnowledgeGraph(), course(), { domain: "수학", lessons: [{ conceptName: "통분", aliases: ["공통 분모 만들기"] }, { conceptName: "분수 덧셈", prerequisites: ["통분"], relatedConcepts: ["분수 곱셈"] }] });
  first.nodes[0].state = "verified"; first.edges[0].disputed = true;
  const merged = mergeCourseGraph(first, course("course-b", ["공통 분모 만들기"]));
  assert.equal(merged.nodes.length, 3);
  assert.equal(merged.nodes[0].state, "verified");
  assert.equal(merged.nodes[0].courseRefs.filter(r => r.lessonId).length, 2);
  assert.equal(merged.edges[0].disputed, true);
  assert.equal(first.nodes[0].courseRefs.filter(r => r.lessonId).length, 1);
  assert.ok(isKnowledgeGraph(merged));
});
test("ambiguous legacy aliases do not merge or select different concepts", () => {
  const graph = mergeCourseGraph(emptyKnowledgeGraph(), course("a", ["변수", "함수"]));
  graph.nodes.forEach(n => n.aliases.push("concept_0_0"));
  assert.equal(findMatchingConcept(graph, "concept_0_0"), undefined);
  assert.equal(findMatchingConcept(graph, "함수")?.name, "함수");
});
test("local graph respects hop count, disputed links and cycles without mutating source", () => {
  const graph = mergeCourseGraph(emptyKnowledgeGraph(), course(), { lessons: [{ conceptName: "분수 덧셈", prerequisites: ["통분"], relatedConcepts: ["분수 곱셈"] }] });
  assert.equal(getLocalGraph(graph, "통분", 0).nodes.length, 1);
  assert.equal(getLocalGraph(graph, "통분", 1).nodes.length, 2);
  assert.equal(getLocalGraph(graph, "통분", 2).nodes.length, 3);
  graph.edges[0].disputed = true;
  assert.equal(getLocalGraph(graph, "통분", 6).nodes.length, 1);
  assert.equal(getLocalGraph(graph, "없음").nodes.length, 0);
});
test("recommendations prioritize wrap-up, review, next lesson and ready neighbors", () => {
  const c = course();
  const graph = mergeCourseGraph(emptyKnowledgeGraph(), c, { lessons: [{ conceptName: "분수 덧셈", prerequisites: ["통분"] }, { conceptName: "분수 곱셈", prerequisites: ["통분"], relatedConcepts: ["분수 덧셈"] }] });
  graph.nodes[0].state = "learned"; graph.nodes[0].depthReached = "easy";
  graph.lastPosition = { courseId: c.id, lessonId: c.chapters[0].lessons[0].id, conceptId: graph.nodes[0].id, at: now };
  c.chapters[0].lessons[0].isCompleted = true;
  const ctx = { currentConceptId: "통분", courses: [c], dueReviewConceptIds: [graph.nodes[0].id], sessionMinutes: 30 };
  assert.deepEqual(recommendNextSteps(graph, ctx).map(s => s.kind), ["wrap_up", "review", "next_lesson"]);
  const connected = recommendNextSteps(graph, { ...ctx, sessionMinutes: 0, dueReviewConceptIds: [] }, 20);
  assert.equal(connected[0].kind, "next_lesson");
  assert.ok(connected.some(s => s.kind === "connected" && s.score === 700));
  assert.ok(connected.some(s => s.kind === "deepen"));
  assert.equal(recommendNextSteps(graph, ctx, 0).length, 0);
});
test("curiosity precedes depth and disputed connections are not recommended", () => {
  StorageService.addCourse(course());
  addCuriosity("통분", "최소공배수", "왜 필요한가요?");
  setDepthReached("통분", "easy"); markKnown("통분", true);
  const graph = getKnowledgeGraph(); disputeEdge(graph.edges[0].id, true);
  const steps = recommendNextSteps(getKnowledgeGraph(), { currentConceptId: "통분", courses: [], dueReviewConceptIds: [] }, 10);
  assert.equal(steps[0].kind, "curiosity");
});
test("next lesson follows the current concept when saved position belongs to another lesson", () => {
  const c = course();
  const graph = mergeCourseGraph(emptyKnowledgeGraph(), c);
  graph.lastPosition = { courseId: c.id, lessonId: c.chapters[0].lessons[2].id, conceptId: graph.nodes[2].id, at: now };
  const steps = recommendNextSteps(graph, { currentConceptId: graph.nodes[0].id, courses: [c], dueReviewConceptIds: [] });
  assert.equal(steps[0].kind, "next_lesson");
  assert.equal(steps[0].lessonId, c.chapters[0].lessons[1].id);
  assert.equal(recommendNextSteps(graph, { courses: [c], dueReviewConceptIds: [] }).some(s => s.kind === "next_lesson"), false);
});
test("legacy courses, skills and reviews migrate once with distinct reading/quiz evidence", () => {
  const c = course(); c.chapters[0].lessons[0].isCompleted = true;
  StorageService.saveCourses([c]);
  StorageService.saveSkills([{ conceptId: c.chapters[0].lessons[1].conceptId, conceptName: "분수 덧셈", courseId: c.id, courseTitle: c.title, understanding: 40, correctCount: 0, wrongCount: 1, reviewCount: 0, lastStudiedAt: now }]);
  StorageService.saveReviews([{ id: "r", conceptId: "standalone", conceptName: "독립 개념", courseTitle: "수학", question: "?", quizType: "short_answer", answer: "1", explanation: "설명", dueAt: now }]);
  const graph = getKnowledgeGraph();
  assert.equal(findMatchingConcept(graph, "통분")?.state, "learned");
  assert.equal(findMatchingConcept(graph, "분수 덧셈")?.state, "needs_review");
  assert.ok(findMatchingConcept(graph, "독립 개념"));
  const raw = storage.getItem(keys.KNOWLEDGE_GRAPH);
  getKnowledgeGraph(); assert.equal(storage.getItem(keys.KNOWLEDGE_GRAPH), raw);
});
test("storage events update graph automatically; repeat answers and reading do not invent verification", () => {
  const c = course(); StorageService.addCourse(c);
  assert.ok(StorageService.markLessonCompleted(c.id, c.chapters[0].lessons[0].id));
  assert.equal(findMatchingConcept(getKnowledgeGraph(), "통분")?.state, "learned");
  assert.ok(StorageService.recordQuizAnswer(c.id, c.title, "legacy", "통분", false, "attempt-1"));
  assert.equal(findMatchingConcept(getKnowledgeGraph(), "통분")?.state, "needs_review");
  assert.equal(StorageService.recordQuizAnswer(c.id, c.title, "legacy", "통분", true, "attempt-1"), false);
  assert.ok(StorageService.recordQuizAnswer(c.id, c.title, "new", "새 개념", true));
  assert.equal(findMatchingConcept(getKnowledgeGraph(), "새 개념")?.state, "verified");
});
test("depth, practical reflection, known toggles and resume persist across reloads", () => {
  const c = course(); StorageService.addCourse(c);
  markKnown("통분", true); markKnown("통분", false);
  assert.equal(findMatchingConcept(getKnowledgeGraph(), "통분")?.state, "unseen");
  setDepthReached("통분", "example"); setDepthReached("통분", "easy");
  markPracticalDone("통분", " 직접 해봤어요. ");
  setLastPosition({ courseId: c.id, lessonId: c.chapters[0].lessons[0].id, conceptId: "통분", at: now });
  const node = findMatchingConcept(getKnowledgeGraph(), "통분")!;
  assert.equal(node.depthReached, "example"); assert.equal(node.reflection, "직접 해봤어요."); assert.equal(node.state, "verified");
  assert.equal(getResumeContext(new Date("2026-10-03T00:00:00Z"))?.daysAway, 2);
  assert.throws(() => setLastPosition({ courseId: "wrong", lessonId: "wrong", conceptId: "통분", at: now }));
});
test("graph write failures and malformed graphs are explicit and preserve stored recovery data", () => {
  StorageService.addCourse(course()); const before = storage.getItem(keys.KNOWLEDGE_GRAPH);
  storage.failKey = keys.KNOWLEDGE_GRAPH;
  assert.throws(() => markKnown("통분", true), /저장하지 못했습니다/u);
  assert.equal(storage.getItem(keys.KNOWLEDGE_GRAPH), before);
  storage.failKey = undefined; storage.setItem(keys.KNOWLEDGE_GRAPH, "broken");
  assert.throws(getKnowledgeGraph, /백업/u); assert.equal(storage.getItem(keys.KNOWLEDGE_GRAPH), "broken");
});
test("graph persistence failure rolls back quiz attempts and lesson completion so retry stays possible", () => {
  const c = course(); StorageService.addCourse(c);
  storage.failKey = keys.KNOWLEDGE_GRAPH;
  assert.equal(StorageService.recordQuizAnswer(c.id, c.title, "legacy", "통분", true, "retry"), false);
  assert.equal(StorageService.getSkills().length, 0);
  assert.equal(StorageService.markLessonCompleted(c.id, c.chapters[0].lessons[0].id), false);
  assert.equal(StorageService.getCourseById(c.id)?.chapters[0].lessons[0].isCompleted, false);
  assert.equal(StorageService.getProgress().completedLessonsCount, 0);
  storage.failKey = undefined;
  assert.equal(StorageService.recordQuizAnswer(c.id, c.title, "legacy", "통분", true, "retry"), true);
});
test("newer edge edits can undo disputes during cross-device graph merges", () => {
  const graph = mergeCourseGraph(emptyKnowledgeGraph(), course(), { lessons: [{ conceptName: "분수 덧셈", prerequisites: ["통분"] }] });
  graph.edges[0].disputed = true; graph.edges[0].updatedAt = now;
  const remote = structuredClone(graph); remote.edges[0].disputed = false; remote.edges[0].updatedAt = "2026-10-02T00:00:00Z";
  assert.equal(mergeKnowledgeGraphs(graph, remote).edges[0].disputed, false);
});
test("backup roundtrips graph and accepts old snapshots without it", () => {
  StorageService.addCourse(course()); addCuriosity("통분", "호기심", "왜요?");
  const backup = createLearningBackup(); assert.ok(backup.data.knowledgeGraph); assert.ok(validateLearningBackup(backup).ok);
  const old = structuredClone(backup); delete old.data.knowledgeGraph; assert.ok(validateLearningBackup(old).ok);
  const other = new MemoryStorage(); assert.ok(importLearningBackup(backup, { storage: other as unknown as Storage, strategy: "overwrite" }).ok);
  assert.deepEqual(JSON.parse(other.getItem(keys.KNOWLEDGE_GRAPH)!), backup.data.knowledgeGraph);
  const malformed = structuredClone(backup); malformed.data.knowledgeGraph!.edges[0].to = "missing";
  assert.equal(validateLearningBackup(malformed).ok, false);
});
test("backup merge retains local and incoming nodes and newest explicit edits", () => {
  StorageService.addCourse(course());
  const local = getKnowledgeGraph(); const remote = structuredClone(local);
  remote.nodes[0].userMarkedKnown = false; remote.nodes[0].updatedAt = "2030-01-01T00:00:00Z";
  local.nodes[0].userMarkedKnown = true;
  const merged = mergeKnowledgeGraphs(local, remote);
  assert.equal(merged.nodes[0].userMarkedKnown, false);
  const backup = createLearningBackup(); backup.data.knowledgeGraph = mergeCourseGraph(remote, course("remote", ["일차함수"]));
  assert.ok(importLearningBackup(backup, { strategy: "merge" }).ok);
  assert.ok(findMatchingConcept(getKnowledgeGraph(), "일차함수"));
});
test("cloud graph upload/restore roundtrip remains account-scoped and handles revision conflicts", async t => {
  const originalFetch = globalThis.fetch; const originalWindow = globalThis.window;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; clearAuthAdapter(); });
  globalThis.window = { location: { origin: "http://localhost:3002" } } as Window & typeof globalThis;
  configureAuthAdapter({ getAccessToken: async () => "token", getAuthStatus: () => ({ configured: true, signedIn: true, provider: "test", userId: "user-a" }) });
  StorageService.setUser({ id: "user-a", name: "사용자", isGuest: false, createdAt: now });
  StorageService.addCourse(course());
  const remote = createLearningBackup(); remote.data.knowledgeGraph = mergeCourseGraph(remote.data.knowledgeGraph!, course("remote", ["원격 개념"]));
  let calls = 0;
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)); calls++;
    assert.ok(body.snapshot.data.knowledgeGraph);
    if (calls === 1) return new Response(JSON.stringify({ snapshot: remote, revision: 2, updatedAt: now }), { status: 409 });
    assert.ok(findMatchingConcept(body.snapshot.data.knowledgeGraph, "원격 개념"));
    return new Response(JSON.stringify({ snapshot: body.snapshot, revision: 3, updatedAt: now }), { status: 200 });
  }) as typeof fetch;
  assert.equal((await syncCurrentLearningSnapshot("user-a", 1)).revision, 3);
  assert.ok(restoreLearningSnapshot("user-a", remote, "merge", { confirmed: true }).ok);
  assert.throws(() => restoreLearningSnapshot("other", remote, "merge", { confirmed: true }));
});
test("cloud 503 errors carry status and code for both GET and PUT", async t => {
  const originalFetch = globalThis.fetch; const originalWindow = globalThis.window;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; clearAuthAdapter(); });
  globalThis.window = { location: { origin: "http://localhost:3002" } } as Window & typeof globalThis;
  configureAuthAdapter({ getAccessToken: async () => "token", getAuthStatus: () => ({ configured: true, signedIn: true, provider: "test", userId: "user-a" }) });
  globalThis.fetch = (async () => new Response(JSON.stringify({ code: "cloud_store_unavailable", error: "한국어 메시지" }), { status: 503 })) as typeof fetch;
  const check = (e: unknown) => e instanceof CloudSnapshotRequestError && e.status === 503 && e.code === "cloud_store_unavailable" && !e.message.includes("credentials");
  await assert.rejects(getLearningSnapshot(), check);
  await assert.rejects(putLearningSnapshot(createLearningBackup(), null), check);
});
