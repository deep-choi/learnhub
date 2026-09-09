import React, { useState } from "react";
import { ReviewQuestion, UserSkill } from "../types/learning";
import { StorageService } from "../services/storage";
import { authorizedFetch } from "../services/authClient";
import { compareAnswers } from "../utils/answerComparison";
import {
  getDueReviewItems,
  isValidMultipleChoice,
  mergeReviewItems,
  rescheduleReviewItem,
  ReviewQuestionWithContext,
} from "../utils/reviewSession";
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Brain,
  ArrowRight,
  Loader2,
  Award,
} from "lucide-react";

interface ReviewViewProps {
  reviews: ReviewQuestion[];
  skills: UserSkill[];
  onReviewFinished: () => void;
}

export const ReviewView: React.FC<ReviewViewProps> = ({
  reviews: initialReviews,
  skills,
  onReviewFinished,
}) => {
  const [reviews, setReviews] = useState<ReviewQuestion[]>(() =>
    getDueReviewItems(initialReviews as ReviewQuestionWithContext[]),
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [qId: string]: string }>({});
  const [results, setResults] = useState<{
    [qId: string]: { status: "correct" | "incorrect" | "unknown"; explanation: string };
  }>({});
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [completedSession, setCompletedSession] = useState(false);

  const weakSkills = skills.filter((s) => s.understanding < 60);
  const currentQ = reviews[currentIdx];

  const courses = StorageService.getCourses();
  const resolveLegacyContext = (question: ReviewQuestionWithContext) => {
    const contextForCourse = (course: (typeof courses)[number]) => {
      const matchingLessons = course.chapters.flatMap((chapter) => chapter.lessons).filter(
        (lesson) => lesson.conceptId === question.conceptId || lesson.conceptName === question.conceptName,
      );
      if (matchingLessons.length === 0) return {};
      const lesson = question.lessonId
        ? matchingLessons.find((candidate) => candidate.id === question.lessonId)
        : matchingLessons.length === 1
        ? matchingLessons[0]
        : undefined;
      return { courseId: course.id, courseTitle: course.title, lessonId: lesson?.id };
    };

    if (question.courseId) {
      const course = courses.find((candidate) => candidate.id === question.courseId);
      return course ? contextForCourse(course) : {};
    }

    if (question.lessonId) {
      const lessonMatches = courses.filter((course) =>
        course.chapters.some((chapter) =>
          chapter.lessons.some(
            (lesson) => lesson.id === question.lessonId &&
              (lesson.conceptId === question.conceptId || lesson.conceptName === question.conceptName),
          ),
        ),
      );
      return lessonMatches.length === 1 ? contextForCourse(lessonMatches[0]) : {};
    }

    const titleMatches = courses.filter((course) => course.title === question.courseTitle);
    const conceptMatches = courses.filter((course) =>
      course.chapters.some((chapter) =>
        chapter.lessons.some(
          (lesson) => lesson.conceptId === question.conceptId || lesson.conceptName === question.conceptName,
        ),
      ),
    );
    const matchingCourses = titleMatches.length === 1 ? titleMatches : conceptMatches;
    if (matchingCourses.length !== 1) return {};

    return contextForCourse(matchingCourses[0]);
  };

  const handleCheckAnswer = (q: ReviewQuestion) => {
    const ans = userAnswers[q.id] || "";
    if (!ans.trim()) return;

    if (results[q.id]) return;
    const status =
      q.quizType === "multiple_choice"
        ? ans.trim() === q.answer.trim()
          ? "correct"
          : "incorrect"
        : compareAnswers(ans, q.answer);

    setResults((prev) => ({
      ...prev,
      [q.id]: {
        status,
        explanation:
          status === "unknown"
            ? "이 문항은 자동 채점을 지원하지 않습니다. 해설과 정답 기준을 직접 확인해 주세요."
            : q.explanation,
      },
    }));

    if (status === "unknown") return;
    const context = resolveLegacyContext(q as ReviewQuestionWithContext);
    const hasValidContext = Boolean(context.courseId);
    if (!hasValidContext) {
      setResults((prev) => ({
        ...prev,
        [q.id]: {
          status,
          explanation: `${q.explanation} 과목과 개념을 유일하게 확인할 수 없어 학습 통계에는 반영하지 않았습니다.`,
        },
      }));
      return;
    }
    StorageService.recordQuizAnswer(
      context.courseId || "",
      context.courseTitle || q.courseTitle,
      q.conceptId,
      q.conceptName,
      status === "correct",
      `${q.id}:${q.dueAt}`,
    );
  };

  const handleNextQuestion = () => {
    const currentQuestion = reviews[currentIdx];
    const currentResult = currentQuestion ? results[currentQuestion.id] : undefined;
    if (!currentQuestion || !currentResult) return;

    const storedReviews = StorageService.getReviews() as ReviewQuestionWithContext[];
    const storedCurrent = storedReviews.find((review) => review.id === currentQuestion.id) || currentQuestion;
    const nextQueue =
      currentResult.status === "correct"
        ? storedReviews.filter((review) => review.id !== currentQuestion.id)
        : mergeReviewItems(
            storedReviews.filter((review) => review.id !== currentQuestion.id),
            [rescheduleReviewItem(storedCurrent)],
          );

    if (!StorageService.saveReviews(nextQueue)) {
      alert("복습 진행 상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const dueReviews = getDueReviewItems(nextQueue);
    setReviews(dueReviews);
    setCurrentIdx(0);
    if (dueReviews.length === 0) {
      setCompletedSession(true);
      onReviewFinished();
    }
  };

  const handleGenerateAiReviewSession = async () => {
    if (weakSkills.length === 0) return;
    setIsGeneratingMore(true);

    try {
      const res = await authorizedFetch("/api/ai/generate-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weakConcepts: weakSkills.map((s) => ({
            conceptName: s.conceptName,
            understanding: s.understanding,
            courseTitle: s.courseTitle,
          })),
        }),
      });

      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!res.ok) throw new Error();

      const data = await res.json();
      if (!Array.isArray(data.questions)) throw new Error("invalid review response");
      const generatedAt = new Date().toISOString();
      const newQuestions: ReviewQuestionWithContext[] = data.questions.flatMap((q: any, idx: number) => {
        if (!q || typeof q.question !== "string" || !q.question.trim() || typeof q.answer !== "string" || !q.answer.trim()) {
          return [];
        }

        const matchingWeakSkills = weakSkills.filter((skill) => {
          const matchesKnownId = typeof q.conceptId === "string" && q.conceptId === skill.conceptId;
          const matchesKnownName =
            typeof q.conceptName === "string" &&
            q.conceptName === skill.conceptName &&
            (typeof q.courseTitle !== "string" || q.courseTitle === skill.courseTitle);
          return matchesKnownId || matchesKnownName;
        });
        if (matchingWeakSkills.length !== 1) return [];

        const quizType = q.quizType === "multiple_choice" || q.quizType === "short_answer" ? q.quizType : null;
        if (!quizType || typeof q.explanation !== "string" || !q.explanation.trim()) return [];
        if (
          quizType === "multiple_choice" &&
          !isValidMultipleChoice(q.options, q.answer)
        ) {
          return [];
        }

        const weakSkill = matchingWeakSkills[0];
        return [{
          id: `gen-rev-${Date.now()}-${idx}`,
          conceptId: weakSkill.conceptId,
          conceptName: weakSkill.conceptName,
          courseTitle: weakSkill.courseTitle,
          courseId: weakSkill.courseId,
          ...(typeof q.lessonId === "string" && q.lessonId ? { lessonId: q.lessonId } : {}),
          question: q.question.trim(),
          quizType,
          ...(quizType === "multiple_choice" ? { options: q.options } : {}),
          answer: q.answer.trim(),
          explanation: q.explanation.trim(),
          dueAt: generatedAt,
        }];
      });
      if (newQuestions.length === 0) throw new Error("no valid review questions");

      const merged = mergeReviewItems(StorageService.getReviews() as ReviewQuestionWithContext[], newQuestions);
      if (!StorageService.saveReviews(merged)) throw new Error("review persistence failed");
      setReviews(getDueReviewItems(merged));
      setCurrentIdx(0);
      setResults({});
      setUserAnswers({});
      setCompletedSession(false);
    } catch (error) {
      alert(error instanceof Error && error.message === "auth_required" ? "로그인 후 새 AI 복습 문제를 만들 수 있습니다." : "AI 복습 세션 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingMore(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[780px] space-y-8 overflow-x-hidden px-5 py-12 pb-24 text-sm text-[var(--lh-ink)] sm:px-8">
      {/* Header Banner */}
      <section className="space-y-3 border-b border-[var(--lh-line)] pb-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--lh-primary)]">
          <RotateCcw className="h-4 w-4" />
          <span>SCHEDULED REVIEW • 예약 복습</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-3xl font-medium tracking-[-0.03em] text-[var(--lh-ink)] sm:text-4xl">
            예정된 복습
          </h1>
          <p className="text-sm leading-relaxed text-[var(--lh-ink-secondary)] font-normal">
            저장된 복습 예정 시각이 지난 문항을 점검합니다. 오답은 다음 복습 일정으로 다시 예약됩니다.
          </p>
        </div>

        {weakSkills.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-xs font-medium text-[var(--lh-ink-secondary)]">
              다시 볼 개념:
            </span>
            {weakSkills.map((s) => (
              <span
                key={s.conceptId}
                className="rounded-full border border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] px-3.5 py-1 text-xs font-medium text-[var(--lh-secondary-text)] shadow-xs"
              >
                {s.conceptName} ({s.understanding}%)
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Completion View: Chunky M3 Card */}
      {completedSession ? (
        <div className="rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-8 sm:p-12 text-center space-y-5 shadow-xs">
          <div className="h-16 w-16 rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] text-[var(--lh-primary)] mx-auto flex items-center justify-center shadow-xs">
            <Award className="h-8 w-8" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-medium text-[var(--lh-ink)]">
              오늘의 복습 큐를 모두 마쳤습니다
            </h2>
            <p className="text-sm text-[var(--lh-ink-secondary)] font-normal">
              복습 기록이 이 기기에 저장되었습니다.
            </p>
          </div>

          <button
            onClick={handleGenerateAiReviewSession}
            disabled={isGeneratingMore || weakSkills.length === 0}
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition disabled:opacity-40 cursor-pointer"
          >
            {isGeneratingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>추가 복습 문항 생성 중...</span>
              </>
            ) : (
              <span>추가 복습 문제 만들기</span>
            )}
          </button>
        </div>
      ) : reviews.length > 0 && currentQ ? (
        /* Active Review Card: Chunky M3 Surface Card */
        <article className="rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--lh-line)] pb-3.5 text-xs text-[var(--lh-ink-secondary)]">
            <span className="font-medium text-[var(--lh-ink)] text-sm">
              {currentQ.courseTitle} • {currentQ.conceptName}
            </span>
            <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-3 py-1 font-mono font-medium text-[var(--lh-primary-text)]">
              {currentIdx + 1} / {reviews.length}
            </span>
          </div>

          {/* Question Text */}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 text-base font-medium text-[var(--lh-ink)] leading-relaxed">
              <HelpCircle className="h-5 w-5 shrink-0 mt-0.5 text-[var(--lh-primary)]" />
              <span>{currentQ.question}</span>
            </div>
          </div>

          {/* Multiple choice or Input */}
          {currentQ.quizType === "multiple_choice" && currentQ.options ? (
            <div className="space-y-2.5">
              {currentQ.options.map((opt, oIdx) => (
                <button
                  key={oIdx}
                  onClick={() =>
                    setUserAnswers((prev) => ({ ...prev, [currentQ.id]: opt }))
                  }
                  className={`min-h-12 w-full rounded-2xl p-4 text-sm text-left transition font-medium border cursor-pointer ${
                    userAnswers[currentQ.id] === opt
                      ? "bg-[var(--lh-primary)] text-white border-[var(--lh-primary)] shadow-xs"
                      : "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)]"
                  }`}
                >
                  {oIdx + 1}. {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={userAnswers[currentQ.id] || ""}
              onChange={(e) =>
                setUserAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
              }
              placeholder="정답을 직접 입력하세요..."
              aria-label="복습 답안"
              className="min-h-12 w-full rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-3 text-sm text-[var(--lh-ink)] placeholder-[var(--lh-ink-tertiary)] focus:border-[var(--lh-primary)] focus:outline-none transition font-medium"
            />
          )}

          {/* Actions */}
          {!results[currentQ.id] ? (
            <button
              onClick={() => handleCheckAnswer(currentQ)}
              disabled={!userAnswers[currentQ.id]}
              className="min-h-12 rounded-full bg-[var(--lh-primary)] px-7 text-sm font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition disabled:opacity-40 cursor-pointer"
            >
              답안 확인하기
            </button>
          ) : (
            <div className="space-y-4 border-t border-[var(--lh-line)] pt-5">
              <div
                className={`rounded-2xl border p-5 text-xs space-y-2 ${
                  results[currentQ.id].status === "correct"
                    ? "border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)]"
                    : results[currentQ.id].status === "incorrect"
                    ? "border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)]"
                    : "border-[var(--lh-line)] bg-[var(--lh-surface-subtle)]"
                }`}
              >
                <div className="font-medium flex items-center gap-2 text-sm">
                  {results[currentQ.id].status === "correct" ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-[var(--lh-primary)]" />
                      <span className="text-[var(--lh-primary-text)]">정답입니다. 기억 보존율이 상승했습니다.</span>
                    </>
                  ) : results[currentQ.id].status === "unknown" ? (
                    <>
                      <HelpCircle className="h-5 w-5 text-[var(--lh-ink-secondary)]" />
                      <span className="text-[var(--lh-ink)]">자동 채점 미지원 문항입니다.</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-[var(--lh-secondary)]" />
                      <span className="text-[var(--lh-secondary-text)]">오답입니다. 정답: {currentQ.answer}</span>
                    </>
                  )}
                </div>
                <p className={`text-xs leading-relaxed font-normal ${
                  results[currentQ.id].status === "correct"
                    ? "text-[var(--lh-primary-text)]"
                    : results[currentQ.id].status === "incorrect"
                    ? "text-[var(--lh-secondary-text)]"
                    : "text-[var(--lh-ink-secondary)]"
                }`}>
                  {results[currentQ.id].explanation}
                </p>
              </div>

              <button
                onClick={handleNextQuestion}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-7 text-sm font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition cursor-pointer"
              >
                <span>다음 복습 문항</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </article>
      ) : (
        <div className="rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-12 text-center text-xs text-[var(--lh-ink-secondary)] shadow-xs">
          현재 예정된 복습 큐가 비어있습니다.
        </div>
      )}
    </div>
  );
};
