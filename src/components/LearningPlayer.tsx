import React, { useState, useEffect } from "react";
import { Course, LessonMeta, LessonContent, LessonStep, QuizData } from "../types/learning";
import { StorageService } from "../services/storage";
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
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [selectedHintIdx, setSelectedHintIdx] = useState<{ [stepIdx: number]: number }>({});

  useEffect(() => {
    async function loadContent() {
      setIsLoadingContent(true);

      const cached = StorageService.getCachedLessonContent(lessonMeta.id);
      if (cached) {
        setLessonContent(cached);
        setIsLoadingContent(false);
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
        });

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
              content: `${lessonMeta.conceptName}의 근본 원리입니다.\n\n수학적 정의와 개념의 배경:\n선수 지식과의 연결점을 사유하며 다음 단계의 유도 질문으로 나아갑니다.`,
            },
            {
              id: "step-2",
              type: "example",
              title: "사유를 돕는 구체적 전개",
              content: "공식에 의존하지 않고 양변의 대칭성과 기하학적 의미를 추론합니다.",
            },
            {
              id: "step-3",
              type: "quiz",
              title: "개념 자가 검증",
              content: "방금 사유한 원리를 적용하여 다음 질문에 답해보세요.",
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
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 text-[#787774]">
        <Loader2 className="w-6 h-6 animate-spin text-[#191919]" />
        <div className="text-center space-y-1">
          <p className="font-semibold text-xs text-[#191919]">소크라틱 교과 레슨을 구성하는 중입니다...</p>
          <p className="text-[11px]">개념 위계와 진단 질문을 체계화하고 있습니다.</p>
        </div>
      </div>
    );
  }

  if (!lessonContent || !lessonContent.steps.length) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-xs text-[#787774]">레슨을 불러올 수 없습니다.</p>
        <button
          onClick={onClosePlayer}
          className="text-xs bg-[#191919] text-white px-3 py-1.5 rounded-md"
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
    } catch {
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
    <div className="max-w-[760px] mx-auto space-y-6 pb-16 text-[#2F3437]">
      {/* 1. Top Bar */}
      <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-3 text-xs">
        <button
          onClick={onClosePlayer}
          className="flex items-center gap-1 text-[#787774] hover:text-[#191919] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>나가기</span>
        </button>

        <div className="text-center truncate px-2">
          <span className="text-[11px] font-semibold text-[#787774]">
            {chapterTitle} / {lessonMeta.conceptName}
          </span>
        </div>

        <div className="font-mono text-xs font-bold text-[#191919]">
          {currentStepIdx + 1} / {steps.length}
        </div>
      </div>

      {/* Progress Bar (Hairline) */}
      <div className="w-full bg-[#E9E9E7] h-1 rounded-full overflow-hidden">
        <div
          className="bg-[#191919] h-full transition-all duration-200"
          style={{ width: `${((currentStepIdx + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* 2. Main Reading Canvas (Editorial Style) */}
      <article className="rounded-lg border border-[#E9E9E7] bg-white p-6 sm:p-8 space-y-6 min-h-[420px] flex flex-col justify-between">
        <div className="space-y-6">
          {/* Header Tag + AI Button */}
          <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-3">
            <span className="rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-2 py-0.5 text-[11px] font-bold text-[#191919]">
              {currentStep.type === "concept" && "개념 원리"}
              {currentStep.type === "example" && "구체 예시 전개"}
              {currentStep.type === "practice" && "사유 실습"}
              {currentStep.type === "quiz" && "메타인지 점검"}
              {currentStep.type === "summary" && "핵심 요약"}
            </span>

            <button
              onClick={() => setIsTutorOpen(true)}
              className="text-xs bg-[#F7F6F3] hover:bg-[#EFEFED] text-[#191919] border border-[#E9E9E7] px-2.5 py-1 rounded-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              <Bot className="w-3.5 h-3.5 text-[#191919]" />
              <span>✦ AI 파트너 질의</span>
            </button>
          </div>

          {/* Title & Body */}
          <div className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#191919]">
              {currentStep.title}
            </h2>

            <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#2F3437]">
              {currentStep.content}
            </div>
          </div>

          {/* Code/Formula Snippet */}
          {currentStep.codeSnippet && (
            <div className="rounded-md border border-[#E9E9E7] bg-[#F7F6F3] p-4 font-mono text-xs text-[#191919] overflow-x-auto">
              <pre>{currentStep.codeSnippet}</pre>
            </div>
          )}

          {/* Quiz Section */}
          {currentStep.quiz && (
            <div className="mt-6 rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-5 space-y-4">
              <div className="text-sm font-bold text-[#191919] flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#191919]" />
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
                      className={`w-full p-3 rounded-md text-xs text-left transition-colors font-medium border ${
                        userAnswers[currentStepIdx] === opt
                          ? "bg-[#191919] text-white border-[#191919]"
                          : "bg-white border-[#E9E9E7] text-[#2F3437] hover:bg-[#F7F6F3]"
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
                  className="w-full bg-white border border-[#E9E9E7] focus:border-[#191919] rounded-md px-3.5 py-2.5 text-xs text-[#191919] placeholder-[#9B9A97] focus:outline-none"
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
                    className="text-xs text-[#787774] hover:text-[#191919] font-medium flex items-center gap-1"
                  >
                    <Brain className="w-3 h-3" />
                    <span>
                      {selectedHintIdx[currentStepIdx] !== undefined
                        ? `단계별 힌트 (${selectedHintIdx[currentStepIdx] + 1}/${currentStep.quiz.hints.length})`
                        : "💡 힌트 열기"}
                    </span>
                  </button>

                  {selectedHintIdx[currentStepIdx] !== undefined && (
                    <div className="bg-[#F7F6F3] border border-[#E9E9E7] text-xs p-3 rounded-md text-[#2F3437]">
                      힌트: {currentStep.quiz.hints[selectedHintIdx[currentStepIdx]]}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              {!quizResults[currentStepIdx] && (
                <button
                  onClick={() => handleEvaluateQuiz(currentStep.quiz!)}
                  disabled={!userAnswers[currentStepIdx] || isEvaluating}
                  className="bg-[#191919] hover:bg-[#37352F] disabled:opacity-30 text-white font-medium px-4 py-2 rounded-md text-xs transition-colors"
                >
                  {isEvaluating ? "채점 분석 중..." : "답안 제출 ⏎"}
                </button>
              )}

              {/* Quiz Result Feedback */}
              {quizResults[currentStepIdx] && (
                <div
                  className={`p-4 rounded-md border space-y-1.5 ${
                    quizResults[currentStepIdx].isCorrect
                      ? "bg-[#F7F6F3] border-[#E9E9E7] text-[#191919]"
                      : "bg-[#FBFBFA] border-[#D3D3D0] text-[#191919]"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    {quizResults[currentStepIdx].isCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#191919]" />
                        <span>정답입니다.</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-[#787774]" />
                        <span>오답입니다. 다시 한번 원리를 점검해보세요.</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-[#787774]">
                    {quizResults[currentStepIdx].feedback}
                  </p>
                  {quizResults[currentStepIdx].hint && (
                    <div className="text-[11px] text-[#787774] border-t border-[#E9E9E7] pt-1.5 mt-1">
                      해설: {quizResults[currentStepIdx].hint}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Navigation Controls */}
        <div className="pt-6 border-t border-[#E9E9E7] flex items-center justify-between gap-4">
          <button
            onClick={() => setCurrentStepIdx((prev) => Math.max(0, prev - 1))}
            disabled={currentStepIdx === 0}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-[#787774] hover:bg-[#F7F6F3] border border-[#E9E9E7] disabled:opacity-30 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>이전</span>
          </button>

          {isLastStep ? (
            <button
              onClick={handleFinishLesson}
              disabled={!isCurrentStepComplete}
              className="bg-[#191919] hover:bg-[#37352F] disabled:opacity-30 text-white font-medium px-4 py-2 rounded-md text-xs flex items-center gap-1.5 transition-colors"
            >
              <Award className="w-3.5 h-3.5" />
              <span>레슨 완료 및 기록 저장</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentStepIdx((prev) => Math.min(steps.length - 1, prev + 1))}
              disabled={!isCurrentStepComplete}
              className="bg-[#191919] hover:bg-[#37352F] disabled:opacity-30 text-white font-medium px-4 py-2 rounded-md text-xs flex items-center gap-1.5 transition-colors"
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