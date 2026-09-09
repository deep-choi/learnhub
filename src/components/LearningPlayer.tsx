import React, { useState, useEffect } from "react";
import { Course, LessonMeta, LessonContent, LessonStep, QuizData } from "../types/learning";
import { StorageService } from "../services/storage";
import { authorizedFetch } from "../services/authClient";
import { AiTutorDrawer } from "./AiTutorDrawer";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Bot,
  Brain,
  Award,
  Loader2,
  BookOpen,
} from "lucide-react";

interface LearningPlayerProps {
  course: Course;
  lessonMeta: LessonMeta;
  chapterTitle: string;
  onClosePlayer: () => void;
  onLessonFinished: () => void;
}

export const LearningPlayer: React.FC<LearningPlayerProps> = ({
  course,
  lessonMeta,
  chapterTitle,
  onClosePlayer,
  onLessonFinished,
}) => {
  const [lessonContent, setLessonContent] = useState<LessonContent | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [stepIdx: number]: string }>({});
  const [quizResults, setQuizResults] = useState<{
    [stepIdx: number]: { isCorrect: boolean; feedback: string; hint?: string };
  }>({});
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [selectedHintIdx, setSelectedHintIdx] = useState<{ [stepIdx: number]: number }>({});
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    async function loadContent() {
      setIsLoadingContent(true);
      setContentError(null);

      const cached = StorageService.getCachedLessonContent(lessonMeta.id);
      if (cached) {
        setLessonContent(cached);
        setIsLoadingContent(false);
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
        });

        if (res.status === 401) {
          window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
          throw new Error("로그인 후 새 AI 학습 내용을 불러올 수 있습니다.");
        }
        if (!res.ok) throw new Error("Failed to generate lesson");

        const data = await res.json();
        const content: LessonContent = {
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

        StorageService.cacheLessonContent(lessonMeta.id, content);
        setLessonContent(content);
      } catch (e) {
        console.error("Failed to load lesson:", e);
        if (e instanceof Error && e.message.startsWith("로그인 후")) {
          setContentError(e.message);
          setLessonContent(null);
          setIsLoadingContent(false);
          return;
        }
        const fallback: LessonContent = {
          id: `content-${lessonMeta.id}`,
          lessonId: lessonMeta.id,
          courseId: course.id,
          title: lessonMeta.title,
          steps: [
            {
              id: "step-1",
              type: "concept",
              title: "핵심 원리와 본질적 정의",
              content: `${lessonMeta.conceptName}의 근본 원리입니다.\n\n수학적 정의와 개념의 배경:\n선수 지식과의 연결점을 확인하며 다음 단계의 질문으로 나아갑니다.`,
            },
            {
              id: "step-2",
              type: "example",
              title: "이해를 돕는 구체적 전개",
              content: "공식에 의존하지 않고 양변의 대칭성과 기하학적 의미를 추론합니다.",
            },
            {
              id: "step-3",
              type: "quiz",
              title: "개념 자가 검증",
              content: "방금 확인한 원리를 적용하여 다음 질문에 답해보세요.",
              quiz: {
                question: `${lessonMeta.conceptName}의 핵심 원리로 올바른 것은?`,
                quizType: "multiple_choice",
                options: [
                  "원리를 바탕으로 인과관계를 완성한다",
                  "단순 암기로 해결한다",
                  "직관을 배제한다",
                ],
                answer: "원리를 바탕으로 인과관계를 완성한다",
                explanation: "수학은 암기가 아닌 논리적 인과관계의 구조화입니다.",
                hints: ["원리에 집중해보세요.", "첫 번째 선지를 검토하세요."],
              },
            },
          ],
        };
        setLessonContent(fallback);
      } finally {
        setIsLoadingContent(false);
      }
    }

    loadContent();
  }, [lessonMeta.id]);

  if (isLoadingContent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 text-[var(--lh-ink-secondary)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--lh-ink)]" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-[var(--lh-ink)]">레슨을 구성하는 중...</p>
          <p className="text-[11px] font-normal">개념 위계와 진단 질문을 체계화하고 있습니다.</p>
        </div>
      </div>
    );
  }

  if (!lessonContent || !lessonContent.steps.length) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-sm text-[var(--lh-ink-secondary)]">{contentError || "레슨을 불러올 수 없습니다."}</p>
        <button
          onClick={onClosePlayer}
          className="text-xs bg-[var(--lh-ink)] text-white px-3 py-1.5 rounded-md"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const steps = lessonContent.steps;
  const currentStep = steps[currentStepIdx] || steps[0];
  const isLastStep = currentStepIdx === steps.length - 1;

  const handleEvaluateQuiz = async (quiz: QuizData) => {
    const userAns = userAnswers[currentStepIdx];
    if (!userAns) return;

    setIsEvaluating(true);
    setAuthError(false);

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

      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!res.ok) throw new Error("Evaluation failed");

      const data = await res.json();
      setQuizResults((prev) => ({
        ...prev,
        [currentStepIdx]: {
          isCorrect: data.isCorrect,
          feedback: data.feedback,
          hint: data.hint,
        },
      }));

      StorageService.recordQuizAnswer(
        course.id,
        course.title,
        lessonMeta.conceptId,
        lessonMeta.conceptName,
        data.isCorrect
      );
    } catch (error) {
      if (error instanceof Error && error.message === "auth_required") {
        setAuthError(true);
        return;
      }
      const isCorrect = userAns.trim().toLowerCase() === quiz.answer.trim().toLowerCase();
      setQuizResults((prev) => ({
        ...prev,
        [currentStepIdx]: {
          isCorrect,
          feedback: isCorrect ? "정답입니다. 핵심 원리를 정확히 파악하셨습니다." : "오답입니다. 힌트를 참고하여 원리를 다시 확인해 보세요.",
          hint: isCorrect ? undefined : quiz.explanation,
        },
      }));

      StorageService.recordQuizAnswer(
        course.id,
        course.title,
        lessonMeta.conceptId,
        lessonMeta.conceptName,
        isCorrect
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleFinishLesson = () => {
    StorageService.markLessonCompleted(course.id, lessonMeta.id);
    onLessonFinished();
  };

  const isCurrentStepComplete =
    currentStep.type !== "quiz" ||
    (currentStep.quiz && quizResults[currentStepIdx] !== undefined);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-6 overflow-x-hidden px-4 pb-16 text-sm text-[var(--lh-ink)] sm:px-0">
      {/* 1. Top Bar */}
      <div className="flex items-center justify-between border-b border-[var(--lh-line)] pb-3 text-xs">
        <button
          onClick={onClosePlayer}
          className="flex min-h-11 items-center gap-1 rounded-md px-3 text-sm text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>나가기</span>
        </button>

        <div className="text-center truncate px-2">
          <span className="text-[11px] font-medium text-[var(--lh-ink-secondary)]">
            {chapterTitle} / {lessonMeta.conceptName}
          </span>
        </div>

        <div className="font-mono text-xs font-medium text-[var(--lh-ink)]">
          {currentStepIdx + 1} / {steps.length}
        </div>
      </div>

      {/* Progress Bar (Hairline) */}
      <div className="w-full bg-[var(--lh-line)] h-1 rounded-full overflow-hidden">
        <div
          className="bg-[var(--lh-primary)] h-full transition-all duration-200"
          style={{ width: `${((currentStepIdx + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* 2. Main Reading Canvas (Editorial Style) */}
      <article className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-8 space-y-6 min-h-[420px] flex flex-col justify-between shadow-xs">
        <div className="space-y-6">
          {/* Header Tag + AI Button */}
          <div className="flex items-center justify-between border-b border-[var(--lh-line)] pb-3">
            <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--lh-primary-text)]">
              {currentStep.type === "concept" && "개념 원리"}
              {currentStep.type === "example" && "구체 예시 전개"}
              {currentStep.type === "practice" && "연습"}
              {currentStep.type === "quiz" && "메타인지 점검"}
              {currentStep.type === "summary" && "핵심 요약"}
            </span>

            <button
              onClick={() => setIsTutorOpen(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-3 text-sm font-medium text-[var(--lh-ink)] transition-colors hover:bg-[var(--lh-surface-strong)]"
            >
              <Bot className="w-3.5 h-3.5 text-[var(--lh-ink)]" />
              <span>AI 튜터에게 질문</span>
            </button>
          </div>

          {/* Title & Body */}
          <div className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-[var(--lh-ink)]">
              {currentStep.title}
            </h2>

            <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--lh-ink)] font-normal">
              {currentStep.content}
            </div>
          </div>

          {/* Code/Formula Snippet */}
          {currentStep.codeSnippet && (
            <div className="rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 font-mono text-xs text-[var(--lh-ink)] overflow-x-auto">
              <pre>{currentStep.codeSnippet}</pre>
            </div>
          )}

          {/* Quiz Section */}
          {currentStep.quiz && (
            <div className="mt-6 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-5 space-y-4">
              <div className="text-sm font-medium text-[var(--lh-ink)] flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[var(--lh-primary)]" />
                <span>{currentStep.quiz.question}</span>
              </div>

              {/* Options */}
              {currentStep.quiz.quizType === "multiple_choice" && currentStep.quiz.options ? (
                <div className="space-y-2">
                  {currentStep.quiz.options.map((opt, optIdx) => (
                    <button
                      key={optIdx}
                      onClick={() =>
                        setUserAnswers((prev) => ({ ...prev, [currentStepIdx]: opt }))
                      }
                      className={`min-h-11 w-full rounded-xl p-3 text-sm text-left transition-colors font-medium border cursor-pointer ${
                        userAnswers[currentStepIdx] === opt
                          ? "bg-[var(--lh-primary)] text-white border-[var(--lh-primary)]"
                          : "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink)] hover:bg-[var(--lh-primary-subtle)] hover:border-[var(--lh-primary-border)]"
                      }`}
                    >
                      {optIdx + 1}. {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  value={userAnswers[currentStepIdx] || ""}
                  onChange={(e) =>
                    setUserAnswers((prev) => ({
                      ...prev,
                      [currentStepIdx]: e.target.value,
                    }))
                  }
                  placeholder="정답 수치나 개념어를 직접 입력하세요..."
                  className="min-h-11 w-full rounded-md border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3.5 py-2.5 text-sm text-[var(--lh-ink)] placeholder-[var(--lh-ink-tertiary)] focus:border-[var(--lh-primary)] focus:outline-none"
                />
              )}

              {/* Step Hints */}
              {currentStep.quiz.hints && currentStep.quiz.hints.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() =>
                      setSelectedHintIdx((prev) => ({
                        ...prev,
                        [currentStepIdx]: ((prev[currentStepIdx] ?? -1) + 1) % currentStep.quiz!.hints.length,
                      }))
                    }
                    className="flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)]"
                  >
                    <Brain className="w-3 h-3" />
                    <span>
                      {selectedHintIdx[currentStepIdx] !== undefined
                        ? `단계별 힌트 (${selectedHintIdx[currentStepIdx] + 1}/${currentStep.quiz.hints.length})`
                        : "힌트 열기"}
                    </span>
                  </button>

                  {selectedHintIdx[currentStepIdx] !== undefined && (
                    <div className="rounded-md border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3 text-sm text-[var(--lh-ink)]">
                      힌트: {currentStep.quiz.hints[selectedHintIdx[currentStepIdx]]}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              {authError && <p className="rounded-xl border border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] p-3 text-sm text-[var(--lh-secondary-text)] font-normal">로그인 후 AI 채점을 사용할 수 있습니다.</p>}
              {!quizResults[currentStepIdx] && (
                <button
                  onClick={() => handleEvaluateQuiz(currentStep.quiz!)}
                  disabled={!userAnswers[currentStepIdx] || isEvaluating}
                  className="min-h-11 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-5 text-sm font-medium text-white transition-colors disabled:opacity-30 cursor-pointer"
                >
                  {isEvaluating ? "채점 중..." : "답안 확인하기"}
                </button>
              )}

              {/* Quiz Result Feedback */}
              {quizResults[currentStepIdx] && (
                <div
                  className={`p-4 rounded-xl border space-y-1.5 ${
                    quizResults[currentStepIdx].isCorrect
                      ? "bg-[var(--lh-primary-subtle)] border-[var(--lh-primary-border)] text-[var(--lh-primary-text)]"
                      : "bg-[var(--lh-secondary-subtle)] border-[var(--lh-secondary-border)] text-[var(--lh-secondary-text)]"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium text-xs">
                    {quizResults[currentStepIdx].isCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[var(--lh-primary)]" />
                        <span>정답입니다.</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-[var(--lh-secondary)]" />
                        <span>오답입니다. 다시 한번 원리를 점검해보세요.</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-normal opacity-90">
                    {quizResults[currentStepIdx].feedback}
                  </p>
                  {quizResults[currentStepIdx].hint && (
                    <div className="text-[11px] border-t border-current/20 pt-1.5 mt-1 font-normal opacity-80">
                      해설: {quizResults[currentStepIdx].hint}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Navigation Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--lh-line)] pt-6">
          <button
            onClick={() => setCurrentStepIdx((prev) => Math.max(0, prev - 1))}
            disabled={currentStepIdx === 0}
            className="flex min-h-11 items-center gap-1 rounded-full border border-[var(--lh-line)] px-4 text-sm font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] disabled:opacity-30 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>이전</span>
          </button>

          {isLastStep ? (
            <button
              onClick={handleFinishLesson}
              disabled={!isCurrentStepComplete}
              className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-6 text-sm font-medium text-white transition-colors disabled:opacity-30 shadow-xs cursor-pointer"
            >
              <Award className="w-3.5 h-3.5" />
              <span>레슨 완료 및 기록 저장</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentStepIdx((prev) => Math.min(steps.length - 1, prev + 1))}
              disabled={!isCurrentStepComplete}
              className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-6 text-sm font-medium text-white transition-colors disabled:opacity-30 shadow-xs cursor-pointer"
            >
              <span>다음 단계</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </article>

      {/* Side Tutor Drawer */}
      <AiTutorDrawer
        isOpen={isTutorOpen}
        onClose={() => setIsTutorOpen(false)}
        courseTitle={course.title}
        lessonTitle={lessonContent.title}
        conceptName={lessonMeta.conceptName}
        currentStepContent={currentStep.content}
      />
    </div>
  );
};
