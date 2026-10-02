import type { LessonCheckResult, LessonPhase, LessonProgressState } from "../types/lessonProgress";

export const LESSON_PROGRESS_LIMITS = { maxStates: 500, maxStepIndex: 99 } as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 200;

export const isLessonPhase = (value: unknown): value is LessonPhase => value === "steps" || value === "check" || value === "done";
export const isLessonCheckResult = (value: unknown): value is LessonCheckResult =>
  value === "correct" || value === "incorrect" || value === "skipped" || value === "practiced";

export const lessonProgressKey = (courseId: string, lessonId: string): string => `${courseId}\u0000${lessonId}`;

export function isLessonProgressState(value: unknown): value is LessonProgressState {
  return isRecord(value) &&
    id(value.courseId) && id(value.lessonId) &&
    typeof value.stepIndex === "number" && Number.isInteger(value.stepIndex) && value.stepIndex >= 0 && value.stepIndex <= LESSON_PROGRESS_LIMITS.maxStepIndex &&
    isLessonPhase(value.phase) &&
    (value.checkResult === undefined || isLessonCheckResult(value.checkResult)) &&
    typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt));
}

export function isLessonProgressList(value: unknown): value is LessonProgressState[] {
  if (!Array.isArray(value) || value.length > LESSON_PROGRESS_LIMITS.maxStates || !value.every(isLessonProgressState)) return false;
  return new Set(value.map((state) => lessonProgressKey(state.courseId, state.lessonId))).size === value.length;
}

export function enforceLessonProgressLimits(states: LessonProgressState[]): LessonProgressState[] {
  return [...states].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, LESSON_PROGRESS_LIMITS.maxStates);
}

/** 레슨(과목+레슨)이 같으면 더 늦게 바뀐 상태를 쓴다. */
export function mergeLessonProgress(current: LessonProgressState[], incoming: LessonProgressState[]): LessonProgressState[] {
  const byKey = new Map<string, LessonProgressState>();
  for (const state of [...current, ...incoming]) {
    const key = lessonProgressKey(state.courseId, state.lessonId);
    const existing = byKey.get(key);
    if (!existing || Date.parse(state.updatedAt) > Date.parse(existing.updatedAt)) byKey.set(key, state);
  }
  return enforceLessonProgressLimits([...byKey.values()]);
}
