import React, { useEffect, useRef } from "react";
import { CheckCircle2, ArrowRight, Home, Sparkles } from "lucide-react";
import { Course, LessonMeta } from "../../types/learning";

interface LessonCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseTitle: string;
  lessonTitle: string;
  savedStatus?: "saved" | "error" | "pending";
  nextLesson?: {
    course: Course;
    lesson: LessonMeta;
    chapterTitle: string;
  } | null;
  onStartNextLesson?: () => void;
  onGoHome: () => void;
  courseCompleted?: boolean;
  onStartAssessment?: () => void;
}

export const LessonCompletionModal: React.FC<LessonCompletionModalProps> = ({
  isOpen,
  onClose,
  courseTitle,
  lessonTitle,
  savedStatus = "saved",
  nextLesson,
  onStartNextLesson,
  onGoHome,
  courseCompleted = false,
  onStartAssessment,
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
      <div role="dialog" aria-modal="true" aria-labelledby="lesson-completion-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-8 text-[var(--lh-ink)] shadow-2xl animate-fade-in space-y-6">
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
            {courseCompleted ? "모든 레슨을 마쳤어요!" : "레슨을 완료했습니다!"}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--lh-ink-secondary)] font-normal">
            {courseTitle} • <span className="font-medium text-[var(--lh-primary)]">{lessonTitle}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-5 text-center shadow-xs">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--lh-ink)]">
            <Sparkles className="h-4 w-4 text-[var(--lh-primary)]" />
            <span>개념 학습 기록이 저장되었습니다.</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--lh-ink-secondary)]">
            모든 레슨을 마치면 전체 문제를 풀어 이해도를 확인할 수 있어요.
          </p>
          <p aria-live="polite" className="mt-3 text-[11px] font-medium text-[var(--lh-ink-secondary)]">
            {savedStatus === "saved" ? "완료 기록 저장됨" : savedStatus === "pending" ? "저장 확인 중" : "완료 기록을 저장하지 못함"}
          </p>
        </div>

        {/* Next Action Buttons */}
        <div className="space-y-2.5 pt-1">
          {courseCompleted && onStartAssessment ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-[var(--lh-ink-secondary)]">학습한 내용을 문제로 확인해볼까요?</p>
              <button onClick={() => { onClose(); onStartAssessment(); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white hover:bg-[var(--lh-primary-hover)]">
                문제로 실력 확인하기 <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : nextLesson && onStartNextLesson ? (
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
            <span>{courseCompleted ? "나중에 풀기" : "나중에 이어하기"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
