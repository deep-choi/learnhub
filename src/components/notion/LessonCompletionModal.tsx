import React, { useEffect, useRef } from "react";
import { CheckCircle2, ArrowRight, Home, BookOpen, RotateCcw, Sparkles } from "lucide-react";
import { Course, LessonMeta } from "../../types/learning";

interface LessonCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseTitle: string;
  lessonTitle: string;
  conceptName: string;
  quizCount: number;
  answeredQuizCount?: number;
  correctCount: number;
  newUnderstanding?: number;
  completionKind?: "read_only" | "quiz_checked";
  reviewScheduleStatus?: "scheduled" | "not_scheduled" | "unavailable";
  savedStatus?: "saved" | "error" | "pending";
  nextLesson?: {
    course: Course;
    lesson: LessonMeta;
    chapterTitle: string;
  } | null;
  onStartNextLesson?: () => void;
  onGoHome: () => void;
}

export const LessonCompletionModal: React.FC<LessonCompletionModalProps> = ({
  isOpen,
  onClose,
  courseTitle,
  lessonTitle,
  conceptName,
  quizCount,
  answeredQuizCount = 0,
  correctCount,
  newUnderstanding,
  completionKind = "quiz_checked",
  reviewScheduleStatus = "unavailable",
  savedStatus = "saved",
  nextLesson,
  onStartNextLesson,
  onGoHome,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="lesson-completion-title" className="w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-8 text-[var(--lh-ink)] shadow-2xl animate-fade-in space-y-6">
        <div className="flex justify-end">
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="완료 요약 닫기" className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-xs font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer">
            닫기
          </button>
        </div>
        {/* Header Badge & Title */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] text-[var(--lh-primary)] shadow-xs">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 id="lesson-completion-title" className="text-2xl font-medium tracking-[-0.03em] text-[var(--lh-ink)]">
            레슨을 완료했습니다!
          </h2>
          <p className="text-xs sm:text-sm text-[var(--lh-ink-secondary)] font-normal">
            {courseTitle} • <span className="font-medium text-[var(--lh-primary)]">{lessonTitle}</span>
          </p>
        </div>

        {/* Learning Achievement Box: Chunky M3 Subsurface Card */}
        <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between text-xs border-b border-[var(--lh-line)] pb-2.5">
            <span className="font-medium text-[var(--lh-ink)] flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[var(--lh-primary)]" />
              <span>오늘의 성취 요약</span>
            </span>
            <span aria-live="polite" className="rounded-full bg-[var(--lh-surface)] border border-[var(--lh-line)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--lh-ink-secondary)]">
              {savedStatus === "saved" ? "완료 기록 저장됨" : savedStatus === "pending" ? "저장 확인 중" : "저장되지 않음"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-4 text-center shadow-xs">
              <span className="block text-xs font-normal text-[var(--lh-ink-secondary)]">학습 지표</span>
              <span className="mt-1 block font-mono text-2xl font-medium text-[var(--lh-primary)]">
                {completionKind === "quiz_checked" && newUnderstanding !== undefined ? `${newUnderstanding}%` : "읽기 완료"}
              </span>
              <span className="mt-1 block text-[10px] text-[var(--lh-ink-secondary)] font-normal">
                {completionKind === "quiz_checked" && newUnderstanding !== undefined ? `[${conceptName}] 정답 기반` : "숙련도 미측정"}
              </span>
            </div>

            <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-4 text-center shadow-xs">
              <span className="block text-xs font-normal text-[var(--lh-ink-secondary)]">확인 퀴즈 결과</span>
              <span className="mt-1 block font-mono text-2xl font-medium text-[var(--lh-ink)]">
                {quizCount > 0 ? `${correctCount} / ${quizCount}` : "퀴즈 없음"}
              </span>
              <span className="mt-1 block text-[10px] text-[var(--lh-ink-secondary)] font-normal truncate">
                {quizCount === 0
                  ? "읽기 완료만 기록"
                  : answeredQuizCount < quizCount
                    ? `${quizCount - answeredQuizCount}개 미확인`
                    : correctCount === quizCount
                      ? "확인 문제 모두 정답"
                      : "오답은 복습 예약"}
              </span>
            </div>
          </div>

          {/* Retention & Review Note */}
          <div className="rounded-2xl bg-[var(--lh-surface)] border border-[var(--lh-line)] p-3 text-xs text-[var(--lh-ink-secondary)] font-normal flex items-start gap-2 shadow-xs">
            <RotateCcw className="h-4 w-4 text-[var(--lh-secondary)] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {reviewScheduleStatus === "scheduled"
                ? <>장기 기억을 위해 <strong className="font-medium text-[var(--lh-secondary-text)]">복습 문제를 예약했습니다.</strong></>
                : reviewScheduleStatus === "not_scheduled"
                  ? "확인 문제를 예약하지 않았습니다. 다음 학습에서 다시 확인해 보세요."
                  : "복습 예약 상태를 확인하지 못했습니다."}
            </p>
          </div>
        </div>

        {/* Next Action Buttons */}
        <div className="space-y-2.5 pt-1">
          {nextLesson && onStartNextLesson ? (
            <button
              onClick={() => {
                onClose();
                onStartNextLesson();
              }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition cursor-pointer"
            >
              <span>다음 레슨 시작: {nextLesson.lesson.title}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                onClose();
                onGoHome();
              }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition cursor-pointer"
            >
              <span>홈으로 이동</span>
              <Home className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={() => {
              onClose();
              onGoHome();
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-5 text-xs font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
          >
            <Home className="h-3.5 w-3.5" />
            <span>나중에 이어하기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
