import type { LessonProgressInput, LessonProgressState } from "../types/lessonProgress";
import {
  enforceLessonProgressLimits,
  isLessonProgressList,
  isLessonProgressState,
  lessonProgressKey,
} from "../domain/lessonProgress";
import { LEARNHUB_STORAGE_KEYS, notifyLearningDataChanged } from "./storage";

const read = (): LessonProgressState[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEARNHUB_STORAGE_KEYS.LESSON_PROGRESS);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (isLessonProgressList(parsed)) return parsed;
    // 손상된 항목만 버리고 읽을 수 있는 상태는 살린다.
    if (Array.isArray(parsed)) {
      const seen = new Set<string>();
      return parsed.filter((item): item is LessonProgressState => {
        if (!isLessonProgressState(item)) return false;
        const key = lessonProgressKey(item.courseId, item.lessonId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  } catch { /* 손상된 값은 비어 있는 것으로 봅니다. */ }
  return [];
};

const write = (states: LessonProgressState[]): boolean => {
  try {
    localStorage.setItem(LEARNHUB_STORAGE_KEYS.LESSON_PROGRESS, JSON.stringify(enforceLessonProgressLimits(states)));
    notifyLearningDataChanged();
    return true;
  } catch (error) {
    console.error("Failed to save lesson progress:", error);
    return false;
  }
};

/** 저장된 레슨 진행 상태. 없으면 undefined(처음 여는 레슨). */
export function getLessonProgress(courseId: string, lessonId: string): LessonProgressState | undefined {
  const key = lessonProgressKey(courseId, lessonId);
  return read().find((state) => lessonProgressKey(state.courseId, state.lessonId) === key);
}

/** 단계가 바뀔 때마다 부른다. 같은 레슨의 이전 상태를 덮어쓰고, 저장하지 못하면 null이다. */
export function saveLessonProgress(input: LessonProgressInput): LessonProgressState | null {
  const state: LessonProgressState = { ...input, updatedAt: input.updatedAt ?? new Date().toISOString() };
  if (state.checkResult === undefined) delete state.checkResult;
  if (!isLessonProgressState(state)) return null;
  const key = lessonProgressKey(state.courseId, state.lessonId);
  const others = read().filter((item) => lessonProgressKey(item.courseId, item.lessonId) !== key);
  return write([state, ...others]) ? state : null;
}

/** "처음부터 다시 보기": 진행 상태를 지운다. 완료 표시와 대화 기록은 그대로다. */
export function clearLessonProgress(courseId: string, lessonId: string): boolean {
  const key = lessonProgressKey(courseId, lessonId);
  const states = read();
  const remaining = states.filter((state) => lessonProgressKey(state.courseId, state.lessonId) !== key);
  return remaining.length === states.length ? false : write(remaining);
}
