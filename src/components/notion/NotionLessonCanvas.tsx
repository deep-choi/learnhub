import React, { useState, useEffect, useRef } from "react";
import { Course, LessonMeta, LessonContent, QuizData } from "../../types/learning";
import { StorageService } from "../../services/storage";
import type { AccessTokenGetter } from "../../services/contentReports";
import { authorizedFetch } from "../../services/authClient";
import { validateLessonPayload } from "../../domain/contentValidation";
import { getLearningSupport } from "../../domain/learningSupport";
import { ContentReportDialog } from "../ContentReportDialog";
import { RichLessonRenderer } from "./RichLessonRenderer";
import { LessonCompletionModal } from "./LessonCompletionModal";
import {
  Award,
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageSquare,
  Sparkles,
  Tag,
  Target,
  XCircle,
} from "lucide-react";

interface NotionLessonCanvasProps {
  course: Course;
  lessonMeta: LessonMeta;
  chapterTitle: string;
  onOpenTutorWithText?: (quote: string) => void;
  onFinishLesson: (metadata?: { kind: "read_only" | "quiz_checked"; courseId: string; lessonId: string }) => void;
  onGoHome?: () => void;
  onStartNextLesson?: (nextCourse: Course, nextLesson: LessonMeta, chapterTitle: string) => void;
  getAccessToken?: AccessTokenGetter;
}

type QuizResultStatus = "correct" | "incorrect" | "pending" | "unknown";

interface QuizResult {
  status: QuizResultStatus;
  isCorrect?: boolean;
  feedback: string;
  hint?: string;
  misconceptionTag?: string;
}

const LEGACY_FALLBACK_MARKERS = [
  "평균변화율에서 순간변화율로의 기하학적 도약",
  "함수 f(x) = x²의 x = 4에서의 순간변화율",
];

const isUsableLessonContent = (
  candidate: LessonContent | null,
  courseId: string,
  lessonId: string
) => {
  if (!candidate || candidate.courseId !== courseId || candidate.lessonId !== lessonId) return false;
  if (validateLessonPayload(candidate).length > 0) return false;
  return !candidate.steps.some((step) =>
    LEGACY_FALLBACK_MARKERS.some((marker) => `${step.title}\n${step.content}`.includes(marker))
  );
};

