import React, { useState, useEffect } from "react";
import { Course, LessonMeta, LessonContent } from "../../types/learning";
import { notifyLearningDataChanged, StorageService } from "../../services/storage";
import type { AccessTokenGetter } from "../../services/contentReports";
import { authorizedFetch } from "../../services/authClient";
import { validateLessonPayload } from "../../domain/contentValidation";
import { getLearningSupport } from "../../domain/learningSupport";
import { createFallbackLessonContent } from "../../domain/lessonFallback";
import { ContentReportDialog } from "../ContentReportDialog";
import { RichLessonRenderer } from "./RichLessonRenderer";
import { LessonCompletionModal } from "./LessonCompletionModal";
import { courseIsComplete } from "../../domain/assessment";
import {
  Award,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";

interface NotionLessonCanvasProps {
  course: Course;
  lessonMeta: LessonMeta;
  chapterTitle: string;
  onOpenTutorWithText?: (quote: string) => void;
  onFinishLesson: (metadata?: { kind: "read_only"; courseId: string; lessonId: string }) => void;
  onGoHome?: () => void;
  onStartNextLesson?: (nextCourse: Course, nextLesson: LessonMeta, chapterTitle: string) => void;
  getAccessToken?: AccessTokenGetter;
  onGoCourse?: () => void;
  onStartAssessment?: () => void;
  onBackToAssessment?: () => void;
}

const LEGACY_FALLBACK_MARKERS = [
  "평균변화율에서 순간변화율로의 기하학적 도약",
  "함수 f(x) = x²의 x = 4에서의 순간변화율",
];

const isUsableLessonContent = (
  candidate: LessonContent | null,
  courseId: string,
  lessonId: string,
  learningType: Course["learningType"],
) => {
  if (!candidate || candidate.courseId !== courseId || candidate.lessonId !== lessonId) return false;
  if (validateLessonPayload(candidate, learningType, { requireLearningArc: true }).length > 0) return false;
  return !candidate.steps.some((step) =>
    LEGACY_FALLBACK_MARKERS.some((marker) => `${step.title}\n${step.content}`.includes(marker))
  );
};

const removeDialogueExamples = (text: string) => {
  const lines = text.split("\n");
  let removingList = false;
  return lines
    .filter((line) => {
      const trimmed = line.trim();
      const isDialogueLabel = /^(?:실전\s*)?(?:발음|대화|회화)(?:\s*(?:예시|표현))?\s*:?$/u.test(trimmed) || /^텍스트\s*읽기\s*:?$/u.test(trimmed);
      if (isDialogueLabel) {
        removingList = true;
        return false;
      }
      if (removingList && (!trimmed || /^(?:[-*•]|\d+[.)])\s+/u.test(trimmed))) return false;
      removingList = false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
};

const cleanSupplementaryTitle = (title: string) => {
  const cleaned = title
    .replace(/\s+(?:및|그리고|과|와)\s+(?:실전\s*)?(?:발음|대화|회화)(?:\s*(?:예시|표현))?/gu, "")
    .replace(/\s+(?:실전\s*)?(?:발음|대화|회화)(?:\s*(?:예시|표현))?/gu, "")
    .trim();
  return cleaned === title ? cleaned : cleaned.replace(/(?:및|그리고|과|와)\s*$/u, "").trim();
};

const removeSupplementarySteps = (lesson: LessonContent): LessonContent => ({
  ...lesson,
  steps: lesson.steps
    .filter((step) => step.type !== "quiz")
    .map(({ audioScript: _audioScript, quiz: _quiz, ...step }) => ({
      ...step,
      title: cleanSupplementaryTitle(step.title),
      content: removeDialogueExamples(step.content),
    }))
    .filter((step) => step.title && step.content),
});

export const NotionLessonCanvas: React.FC<NotionLessonCanvasProps> = ({
  course,
  lessonMeta,
  chapterTitle,
  onOpenTutorWithText,
  onFinishLesson,
  onGoHome,
  onStartNextLesson,
  getAccessToken,
  onGoCourse,
  onStartAssessment,
  onBackToAssessment,
}) => {
  const [content, setContent] = useState<LessonContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFallbackContent, setIsFallbackContent] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isCompleted, setIsCompleted] = useState(lessonMeta.isCompleted);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionSaveStatus, setCompletionSaveStatus] = useState<"saved" | "error" | "idle">("idle");
  const [reportStepId, setReportStepId] = useState<string | null>(null);
  const [showSupportDetails, setShowSupportDetails] = useState(false);
  const [practiceResponses, setPracticeResponses] = useState<Record<string, string>>({});
  const [practiceSaveError, setPracticeSaveError] = useState(false);

  const [selectedText, setSelectedText] = useState("");
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const practiceStorageKey = `learnhub_practice_${encodeURIComponent(course.id)}_${encodeURIComponent(lessonMeta.id)}`;
  const lessonSupport = getLearningSupport(course.learningType);
  const primaryLimitation = lessonSupport.notSupported.find((item) => item.includes("코드") || item.includes("음성")) || lessonSupport.notSupported[0];
  const latestCourse = StorageService.getCourseById(course.id) || course;
  const allLessons = latestCourse.chapters.flatMap((chapter) => chapter.lessons);
  const lessonPosition = allLessons.findIndex((lesson) => lesson.id === lessonMeta.id) + 1;
  const allCompleted = courseIsComplete(latestCourse);
  const [completionCourseCompleted, setCompletionCourseCompleted] = useState(allCompleted);

  useEffect(() => {
    setPracticeResponses({});
    setPracticeSaveError(false);
    try {
      const raw = localStorage.getItem(practiceStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setPracticeResponses(Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => typeof value === "string")
        ));
      }
    } catch {
      setPracticeSaveError(true);
    }
  }, [practiceStorageKey]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadLesson() {
      setIsLoading(true);
      setLoadError(null);
      setIsFallbackContent(false);
      setContent(null);

      const cached = StorageService.getCachedLessonContent(lessonMeta.id);
      if (isUsableLessonContent(cached, course.id, lessonMeta.id, course.learningType)) {
        const visibleCached = removeSupplementarySteps(cached);
        if (validateLessonPayload(visibleCached, course.learningType, { requireLearningArc: true }).length === 0) {
          setContent(visibleCached);
          setIsLoading(false);
          return;
        }
      }

      try {
        const res = await authorizedFetch("/api/ai/generate-lesson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseTitle: course.title,
            chapterTitle,
            lessonTitle: lessonMeta.title,
            learningType: course.learningType,
            level: course.level,
            conceptId: lessonMeta.conceptId,
            conceptName: lessonMeta.conceptName,
          }),
          signal: controller.signal,
        });

        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
          throw new Error("로그인 후 새 AI 학습 내용을 불러올 수 있습니다.");
        }
        if (!res.ok) throw new Error(`lesson_request_${res.status}`);
        const data = await res.json();
        const validationErrors = validateLessonPayload(data, course.learningType, { requireLearningArc: true });
        if (validationErrors.length > 0) throw new Error(`invalid_lesson_content:${validationErrors[0]}`);
        const loaded: LessonContent = {
          id: `content-${lessonMeta.id}`,
          lessonId: lessonMeta.id,
          courseId: course.id,
          title: data.title || lessonMeta.title,
          steps: (data.steps || []).map((s: any, idx: number) => ({
            id: `step-${idx}`,
            type: s.type || "concept",
            title: s.title || `단계 ${idx + 1}`,
            content: s.content || "",
            codeSnippet: s.codeSnippet,
          })),
        };
        const visibleLesson = removeSupplementarySteps(loaded);
        if (validateLessonPayload(visibleLesson, course.learningType, { requireLearningArc: true }).length > 0) {
          throw new Error("invalid_lesson_content:학습 흐름이 충분하지 않습니다.");
        }
        StorageService.cacheLessonContent(lessonMeta.id, visibleLesson);
        if (!cancelled) {
          setIsFallbackContent(false);
          setContent(visibleLesson);
        }
      } catch (error) {
        if (!cancelled) {
          // Keep the learner moving with curriculum-grounded content. The
          // fallback is not cached, so a later retry can still fetch the full
          // AI lesson when the provider is healthy again.
          setContent(createFallbackLessonContent(course, lessonMeta, chapterTitle));
          setIsFallbackContent(true);
          setLoadError(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadLesson();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [course.id, course.level, course.learningType, chapterTitle, lessonMeta.id, lessonMeta.title, lessonMeta.conceptId, lessonMeta.conceptName, loadAttempt]);

  // Handle text selection for floating AI tooltip
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setTooltipPos(null);
      return;
    }
    const text = selection.toString().trim();
    if (text.length > 2) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
    } else {
      setTooltipPos(null);
    }
  };

  const handleTriggerTutorForSelection = () => {
    if (selectedText && onOpenTutorWithText) {
      onOpenTutorWithText(selectedText);
      setTooltipPos(null);
    }
  };

  const updatePracticeResponse = (stepId: string, value: string) => {
    const next = { ...practiceResponses, [stepId]: value };
    setPracticeResponses(next);
    try {
      localStorage.setItem(practiceStorageKey, JSON.stringify(next));
      notifyLearningDataChanged();
      setPracticeSaveError(false);
    } catch {
      setPracticeSaveError(true);
    }
  };

  const lessonEntries = latestCourse.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ course: latestCourse, lesson, chapterTitle: chapter.title })));
  const currentLessonIndex = lessonEntries.findIndex((entry) => entry.lesson.id === lessonMeta.id);
  const previousLesson = currentLessonIndex > 0 ? lessonEntries[currentLessonIndex - 1] : null;
  const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < lessonEntries.length - 1
    ? lessonEntries[currentLessonIndex + 1]
    : null;

  const markCurrentLessonComplete = () => {
    if (isCompleted) return true;
    const saved = StorageService.markLessonCompleted(course.id, lessonMeta.id);
    if (!saved) {
      setCompletionSaveStatus("error");
      return false;
    }
    setCompletionSaveStatus("saved");
    setIsCompleted(true);
    onFinishLesson({ kind: "read_only", courseId: course.id, lessonId: lessonMeta.id });
    return true;
  };

  const handlePreviousLesson = () => {
    if (previousLesson && onStartNextLesson) {
      onStartNextLesson(previousLesson.course, previousLesson.lesson, previousLesson.chapterTitle);
    }
  };

  const handleNextLesson = () => {
    if (!markCurrentLessonComplete()) return;
    if (nextLesson && onStartNextLesson) {
      onStartNextLesson(nextLesson.course, nextLesson.lesson, nextLesson.chapterTitle);
      return;
    }

    const savedCourse = StorageService.getCourseById(course.id) || course;
    setCompletionCourseCompleted(courseIsComplete(savedCourse));
    setIsCompletionModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center space-y-3 text-[var(--lh-ink-secondary)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--lh-primary)]" />
        <span className="text-sm font-medium">레슨을 준비하는 중...</span>
      </div>
    );
  }

  if (loadError || !content) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-[560px] flex-col items-center justify-center gap-4 px-4 text-center text-[var(--lh-ink-secondary)]">
        <AlertTriangle className="h-6 w-6 text-[var(--lh-secondary)]" />
        <div>
          <h2 className="text-lg font-medium text-[var(--lh-ink)]">레슨을 준비하지 못했습니다</h2>
          <p className="mt-2 text-sm leading-relaxed">{loadError || "현재 과목의 레슨 내용이 비어 있습니다."}</p>
        </div>
        <button
          type="button"
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          className="min-h-11 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-6 text-sm font-medium text-white cursor-pointer shadow-xs transition"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div
      onMouseUp={handleMouseUp}
      className="relative mx-auto w-full max-w-[760px] overflow-x-hidden px-5 pb-36 pt-12 text-base leading-relaxed text-[var(--lh-ink)] select-text sm:px-8"
    >
      {/* Floating Selection Tooltip (AI Bubble in Dynamic Primary) */}
      {tooltipPos && (
        <div
          style={{ top: `${tooltipPos.y + window.scrollY - 36}px`, left: `${tooltipPos.x}px` }}
          className="fixed -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-full bg-[var(--lh-primary)] px-3.5 py-1.5 text-white shadow-xl text-xs animate-fade-in cursor-pointer hover:bg-[var(--lh-primary-hover)] transition"
          onClick={handleTriggerTutorForSelection}
        >
          <Sparkles className="h-3.5 w-3.5 text-white" />
          <span className="font-medium">선택 문장 AI에게 질문하기</span>
        </div>
      )}

      {/* 1. Lesson title */}
      <div className="space-y-4 border-b border-[var(--lh-line)] pb-8">
        {isFallbackContent && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-3 text-xs text-[var(--lh-ink-secondary)]">
            <span>AI 레슨을 불러오지 못해 기본 학습 흐름으로 먼저 열었습니다. 완료 기록은 계속 남길 수 있어요.</span>
            <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="shrink-0 font-medium text-[var(--lh-primary)] underline underline-offset-2">AI 레슨 다시 불러오기</button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--lh-ink-secondary)]">
          <button type="button" onClick={onBackToAssessment || onGoCourse || onGoHome} className="min-h-10 underline underline-offset-4">{onBackToAssessment ? "← 풀이 결과로 돌아가기" : "← 전체 커리큘럼"}</button>
          <span>{lessonPosition} / {allLessons.length} 레슨</span>
        </div>
        <h1 className="text-3xl font-medium tracking-[-0.03em] text-[var(--lh-ink)] sm:text-4xl">
          {lessonMeta.title}
        </h1>

        {/* Lesson context */}
        <div className="grid grid-cols-1 gap-2 border-t border-[var(--lh-line)] pt-4 text-xs sm:grid-cols-3">
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">소속 챕터</span>
            <span className="mt-1 block font-medium text-[var(--lh-ink)]">{chapterTitle}</span>
          </div>
          <div>
            <span className="block text-[10px] font-medium text-[var(--lh-ink-tertiary)]">이번에 배울 개념</span>
            <span className="mt-1 block text-[var(--lh-ink)]">{lessonMeta.conceptName}</span>
          </div>
          <div>
            <span className="block text-[10px] font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">학습 상태</span>
            <span className="mt-1 block font-medium text-[var(--lh-ink)]">{isCompleted ? "완료됨" : "학습 중"}</span>
          </div>
        </div>
      </div>

      {/* 2. Learning contract */}
      <div className="mt-8 space-y-8 leading-relaxed">
        <div className="space-y-2 border-b border-[var(--lh-line)] pb-8 text-sm text-[var(--lh-ink)]">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
            {lessonSupport.label} · 이번 레슨의 목표
          </span>
          <p className="text-base font-medium text-[var(--lh-ink)]">{lessonSupport.successCriteria[0]}</p>
          <button
            type="button"
            onClick={() => setShowSupportDetails((open) => !open)}
            className="pt-1 text-xs font-medium text-[var(--lh-ink-secondary)] underline hover:text-[var(--lh-ink)] cursor-pointer"
          >
            {showSupportDetails ? "상세 기준 접기" : "학습 방식 상세 보기"}
          </button>
          {showSupportDetails && (
            <div className="space-y-2 border-t border-[var(--lh-line)] pt-3 text-xs text-[var(--lh-ink-secondary)]">
              <p>가능 범위: {primaryLimitation}</p>
              <p>바로 해볼 일: {lessonSupport.adultTaskSuggestions[0]}</p>
              <p>추가 성공 기준: {lessonSupport.successCriteria[1]}</p>
              <p>지원하는 방식: {lessonSupport.supported[0]}</p>
            </div>
          )}
        </div>

        {/* Steps Blocks */}
        {content?.steps.map((step, stepIndex) => (
          <div key={`${step.id}-${stepIndex}`} className="group relative space-y-4">
            <h2 className="text-xl font-medium tracking-tight text-[var(--lh-ink)] sm:text-2xl">
              {step.title}
            </h2>

            <RichLessonRenderer content={step.content} />

            {step.codeSnippet && (
              <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 space-y-2 shadow-xs">
                <div className="text-xs font-medium text-[var(--lh-ink-secondary)]">코드 예시 · 실행하지 않는 참고용 텍스트</div>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-[var(--lh-surface)] p-3 font-mono text-xs leading-relaxed text-[var(--lh-ink)] border border-[var(--lh-line)]"><code>{step.codeSnippet}</code></pre>
              </div>
            )}

            {step.type === "practice" && (
              <div className="space-y-2 border-l-2 border-[var(--lh-primary-border)] pl-4">
                <label htmlFor={`practice-${step.id}`} className="text-xs font-medium text-[var(--lh-ink-secondary)]">
                  직접 적어보세요
                </label>
                <textarea
                  id={`practice-${step.id}`}
                  rows={4}
                  maxLength={2000}
                  value={practiceResponses[step.id] || ""}
                  onChange={(event) => updatePracticeResponse(step.id, event.target.value)}
                  placeholder="답이나 풀이 과정을 내 말로 간단히 적어보세요."
                  className="w-full resize-y rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3 text-sm leading-relaxed text-[var(--lh-ink)] placeholder-[var(--lh-ink-tertiary)] transition focus:border-[var(--lh-primary)] focus:bg-[var(--lh-surface)] focus:outline-none"
                />
                <p className="text-[11px] text-[var(--lh-ink-tertiary)]">
                  {practiceSaveError ? "저장하지 못했어요. 작성한 내용은 이 화면에서만 유지됩니다." : "작성한 내용은 이 기기에 저장됩니다. 자동 채점하지 않아요."}
                </p>
              </div>
            )}

            {/* Effortless 1-Click AI Explanation Chip */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() =>
                  onOpenTutorWithText?.(
                    `"${step.title}" 내용이 조금 어려워요. 초등학생이나 비전공자도 단번에 이해할 수 있게 쉬운 비유와 일상 예시로 친절하게 설명해 주세요.`
                  )
                }
                className="inline-flex items-center gap-2 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-4 py-2 text-xs font-medium text-[var(--lh-primary-text)] shadow-xs hover:bg-[var(--lh-primary)] hover:text-white transition cursor-pointer group"
              >
                <Sparkles className="h-4 w-4 text-[var(--lh-primary)] group-hover:text-white transition" />
                <span>이 부분 쉬운 예시로 설명해줘</span>
              </button>
              <button
                type="button"
                onClick={() => setReportStepId(step.id)}
                className="text-xs text-[var(--lh-ink-tertiary)] underline hover:text-[var(--lh-ink)] cursor-pointer"
              >
                내용 오류 신고
              </button>
            </div>

          </div>
        ))}

        {/* 3. Page Footer Navigation */}
        <div className="mt-12 flex items-center justify-between gap-3 border-t border-[var(--lh-line)] pt-8">
          {previousLesson && onStartNextLesson ? (
            <button
              type="button"
              onClick={handlePreviousLesson}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-5 text-sm font-medium text-[var(--lh-ink-secondary)] shadow-xs transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>이전</span>
            </button>
          ) : <span />}

          <button
            type="button"
            onClick={handleNextLesson}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white shadow-xs transition hover:bg-[var(--lh-primary-hover)] cursor-pointer"
          >
            <span>{nextLesson ? "다음" : "학습 완료"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {completionSaveStatus === "error" && (
          <p className="mt-2 text-right text-xs text-[var(--lh-danger)]">
            레슨 완료 기록을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.
          </p>
        )}

      </div>

      {/* Comprehensive Lesson Completion Modal */}
      <LessonCompletionModal
        isOpen={isCompletionModalOpen}
        onClose={() => setIsCompletionModalOpen(false)}
        courseTitle={course.title}
        lessonTitle={lessonMeta.title}
        savedStatus={completionSaveStatus === "saved" ? "saved" : completionSaveStatus === "error" ? "error" : "pending"}
        nextLesson={nextLesson}
        onStartNextLesson={
          onStartNextLesson && nextLesson
            ? () => {
                const next = nextLesson;
                onStartNextLesson(next.course, next.lesson, next.chapterTitle);
              }
            : undefined
        }
        onGoHome={onGoHome || onFinishLesson}
        courseCompleted={completionCourseCompleted}
        onStartAssessment={onStartAssessment}
      />
      <ContentReportDialog
        isOpen={reportStepId !== null}
        onClose={() => setReportStepId(null)}
        courseId={course.id}
        lessonId={lessonMeta.id}
        stepId={reportStepId || undefined}
        getAccessToken={getAccessToken}
      />
    </div>
  );
};
