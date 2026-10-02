import React from "react";
import { ArrowRight, Home, Loader2, Sparkles } from "lucide-react";
import type { KnowledgeGraph, NextStep } from "./graphTypes";
import { stepActionLabel, stepReason, stepTitle, type NudgeText } from "./nextStepText";

interface NextStepBlockProps {
  graph: KnowledgeGraph;
  steps: NextStep[];
  nudge: NudgeText | null;
  nudgeLoading?: boolean;
  /** 방금 배운 개념 이름 */
  currentName: string;
  onOpenStep: (step: NextStep) => void;
  onGoHome?: () => void;
  /** wrap_up 화면에서 "조금 더 해볼래요"를 눌렀을 때 */
  onKeepGoing?: () => void;
  wrappedUp?: boolean;
  /** 레슨을 마쳤거나 문제를 맞힌 뒤인지 */
  understood?: boolean;
  /** 좁은 옆 패널용: 한 줄에 카드 하나, 여백을 줄입니다. */
  compact?: boolean;
}

/** 대화 맨 끝에서 다음 학습으로 이어 주는 블록: 질문 한 줄 + 추천 카드 1~3개. */
export const NextStepBlock: React.FC<NextStepBlockProps> = ({ graph, steps, nudge, nudgeLoading, currentName, onOpenStep, onGoHome, onKeepGoing, wrappedUp, understood = false, compact = false }) => {
  const wrapUp = steps[0]?.kind === "wrap_up" && !wrappedUp;
  const cards = steps.filter((step) => step.kind !== "wrap_up").slice(0, 3);

  if (wrapUp) {
    return (
      <section aria-label="오늘의 마무리" className={`rounded-[24px] border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] text-center ${compact ? "p-5" : "p-6 sm:p-8"}`}>
        <p aria-hidden className="text-3xl">🌱</p>
        <h2 className={`mt-2 font-medium tracking-tight text-[var(--lh-ink)] ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}>오늘은 여기까지 잘했어요</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--lh-ink-secondary)]">
          {currentName ? (understood ? `오늘 ‘${currentName}’까지 지도에 밝혀 뒀어요. ` : `오늘 ‘${currentName}’까지 봤어요. `) : ""}쉬었다 와도 지도는 그대로 남아 있고, 다음엔 이어서 시작할 수 있어요.
        </p>
        <div className={`mt-5 flex justify-center gap-2 ${compact ? "flex-col" : "flex-wrap"}`}>
          {onGoHome && (
            <button type="button" onClick={onGoHome} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-5 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">
              <Home aria-hidden className="h-4 w-4" /> 오늘은 마칠게요
            </button>
          )}
          {onKeepGoing && (
            <button type="button" onClick={onKeepGoing} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-surface)] px-5 text-sm font-medium text-[var(--lh-primary-text)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">
              조금 더 해볼래요
            </button>
          )}
        </div>
      </section>
    );
  }

  if (cards.length === 0) return null;

  return (
    <section aria-label="다음 학습 추천" className={`rounded-[24px] border border-[var(--lh-line)] bg-[var(--lh-surface)] shadow-xs ${compact ? "p-4" : "p-5 sm:p-6"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] text-[var(--lh-primary)]"><Sparkles className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className={`font-medium text-[var(--lh-ink)] ${compact ? "text-sm leading-6" : "text-base leading-7 sm:text-lg"}`}>{nudge?.question ?? "다음엔 이어서 이런 걸 해볼 수 있어요."}</p>
          {nudge?.reason && <p className="mt-0.5 text-sm leading-6 text-[var(--lh-ink-secondary)]">{nudge.reason}</p>}
          {nudgeLoading && <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--lh-ink-tertiary)]"><Loader2 aria-hidden className="h-3 w-3 animate-spin" /> 추천 이유를 다듬는 중…</p>}
        </div>
      </div>
      <ul className={`mt-4 grid gap-2 ${compact ? "" : "sm:grid-cols-3"}`}>
        {cards.map((step, index) => (
          <li key={`${step.kind}-${step.conceptId}-${index}`}>
            <button
              type="button"
              onClick={() => onOpenStep(step)}
              className={`group flex h-full w-full flex-col justify-between gap-3 rounded-2xl border p-4 text-left transition cursor-pointer ${index === 0 ? "border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)]" : "border-[var(--lh-line)] bg-[var(--lh-surface)] hover:border-[var(--lh-primary-border)]"}`}
            >
              <span className="space-y-1">
                <span className="block text-sm font-medium leading-snug text-[var(--lh-ink)]">{stepTitle(graph, step)}</span>
                <span className="block text-xs leading-5 text-[var(--lh-ink-secondary)]">{stepReason(graph, step, understood)}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--lh-primary-text)]">{stepActionLabel(step)} <ArrowRight aria-hidden className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
