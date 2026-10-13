import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { answerStudyQuiz, restartStudyQuiz } from "../src/services/studyQuiz";
import { getStudyLibrary, updateStudyLibrary } from "../src/services/studyStore";
import { LEARNHUB_STORAGE_KEYS as keys, StorageService } from "../src/services/storage";
import { emptyStudyLibrary, isStudyResult, isStudyDiagram, mergeStudyLibraries, type StudyResult } from "../src/domain/study";
import { studyDiagramSvg } from "../src/domain/studyDiagram";
import { normalizeTutorResponse, validateTutorResponse } from "../server/knowledgeGraphApi";
import { requestedQuizCount } from "../server/study";
import { createLearningBackup, validateLearningBackup, carryNewerLocalRecords } from "../src/services/learningBackup";

class MemoryStorage {
  values = new Map<string, string>();
  fail = "";
  get length() { return this.values.size; }
  key(i: number) { return [...this.values.keys()][i] ?? null; }
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { if (k === this.fail) { this.fail = ""; throw new Error("quota"); } this.values.set(k, v); }
  removeItem(k: string) { this.values.delete(k); }
  clear() { this.values.clear(); }
}
let storage: MemoryStorage;
const quiz: StudyResult = { id: "quiz1", scope: "chat:a", createdAt: "2026-01-01T00:00:00Z", action: "quiz", title: "조건부확률", reply: "풀어보세요.", citations: [], questions: [{ question: "짝수 눈의 개수는?", options: ["1", "2", "3", "6"], answer: 2, explanation: "2, 4, 6입니다." }] };
beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true });
  updateStudyLibrary(l => ({ ...l, results: [structuredClone(quiz)] }));
});

test("quiz answers survive reopen and backup; wrong answers enter archive and reattempt resolves them", () => {
  answerStudyQuiz(quiz.id, 0, 3);
  assert.equal(getStudyLibrary().results[0].quizProgress?.answers[0], 3);
  assert.equal(StorageService.getMistakes().length, 1);
  assert.equal(StorageService.getMistakes()[0].wrongAnswer, "6");
  assert.equal(StorageService.getMistakes()[0].studyResultId, quiz.id);
  answerStudyQuiz(quiz.id, 0, 2);
  assert.equal(getStudyLibrary().results[0].quizProgress?.answers[0], 3, "answered question is immutable within a round");
  const backup = createLearningBackup();
  assert.equal(validateLearningBackup(backup).ok, true);
  restartStudyQuiz(quiz.id);
  assert.deepEqual(getStudyLibrary().results[0].quizProgress?.answers, {});
  answerStudyQuiz(quiz.id, 0, 2);
  assert.equal(StorageService.getMistakes()[0].isResolved, true);
});

test("course quiz updates concept once and rolls back all records on storage failure", () => {
  storage.setItem(keys.COURSES, JSON.stringify([{ id: "course1", title: "확률", chapters: [] }]));
  updateStudyLibrary(l => ({ ...l, results: [{ ...quiz, learningContext: { courseId: "course1", lessonId: "lesson1", conceptId: "conditional", conceptName: "조건부확률" } }] }));
  const before = new Map(storage.values);
  storage.fail = keys.MISTAKES;
  assert.throws(() => answerStudyQuiz(quiz.id, 0, 3));
  assert.deepEqual(storage.values, before);
  answerStudyQuiz(quiz.id, 0, 3);
  answerStudyQuiz(quiz.id, 0, 3);
  assert.equal(StorageService.getSkills()[0].wrongCount, 1);
  assert.equal(StorageService.getMistakes()[0].courseId, "course1");
});

test("sync keeps newly answered existing results and rejects malformed saved progress", () => {
  const remote = createLearningBackup();
  remote.exportedAt = "2026-01-02T00:00:00Z";
  answerStudyQuiz(quiz.id, 0, 2);
  const local = createLearningBackup();
  const carried = carryNewerLocalRecords(remote, local);
  assert.equal(carried.snapshot.data.studyLibrary?.results[0].quizProgress?.answers[0], 2);
  const newer = getStudyLibrary();
  assert.equal(mergeStudyLibraries(newer, { ...emptyStudyLibrary(), results: [quiz] }).results[0].quizProgress?.answers[0], 2);
  assert.equal(isStudyResult({ ...quiz, quizProgress: { round: 0, answers: { 9: 2 }, updatedAt: new Date().toISOString() } }), false);
});

test("empty tutor optional fields normalize without accepting nonempty invalid concepts", () => {
  const response = normalizeTutorResponse({ reply: "확률을 배워볼까요?", tangent: { conceptName: "", question: "" }, learnedConcept: "", learningIntent: { subject: "조건부확률" } });
  assert.deepEqual(validateTutorResponse(response, "", { free: true }), []);
  assert.notEqual(validateTutorResponse(normalizeTutorResponse({ reply: "답", learnedConcept: "다른 개념" }), "확률").length, 0);
});

test("question counts and escaped diagram geometry respect user requests and data bounds", () => {
  assert.equal(requestedQuizCount("분모 문제 3개를 내줘"), 3);
  assert.equal(requestedQuizCount("세 문제"), 3);
  assert.equal(requestedQuizCount("퀴즈 50개"), 10);
  const diagram = { nodes: [{ id: "a", label: "전체 <script>", items: ["1", "2"], kept: ["1", "2"] }, { id: "b", label: "짝수", items: ["1", "2"], kept: ["2"] }], edges: [{ from: "a", to: "b", label: "짝수만" }] };
  assert.equal(isStudyDiagram(diagram), true);
  assert.equal(isStudyDiagram({ ...diagram, edges: [{ from: "a", to: "missing", label: "" }] }), false);
  const svg = studyDiagramSvg({ ...quiz, action: "visual", diagram });
  assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes('marker-end="url(#arrow)"'));
  diagram.nodes[1].items[0] = "~~1~~";
  assert.ok(!studyDiagramSvg({ ...quiz, action: "visual", diagram }).includes("~~"));
});
