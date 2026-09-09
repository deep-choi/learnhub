import React, { useEffect, useState } from "react";
import { Award, ChevronRight, Target, X } from "lucide-react";
import { Course } from "../../types/learning";
import { NotionPageView } from "./Sidebar";

interface PlacementTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  onSelectView: (view: NotionPageView) => void;
}

interface DiagnosticQuestion {
  id: string;
  stage: "초등" | "중등" | "고등";
  title: string;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

const QUESTIONS: DiagnosticQuestion[] = [
  {
    id: "diag-1",
    stage: "초등",
    title: "1. 수와 연산",
    question: "두 분수 1/2 과 1/3 을 더하기 위해 통분할 때 가장 알맞은 최소공배수 공통분모는?",
    options: ["5", "6", "10", "12"],
    answer: "6",
    explanation: "2와 3의 최소공배수는 6이므로 최소 공통분모는 6입니다. 3/6 + 2/6 = 5/6 으로 계산합니다.",
  },
  {
    id: "diag-2",
    stage: "중등",
    title: "2. 방정식과 논리",
    question: "방정식 2x + 4 = 12 에서 미지수 x의 값은?",
    options: ["2", "4", "6", "8"],
    answer: "4",
    explanation: "양변에서 4를 빼면 2x = 8, 2로 나누면 x = 4 입니다.",
  },
  {
    id: "diag-3",
    stage: "고등",
    title: "3. 변화율과 극한",
    question: "함수 f(x) = x²의 x = 2에서의 순간변화율(미분계수 f'(2))은?",
    options: ["2", "4", "6", "8"],
    answer: "4",
    explanation: "f'(x) = 2x 이므로 f'(2) = 2 * 2 = 4 입니다.",
  },
];

export const PlacementTestModal: React.FC<PlacementTestModalProps> = ({
  isOpen,
  onClose,
  courses,
  onSelectView,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [qId: string]: string }>({});
  const [isFinished, setIsFinished] = useState(false);
  const [showSessionChoice, setShowSessionChoice] = useState(false);

  const hasDiagnosticProgress = currentIdx > 0 || Object.keys(userAnswers).length > 0 || isFinished;

  useEffect(() => {
    if (isOpen && hasDiagnosticProgress) setShowSessionChoice(true);
  }, [isOpen, hasDiagnosticProgress]);

  const handleRestart = () => {
    setCurrentIdx(0);
    setUserAnswers({});
    setIsFinished(false);
    setShowSessionChoice(false);
  };

  if (!isOpen) return null;

  const currentQ = QUESTIONS[currentIdx];

  const handleSelectOption = (opt: string) => {
    setUserAnswers((prev) => ({ ...prev, [currentQ.id]: opt }));
  };

  const handleNext = () => {
    if (currentIdx < QUESTIONS.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const calculateScore = () => {
    let score = 0;
    QUESTIONS.forEach((q) => {
      if (userAnswers[q.id] === q.answer) score++;
    });
    return score;
  };

  const score = calculateScore();

  const getRecommendation = () => {
    if (score === 3) {
      return {
        level: "변화율·미적분 개념을 살펴봐요",
        desc: "기초 계산과 변화율 감각을 확인했습니다. 변화율과 미적분 개념을 다음 주제로 살펴볼 수 있습니다.",
        courseId: "course-high-math-01",
      };
    }
    if (score === 2) {
      return {
        level: "방정식의 원리를 살펴봐요",
        desc: "미지수 풀이와 등식의 성질을 확인했습니다. 방정식의 원리를 다음 주제로 살펴볼 수 있습니다.",
        courseId: "course-mid-math-01",
      };
    }
    return {
      level: "분수의 원리를 살펴봐요",
      desc: "분수의 덧셈과 통분 원리부터 차근차근 살펴볼 수 있습니다. 필요한 기초부터 편하게 시작하세요.",
      courseId: "course-elem-math-01",
    };
  };

  const recommendation = getRecommendation();

  const handleStartRecommendedCourse = () => {
    const targetCourse =
      courses.find((c) => c.id === recommendation.courseId) || courses[0];
    const resumeLesson = targetCourse?.chapters
      .flatMap((chapter) => chapter.lessons)
      .find((lesson) => !lesson.isCompleted) || targetCourse?.chapters[0]?.lessons[0];
    if (targetCourse && resumeLesson) {
      onSelectView({
        type: "lesson",
        course: targetCourse,
        lesson: resumeLesson,
        chapterTitle: targetCourse.chapters.find((chapter) =>
          chapter.lessons.some((lesson) => lesson.id === resumeLesson.id),
        )?.title || targetCourse.chapters[0].title,
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-8 shadow-2xl space-y-6 text-[var(--lh-ink)] text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--lh-line)] pb-4">
          <div className="flex items-center gap-2.5 font-medium text-[var(--lh-ink)] text-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] text-[var(--lh-primary)] shadow-xs">
              <Target className="h-4 w-4" />
            </span>
            <span>간단한 수학 체험 진단 (선택)</span>
          </div>
          <button
            onClick={onClose}
            className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showSessionChoice ? (
          <div className="space-y-5 text-center">
            <div className="rounded-2xl bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] p-4 text-left text-xs text-[var(--lh-ink-secondary)] leading-relaxed font-normal shadow-xs">
              이전 체험 진단이 진행 중이거나 결과가 남아 있습니다. 이 진단은 전체 실력을 판정하지 않는 참고용 체험입니다.
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowSessionChoice(false)}
                className="flex-1 min-h-11 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] py-2.5 text-xs font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] shadow-xs transition cursor-pointer"
              >
                이어보기
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="flex-1 min-h-11 rounded-full bg-[var(--lh-primary)] py-2.5 text-xs font-medium text-white hover:bg-[var(--lh-primary-hover)] shadow-xs transition cursor-pointer"
              >
                새로 시작
              </button>
            </div>
          </div>
        ) : !isFinished ? (
          /* Ongoing Test */
          <div className="space-y-4">
            <div className="rounded-2xl bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] p-3.5 text-xs leading-relaxed text-[var(--lh-ink-secondary)] font-normal shadow-xs">
              모르는 문제는 건너뛰어도 됩니다. 결과는 학습 순서를 제안하는 참고 자료로만 사용됩니다.
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--lh-ink-secondary)] font-normal">
              <span className="font-medium text-[var(--lh-ink)]">{currentQ.title}</span>
              <span className="font-mono text-xs rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-2.5 py-0.5 text-[var(--lh-primary-text)] font-medium">
                {currentIdx + 1} / {QUESTIONS.length}
              </span>
            </div>

            <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 font-medium text-[var(--lh-ink)] text-sm sm:text-base leading-relaxed shadow-xs">
              {currentQ.question}
            </div>

            <div className="space-y-2">
              {currentQ.options.map((opt, oIdx) => (
                <button
                  key={oIdx}
                  onClick={() => handleSelectOption(opt)}
                  className={`min-h-12 w-full rounded-2xl border p-3.5 text-left text-xs sm:text-sm transition cursor-pointer shadow-xs ${
                    userAnswers[currentQ.id] === opt
                      ? "bg-[var(--lh-primary)] text-white border-[var(--lh-primary)] font-medium"
                      : "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] font-normal"
                  }`}
                >
                  {oIdx + 1}. {opt}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setUserAnswers((prev) => ({ ...prev, [currentQ.id]: "아직 안 배웠음" }));
                  handleNext();
                }}
                className="text-xs font-medium text-[var(--lh-ink-secondary)] hover:text-[var(--lh-primary)] underline cursor-pointer"
              >
                아직 안 배웠어요 (건너뛰기)
              </button>

              <button
                onClick={handleNext}
                disabled={!userAnswers[currentQ.id]}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-xs font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition disabled:opacity-30 cursor-pointer"
              >
                <span>{currentIdx === QUESTIONS.length - 1 ? "진단 결과 보기" : "다음 문항"}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Finished Result & Recommendation */
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] text-[var(--lh-primary)] shadow-xs">
              <Award className="h-7 w-7" />
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--lh-primary)]">
                체험 진단 결과: {score} / 3 문항 정답
              </div>
              <h2 className="text-xl font-medium text-[var(--lh-ink)]">
                참고용 시작점: {recommendation.level}
              </h2>
              <p className="text-xs text-[var(--lh-ink-secondary)] leading-relaxed font-normal pt-1">
                {recommendation.desc}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 text-left space-y-1.5 shadow-xs">
              <div className="font-medium text-xs text-[var(--lh-ink)]">선택적 참고 제안:</div>
              <p className="text-xs text-[var(--lh-ink-secondary)] leading-relaxed font-normal">
                세 문항으로 전체 실력을 판정할 수는 없습니다. 이 결과는 수학 학습을 시작할 위치를 정하는 참고용 제안입니다.
              </p>
            </div>

            <button
              onClick={handleStartRecommendedCourse}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition cursor-pointer"
            >
              제안된 과정 시작하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
