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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-lg border border-[#E9E9E7] bg-white p-6 shadow-2xl space-y-6 text-[#2F3437] text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-3">
          <div className="flex items-center gap-1.5 font-bold text-[#191919]">
            <Target className="h-4 w-4" />
            <span>간단한 수학 체험 진단 (선택)</span>
          </div>
          <button onClick={onClose} className="text-[#787774] hover:text-[#191919] cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {showSessionChoice ? (
          <div className="space-y-4 text-center">
            <div className="rounded-md bg-[#F7F6F3] p-3 text-left text-[11px] text-[#787774] leading-relaxed">
              이전 체험 진단이 진행 중이거나 결과가 남아 있습니다. 이 진단은 전체 실력을 판정하지 않는 참고용 체험입니다.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowSessionChoice(false)}
                className="flex-1 rounded-md border border-[#E9E9E7] bg-white py-2.5 text-xs font-semibold text-[#787774] hover:bg-[#F7F6F3] cursor-pointer"
              >
                이어보기
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="flex-1 rounded-md bg-[#191919] py-2.5 text-xs font-semibold text-white hover:bg-[#37352F] cursor-pointer"
              >
                새로 시작
              </button>
            </div>
          </div>
        ) : !isFinished ? (
          /* Ongoing Test */
          <div className="space-y-4">
            <div className="rounded-md bg-[#F7F6F3] p-2.5 text-[11px] text-[#787774] leading-relaxed">
              💡 <span className="font-semibold text-[#191919]">틀려도 괜찮아요!</span> 아직 안 배운 문제는 아래의 <b>'아직 안 배웠어요'</b>를 누르면 나에게 딱 맞는 과정부터 편하게 시작해요.
            </div>

            <div className="flex items-center justify-between text-[#787774]">
              <span className="font-semibold text-[#191919]">{currentQ.title}</span>
              <span className="font-mono text-[11px]">{currentIdx + 1} / {QUESTIONS.length}</span>
            </div>

            <div className="rounded-md border border-[#E9E9E7] bg-white p-4 font-medium text-[#191919] text-sm">
              {currentQ.question}
            </div>

            <div className="space-y-2">
              {currentQ.options.map((opt, oIdx) => (
                <button
                  key={oIdx}
                  onClick={() => handleSelectOption(opt)}
                  className={`w-full rounded-md border p-3 text-left transition cursor-pointer ${
                    userAnswers[currentQ.id] === opt
                      ? "bg-[#191919] text-white border-[#191919] font-semibold"
                      : "bg-white border-[#E9E9E7] text-[#2F3437] hover:bg-[#F7F6F3]"
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
                className="text-xs text-[#787774] hover:text-[#191919] underline cursor-pointer"
              >
                아직 안 배웠어요 (건너뛰기)
              </button>

              <button
                onClick={handleNext}
                disabled={!userAnswers[currentQ.id]}
                className="flex items-center gap-1 rounded-md bg-[#191919] px-4 py-2 text-white hover:bg-[#37352F] disabled:opacity-30 transition cursor-pointer"
              >
                <span>{currentIdx === QUESTIONS.length - 1 ? "진단 결과 보기" : "다음 문항"}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Finished Result & Recommendation */
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F7F6F3] text-[#191919]">
              <Award className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
                체험 진단 결과: {score} / 3 문항 정답
              </div>
              <h2 className="text-lg font-bold text-[#191919]">
                참고용 시작점: {recommendation.level}
              </h2>
              <p className="text-[#787774] leading-relaxed pt-1">
                {recommendation.desc}
              </p>
            </div>

            <div className="rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-4 text-left space-y-2">
                <div className="font-bold text-[11px] text-[#191919]">선택적 참고 제안:</div>
              <p className="text-[11px] text-[#787774]">
                세 문항으로 전체 실력을 판정할 수는 없습니다. 이 결과는 수학 학습을 시작할 위치를 정하는 참고용 제안입니다.
              </p>
            </div>

            <button
              onClick={handleStartRecommendedCourse}
              className="w-full rounded-md bg-[#191919] py-2.5 text-xs font-semibold text-white hover:bg-[#37352F] transition cursor-pointer"
            >
              추천 맞춤 코스로 바로 공부 시작하기 ⏎
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
