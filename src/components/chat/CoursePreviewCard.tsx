import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Loader2, Pencil } from "lucide-react";
import type { Course } from "../../types/learning";
import { authorizedFetch } from "../../services/authClient";
import { validateCurriculumPayload } from "../../domain/contentValidation";
import { buildCourseFromPayload, unwrapCurriculum } from "../graph/courseFromPayload";
import { existingConceptNames } from "../graph/graphBridge";
import type { CurriculumConceptLinks } from "../graph/graphTypes";
import { isUsablePreviewData } from "./previewPersist";
import { SETUP_STEPS, courseRequestFromSetup, resolveCourseSetup, summarizeCourseSetup } from "../../domain/courseSetup";
import type { CourseSetup, SetupOption, SetupStepId } from "../../types/courseSetup";

interface CoursePreviewCardProps {
  subject: string;
  isSignedIn: boolean;
  /** 대화로 정한 설정. 없으면 기본값(초급 · 원리 탐구 · 15분)입니다. */
  setup?: CourseSetup;
  /** 로그인한 사용자가 "이 과정으로 시작하기"를 눌렀을 때 */
  onStart: (course: Course, links: CurriculumConceptLinks) => void;
  /** 로그인 전 사용자가 눌렀을 때: 같은 결과와 설정을 로그인 뒤에도 이어 쓰도록 넘깁니다. */
  onGuestStart: (subject: string, data: Record<string, any>, setup: CourseSetup) => void;
  onRequestAuth: () => void;
  /** 저장해 둔 미리보기 결과. 있으면 AI를 부르지 않고 이 값으로 바로 그리며, 설정을 '수정'할 때만 다시 만듭니다. */
  initialData?: Record<string, any>;
  /** 새로 만든 미리보기를 받은 직후(처음, 수정 뒤)에 최종 설정과 함께 알립니다. 대화에 저장하는 데 씁니다. */
  onReady?: (data: Record<string, any>, setup: CourseSetup) => void;
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string; limited: boolean }
  | { status: "ready"; data: Record<string, any> };

const EDIT_STEPS: SetupStepId[] = ["experience", "goal", "dailyMinutes"];

const isSelected = (setup: CourseSetup, option: SetupOption): boolean => {
  const resolved: Record<string, unknown> = { ...resolveCourseSetup(setup) };
  return Object.entries(option.value).every(([key, value]) => resolved[key] === value);
};

