import React from "react";
import { CheckCircle2, ArrowRight, Home, BookOpen, RotateCcw, Sparkles } from "lucide-react";
import { Course, LessonMeta } from "../../types/learning";

interface LessonCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseTitle: string;
  lessonTitle: string;
  conceptName: string;
  quizCount: number;
  answeredQuizCount?: number;
  correctCount: number;
  newUnderstanding?: number;
  completionKind?: "read_only" | "quiz_checked";
  reviewScheduleStatus?: "scheduled" | "not_scheduled" | "unavailable";
  savedStatus?: "saved" | "error" | "pending";
  nextLesson?: {
    course: Course;
    lesson: LessonMeta;
    chapterTitle: string;
  } | null;
  onStartNextLesson?: () => void;
  onGoHome: () => void;
}

export const LessonCompletionModal: React.FC<LessonCompletionModalProps> = ({
  isOpen,
  onClose,
  courseTitle,
  lessonTitle,
  conceptName,
  quizCount,
  answeredQuizCount = 0,
  correctCount,
  newUnderstanding,
  completionKind = "quiz_checked",
  reviewScheduleStatus = "unavailable",
  savedStatus = "saved",
  nextLesson,
  onStartNextLesson,
  onGoHome,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-[#E9E9E7] bg-white p-6 shadow-2xl text-[#2F3437] animate-fade-in space-y-6">
        {/* Header Badge & Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#F7F6F3] border border-[#E9E9E7] text-3xl">
            👏
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#191919]">
            수고하셨습니다! 학습을 완료했습니다.
          </h2>
          <p className="text-xs text-[#787774]">
            {courseTitle} • <span className="font-semibold text-[#191919]">{lessonTitle}</span>
          </p>
        </div>

        {/* Learning Achievement Box */}
        <div className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-4 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-[#E9E9E7] pb-2">
            <span className="font-bold text-[#191919] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>오늘의 성취 요약</span>
            </span>
            <span className="text-[11px] text-[#787774]">
              {savedStatus === "saved" ? "레슨 완료 기록 저장됨" : savedStatus === "pending" ? "저장 확인 중" : "저장되지 않음"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-md border border-[#E9E9E7] bg-white p-3 text-center">
              <span className="block text-[11px] text-[#787774]">학습 기록 참고 지표</span>
              <span className="mt-1 block font-mono text-xl font-bold text-[#191919]">
                {completionKind === "quiz_checked" && newUnderstanding !== undefined ? `${newUnderstanding}%` : "읽기 완료"}
              </span>
              <span className="text-[10px] text-[#787774]">
                {completionKind === "quiz_checked" && newUnderstanding !== undefined ? `[${conceptName}] · 정답 기록 기반` : "숙련도는 아직 측정하지 않음"}
              </span>
            </div>

            <div className="rounded-md border border-[#E9E9E7] bg-white p-3 text-center">
              <span className="block text-[11px] text-[#787774]">확인 퀴즈 결과</span>
              <span className="mt-1 block font-mono text-xl font-bold text-[#191919]">
                {quizCount > 0 ? `${correctCount} / ${quizCount}` : "확인 문제 없음"}
              </span>
              <span className="text-[10px] text-[#787774]">
                {quizCount === 0
                  ? "읽기 완료만 기록"
                  : answeredQuizCount < quizCount
                    ? `${quizCount - answeredQuizCount}개 문항은 아직 확인하지 않음`
                    : correctCount === quizCount
                      ? "확인 문제 모두 정답"
                      : "오답은 복습 대상으로 남김"}
              </span>
            </div>
          </div>

          {/* Retention & Review Note */}
          <div className="rounded-md bg-white border border-[#E9E9E7] p-2.5 text-[11px] text-[#787774] flex items-start gap-2">
            <RotateCcw className="h-3.5 w-3.5 text-[#191919] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {reviewScheduleStatus === "scheduled"
                ? <>장기 기억을 위해 <strong className="text-[#191919]">복습 문제를 예약했습니다.</strong></>
                : reviewScheduleStatus === "not_scheduled"
                  ? "확인 문제를 예약하지 않았습니다. 다음 학습에서 다시 확인해 보세요."
                  : "복습 예약 상태를 확인하지 못했습니다."}
            </p>
          </div>
        </div>

        {/* Next Action Buttons */}
        <div className="space-y-2">
          {nextLesson && onStartNextLesson ? (
            <button
              onClick={() => {
                onClose();
                onStartNextLesson();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#191919] py-3 text-xs font-semibold text-white shadow-md hover:bg-[#37352F] transition cursor-pointer"
            >
              <span>다음 레슨 시작: {nextLesson.lesson.title}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                onClose();
                onGoHome();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#191919] py-3 text-xs font-semibold text-white shadow-md hover:bg-[#37352F] transition cursor-pointer"
            >
              <span>홈(대시보드)으로 가기</span>
              <Home className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={() => {
              onClose();
              onGoHome();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E9E9E7] bg-white py-2.5 text-xs font-semibold text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919] transition cursor-pointer"
          >
            <Home className="h-3.5 w-3.5" />
            <span>오늘 공부 마치고 홈으로 이동</span>
          </button>
        </div>
      </div>
    </div>
  );
};
