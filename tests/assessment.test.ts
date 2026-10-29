import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { AiGateway } from "../server/aiGateway";
import { assessmentRouter } from "../server/assessment";
import { assessmentScore, batchTypes, buildAssessmentSources, courseIsComplete, isAssessmentSession, nextUnfinishedLesson, validateAssessmentQuestions, validateAssessmentGrades } from "../src/domain/assessment";
import { assessmentStorageKey, loadAssessment, practiceStorageKey, saveAssessment, recordAssessmentGrade } from "../src/services/assessment";
import { StorageService } from "../src/services/storage";
import { assessmentCourse, fixtureQuestion, fixtureSession } from "./fixtures/assessment";
import { createFallbackLessonContent } from "../src/domain/lessonFallback";
import { validateLessonPayload } from "../src/domain/contentValidation";

test("AI lesson failures still produce a valid, curriculum-grounded fallback", () => {
  const lesson = assessmentCourse.chapters[0].lessons[0];
  const fallback = createFallbackLessonContent(assessmentCourse, lesson, assessmentCourse.chapters[0].title);
  assert.deepEqual(validateLessonPayload(fallback, assessmentCourse.learningType), []);
  assert.deepEqual(validateLessonPayload(fallback, assessmentCourse.learningType, { requireLearningArc: true }), []);
  assert.equal(fallback.courseId, assessmentCourse.id);
  assert.equal(fallback.lessonId, lesson.id);
  assert.ok(fallback.steps.every((step) => step.content.includes(lesson.conceptName) || step.title === "핵심을 자기 말로 정리해 보세요"));
  assert.equal(fallback.steps.some((step) => step.quiz), false);
});

test("completion does not loop back to the first lesson or skip earlier unfinished lessons", () => {
  assert.equal(courseIsComplete(assessmentCourse), true);
  assert.equal(nextUnfinishedLesson(assessmentCourse), null);
  const course = structuredClone(assessmentCourse);
  course.chapters[0].lessons[0].isCompleted = false;
  assert.equal(courseIsComplete(course), false);
  assert.equal(nextUnfinishedLesson(course)?.lesson.id, "balance-1");
  assert.equal(courseIsComplete({ ...course, chapters: [] }), false);
});

test("5/10/20 question mixed sets preserve the total and balance across batches", () => {
  for (const count of [5, 10, 20] as const) {
    const types = Array.from({ length: count / 5 }, (_, i) => batchTypes({ count, type: "mixed" }, i * 5)).flat();
    assert.equal(types.length, count);
    assert.equal(types.filter((t) => t === "multiple_choice").length, Math.ceil(count / 2));
    assert.equal(types.filter((t) => t === "essay").length, Math.floor(count / 2));
  }
});

test("source context includes only studied lessons and cannot use another course's cache", () => {
  const source = buildAssessmentSources(assessmentCourse, () => ({ courseId: "another", lessonId: "balance-1", id: "x", title: "x", steps: [{ id: "x", type: "concept", title: "x", content: "unrelated material" }] }));
  assert.equal(source.length, 2);
  assert.ok(source.every((s) => !s.content.includes("unrelated")));
  const partial = structuredClone(assessmentCourse); partial.chapters[0].lessons[0].isCompleted = false;
  assert.equal(buildAssessmentSources(partial, () => null).length, 1);
});

test("concept practice limits sources to the chosen studied lessons", () => {
  const picked = buildAssessmentSources(assessmentCourse, () => null, ["balance-2"]);
  assert.deepEqual(picked.map((s) => s.lessonId), ["balance-2"]);
  const partial = structuredClone(assessmentCourse); partial.chapters[0].lessons[1].isCompleted = false;
  assert.equal(buildAssessmentSources(partial, () => null, ["balance-2"]).length, 0);
});

test("concept practice is stored apart from the course assessment and keeps its scope", () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) } });
  const course = fixtureSession();
  const practice = { ...fixtureSession(), id: "practice-session", lessonIds: ["balance-2"] };
  assert.equal(isAssessmentSession(practice), true);
  assert.equal(isAssessmentSession({ ...practice, lessonIds: [] }), false);
  assert.equal(isAssessmentSession({ ...practice, lessonIds: [3] }), false);
  assert.equal(saveAssessment("learner-a", course), true);
  assert.equal(saveAssessment("learner-a", practice), true);
  assert.notEqual(practiceStorageKey("learner-a", course.courseId), assessmentStorageKey("learner-a", course.courseId));
  assert.equal(loadAssessment("learner-a", course.courseId)?.id, "test-session");
  assert.deepEqual(loadAssessment("learner-a", course.courseId, true), practice);
  data.set(practiceStorageKey("learner-a", course.courseId), JSON.stringify(course));
  assert.throws(() => loadAssessment("learner-a", course.courseId, true));
});

