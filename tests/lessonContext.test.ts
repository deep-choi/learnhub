import assert from "node:assert/strict";
import test from "node:test";
import { lessonLearningContext, isLessonLearningContext } from "../src/domain/lessonContext";
import { buildCourseFromPayload } from "../src/components/graph/courseFromPayload";
import { resolveCourseSetup } from "../src/domain/courseSetup";
import { coursePrompt, lessonPrompt, setupInterpretPrompt } from "../server/knowledgeGraphApi";
import { validCurricula } from "./fixtures/contentQuality";

test("setup evidence and the lesson's objective survive course creation into lesson context", () => {
  const setup = resolveCourseSetup({ levelEvidence: "학습자 답변: 생활 속 과학이 궁금해요", goal: "생활 현상 설명하기" });
  const { course } = buildCourseFromPayload(structuredClone(validCurricula[0]), "과학", setup);
  const first = course.chapters[0].lessons[0];
  const context = lessonLearningContext(course, first);
  assert.equal(context.levelEvidence, setup.levelEvidence);
  assert.equal(context.goal, setup.goal);
  assert.equal(context.lessonDescription, first.description);
  assert.equal(context.firstLesson, true);
  assert.equal(isLessonLearningContext(context), true);
  const second = { ...first, id: "second", title: "다음 적용" };
  course.chapters[0].lessons.push(second);
  assert.equal(lessonLearningContext(course, first).nextLesson, second.title);
  assert.equal(lessonLearningContext(course, second).previousLesson, first.title);
  assert.equal(lessonLearningContext(course, second).firstLesson, false);
  delete course.setup;
  assert.equal(lessonLearningContext(course, first).levelEvidence, undefined);
  assert.equal(isLessonLearningContext(lessonLearningContext(course, first)), true);
});

test("lesson context rejects oversized, malformed, and unrecognized fields", () => {
  for (const value of [null, [], {}, { firstLesson: "true" }, { firstLesson: true, goal: "" }, { firstLesson: true, levelEvidence: "가".repeat(2401) }, { firstLesson: true, arbitrary: "instruction" }]) {
    assert.equal(isLessonLearningContext(value), false);
  }
  const { course } = buildCourseFromPayload(structuredClone(validCurricula[0]), "과학", resolveCourseSetup());
  course.summary = "가".repeat(5000);
  assert.equal(lessonLearningContext(course, course.chapters[0].lessons[0]).courseSummary?.length, 1200);
});

test("course and lesson prompts connect learning outcomes with activities inside the lesson", () => {
  assert.match(coursePrompt({ subject: "과학" }), /각 레슨 description.*구체적인 목표.*확인할 짧은 활동/u);
  const prompt = lessonPrompt({ learningType: "concept", learningContext: { firstLesson: true, lessonDescription: "젖은 수건이 마르는 이유를 설명한다" } });
  assert.match(prompt, /젖은 수건이 마르는 이유를 설명한다/u);
  assert.match(prompt, /목표 목록.*넣지 마세요/u);
  assert.match(prompt, /이미 물은 설정 질문은 반복하지/u);
  assert.match(setupInterpretPrompt({ stepId: "levelCheck", subject: "과학", answer: "잘 모르겠어요" }), /개념의 답을 모르겠다고 하면 nextQuestion을 비우고/u);
});
