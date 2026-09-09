import React, { useState } from "react";
import { ReviewQuestion, UserSkill } from "../types/learning";
import { StorageService } from "../services/storage";
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
      const res = await fetch("/api/ai/generate-review", {
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
    } catch {
      alert("AI 복습 세션 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingMore(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16 text-[#2F3437]">
      {/* Notion Header Banner */}
      <section className="rounded-lg border border-[#E9E9E7] bg-white p-6 space-y-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
          <RotateCcw className="w-3.5 h-3.5" />
           <span>SCHEDULED REVIEW • 예약 복습</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-[#191919]">
            예정된 복습 큐
          </h1>
          <p className="text-xs leading-relaxed text-[#787774]">
            저장된 복습 예정 시각이 지난 문항을 점검합니다. 오답은 다음 복습 일정으로 다시 예약됩니다.
          </p>
        </div>

        {weakSkills.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-[#787774]">
              결손 추적 중:
            </span>
            {weakSkills.map((s) => (
              <span
                key={s.conceptId}
                className="text-[11px] bg-[#F7F6F3] border border-[#E9E9E7] px-2 py-0.5 rounded-sm font-medium text-[#191919]"
              >
                {s.conceptName} ({s.understanding}%)
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Completion View */}
      {completedSession ? (
        <div className="rounded-lg border border-[#E9E9E7] bg-white p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#F7F6F3] text-[#191919] mx-auto flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-bold text-[#191919]">
              오늘의 복습 큐를 모두 마쳤습니다
            </h2>
            <p className="text-[#787774] text-xs">
              개념별 이해도가 장기 기억 보존 데이터베이스에 안전하게 갱신되었습니다.
            </p>
          </div>

          <button
            onClick={handleGenerateAiReviewSession}
            disabled={isGeneratingMore || weakSkills.length === 0}
            className="bg-[#191919] hover:bg-[#37352F] text-white font-medium px-4 py-2 rounded-md text-xs inline-flex items-center gap-2 disabled:opacity-40 transition-colors"
          >
            {isGeneratingMore ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>추가 복습 문항 생성 중...</span>
              </>
            ) : (
              <span>취약 개념 추가 복습 큐 생성 ⏎</span>
            )}
          </button>
        </div>
      ) : reviews.length > 0 && currentQ ? (
        /* Active Review Card */
        <article className="rounded-lg border border-[#E9E9E7] bg-white p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-3 text-xs text-[#787774]">
            <span className="font-semibold text-[#191919]">
              {currentQ.courseTitle} • {currentQ.conceptName}
            </span>
            <span className="font-mono font-bold">
              {currentIdx + 1} / {reviews.length}
            </span>
          </div>

          {/* Question Text */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-[#191919]">
              <HelpCircle className="w-4 h-4" />
              <span>{currentQ.question}</span>
            </div>
          </div>

          {/* Multiple choice or Input */}
          {currentQ.quizType === "multiple_choice" && currentQ.options ? (
            <div className="space-y-2">
              {currentQ.options.map((opt, oIdx) => (
                <button
                  key={oIdx}
                  onClick={() =>
                    setUserAnswers((prev) => ({ ...prev, [currentQ.id]: opt }))
                  }
                  className={`w-full p-3 rounded-md text-xs text-left transition-colors font-medium border ${
                    userAnswers[currentQ.id] === opt
                      ? "bg-[#191919] text-white border-[#191919]"
                      : "bg-white border-[#E9E9E7] text-[#2F3437] hover:bg-[#F7F6F3]"
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
              className="w-full rounded-md border border-[#E9E9E7] bg-white px-3.5 py-2.5 text-xs text-[#191919] placeholder-[#9B9A97] focus:border-[#191919] focus:outline-none"
            />
          )}

          {/* Actions */}
          {!results[currentQ.id] ? (
            <button
              onClick={() => handleCheckAnswer(currentQ)}
              disabled={!userAnswers[currentQ.id]}
              className="bg-[#191919] hover:bg-[#37352F] disabled:opacity-40 text-white font-medium px-4 py-2 rounded-md text-xs transition-colors"
            >
              정답 검증 ⏎
            </button>
          ) : (
            <div className="space-y-3 border-t border-[#E9E9E7] pt-4">
                <div
                  className={`p-3.5 rounded-md border text-xs space-y-1 ${
                    results[currentQ.id].status === "correct"
                      ? "bg-[#F7F6F3] border-[#E9E9E7] text-[#191919]"
                      : "bg-[#FBFBFA] border-[#D3D3D0] text-[#191919]"
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                  {results[currentQ.id].status === "correct" ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#191919]" />
                      <span>정답입니다. 기억 보존율이 상승했습니다.</span>
                    </>
                  ) : results[currentQ.id].status === "unknown" ? (
                    <>
                      <HelpCircle className="w-4 h-4 text-[#787774]" />
                      <span>자동 채점 미지원 문항입니다.</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-[#787774]" />
                      <span>오답입니다. 정답: {currentQ.answer}</span>
                    </>
                  )}
                </div>
                <p className="text-[#787774] leading-relaxed">
                  {results[currentQ.id].explanation}
                </p>
              </div>

              <button
                onClick={handleNextQuestion}
                className="bg-[#191919] hover:bg-[#37352F] text-white font-medium px-4 py-2 rounded-md text-xs inline-flex items-center gap-1.5 transition-colors"
              >
                <span>다음 복습 문항</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </article>
      ) : (
        <div className="rounded-lg border border-[#E9E9E7] bg-white p-8 text-center text-xs text-[#787774]">
          현재 예정된 복습 큐가 비어있습니다.
        </div>
      )}
    </div>
  );
};
