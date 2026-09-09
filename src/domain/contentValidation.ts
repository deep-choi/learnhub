import { LearningType } from "../types/learning";

const LEARNING_TYPES: LearningType[] = ["concept", "problem_solving", "memorization", "language", "practical"];
const STEP_TYPES = ["concept", "example", "practice", "quiz", "summary"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function validateCurriculumPayload(payload: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(payload)) return ["커리큘럼 응답이 객체가 아닙니다."];
  if (!nonEmpty(payload.courseTitle)) errors.push("커리큘럼 제목이 없습니다.");
  if (!LEARNING_TYPES.includes(payload.learningType as LearningType)) errors.push("지원하지 않는 학습 유형입니다.");
  if (!nonEmpty(payload.learningTypeExplanation)) errors.push("학습 방식 설명이 없습니다.");
  if (!nonEmpty(payload.summary)) errors.push("커리큘럼 요약이 없습니다.");
  if (!Array.isArray(payload.chapters) || payload.chapters.length === 0) {
    errors.push("챕터가 하나 이상 필요합니다.");
    return errors;
  }
  payload.chapters.forEach((chapter, chapterIndex) => {
    if (!isRecord(chapter)) {
      errors.push(`챕터 ${chapterIndex + 1} 형식이 올바르지 않습니다.`);
      return;
    }
    if (!nonEmpty(chapter.title)) errors.push(`챕터 ${chapterIndex + 1} 제목이 없습니다.`);
    if (!nonEmpty(chapter.description)) errors.push(`챕터 ${chapterIndex + 1} 설명이 없습니다.`);
    if (!Array.isArray(chapter.lessons) || chapter.lessons.length === 0) {
      errors.push(`챕터 ${chapterIndex + 1}에 레슨이 없습니다.`);
      return;
    }
    chapter.lessons.forEach((lesson, lessonIndex) => {
      if (!isRecord(lesson)) {
        errors.push(`챕터 ${chapterIndex + 1} 레슨 ${lessonIndex + 1} 형식이 올바르지 않습니다.`);
        return;
      }
      if (!nonEmpty(lesson.title)) errors.push(`챕터 ${chapterIndex + 1} 레슨 ${lessonIndex + 1} 제목이 없습니다.`);
      if (!nonEmpty(lesson.description)) errors.push(`챕터 ${chapterIndex + 1} 레슨 ${lessonIndex + 1} 설명이 없습니다.`);
      if (!Number.isFinite(lesson.estimatedMinutes) || Number(lesson.estimatedMinutes) <= 0) {
        errors.push(`챕터 ${chapterIndex + 1} 레슨 ${lessonIndex + 1} 시간이 올바르지 않습니다.`);
      }
      if (!nonEmpty(lesson.conceptId) || !nonEmpty(lesson.conceptName)) {
        errors.push(`챕터 ${chapterIndex + 1} 레슨 ${lessonIndex + 1} 핵심 개념이 없습니다.`);
      }
    });
  });
  return errors;
}

export function validateLessonPayload(payload: unknown, learningType?: string): string[] {
  const errors: string[] = [];
  if (!isRecord(payload)) return ["레슨 응답이 객체가 아닙니다."];
  if (!nonEmpty(payload.title)) errors.push("레슨 제목이 없습니다.");
  if (!Array.isArray(payload.steps) || payload.steps.length === 0) return [...errors, "레슨 단계가 하나 이상 필요합니다."];
  if (learningType !== undefined && !LEARNING_TYPES.includes(learningType as LearningType)) errors.push("지원하지 않는 학습 유형입니다.");
  payload.steps.forEach((step, index) => {
    if (!isRecord(step)) {
      errors.push(`단계 ${index + 1} 형식이 올바르지 않습니다.`);
      return;
    }
    if (!nonEmpty(step.title) || !nonEmpty(step.content)) errors.push(`단계 ${index + 1} 제목과 내용이 필요합니다.`);
    if (step.type !== undefined && !STEP_TYPES.includes(String(step.type))) errors.push(`단계 ${index + 1} 유형이 올바르지 않습니다.`);
    if (step.codeSnippet !== undefined && typeof step.codeSnippet !== "string") errors.push(`단계 ${index + 1} 코드 예시 형식이 올바르지 않습니다.`);
    if (step.audioScript !== undefined && typeof step.audioScript !== "string") errors.push(`단계 ${index + 1} 오디오 대본 형식이 올바르지 않습니다.`);
    if (step.type === "quiz" && step.quiz === undefined) {
      errors.push(`단계 ${index + 1} 퀴즈 내용이 없습니다.`);
      return;
    }
    if (step.quiz === undefined) return;
    if (!isRecord(step.quiz) || !nonEmpty(step.quiz.question) || !nonEmpty(step.quiz.answer) || !nonEmpty(step.quiz.explanation)) {
      errors.push(`단계 ${index + 1} 퀴즈의 질문·정답·설명이 필요합니다.`);
      return;
    }
    if (step.quiz.quizType !== "multiple_choice" && step.quiz.quizType !== "short_answer") {
      errors.push(`단계 ${index + 1} 퀴즈 유형이 올바르지 않습니다.`);
    }
    if (!Array.isArray(step.quiz.hints) || step.quiz.hints.some((hint) => typeof hint !== "string")) {
      errors.push(`단계 ${index + 1} 퀴즈 힌트 형식이 올바르지 않습니다.`);
    }
    if (step.quiz.quizType === "multiple_choice") {
      const options = step.quiz.options;
      if (!Array.isArray(options) || options.length < 2 || options.some((option) => !nonEmpty(option))) {
        errors.push(`단계 ${index + 1} 객관식 선택지가 두 개 이상 필요합니다.`);
      } else {
        const normalized = options.map((option) => option.trim());
        if (new Set(normalized).size !== normalized.length) errors.push(`단계 ${index + 1} 객관식 선택지가 중복됩니다.`);
        if (!normalized.includes(step.quiz.answer.trim())) errors.push(`단계 ${index + 1} 객관식 정답이 선택지와 일치하지 않습니다.`);
      }
    }
  });
  return errors;
}
