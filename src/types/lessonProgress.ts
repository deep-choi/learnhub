export type LessonPhase = "steps" | "check" | "done";
/** 확인 단계의 결과. skipped = "넘어갈게요", practiced = 실기형의 "해봤어요". */
export type LessonCheckResult = "correct" | "incorrect" | "skipped" | "practiced";

/** 레슨 단위의 대화 진행 상태. 다시 열 때 현재 단계에서 이어 가는 데 쓴다. */
export interface LessonProgressState {
  courseId: string;
  lessonId: string;
  /** 0부터 시작하는 현재 단계 */
  stepIndex: number;
  phase: LessonPhase;
  checkResult?: LessonCheckResult;
  updatedAt: string;
}

export type LessonProgressInput = Omit<LessonProgressState, "updatedAt"> & { updatedAt?: string };

export interface CompleteLessonResult {
  ok: boolean;
  /** 이 호출 전에 이미 완료였는지 */
  alreadyCompleted: boolean;
  /** 완료 처리 뒤 개념의 상태(지도를 읽을 수 없으면 undefined) */
  conceptState?: "unseen" | "learned" | "verified" | "needs_review" | "curious";
  reason?: "lesson_not_found" | "storage";
}
