import type { CompleteLessonResult, LessonCheckResult } from "../types/lessonProgress";
import { getKnowledgeGraph, markQuizResult } from "./knowledgeGraphStore";
import { findMatchingConcept } from "../domain/knowledgeGraph";
import { getLessonProgress, saveLessonProgress } from "./lessonProgressStore";
import { StorageService } from "./storage";

/**
 * 레슨 대화를 끝낼 때 한 번 부르는 완료 처리.
 * - 레슨을 완료로 표시한다(`StorageService.markLessonCompleted`: 개념이 아직 본 적 없는 상태면 `learned`).
 * - `correct`: 개념을 `verified`로 올린다. 정답 기록(`recordQuizAnswer`)이 이미 했다면 그대로 두며, 실력 점수를 한 번 더 쌓지 않는다.
 * - `incorrect`: 완료는 하되 개념은 `needs_review`로 남는다(정답 기록은 `recordQuizAnswer`가 한다). 학습 확인 없이 `verified`가 되지 않는다.
 * - `skipped`("넘어갈게요"), `practiced`(실기형 "해봤어요"): `learned`까지만 간다. 이미 `verified`면 내리지 않는다.
 * - 레슨 진행 상태를 `done`+결과로 저장한다. 같은 레슨에 다시 불러도 안전하다(이미 완료면 점수·시간을 다시 쌓지 않는다).
 */
export function completeLesson(courseId: string, lessonId: string, outcome: LessonCheckResult): CompleteLessonResult {
  const course = StorageService.getCourseById(courseId);
  const lesson = course?.chapters.flatMap((chapter) => chapter.lessons).find((item) => item.id === lessonId);
  if (!course || !lesson) return { ok: false, alreadyCompleted: false, reason: "lesson_not_found" };

  const alreadyCompleted = lesson.isCompleted;
  if (!alreadyCompleted && !StorageService.markLessonCompleted(courseId, lessonId)) return { ok: false, alreadyCompleted, reason: "storage" };

  if (outcome === "correct") {
    try {
      const node = findMatchingConcept(getKnowledgeGraph(), lesson.conceptName) || findMatchingConcept(getKnowledgeGraph(), lesson.conceptId);
      if (node && node.state !== "verified") markQuizResult(node.id, true);
    } catch { /* 지도를 고치지 못해도 완료 표시는 유지하고 상태만 돌려준다. */ }
  }

  const previous = getLessonProgress(courseId, lessonId);
  const saved = saveLessonProgress({ courseId, lessonId, stepIndex: previous?.stepIndex ?? 0, phase: "done", checkResult: outcome });

  let conceptState: CompleteLessonResult["conceptState"];
  try {
    const graph = getKnowledgeGraph();
    conceptState = (findMatchingConcept(graph, lesson.conceptName) || findMatchingConcept(graph, lesson.conceptId))?.state;
  } catch { conceptState = undefined; }
  return { ok: saved !== null, alreadyCompleted, ...(conceptState ? { conceptState } : {}), ...(saved === null ? { reason: "storage" as const } : {}) };
}
