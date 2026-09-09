import test from "node:test";
import assert from "node:assert/strict";
import {
  clearLearningAnalytics,
  getLearningAnalyticsSummary,
  trackLearningEvent,
} from "../src/services/learningAnalytics";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("storage unavailable");
    this.values.set(key, value);
  }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
const testWindow = {
  localStorage: local,
  sessionStorage: session,
} as unknown as Window & typeof globalThis;
Object.defineProperty(globalThis, "window", { configurable: true, value: testWindow });

test("records bounded local events, deduplicates, and excludes sample data", () => {
  clearLearningAnalytics();
  local.clear();
  session.clear();

  assert.equal(trackLearningEvent("lesson_started", {
    courseId: "adult-course-1",
    lessonId: "lesson-1",
    source: "home",
    firstLesson: true,
    resume: false,
    sample: false,
    // @ts-expect-error raw payloads are intentionally not accepted
    answer: "private answer",
  }), true);
  assert.equal(trackLearningEvent("lesson_started", {
    courseId: "adult-course-1",
    lessonId: "lesson-1",
    source: "home",
    firstLesson: true,
  }), false);
  assert.equal(trackLearningEvent("lesson_completed", {
    courseId: "adult-course-1",
    lessonId: "lesson-1",
    firstLesson: true,
  }), true);
  assert.equal(trackLearningEvent("lesson_started", {
    courseId: "math-sample",
    lessonId: "sample-1",
    sample: true,
  }), true);

  assert.deepEqual(getLearningAnalyticsSummary(), {
    lessonStarts: 1,
    firstLessonStarts: 1,
    firstLessonCompletions: 1,
    resumeVisits: 0,
    reviewVisits: 0,
    courseCreations: 0,
  });

  const raw = local.getItem("learnhub_learning_analytics_v1") || "";
  assert.equal(raw.includes("private answer"), false);
});

test("malformed persisted data is ignored and storage failures do not throw", () => {
  local.clear();
  session.clear();
  local.setItem("learnhub_learning_analytics_v1", "not-json");
  assert.deepEqual(getLearningAnalyticsSummary(), {
    lessonStarts: 0,
    firstLessonStarts: 0,
    firstLessonCompletions: 0,
    resumeVisits: 0,
    reviewVisits: 0,
    courseCreations: 0,
  });

  local.failWrites = true;
  assert.equal(trackLearningEvent("review_visited", { source: "test" }), false);
  assert.doesNotThrow(() => getLearningAnalyticsSummary());
  local.failWrites = false;
});

test("does not claim success when local storage is unavailable", () => {
  clearLearningAnalytics();
  const original = testWindow.localStorage;
  Object.defineProperty(testWindow, "localStorage", { configurable: true, value: undefined });
  assert.equal(trackLearningEvent("course_created", { courseId: "no-storage" }), false);
  Object.defineProperty(testWindow, "localStorage", { configurable: true, value: original });
});
