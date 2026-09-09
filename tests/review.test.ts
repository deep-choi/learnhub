import test from "node:test";
import assert from "node:assert/strict";
import {
  getDueReviewItems,
  isValidMultipleChoice,
  mergeReviewItems,
  rescheduleReviewItem,
  ReviewQuestionWithContext,
} from "../src/utils/reviewSession";

const makeReview = (overrides: Partial<ReviewQuestionWithContext> = {}): ReviewQuestionWithContext => ({
  id: "review-1",
  conceptId: "concept-1",
  conceptName: "개념 1",
  courseTitle: "과목 1",
  courseId: "course-1",
  lessonId: "lesson-1",
  question: "1 + 1 = ?",
  quizType: "short_answer",
  answer: "2",
  explanation: "2입니다.",
  dueAt: "2026-09-09T09:00:00.000Z",
  ...overrides,
});

test("due filtering includes only valid items at or before now", () => {
  const now = new Date("2026-09-09T10:00:00.000Z");
  const due = makeReview({ id: "due", dueAt: "2026-09-09T10:00:00.000Z" });
  const future = makeReview({ id: "future", dueAt: "2026-09-09T10:00:01.000Z" });
  const invalid = makeReview({ id: "invalid", dueAt: "not-a-date" });

  assert.deepEqual(getDueReviewItems([future, invalid, due], now).map((item) => item.id), ["due"]);
});

test("merging a conceptual duplicate keeps persisted identity and schedule", () => {
  const existing = makeReview({
    id: "persisted-id",
    dueAt: "2026-09-12T09:00:00.000Z",
    lessonId: "persisted-lesson",
  });
  const incoming = makeReview({
    id: "generated-id",
    dueAt: "2026-09-09T10:00:00.000Z",
    lessonId: undefined,
    explanation: "새 해설",
  });

  const [merged] = mergeReviewItems([existing], [incoming]);
  assert.equal(merged.id, "persisted-id");
  assert.equal(merged.dueAt, "2026-09-12T09:00:00.000Z");
  assert.equal(merged.lessonId, "persisted-lesson");
  assert.equal(merged.explanation, "새 해설");
});

test("rescheduling a wrong answer keeps the item instead of erasing it", () => {
  const now = new Date("2026-09-09T10:00:00.000Z");
  const rescheduled = rescheduleReviewItem(makeReview(), now);

  assert.equal(rescheduled.id, "review-1");
  assert.equal(rescheduled.dueAt, "2026-09-10T10:00:00.000Z");
});

test("multiple-choice validation requires distinct options and one matching answer", () => {
  assert.equal(isValidMultipleChoice(["A", "B"], " A "), true);
  assert.equal(isValidMultipleChoice(["A"], "A"), false);
  assert.equal(isValidMultipleChoice(["A", "A"], "A"), false);
  assert.equal(isValidMultipleChoice(["A", "B"], "C"), false);
});