export const NotionLessonCanvas: React.FC<NotionLessonCanvasProps> = ({
  course,
  lessonMeta,
  chapterTitle,
  onOpenTutorWithText,
  onFinishLesson,
  onGoHome,
  onStartNextLesson,
  getAccessToken,
}) => {
  const [content, setContent] = useState<LessonContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [stepId: string]: string }>({});
  const [quizResults, setQuizResults] = useState<{ [stepId: string]: QuizResult }>({});
  const [quizHints, setQuizHints] = useState<{ [stepId: string]: string }>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(lessonMeta.isCompleted);
  const [showQuizWarningModal, setShowQuizWarningModal] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionKind, setCompletionKind] = useState<"read_only" | "quiz_checked">("read_only");
  const [reviewScheduleStatus, setReviewScheduleStatus] = useState<"scheduled" | "not_scheduled" | "unavailable">("unavailable");
  const [completionSaveStatus, setCompletionSaveStatus] = useState<"saved" | "error" | "idle">("idle");
  const [noteText, setNoteText] = useState("");
  const [noteSaveStatus, setNoteSaveStatus] = useState<"saved" | "error" | "idle">("idle");
  const [reportStepId, setReportStepId] = useState<string | null>(null);
  const [showSupportDetails, setShowSupportDetails] = useState(false);
  const activeEvaluationIds = useRef(new Set<string>());
  const lessonKey = `${course.id}:${lessonMeta.id}`;
  const lessonKeyRef = useRef(lessonKey);

  // Floating selection tooltip state
  const [selectedText, setSelectedText] = useState("");
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const noteStorageKey = `learnhub_note_${encodeURIComponent(course.id)}_${encodeURIComponent(lessonMeta.id)}`;
  const lessonSupport = getLearningSupport(course.learningType);
  const primaryLimitation = lessonSupport.notSupported.find((item) => item.includes("코드") || item.includes("음성")) || lessonSupport.notSupported[0];

  useEffect(() => {
    lessonKeyRef.current = lessonKey;
    activeEvaluationIds.current.clear();
  }, [lessonKey]);

  useEffect(() => {
    try {
      setNoteText(localStorage.getItem(noteStorageKey) || "");
      setNoteSaveStatus(localStorage.getItem(noteStorageKey) ? "saved" : "idle");
    } catch {
      setNoteSaveStatus("error");
    }
  }, [noteStorageKey]);

  useEffect(() => {
    if (!showQuizWarningModal) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowQuizWarningModal(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showQuizWarningModal]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadLesson() {
      setIsLoading(true);
      setLoadError(null);
      setContent(null);
      setQuizResults({});
      setQuizHints({});
      setUserAnswers({});

      const cached = StorageService.getCachedLessonContent(lessonMeta.id);
      if (isUsableLessonContent(cached, course.id, lessonMeta.id)) {
        setContent(cached);
        setIsLoading(false);
        return;
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
        const validationErrors = validateLessonPayload(data, course.learningType);
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
            audioScript: s.audioScript,
            quiz: s.quiz,
          })),
        };
        StorageService.cacheLessonContent(lessonMeta.id, loaded);
        if (!cancelled) setContent(loaded);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error && error.message.startsWith("로그인 후")
            ? error.message
            : "이 레슨 내용을 불러오지 못했습니다. 현재 과목의 내용은 바뀌지 않았어요.");
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

  const recordScoredAnswer = (stepId: string, quiz: QuizData, userAns: string, data: any) => {
    const answerKey = userAns.normalize("NFC").replace(/\s+/gu, " ").trim();
    const attemptId = `${course.id}:${lessonMeta.id}:${stepId}:${answerKey}`;
    StorageService.recordQuizAnswer(
      course.id,
      course.title,
      lessonMeta.conceptId,
      lessonMeta.conceptName,
      data.isCorrect,
      attemptId
    );

    if (!data.isCorrect) {
      StorageService.addMistake({
        id: `mistake-${course.id}-${lessonMeta.id}-${stepId}`,
        conceptId: lessonMeta.conceptId,
        concept: lessonMeta.conceptName,
        courseId: course.id,
        course: course.title,
        lessonId: lessonMeta.id,
        question: quiz.question,
        wrongAnswer: userAns,
        correctAnswer: quiz.answer,
        misconceptionTag: (data.misconceptionTag as any) || "개념 미숙",
        explanation: data.explanation || quiz.explanation || "개념 적용 중 오류 발생",
        hint: data.hint,
        date: new Date().toISOString().split("T")[0],
        isResolved: false,
      });
    }
  };

  const handleEvaluateQuiz = async (stepId: string, quiz: QuizData) => {
    const userAns = userAnswers[stepId] || "";
    if (!userAns.trim()) return;

    const answerKey = userAns.normalize("NFC").replace(/\s+/gu, " ").trim();
    const attemptId = `${course.id}:${lessonMeta.id}:${stepId}:${answerKey}`;
    const evaluationLessonKey = lessonKeyRef.current;
    if (activeEvaluationIds.current.has(attemptId)) return;
    activeEvaluationIds.current.add(attemptId);

    setIsEvaluating(true);
    try {
      const res = await authorizedFetch("/api/ai/evaluate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptName: lessonMeta.conceptName,
          question: quiz.question,
          userAnswer: userAns,
          expectedAnswer: quiz.answer,
          quizType: quiz.quizType,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (lessonKeyRef.current !== evaluationLessonKey) return;
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("로그인 후 AI 채점을 사용할 수 있습니다.");
      }
      if (!res.ok || data.status === "pending") {
        throw new Error("evaluation_pending");
      }
      if (data.status === "unknown" || typeof data.isCorrect !== "boolean") {
        setQuizResults((prev) => ({
          ...prev,
          [stepId]: {
            status: "unknown",
            feedback: data.feedback || "답안을 확실히 판정하기 어려워 오답으로 기록하지 않았습니다. 다른 표현으로 다시 제출해 보세요.",
            hint: data.hint,
          },
        }));
        return;
      }
      setQuizResults((prev) => ({
        ...prev,
        [stepId]: {
          status: data.isCorrect ? "correct" : "incorrect",
          isCorrect: data.isCorrect,
          feedback: data.feedback || (data.isCorrect ? "정답입니다." : "오답입니다. 다시 시도해 보세요."),
          hint: data.hint,
          misconceptionTag: data.misconceptionTag,
        },
      }));
      recordScoredAnswer(stepId, quiz, userAns, data);
    } catch {
      if (lessonKeyRef.current === evaluationLessonKey) {
        setQuizResults((prev) => ({
          ...prev,
          [stepId]: {
            status: "pending",
            feedback: "채점 서버가 응답하지 않았습니다. 답안은 오답으로 기록하지 않았어요. 다시 시도해 주세요.",
          },
        }));
      }
    } finally {
      activeEvaluationIds.current.delete(attemptId);
      setIsEvaluating(false);
    }
  };

  const getNextLesson = () => {
    let foundCurrent = false;
    for (const chapter of course.chapters) {
      for (const lesson of chapter.lessons) {
        if (foundCurrent) {
          return { course, lesson, chapterTitle: chapter.title };
        }
        if (lesson.id === lessonMeta.id) {
          foundCurrent = true;
        }
      }
    }
    return null;
  };

  const handleCompleteLesson = () => {
    const quizSteps = (content?.steps || []).filter((s) => s.quiz);
    const incompleteCount = quizSteps.filter((step) => {
      const result = quizResults[step.id];
      return !result || result.status === "pending" || result.status === "unknown";
    }).length;

    if (incompleteCount > 0) {
      setShowQuizWarningModal(true);
      return;
    }

    executeCompletion(quizSteps.length > 0 ? "quiz_checked" : "read_only");
  };

  const executeCompletion = (kind: "read_only" | "quiz_checked") => {
    setShowQuizWarningModal(false);
    const saved = StorageService.markLessonCompleted(course.id, lessonMeta.id);
    if (!saved) {
      setCompletionSaveStatus("error");
      return;
    }
    setCompletionSaveStatus("saved");
    const quizCount = (content?.steps || []).filter((step) => step.quiz).length;
    if (quizCount === 0) {
      setReviewScheduleStatus("not_scheduled");
    } else if (content) {
      try {
        setReviewScheduleStatus(StorageService.scheduleLessonReviews(course, lessonMeta, content) ? "scheduled" : "not_scheduled");
      } catch {
        setReviewScheduleStatus("not_scheduled");
      }
    } else {
      setReviewScheduleStatus("unavailable");
    }
    setCompletionKind(kind);
    setIsCompleted(true);
    setIsCompletionModalOpen(true);
    onFinishLesson({ kind, courseId: course.id, lessonId: lessonMeta.id });
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

      {/* 1. Notion Page Icon & Title */}
      <div className="space-y-4 border-b border-[var(--lh-line)] pb-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lh-ink)] text-white"><BookOpen className="h-5 w-5" /></span>
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-2 py-0.5 text-[11px] font-medium text-[var(--lh-ink-secondary)]">
              {course.subject}
            </span>
            <span className="text-[11px] text-[var(--lh-ink-tertiary)]">약 {lessonMeta.estimatedMinutes}분 소요</span>
          </div>
        </div>

        <h1 className="text-3xl font-medium tracking-[-0.03em] text-[var(--lh-ink)] sm:text-4xl">
          {lessonMeta.title}
        </h1>

        {/* M3 Property Card */}
        <div className="space-y-2 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 text-xs">
          <div className="flex items-center gap-4 text-[var(--lh-ink-secondary)]">
            <span className="w-24 shrink-0 font-medium uppercase tracking-wider text-[10px] text-[var(--lh-ink-tertiary)]">소속 챕터</span>
            <span className="text-[var(--lh-ink)] font-medium">{chapterTitle}</span>
          </div>
          <div className="flex items-center gap-4 text-[var(--lh-ink-secondary)]">
            <span className="w-24 shrink-0 font-medium uppercase tracking-wider text-[10px] text-[var(--lh-ink-tertiary)]">핵심 개념 ID</span>
            <span className="font-mono text-xs text-[var(--lh-ink)]">{lessonMeta.conceptId}</span>
          </div>
          <div className="flex items-center gap-4 text-[var(--lh-ink-secondary)]">
            <span className="w-24 shrink-0 font-medium uppercase tracking-wider text-[10px] text-[var(--lh-ink-tertiary)]">학습 완결 상태</span>
            <span className="inline-flex items-center rounded-full bg-[var(--lh-surface)] px-2.5 py-0.5 font-medium text-[var(--lh-ink)] border border-[var(--lh-line)] shadow-xs">
              {isCompleted ? "완료됨" : "학습 중"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Learning contract: M3 Target Card */}
      <div className="mt-8 space-y-8 leading-relaxed">
        <div className="group relative flex items-start gap-4 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 shadow-xs text-sm text-[var(--lh-ink)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lh-surface-subtle)] text-[var(--lh-ink)]">
            <Target className="h-5 w-5" />
          </span>
          <div className="space-y-1.5 flex-1">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
              {lessonSupport.label} · 이번 레슨의 목표
            </span>
            <p className="text-base font-medium text-[var(--lh-ink)]">{lessonSupport.successCriteria[0]}</p>
            <p className="text-xs text-[var(--lh-ink-secondary)]">가능 범위: {primaryLimitation}</p>
            <button
              type="button"
              onClick={() => setShowSupportDetails((open) => !open)}
              className="pt-1 text-xs font-medium text-[var(--lh-ink-secondary)] underline hover:text-[var(--lh-ink)] cursor-pointer"
            >
              {showSupportDetails ? "상세 기준 접기" : "학습 방식 상세 보기"}
            </button>
            {showSupportDetails && (
              <div className="space-y-2 border-t border-[var(--lh-line)] pt-3 text-xs text-[var(--lh-ink-secondary)]">
                <p>바로 해볼 일: {lessonSupport.adultTaskSuggestions[0]}</p>
                <p>추가 성공 기준: {lessonSupport.successCriteria[1]}</p>
                <p>지원하는 방식: {lessonSupport.supported[0]}</p>
              </div>
            )}
          </div>
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

            {step.audioScript && (
              <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 space-y-2 text-xs shadow-xs">
                <div className="text-xs font-medium text-[var(--lh-ink-secondary)]">발음·대화 예시 · 텍스트 읽기</div>
                <p className="whitespace-pre-wrap leading-relaxed text-[var(--lh-ink)] font-medium">{step.audioScript}</p>
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

            {/* Quiz Checkpoint Block: Chunky M3 Card */}
            {step.quiz && (
              <div className="mt-6 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-7 space-y-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-[var(--lh-line)] pb-3 text-xs">
                  <span className="font-medium text-[var(--lh-ink)] flex items-center gap-2 text-sm">
                    <HelpCircle className="h-4 w-4 text-[var(--lh-primary)]" />
                    <span>확인 퀴즈 (스스로 점검)</span>
                  </span>
                  <span className="text-xs text-[var(--lh-ink-secondary)]">정답과 해설을 확인할 수 있습니다.</span>
                </div>

                <p className="text-base font-medium text-[var(--lh-ink)] leading-relaxed">{step.quiz.question}</p>

                {step.quiz.quizType === "multiple_choice" && step.quiz.options ? (
                  <div className="space-y-2">
                    {step.quiz.options.map((opt, oIdx) => (
                      <button
                        key={oIdx}
                        onClick={() => setUserAnswers((prev) => ({ ...prev, [step.id]: opt }))}
                        className={`min-h-12 w-full rounded-2xl p-3.5 text-sm text-left border transition cursor-pointer ${
                          userAnswers[step.id] === opt
                            ? "bg-[var(--lh-primary)] text-white border-[var(--lh-primary)] font-medium shadow-xs"
                            : "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] font-medium"
                        }`}
                      >
                        {oIdx + 1}. {opt}
                      </button>
                    ))}
                    {userAnswers[step.id] && !quizResults[step.id] && (
                      <button
                        onClick={() => handleEvaluateQuiz(step.id, step.quiz!)}
                        disabled={isEvaluating}
                        className="mt-2 min-h-11 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-6 text-sm font-medium text-white shadow-xs disabled:opacity-30 cursor-pointer transition"
                      >
                        {isEvaluating ? "채점 중..." : "답안 확인하기"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={userAnswers[step.id] || ""}
                      onChange={(e) =>
                        setUserAnswers((prev) => ({ ...prev, [step.id]: e.target.value }))
                      }
                      placeholder="정답 수치를 직접 입력하세요 (예: 8)..."
                      className="min-h-12 flex-1 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] px-4 py-3 text-sm focus:border-[var(--lh-primary)] focus:outline-none"
                    />
                    {!quizResults[step.id] && (
                      <button
                        onClick={() => handleEvaluateQuiz(step.id, step.quiz!)}
                        disabled={!userAnswers[step.id] || isEvaluating}
                        className="min-h-12 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-6 text-sm font-medium text-white shadow-xs disabled:opacity-30 cursor-pointer transition"
                      >
                        {isEvaluating ? "채점 중..." : "답안 확인"}
                      </button>
                    )}
                  </div>
                )}

                {/* Hint / Skip trigger */}
                {!quizResults[step.id] && (
                  <div className="pt-1">
                    <button
                      onClick={() => {
                        setQuizHints((prev) => ({
                          ...prev,
                          [step.id]: step.quiz?.hints?.[0] || "천천히 개념의 정의를 되짚어보세요.",
                        }));
                      }}
                      className="inline-flex min-h-9 items-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-1.5 text-xs font-medium text-[var(--lh-ink-secondary)] hover:text-[var(--lh-primary)] hover:bg-[var(--lh-primary-subtle)] transition cursor-pointer"
                    >
                      아직 헷갈려요 (힌트 보기)
                    </button>
                  </div>
                )}

                {/* Quiz Hint Box */}
                {quizHints[step.id] && !quizResults[step.id] && (
                  <div className="rounded-2xl border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] p-4 text-xs text-[var(--lh-primary-text)] leading-relaxed">
                    <span className="font-medium mr-1 text-[var(--lh-primary-text)]">힌트:</span>
                    <span>{quizHints[step.id]}</span>
                  </div>
                )}

                {/* Quiz Result Box */}
                {quizResults[step.id] && (
                  <div className="rounded-2xl p-5 text-xs space-y-3 border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)]">
                    <div className="flex items-center justify-between">
                      <div className="font-medium flex items-center gap-2 text-sm">
                        {quizResults[step.id].status === "correct" ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span className="text-emerald-700">정답입니다.</span>
                          </>
                        ) : quizResults[step.id].status === "incorrect" ? (
                          <>
                            <XCircle className="h-4 w-4 text-[var(--lh-secondary)]" />
                            <span className="text-[var(--lh-secondary-text)]">오답입니다. (오답 노트에 자동 보관되었습니다)</span>
                          </>
                        ) : (
                          <>
                            <Lightbulb className="h-4 w-4 text-[var(--lh-ink-secondary)]" />
                            <span>아직 채점하지 않았어요.</span>
                          </>
                        )}
                      </div>
                      {quizResults[step.id].misconceptionTag && (
                        <span className="rounded-full bg-[var(--lh-secondary-subtle)] border border-[var(--lh-secondary-border)] px-3 py-1 text-[11px] font-medium text-[var(--lh-secondary-text)]">
                          {quizResults[step.id].misconceptionTag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--lh-ink-secondary)] leading-relaxed font-medium">{quizResults[step.id].feedback}</p>
                    {quizResults[step.id].hint && quizResults[step.id].status !== "correct" && (
                      <div className="rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3 text-xs text-[var(--lh-ink)] leading-relaxed">
                        <span className="font-medium mr-1 text-[var(--lh-ink)]">AI 튜터 힌트:</span>
                        <span>{quizResults[step.id].hint}</span>
                      </div>
                    )}
                    {quizResults[step.id].status !== "correct" && (
                      <button
                        type="button"
                        onClick={() => setQuizResults((prev) => {
                          const next = { ...prev };
                          delete next[step.id];
                          return next;
                        })}
                        className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-2 text-xs font-medium text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] shadow-xs cursor-pointer transition"
                      >
                        다시 풀기 / 다시 채점
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Personal Study Notes: Chunky M3 Card */}
        <div className="rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 space-y-3 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--lh-ink)] flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4" />
              <span>한 줄 정리</span>
            </span>
            <span className="rounded-full bg-[var(--lh-surface-subtle)] px-2.5 py-1 text-[10px] font-medium text-[var(--lh-ink-tertiary)]">
              {noteSaveStatus === "saved" ? "이 기기에 저장됨" : noteSaveStatus === "error" ? "저장 실패" : "입력하면 이 기기에 저장돼요"}
            </span>
          </div>
          <textarea
            rows={3}
            value={noteText}
            onChange={(e) => {
              const nextText = e.target.value;
              setNoteText(nextText);
              try {
                localStorage.setItem(noteStorageKey, nextText);
                setNoteSaveStatus("saved");
              } catch {
                setNoteSaveStatus("error");
              }
            }}
            placeholder="이 개념을 공부하며 알게 된 핵심이나 기억하고 싶은 점을 편하게 적어두세요..."
            aria-label="나만의 학습 메모"
            className="min-h-24 w-full rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 text-sm leading-relaxed text-[var(--lh-ink)] placeholder-[var(--lh-ink-tertiary)] focus:border-[var(--lh-primary)] focus:bg-[var(--lh-surface)] focus:outline-none transition"
          />
        </div>

        {/* 3. Page Footer Action */}
        <div className="mt-12 flex flex-col items-stretch gap-4 border-t border-[var(--lh-line)] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-[var(--lh-ink-secondary)]">
            공부를 마치셨다면 완료를 눌러 내 실력 그래프에 기록하세요.
          </div>

          <button
            onClick={handleCompleteLesson}
            className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-7 text-sm font-medium text-white shadow-xs transition cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{isCompleted ? "완료 기록 업데이트" : "레슨 완료하기"}</span>
          </button>
        </div>
        {completionSaveStatus === "error" && (
          <p className="mt-2 text-right text-xs text-[var(--lh-danger)]">
            레슨 완료 기록을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.
          </p>
        )}

        {/* Dignified Completion Celebration Card: Chunky M3 Card */}
        {isCompleted && (
          <div className="mt-8 rounded-3xl border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] p-8 text-center space-y-3 shadow-xs">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white mx-auto shadow-xs">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div className="text-lg font-medium text-[var(--lh-ink)]">
              {lessonMeta.title} 학습을 기록했습니다.
            </div>
            <p className="text-xs text-[var(--lh-ink-secondary)] max-w-md mx-auto leading-relaxed">
              {completionKind === "quiz_checked" ? "확인 문제 결과를 반영했습니다. 다음 개념으로 전진해 보세요." : "읽기 완료를 기록했습니다. 숙련도는 확인 문제를 푼 뒤 측정됩니다."}
            </p>
          </div>
        )}
      </div>

      {/* Quiz Warning Modal if completed without quiz */}
      {showQuizWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--lh-ink)]/45 p-4 backdrop-blur-xs" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="quiz-warning-title" className="w-full max-w-sm rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 text-[var(--lh-ink)] shadow-2xl animate-fade-in space-y-4">
            <div className="flex items-center gap-2 font-medium text-base text-[var(--lh-ink)]">
              <HelpCircle className="h-5 w-5" />
              <span id="quiz-warning-title">아직 확인 퀴즈를 풀지 않았어요</span>
            </div>
            <p className="text-xs text-[var(--lh-ink-secondary)] leading-relaxed font-medium">
              퀴즈를 풀고 스스로 점검하면 학습 기록 참고 지표에 결과가 반영됩니다. 지금 풀어볼까요?
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => executeCompletion("read_only")}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-xs font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] cursor-pointer transition shadow-xs"
              >
                다음에 풀기
              </button>
              <button
                type="button"
                onClick={() => setShowQuizWarningModal(false)}
                className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-[var(--lh-ink)] px-4 text-xs font-medium text-white hover:bg-[#343431] cursor-pointer transition shadow-xs"
              >
                퀴즈 풀기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Lesson Completion Modal */}
      <LessonCompletionModal
        isOpen={isCompletionModalOpen}
        onClose={() => setIsCompletionModalOpen(false)}
        courseTitle={course.title}
        lessonTitle={lessonMeta.title}
        conceptName={lessonMeta.conceptName}
        completionKind={completionKind}
        reviewScheduleStatus={reviewScheduleStatus}
        savedStatus={completionSaveStatus === "saved" ? "saved" : completionSaveStatus === "error" ? "error" : "pending"}
        quizCount={(content?.steps || []).filter((s) => s.quiz).length}
        answeredQuizCount={(content?.steps || []).filter((s) => s.quiz && ["correct", "incorrect"].includes(quizResults[s.id]?.status || "")).length}
        correctCount={Object.values(quizResults).filter((r: QuizResult) => r.status === "correct").length}
        newUnderstanding={
          completionKind === "quiz_checked"
            ? StorageService.getSkills().find((s) => s.conceptId === lessonMeta.conceptId && s.courseId === course.id)?.understanding
            : undefined
        }
        nextLesson={getNextLesson()}
        onStartNextLesson={
          onStartNextLesson && getNextLesson()
            ? () => {
                const next = getNextLesson()!;
                onStartNextLesson(next.course, next.lesson, next.chapterTitle);
              }
            : undefined
        }
        onGoHome={onGoHome || onFinishLesson}
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