/** 대화 안에 놓이는 과목 미리보기 카드. 과정 요약과 설정 요약을 보여 주고, 눌러서 과목을 시작합니다. */
export const CoursePreviewCard: React.FC<CoursePreviewCardProps> = ({ subject, isSignedIn, setup: initialSetup, onStart, onGuestStart, onRequestAuth, initialData, onReady }) => {
  const [setup, setSetup] = useState<CourseSetup>(initialSetup ?? {});
  const [draft, setDraft] = useState<CourseSetup>(initialSetup ?? {});
  const [editing, setEditing] = useState(false);
  const usableInitial = useMemo(() => isUsablePreviewData(initialData), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<State>(() => (usableInitial && initialData ? { status: "ready", data: initialData } : { status: "loading" }));
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const startedRef = useRef(false);
  const resolved = resolveCourseSetup(setup);
  const settingsKey = JSON.stringify(resolved);
  // 저장된 결과를 그리는 동안은 같은 설정으로 다시 요청하지 않습니다. 설정이 바뀌면 새로 만듭니다.
  const loadedKeyRef = useRef<string | null>(usableInitial ? settingsKey : null);

  useEffect(() => {
    if (loadedKeyRef.current === settingsKey) return;
    loadedKeyRef.current = null;
    const controller = new AbortController();
    setState({ status: "loading" });
    const run = async () => {
      try {
        const body = JSON.stringify(
          courseRequestFromSetup(subject, setup, isSignedIn ? { learningStyle: "concept", existingConceptNames: existingConceptNames() } : { existingConceptNames: existingConceptNames() }),
        );
        const init = { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal };
        const response = isSignedIn ? await authorizedFetch("/api/ai/analyze-subject", init) : await fetch("/api/ai/preview-course", init);
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
          setState({ status: "error", message: "과정을 만들려면 로그인해 주세요.", limited: true });
          return;
        }
        if (response.status === 429) {
          setState({ status: "error", message: "오늘 볼 수 있는 미리보기를 모두 썼어요. 로그인하면 이어서 만들 수 있어요.", limited: true });
          return;
        }
        if (!response.ok) throw new Error("preview_unavailable");
        const data = (await response.json()) as Record<string, any>;
        const curriculum = unwrapCurriculum(data);
        if (!curriculum || validateCurriculumPayload(curriculum).length > 0) throw new Error("preview_invalid");
        if (controller.signal.aborted) return;
        setState({ status: "ready", data });
        onReadyRef.current?.(data, setup);
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: "과정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", limited: false });
      }
    };
    void run();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, isSignedIn, attempt, settingsKey]);

  const built = useMemo(
    () => (state.status === "ready" ? buildCourseFromPayload(state.data, subject, resolved) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, subject, settingsKey],
  );
  const lessonCount = built ? built.course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0) : 0;

  const handleStart = () => {
    if (state.status !== "ready" || !built || startedRef.current) return;
    if (!isSignedIn) {
      onGuestStart(subject, state.data, setup);
      return;
    }
    startedRef.current = true;
    onStart(built.course, built.links);
  };

  const applyDraft = () => {
    setSetup(draft);
    setEditing(false);
  };

  return (
    <section aria-label={`‘${subject}’ 과목 미리보기`} className="w-full overflow-hidden rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] shadow-[var(--lh-shadow-md)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--lh-line)] px-4 py-2.5">
        <p className="min-w-0 truncate text-xs text-[var(--lh-ink-secondary)]">{summarizeCourseSetup(resolved)}</p>
        <button
          type="button"
          onClick={() => { setDraft(setup); setEditing((open) => !open); }}
          aria-expanded={editing}
          className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--lh-primary-text)] transition hover:bg-[var(--lh-primary-subtle)] cursor-pointer"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" /> 수정
        </button>
      </div>

      {editing && (
        <div className="space-y-3 border-b border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-3">
          {EDIT_STEPS.map((stepId) => {
            const step = SETUP_STEPS[stepId];
            return (
              <div key={stepId} role="group" aria-label={step.question?.(subject)} className="space-y-1.5">
                <p className="text-xs font-medium text-[var(--lh-ink-secondary)]">{step.question?.(subject)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {step.options.map((option) => {
                    const selected = isSelected(draft, option);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDraft((previous) => ({ ...previous, ...option.value }))}
                        className={`min-h-8 rounded-full border px-3 text-xs font-medium transition cursor-pointer ${selected ? "border-[var(--lh-primary)] bg-[var(--lh-primary)] text-white" : "border-[var(--lh-line-strong)] bg-[var(--lh-surface)] text-[var(--lh-ink)] hover:border-[var(--lh-primary-border)]"}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-full px-4 text-xs font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface)] cursor-pointer">취소</button>
            <button type="button" onClick={applyDraft} className="min-h-9 rounded-full bg-[var(--lh-primary)] px-4 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">이 설정으로 다시 만들기</button>
          </div>
        </div>
      )}

      {state.status === "loading" && (
        <div role="status" className="flex flex-col items-center gap-3 px-5 py-12 text-sm text-[var(--lh-ink-secondary)]">
          <Loader2 aria-hidden className="h-5 w-5 animate-spin text-[var(--lh-primary)]" />
          <span>‘{subject}’ 과정을 구성하고 있어요…</span>
        </div>
      )}
      {state.status === "error" && (
        <div role="alert" className="space-y-3 p-5">
          <p className="text-sm text-[var(--lh-ink)]">{state.message}</p>
          {state.limited ? (
            <button type="button" onClick={onRequestAuth} className="rounded-full bg-[var(--lh-primary)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">로그인하기</button>
          ) : (
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-full border border-[var(--lh-line-strong)] px-4 py-2 text-xs font-medium transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">다시 시도하기</button>
          )}
        </div>
      )}
      {built && (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="space-y-1.5">
            <h3 className="text-lg font-medium leading-snug tracking-tight text-[var(--lh-ink)]">{built.course.title}</h3>
            {built.course.summary && <p className="text-base leading-[1.75] text-[var(--lh-ink-secondary)]">{built.course.summary}</p>}
            <p className="text-sm text-[var(--lh-ink-tertiary)]">{built.course.chapters.length}단계 · 레슨 {lessonCount}개 · 하루 {resolved.dailyMinutes}분</p>
          </div>

          {expanded && (
            <ol id="course-steps" className="space-y-3">
              {built.course.chapters.map((chapter, index) => (
                <li key={chapter.id} className="rounded-2xl border border-[var(--lh-line)] p-4">
                  <p className="flex items-center gap-2.5 text-base font-medium text-[var(--lh-ink)]">
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-xs font-medium text-white">{index + 1}</span>
                    {chapter.title}
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-10 text-[15px] leading-6 text-[var(--lh-ink-secondary)]">
                    {chapter.lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}
                  </ul>
                </li>
              ))}
            </ol>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--lh-line)] pt-3">
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              aria-controls="course-steps"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-5 text-[15px] font-medium text-[var(--lh-ink)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
            >
              {expanded ? "접기" : "단계 살펴보기"} <ChevronDown aria-hidden className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
            </button>
            <button type="button" onClick={handleStart} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-[15px] font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">
              이 과정으로 시작하기 <ArrowRight aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
