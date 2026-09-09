import React, { useState, useEffect, useRef } from "react";
import { Course, LessonMeta, LessonContent, QuizData } from "../../types/learning";
import { StorageService } from "../../services/storage";
import type { AccessTokenGetter } from "../../services/contentReports";
import { validateLessonPayload } from "../../domain/contentValidation";
import { getLearningSupport } from "../../domain/learningSupport";
import { ContentReportDialog } from "../ContentReportDialog";
import { RichLessonRenderer } from "./RichLessonRenderer";
import { LessonCompletionModal } from "./LessonCompletionModal";
import {
  Award,
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
        const res = await fetch("/api/ai/generate-lesson", {
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
      } catch {
        if (!cancelled) {
          setLoadError("이 레슨 내용을 불러오지 못했습니다. 현재 과목의 내용은 바뀌지 않았어요.");
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
      const res = await fetch("/api/ai/evaluate-quiz", {
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
      <div className="flex h-[70vh] flex-col items-center justify-center space-y-3 text-[#787774]">
        <Loader2 className="h-5 w-5 animate-spin text-[#191919]" />
        <span className="text-xs">노션 교과 캔버스 로딩 중...</span>
      </div>
    );
  }

  if (loadError || !content) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-[560px] flex-col items-center justify-center gap-4 px-4 text-center text-[#787774]">
        <div className="text-2xl">⚠️</div>
        <div>
          <h2 className="text-base font-bold text-[#191919]">레슨을 준비하지 못했습니다</h2>
          <p className="mt-2 text-xs leading-relaxed">{loadError || "현재 과목의 레슨 내용이 비어 있습니다."}</p>
        </div>
        <button
          type="button"
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          className="rounded-md bg-[#191919] px-4 py-2 text-xs font-semibold text-white hover:bg-[#37352F] cursor-pointer"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div
      onMouseUp={handleMouseUp}
      className="relative mx-auto w-full max-w-[760px] py-10 px-4 text-[#2F3437] select-text"
    >
      {/* Floating Selection Tooltip (Notion Style AI Bubble) */}
      {tooltipPos && (
        <div
          style={{ top: `${tooltipPos.y + window.scrollY - 36}px`, left: `${tooltipPos.x}px` }}
          className="fixed -translate-x-1/2 z-50 flex items-center gap-1 rounded-md bg-[#191919] px-2.5 py-1 text-white shadow-xl text-[11px] animate-fade-in cursor-pointer"
          onClick={handleTriggerTutorForSelection}
        >
          <Sparkles className="h-3 w-3 text-white" />
          <span className="font-medium">선택 문장 AI에게 질문하기</span>
        </div>
      )}

      {/* 1. Notion Page Icon & Title */}
      <div className="space-y-4 border-b border-[#E9E9E7] pb-8">
        <div className="flex items-center gap-3">
          <span className="text-4xl">📚</span>
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-2 py-0.5 text-[11px] font-semibold text-[#787774]">
              {course.subject}
            </span>
            <span className="text-[11px] text-[#9B9A97]">약 {lessonMeta.estimatedMinutes}분 소요</span>
          </div>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-[#191919] sm:text-4xl">
          {lessonMeta.title}
        </h1>

        {/* Notion Property Table */}
        <div className="space-y-1.5 rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-3 text-xs">
          <div className="flex items-center gap-4 text-[#787774]">
            <span className="w-24 shrink-0 font-medium text-[11px] text-[#9B9A97]">소속 챕터</span>
            <span className="text-[#191919] font-medium">{chapterTitle}</span>
          </div>
          <div className="flex items-center gap-4 text-[#787774]">
            <span className="w-24 shrink-0 font-medium text-[11px] text-[#9B9A97]">핵심 개념 ID</span>
            <span className="font-mono text-[11px] text-[#2F3437]">{lessonMeta.conceptId}</span>
          </div>
          <div className="flex items-center gap-4 text-[#787774]">
            <span className="w-24 shrink-0 font-medium text-[11px] text-[#9B9A97]">학습 완결 상태</span>
            <span className="font-medium text-[#191919]">
              {isCompleted ? "● 이수 완료 (Saved)" : "○ 사유 진행 중 (In Progress)"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Learning contract: a small, observable target without extra setup */}
      <div className="mt-8 space-y-8 leading-relaxed">
        <div className="group relative flex items-start gap-3 rounded-md border border-[#E9E9E7] bg-[#F7F6F3] p-4 text-xs text-[#2F3437]">
          <span className="text-base shrink-0">💡</span>
          <div className="space-y-1">
            <span className="font-bold text-[#191919]">{lessonSupport.label} · 이번 레슨의 목표</span>
            <p className="mt-1 text-[#2F3437]">{lessonSupport.successCriteria[0]}</p>
            <p className="text-[11px] text-[#787774]">가능 범위: {primaryLimitation}</p>
            <button
              type="button"
              onClick={() => setShowSupportDetails((open) => !open)}
              className="pt-1 text-[11px] font-medium text-[#787774] underline hover:text-[#191919]"
            >
              {showSupportDetails ? "상세 기준 접기" : "학습 방식 상세 보기"}
            </button>
            {showSupportDetails && (
              <div className="space-y-2 border-t border-[#E9E9E7] pt-2 text-[11px] text-[#787774]">
                <p>바로 해볼 일: {lessonSupport.adultTaskSuggestions[0]}</p>
                <p>추가 성공 기준: {lessonSupport.successCriteria[1]}</p>
                <p>지원하는 방식: {lessonSupport.supported[0]}</p>
              </div>
            )}
          </div>
        </div>

        {/* Steps Blocks */}
        {content?.steps.map((step) => (
          <div key={step.id} className="group relative space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-[#191919]">
              {step.title}
            </h2>

            <RichLessonRenderer content={step.content} />

            {step.codeSnippet && (
              <div className="rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-3 space-y-1">
                <div className="text-[11px] font-semibold text-[#787774]">코드 예시 · 실행하지 않는 참고용 텍스트</div>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-xs leading-relaxed text-[#2F3437]"><code>{step.codeSnippet}</code></pre>
              </div>
            )}

            {step.audioScript && (
              <div className="rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-3 space-y-1 text-xs">
                <div className="text-[11px] font-semibold text-[#787774]">발음·대화 예시 · 텍스트 읽기</div>
                <p className="whitespace-pre-wrap leading-relaxed text-[#2F3437]">{step.audioScript}</p>
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
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E9E9E7] bg-[#FBFBFA] px-3.5 py-1 text-xs text-[#787774] hover:bg-white hover:text-[#191919] hover:border-[#D3D3D0] transition cursor-pointer"
              >
                <span className="text-[#191919] font-bold">✦</span>
                <span>이 부분 쉬운 예시로 설명해줘</span>
              </button>
              <button
                type="button"
                onClick={() => setReportStepId(step.id)}
                className="text-[11px] text-[#9B9A97] underline hover:text-[#191919]"
              >
                내용 오류 신고
              </button>
            </div>

            {/* Quiz Checkpoint Block */}
            {step.quiz && (
              <div className="mt-6 rounded-md border border-[#E9E9E7] bg-white p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-2 text-xs">
                  <span className="font-bold text-[#191919] flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>확인 퀴즈 (스스로 점검)</span>
                  </span>
                  <span className="text-[11px] text-[#787774]">틀려도 괜찮아요</span>
                </div>

                <p className="text-sm font-semibold text-[#191919]">{step.quiz.question}</p>

                {step.quiz.quizType === "multiple_choice" && step.quiz.options ? (
                  <div className="space-y-1.5">
                    {step.quiz.options.map((opt, oIdx) => (
                      <button
                        key={oIdx}
                        onClick={() => setUserAnswers((prev) => ({ ...prev, [step.id]: opt }))}
                        className={`w-full rounded-md p-2.5 text-xs text-left border transition cursor-pointer ${
                          userAnswers[step.id] === opt
                            ? "bg-[#191919] text-white border-[#191919] font-medium"
                            : "bg-white border-[#E9E9E7] text-[#2F3437] hover:bg-[#F7F6F3]"
                        }`}
                      >
                        {oIdx + 1}. {opt}
                      </button>
                    ))}
                    {userAnswers[step.id] && !quizResults[step.id] && (
                      <button
                        onClick={() => handleEvaluateQuiz(step.id, step.quiz!)}
                        disabled={isEvaluating}
                        className="mt-2 rounded-md bg-[#191919] px-4 py-2 text-xs font-medium text-white hover:bg-[#37352F] disabled:opacity-30 cursor-pointer"
                      >
                        {isEvaluating ? "채점 중..." : "답안 제출 ⏎"}
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
                      className="flex-1 rounded-md border border-[#E9E9E7] px-3 py-2 text-xs focus:border-[#191919] focus:outline-none"
                    />
                    {!quizResults[step.id] && <button
                      onClick={() => handleEvaluateQuiz(step.id, step.quiz!)}
                      disabled={!userAnswers[step.id] || isEvaluating}
                      className="rounded-md bg-[#191919] px-4 py-2 text-xs font-medium text-white hover:bg-[#37352F] disabled:opacity-30 cursor-pointer"
                    >
                      {isEvaluating ? "채점 중..." : "제출 ⏎"}
                    </button>}
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
                      className="text-xs text-[#9B9A97] hover:text-[#191919] underline cursor-pointer"
                    >
                      아직 헷갈려요 (힌트 보기)
                    </button>
                  </div>
                )}

                {/* Quiz Result */}
                {quizHints[step.id] && !quizResults[step.id] && (
                  <div className="rounded-sm border border-[#E9E9E7] bg-white p-2.5 text-[11px] text-[#2F3437] leading-relaxed">
                    <span className="font-bold mr-1 text-[#191919]">✦ 힌트:</span>
                    <span>{quizHints[step.id]}</span>
                  </div>
                )}

                {quizResults[step.id] && (
                  <div
                    className={`rounded-md p-3 text-xs space-y-2 border ${
                      quizResults[step.id].status === "correct"
                        ? "bg-[#F7F6F3] border-[#E9E9E7] text-[#191919]"
                        : "bg-[#FBFBFA] border-[#D3D3D0] text-[#191919]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold flex items-center gap-1.5">
                        {quizResults[step.id].status === "correct" ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#191919]" />
                            <span>정답입니다.</span>
                          </>
                        ) : quizResults[step.id].status === "incorrect" ? (
                          <>
                            <XCircle className="h-3.5 w-3.5 text-[#787774]" />
                            <span>오답입니다. (오답 아카이브 자동 보관)</span>
                          </>
                        ) : (
                          <>
                            <Lightbulb className="h-3.5 w-3.5 text-[#787774]" />
                            <span>아직 채점하지 않았어요.</span>
                          </>
                        )}
                      </div>
                      {quizResults[step.id].misconceptionTag && (
                        <span className="rounded-sm bg-white border border-[#E9E9E7] px-1.5 py-0.5 text-[10px] font-semibold text-[#787774]">
                          {quizResults[step.id].misconceptionTag}
                        </span>
                      )}
                    </div>
                    <p className="text-[#787774] leading-relaxed">{quizResults[step.id].feedback}</p>
                    {quizResults[step.id].hint && quizResults[step.id].status !== "correct" && (
                      <div className="rounded-sm border border-[#E9E9E7] bg-white p-2.5 text-[11px] text-[#2F3437] leading-relaxed">
                        <span className="font-bold mr-1 text-[#191919]">✦ AI 소크라틱 힌트:</span>
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
                        className="rounded-md border border-[#E9E9E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#787774] hover:bg-[#F7F6F3] cursor-pointer"
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

        {/* Personal Study Notes */}
        <div className="rounded-md border border-[#E9E9E7] bg-white p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#191919] flex items-center gap-1.5">
              <span>📝</span>
              <span>나만의 한 줄 정리 (자동 저장)</span>
            </span>
            <span className="text-[10px] text-[#9B9A97]">
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
            className="w-full rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-3 text-xs leading-relaxed text-[#191919] placeholder-[#9B9A97] focus:border-[#191919] focus:outline-none"
          />
        </div>

        {/* 3. Page Footer Action */}
        <div className="mt-12 flex items-center justify-between border-t border-[#E9E9E7] pt-6">
          <div className="text-xs text-[#787774]">
            공부를 마치셨다면 완료를 눌러 내 실력 그래프에 기록하세요.
          </div>

          <button
            onClick={handleCompleteLesson}
            className="flex items-center gap-1.5 rounded-md bg-[#191919] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#37352F] cursor-pointer"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{isCompleted ? "학습 완료됨 (다시 기록)" : "오늘 공부 완료! ⏎"}</span>
          </button>
        </div>
        {completionSaveStatus === "error" && (
          <p className="mt-2 text-right text-xs text-[#B42318]">
            레슨 완료 기록을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.
          </p>
        )}

        {/* Dignified Completion Celebration Card */}
        {isCompleted && (
          <div className="mt-6 rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-6 text-center space-y-2">
            <div className="text-3xl">👏</div>
            <div className="text-base font-bold text-[#191919]">
              수고하셨습니다! [{lessonMeta.title}] 학습을 기록했습니다.
            </div>
            <p className="text-xs text-[#787774]">
              {completionKind === "quiz_checked" ? "확인 문제 결과를 반영했습니다. 다음 개념으로 전진해 보세요." : "읽기 완료를 기록했습니다. 숙련도는 확인 문제를 푼 뒤 측정됩니다."}
            </p>
          </div>
        )}
      </div>

      {/* Quiz Warning Modal if completed without quiz */}
      {showQuizWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-[#E9E9E7] bg-white p-5 shadow-2xl text-[#2F3437] animate-fade-in space-y-4">
            <div className="flex items-center gap-2 font-bold text-sm text-[#191919]">
              <span className="text-lg">💡</span>
              <span>아직 확인 퀴즈를 풀지 않았어요</span>
            </div>
            <p className="text-xs text-[#787774] leading-relaxed">
              퀴즈를 풀고 스스로 점검하면 학습 기록 참고 지표에 결과가 반영됩니다. 지금 풀어볼까요?
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => executeCompletion("read_only")}
                className="flex-1 rounded-md border border-[#E9E9E7] bg-white py-2 text-xs font-semibold text-[#787774] hover:bg-[#F7F6F3] cursor-pointer"
              >
                다음에 풀기
              </button>
              <button
                type="button"
                onClick={() => setShowQuizWarningModal(false)}
                className="flex-1 rounded-md bg-[#191919] py-2 text-xs font-semibold text-white hover:bg-[#37352F] cursor-pointer"
              >
                퀴즈 풀러 가기 ⏎
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
