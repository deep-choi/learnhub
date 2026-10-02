import React from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { ResumeContext } from "./graphTypes";

interface ResumeBannerProps {
  resume: ResumeContext;
  /** 지난 레슨으로 돌아가서 이어갑니다. */
  onContinue: () => void;
  /** 1분 복습을 먼저 하고 이어갑니다. */
  onQuickReview?: () => void;
  compact?: boolean;
}

export const ResumeBanner: React.FC<ResumeBannerProps> = ({ resume, onContinue, onQuickReview, compact = false }) => (
  <section
    aria-label="지난번 학습 이어가기"
    className={`rounded-[24px] border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] ${compact ? "p-4" : "p-5 sm:p-6"}`}
  >
    <p className="text-xs font-medium text-[var(--lh-primary-text)]">{resume.courseTitle}</p>
    <p className={`mt-1 font-medium text-[var(--lh-ink)] ${compact ? "text-sm" : "text-base sm:text-lg"}`}>
      지난번엔 {resume.daysAway >= 1 ? `${resume.daysAway === 1 ? "어제" : `${resume.daysAway}일 전`} ` : ""}‘{resume.conceptName}’까지 했어요.
      {onQuickReview ? " 1분만 복습하고 이어갈까요?" : " 이어서 해볼까요?"}
    </p>
    {resume.dueReviewCount > 0 && (
      <p className="mt-1 text-xs text-[var(--lh-ink-secondary)]">다시 풀어볼 문제도 {resume.dueReviewCount}개 있어요.</p>
    )}
    <div className="mt-3 flex flex-wrap gap-2">
      {onQuickReview && (
        <button
          type="button"
          onClick={onQuickReview}
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-4 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer sm:text-sm"
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" /> 1분 복습하기
        </button>
      )}
      <button
        type="button"
        onClick={onContinue}
        className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-medium transition cursor-pointer sm:text-sm ${
          onQuickReview
            ? "border border-[var(--lh-primary-border)] bg-[var(--lh-surface)] text-[var(--lh-primary-text)] hover:bg-[var(--lh-surface-subtle)]"
            : "bg-[var(--lh-primary)] text-white hover:bg-[var(--lh-primary-hover)]"
        }`}
      >
        바로 이어가기 <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  </section>
);
