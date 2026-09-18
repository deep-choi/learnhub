import assert from "node:assert/strict";
import test from "node:test";
import { validateCurriculumPayload, validateLessonPayload } from "../src/domain/contentValidation";
import { getLearningSupport, learningSupportDefinitions } from "../src/domain/learningSupport";
import { LEARNING_ROADMAPS } from "../src/data/roadmapData";
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

test("generated lessons require a complete concept-example-practice arc", () => {
  const shallowLesson = {
    title: "얕은 레슨",
    steps: [{ type: "concept", title: "설명", content: "짧은 내용" }],
  };
  assert.ok(validateLessonPayload(shallowLesson, "concept", { requireLearningArc: true }).length > 0);
});

test("math roadmap spans elementary through graduate study with real lesson depth", () => {
  const math = LEARNING_ROADMAPS.filter((roadmap) => roadmap.subjectKey === "math").sort((a, b) => a.stepLevel - b.stepLevel);
  assert.equal(math.length, 5);
  assert.match(math[0].targetAudience, /초등 1학년/);
  assert.match(math[4].targetAudience, /대학원/);
  for (const roadmap of math) {
    assert.equal(roadmap.course.chapters.length, 4);
    assert.equal(roadmap.totalLessons, 20);
    assert.equal(roadmap.course.chapters.flatMap((chapter) => chapter.lessons).length, 20);
    assert.ok(roadmap.recommendedPrerequisites.length > 0);
    assert.ok(roadmap.learningOutcomes.length >= 3);
  }
  assert.ok(math[1].recommendedPrerequisites.some((item) => item.includes("Lv.1")));
  assert.ok(math[4].recommendedPrerequisites.some((item) => item.includes("Lv.4")));
});