test("generated questions enforce count, type, source mapping, distinct choices and no duplicates", () => {
  const sources = buildAssessmentSources(assessmentCourse, () => null);
  const q = fixtureQuestion(0, "multiple_choice");
  assert.deepEqual(validateAssessmentQuestions({ questions: [q] }, sources, ["multiple_choice"]), []);
  for (const bad of [{ ...q, options: ["4", "4", "2", "3"] }, { ...q, answer: "8" }, { ...q, lessonId: "unknown" }, { ...q, conceptId: "other" }]) {
    assert.ok(validateAssessmentQuestions({ questions: [bad] }, sources, ["multiple_choice"]).length);
  }
  assert.ok(validateAssessmentQuestions({ questions: [q] }, sources, ["essay"]).length);
  assert.ok(validateAssessmentQuestions({ questions: [q] }, sources, ["multiple_choice"], [q.question]).length);
  assert.ok(validateAssessmentQuestions({ questions: [q] }, sources, ["multiple_choice", "essay"]).length);
});

test("partial credit counts as half; unavailable grading never becomes a zero", () => {
  const qs = fixtureSession().questions;
  const grades = { q1: { questionId: "q1", status: "correct" as const, feedback: "좋아요", missingPoints: [] }, q2: { questionId: "q2", status: "partial" as const, feedback: "검산도 해보세요", missingPoints: ["검산"] }, q3: { questionId: "q3", status: "unknown" as const, feedback: "보류", missingPoints: [] } };
  assert.deepEqual(assessmentScore(qs, grades), { scored: 2, correct: 1, pending: 3, percent: 75 });
  assert.equal(assessmentScore(qs, {}).percent, null);
  assert.ok(validateAssessmentGrades({ grades: [grades.q1, grades.q1] }, ["q1", "q2"]).length);
});

test("drafts and results restore per owner/course; storage failures and corrupt drafts are explicit", () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) } });
  const session = fixtureSession();
  assert.equal(saveAssessment("learner-a", session), true);
  assert.deepEqual(loadAssessment("learner-a", session.courseId), session);
  assert.equal(loadAssessment("learner-b", session.courseId), null);
  assert.equal(loadAssessment("learner-a", "other-course"), null);
  StorageService.saveSkills([]); StorageService.saveMistakes([]);
  const grade = { questionId: "q1", status: "correct" as const, feedback: "좋아요", missingPoints: [] };
  recordAssessmentGrade(assessmentCourse, session.id, session.questions[0], "4", grade);
  recordAssessmentGrade(assessmentCourse, session.id, session.questions[0], "4", grade);
  assert.equal(StorageService.getSkills()[0].correctCount, 1);
  recordAssessmentGrade(assessmentCourse, session.id, session.questions[1], "부분 답", { ...grade, questionId: "q2", status: "partial" });
  assert.equal(StorageService.getSkills()[0].wrongCount, 0);
  assert.equal(StorageService.getMistakes().length, 1);
  data.set(assessmentStorageKey("learner-a", session.courseId), JSON.stringify({ ...session, index: 99 }));
  assert.throws(() => loadAssessment("learner-a", session.courseId));
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { setItem() { throw new Error("full"); } } });
  assert.equal(saveAssessment("learner-a", session), false);
});

test("assessment routes preserve access checks and reject invalid batches before AI work", async () => {
  let allow = false, calls = 0;
  const gateway = new AiGateway({ client: { models: { async generateContent() { calls++; return { text: JSON.stringify({ questions: Array.from({ length: 5 }, (_, i) => fixtureQuestion(i, i % 2 ? "essay" : "multiple_choice")) }) } as any; } } }, logger: () => {} });
  const app = express(); app.use(express.json());
  app.use(assessmentRouter({ gateway, authorize: async (_req, res) => { if (!allow) res.status(401).json({ error: "auth" }); return allow; }, clientKey: () => "test", error: (res) => res.status(503).json({ error: "ai" }) }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const post = (path: string, body: unknown) => fetch(`http://127.0.0.1:${port}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const body = { courseTitle: assessmentCourse.title, config: { count: 5, type: "mixed" }, offset: 0, previous: [], sources: buildAssessmentSources(assessmentCourse, () => null) };
    assert.equal((await post("generate-assessment", body)).status, 401); assert.equal(calls, 0);
    allow = true;
    assert.equal((await post("generate-assessment", { ...body, config: { count: 500, type: "mixed" } })).status, 400);
    assert.equal((await post("grade-assessment", { items: [{ question: fixtureQuestion(0, "essay"), answer: "x".repeat(2001) }] })).status, 400);
    assert.equal(calls, 0);
    const response = await post("generate-assessment", body); assert.equal(response.status, 200);
    assert.equal((await response.json()).questions.length, 5); assert.equal(calls, 1);
  } finally { server.close(); }
});
