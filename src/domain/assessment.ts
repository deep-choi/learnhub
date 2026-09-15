import type { Course, LessonContent } from "../types/learning";
import { isValidMultipleChoice } from "../utils/reviewSession";

export type AssessmentType = "mixed" | "multiple_choice" | "essay";
export interface AssessmentConfig { count: 5 | 10 | 20; type: AssessmentType }
export interface AssessmentSource { lessonId: string; title: string; conceptId: string; conceptName: string; content: string }
export interface AssessmentQuestion {
  id: string;
  lessonId: string;
  conceptId: string;
  conceptName: string;
  type: "multiple_choice" | "essay";
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
  criteria: string[];
}
export interface AssessmentGrade {
  questionId: string;
  status: "correct" | "partial" | "incorrect" | "unknown";
  feedback: string;
  missingPoints: string[];
}
export interface AssessmentSession {
  version: 1;
  id: string;
  courseId: string;
  config: AssessmentConfig;
  questions: AssessmentQuestion[];
  answers: Record<string, string>;
  grades: Record<string, AssessmentGrade>;
  index: number;
  stage: "solving" | "results";
  createdAt: string;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
export const isAssessmentConfig = (value: unknown): value is AssessmentConfig =>
  isRecord(value) && [5, 10, 20].includes(value.count as number) && ["mixed", "multiple_choice", "essay"].includes(value.type as string);
export const courseIsComplete = (course: Course) => {
  const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
  return lessons.length > 0 && lessons.every((lesson) => lesson.isCompleted);
};
export const nextUnfinishedLesson = (course: Course) => {
  for (const chapter of course.chapters) {
    const lesson = chapter.lessons.find((item) => !item.isCompleted);
    if (lesson) return { lesson, chapterTitle: chapter.title };
  }
  return null;
};
/** Bound the total context while retaining a piece of every completed lesson. */
export const buildAssessmentSources = (course: Course, read: (id: string) => LessonContent | null): AssessmentSource[] => {
  const lessons = course.chapters.flatMap((chapter) => chapter.lessons).filter((lesson) => lesson.isCompleted);
  const perLesson = Math.max(40, Math.min(900, Math.floor(9_000 / Math.max(1, lessons.length))));
  return lessons.map((lesson) => {
    const cached = read(lesson.id);
    const content = cached?.courseId === course.id && cached?.lessonId === lesson.id
      ? cached.steps.map((step) => `${step.title}: ${step.content}`).join("\n") : lesson.description;
    return { lessonId: lesson.id, title: lesson.title, conceptId: lesson.conceptId, conceptName: lesson.conceptName, content: content.slice(0, perLesson) };
  });
};
export const batchTypes = (config: AssessmentConfig, offset: number): AssessmentQuestion["type"][] =>
  Array.from({ length: Math.min(5, config.count - offset) }, (_, i) =>
    config.type === "mixed" ? ((offset + i) % 2 === 0 ? "multiple_choice" : "essay") : config.type);
export const validQuestion = (q: unknown): q is AssessmentQuestion => {
  if (!isRecord(q) || !["id", "lessonId", "conceptId", "conceptName"].every((key) => text(q[key], 200)) ||
    !text(q.question, 1_000) || !text(q.answer, 1_500) || !text(q.explanation, 1_500) ||
    !Array.isArray(q.criteria) || q.criteria.length > 5 || q.criteria.some((item) => !text(item, 250))) return false;
  if (q.type === "multiple_choice") return Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every((option) => text(option, 400)) && isValidMultipleChoice(q.options, q.answer as string);
  return q.type === "essay" && q.criteria.length > 0;
};
export const validateAssessmentQuestions = (payload: unknown, sources: AssessmentSource[], types: AssessmentQuestion["type"][], previous: string[] = []): string[] => {
  if (!isRecord(payload) || !Array.isArray(payload.questions) || payload.questions.length !== types.length) return ["문제 수가 설정과 다릅니다."];
  const seen = new Set(previous.map((q) => q.replace(/\s/gu, "").toLowerCase()));
  const ids = new Set<string>();
  return payload.questions.flatMap((q, i) => {
    if (!validQuestion(q)) return ["문제 형식이나 정답 기준을 확인할 수 없습니다."];
    const source = sources.find((item) => item.lessonId === q.lessonId);
    if (!source || source.conceptId !== q.conceptId || source.conceptName !== q.conceptName) return ["학습 범위를 벗어난 문제입니다."];
    const normalized = q.question.replace(/\s/gu, "").toLowerCase();
    if (q.type !== types[i] || seen.has(normalized) || ids.has(q.id)) return ["문제 유형이나 중복 문제를 확인해 주세요."];
    seen.add(normalized); ids.add(q.id);
    return [];
  });
};
export const validGrade = (grade: unknown): grade is AssessmentGrade => isRecord(grade) &&
  text(grade.questionId, 200) && ["correct", "partial", "incorrect", "unknown"].includes(grade.status as string) &&
  text(grade.feedback, 1_500) && Array.isArray(grade.missingPoints) && grade.missingPoints.length <= 5 && grade.missingPoints.every((point) => text(point, 300));
export const isAssessmentSession = (value: unknown, expectedCourseId?: string): value is AssessmentSession => {
  if (!isRecord(value) || value.version !== 1 || typeof value.courseId !== "string" || !value.courseId ||
    (expectedCourseId !== undefined && value.courseId !== expectedCourseId) || typeof value.id !== "string" || !value.id ||
    !isAssessmentConfig(value.config) || !Array.isArray(value.questions) || !value.questions.length ||
    value.questions.length > 20 || !value.questions.every(validQuestion) ||
    new Set(value.questions.map((question) => question.id)).size !== value.questions.length ||
    !isRecord(value.answers) || !isRecord(value.grades) || !Number.isInteger(value.index) ||
    (value.index as number) < 0 || (value.index as number) >= value.questions.length ||
    !["solving", "results"].includes(value.stage as string) || typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))) return false;
  const ids = new Set(value.questions.map((question) => question.id));
  return !Object.entries(value.answers).some(([id, answer]) => !ids.has(id) || typeof answer !== "string" || answer.length > 2_000) &&
    !Object.entries(value.grades).some(([id, grade]) => !ids.has(id) || !validGrade(grade) || grade.questionId !== id);
};
export const validateAssessmentGrades = (payload: unknown, ids: string[]): string[] => {
  if (!isRecord(payload) || !Array.isArray(payload.grades) || payload.grades.length !== ids.length) return ["채점 결과 수를 확인해 주세요."];
  const seen = new Set<string>();
  for (const grade of payload.grades) {
    if (!validGrade(grade) || !ids.includes(grade.questionId) || seen.has(grade.questionId)) return ["채점 결과를 확인할 수 없습니다."];
    seen.add(grade.questionId);
  }
  return [];
};
export const assessmentScore = (questions: AssessmentQuestion[], grades: Record<string, AssessmentGrade>) => {
  let scored = 0, points = 0, correct = 0;
  for (const question of questions) {
    const grade = grades[question.id];
    if (!grade || grade.status === "unknown") continue;
    scored++;
    if (grade.status === "correct") { points++; correct++; }
    else if (grade.status === "partial") points += 0.5;
  }
  return { scored, correct, pending: questions.length - scored, percent: scored ? Math.round(points / scored * 100) : null };
};
