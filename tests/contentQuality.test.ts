import assert from "node:assert/strict";
import test from "node:test";
import { validateCurriculumPayload, validateLessonPayload } from "../src/domain/contentValidation";
import { getLearningSupport, learningSupportDefinitions } from "../src/domain/learningSupport";
import { invalidPayloads, validCurricula, validLessons } from "./fixtures/contentQuality";

test("five supported learning types have actionable adult criteria and boundaries", () => {
  const types = ["concept", "problem_solving", "memorization", "language", "practical"] as const;
  for (const type of types) {
    const support = getLearningSupport(type);
    assert.equal(support.learningType, type);
    assert.ok(support.successCriteria.length > 0);
    assert.ok(support.adultTaskSuggestions.length > 0);
    assert.ok(support.notSupported.some((item) => item.includes("코드") || item.includes("음성")));
  }
  assert.equal(Object.keys(learningSupportDefinitions).length, 5);
});

test("representative multi-subject curriculum and lesson fixtures are valid", () => {
  for (const curriculum of validCurricula) assert.deepEqual(validateCurriculumPayload(curriculum), []);
  for (const lesson of validLessons) assert.deepEqual(validateLessonPayload(lesson), []);
});

test("invalid lesson shapes and inconsistent multiple choice are rejected", () => {
  assert.ok(validateCurriculumPayload(invalidPayloads.curriculumWithoutLessons).length > 0);
  assert.ok(validateLessonPayload(invalidPayloads.lessonWithoutSteps).length > 0);
  assert.ok(validateLessonPayload(invalidPayloads.multipleChoiceAnswerMismatch).some((error) => error.includes("일치")));
  assert.ok(validateLessonPayload(invalidPayloads.duplicateOptions).some((error) => error.includes("중복")));
});

test("an explicit quiz step requires quiz data, while read-only steps remain valid", () => {
  const malformedQuizStep = { title: "퀴즈 단계", steps: [{ type: "quiz", title: "확인", content: "답을 생각해 봅니다." }] };
  const readOnlyLesson = { title: "읽기 레슨", steps: [{ type: "concept", title: "읽기", content: "핵심 내용을 읽습니다." }] };
  assert.ok(validateLessonPayload(malformedQuizStep).some((error) => error.includes("퀴즈 내용")));
  assert.deepEqual(validateLessonPayload(readOnlyLesson), []);
});
