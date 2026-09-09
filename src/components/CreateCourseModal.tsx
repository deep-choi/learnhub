import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Brain, Clock3, Loader2, Target, X, CheckCircle2, RotateCcw, BookOpen } from "lucide-react";
import { Course } from "../types/learning";
import { validateCurriculumPayload } from "../domain/contentValidation";
import { getLearningSupport } from "../domain/learningSupport";

interface CreateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCourseCreated: (course: Course) => void;
  initialSubject?: string;
  autoGenerate?: boolean;
}

const PRESET_TOPICS = [
  "파이썬으로 반복 업무 줄이기",
  "여행 일본어 기초 회화",
  "스마트폰 사진 구도",
  "그림의 색과 대비",
  "초등 분수의 덧셈과 통분",
];

const GOAL_OPTIONS = [
  { id: "원리 탐구", label: "기초 원리 탐구", desc: "왜 그런지 기본부터 차근차근" },
  { id: "시험 대비", label: "시험/성적 대비", desc: "학교 시험이나 평가 준비" },
  { id: "실무 적용", label: "실무/전공 적용", desc: "대학 과제나 실무 활용" },
  { id: "교양 상식", label: "취미/교양 상식", desc: "가볍고 즐겁게 배우기" },
];

const STYLE_OPTIONS = [
  { id: "concept", label: "개념 설명 중심", desc: "쉬운 비유와 꼼꼼한 설명" },
  { id: "problem_solving", label: "문제 풀이 중심", desc: "예제와 퀴즈로 바로 연습" },
  { id: "dialogue", label: "대화형 문답 중심", desc: "AI 선생님과 묻고 답하며 탐구" },
];

export const CreateCourseModal: React.FC<CreateCourseModalProps> = ({
  isOpen,
  onClose,
  onCourseCreated,
  initialSubject,
  autoGenerate = false,
}) => {
  const [subjectInput, setSubjectInput] = useState("");
  const [level, setLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [goal, setGoal] = useState("원리 탐구");
  const [dailyMinutes, setDailyMinutes] = useState(15);
  const [learningStyle, setLearningStyle] = useState<string>("concept");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showPreviewSupportDetails, setShowPreviewSupportDetails] = useState(false);

  // Preview state
  const [previewCourse, setPreviewCourse] = useState<Course | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const autoGenerateKeyRef = useRef<string | null>(null);
  const deferredUnmountAbortRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (deferredUnmountAbortRef.current !== null) {
      clearTimeout(deferredUnmountAbortRef.current);
      deferredUnmountAbortRef.current = null;
    }
    return () => {
      // Defer one tick so React StrictMode's effect replay can cancel this
      // cleanup before the first request is aborted or needlessly replaced.
      deferredUnmountAbortRef.current = setTimeout(() => {
        requestRef.current?.abort();
        requestRef.current = null;
        requestIdRef.current += 1;
        deferredUnmountAbortRef.current = null;
      }, 0);
    };
  }, []);

  const handleGenerate = async (event?: React.FormEvent, subjectOverride?: string) => {
    if (event) event.preventDefault();
    if (isLoading) return;
    const subject = (subjectOverride ?? subjectInput).trim();
    if (!subject) {
      setErrorMessage("배우고 싶은 교과 과목 또는 주제를 입력해주세요.");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);
    requestRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    requestRef.current = controller;

    try {
      const response = await fetch("/api/ai/analyze-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, level, goal, dailyMinutes, learningStyle }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("AI 커리큘럼 생성 중 오류가 발생했습니다.");

      const data = await response.json();
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      if (!data || !Array.isArray(data.chapters)) {
        throw new Error("커리큘럼 응답 형식이 올바르지 않습니다.");
      }
      const validationErrors = validateCurriculumPayload(data);
      if (validationErrors.length > 0) {
        throw new Error(`커리큘럼 검증 실패: ${validationErrors[0]}`);
      }
      const courseId = `course-${Date.now()}`;
      const chapters = data.chapters.map((chapter: any, chapterIndex: number) => {
        const chapterId = `${courseId}-chapter-${chapterIndex}`;
        return {
          id: chapterId,
          title: chapter.title,
          description: chapter.description,
          lessons: Array.isArray(chapter.lessons) ? chapter.lessons.map((lesson: any, lessonIndex: number) => ({
            id: `${chapterId}-lesson-${lessonIndex}`,
            chapterId,
            courseId,
            title: lesson.title,
            description: lesson.description,
            estimatedMinutes: lesson.estimatedMinutes || dailyMinutes,
            conceptId: lesson.conceptId || `concept_${chapterIndex}_${lessonIndex}`,
            conceptName: lesson.conceptName || lesson.title,
            isCompleted: false,
            isGenerated: false,
          })) : [],
        };
      });

      const totalGeneratedLessons = chapters.reduce((total, chapter) => total + chapter.lessons.length, 0);
      if (totalGeneratedLessons === 0) {
        throw new Error("커리큘럼에 시작할 레슨이 없습니다.");
      }

      const generated: Course = {
        id: courseId,
        title: data.courseTitle || subject,
        subject,
        learningType: (data.learningType as any) || "concept",
        learningTypeExplanation: data.learningTypeExplanation || "AI 맞춤 교과 커리큘럼입니다.",
        summary: data.summary || "AI가 설계한 맞춤형 교과 학습 경로입니다.",
        level,
        goal,
        dailyMinutes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        chapters,
      };

      if (requestId === requestIdRef.current && !controller.signal.aborted) {
        setPreviewCourse(generated);
      }
    } catch (error: any) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      console.error(error);
      setErrorMessage("커리큘럼 설계에 실패했습니다. 다시 시도해주세요.");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        requestRef.current = null;
      }
    }
  };

  useEffect(() => {
    const subject = initialSubject?.trim();
    if (!isOpen) {
      autoGenerateKeyRef.current = null;
      return;
    }
    if (!subject) return;
    setSubjectInput(subject);
    if (!autoGenerate || isLoading) return;
    const requestKey = `${isOpen}:${subject}`;
    if (autoGenerateKeyRef.current === requestKey) return;
    autoGenerateKeyRef.current = requestKey;
    void handleGenerate(undefined, subject);
  }, [autoGenerate, initialSubject, isOpen]);

  const handleClose = () => {
    requestIdRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    autoGenerateKeyRef.current = null;
    setIsLoading(false);
    setPreviewCourse(null);
    setShowPreviewSupportDetails(false);
    setErrorMessage("");
    onClose();
  };

  const handleConfirmCourse = () => {
    if (!previewCourse) return;
    onCourseCreated(previewCourse);
    setPreviewCourse(null);
    onClose();
  };

  const totalLessons = previewCourse
    ? previewCourse.chapters.reduce((acc, c) => acc + c.lessons.length, 0)
    : 0;
  const previewSupport = previewCourse ? getLearningSupport(previewCourse.learningType) : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-[#E9E9E7] bg-white p-6 shadow-2xl text-[#2F3437] animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#191919] text-xs font-bold text-white">
              +
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#191919]">
                {previewCourse ? "AI 맞춤 커리큘럼 미리보기" : "나만의 새 교과 과목 만들기"}
              </h2>
              <p className="text-[11px] text-[#787774]">
                {previewCourse
                  ? "AI가 설계한 구성을 확인하고 시작하세요."
                  : "배우고 싶은 것을 알려주시면 딱 맞는 공부 길을 열어드려요."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 2: Curriculum Preview */}
        {previewCourse ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">📚</span>
                <h3 className="text-base font-bold text-[#191919]">{previewCourse.title}</h3>
              </div>
              <p className="text-xs text-[#787774] leading-relaxed">{previewCourse.summary}</p>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E9E9E7] text-[11px] text-[#787774]">
                <span>총 {previewCourse.chapters.length}개 챕터</span>
                <span>•</span>
                <span>총 {totalLessons}개 레슨</span>
                <span>•</span>
                <span>하루 {previewCourse.dailyMinutes}분 목표</span>
              </div>
            </div>

            {previewSupport && (
              <div className="rounded-lg border border-[#E9E9E7] bg-white p-4 space-y-2 text-xs">
                <div className="font-bold text-[#191919]">{previewSupport.label} · 이번 학습에서 확인할 것</div>
                <p className="text-[#2F3437]">{previewSupport.successCriteria[0]}</p>
                <p className="text-[11px] text-[#787774]">
                  가능 범위: {previewSupport.notSupported.find((item) => item.includes("코드") || item.includes("음성")) || previewSupport.notSupported[0]}
                </p>
                <button type="button" onClick={() => setShowPreviewSupportDetails((open) => !open)} className="text-[11px] font-medium text-[#787774] underline hover:text-[#191919]">
                  {showPreviewSupportDetails ? "상세 기준 접기" : "학습 방식 상세 보기"}
                </button>
                {showPreviewSupportDetails && (
                  <div className="space-y-1 border-t border-[#E9E9E7] pt-2 text-[11px] text-[#787774]">
                    <p>바로 해볼 일: {previewSupport.adultTaskSuggestions[0]}</p>
                    <p>추가 성공 기준: {previewSupport.successCriteria[1]}</p>
                    <p>지원하는 방식: {previewSupport.supported[0]}</p>
                  </div>
                )}
              </div>
            )}

            {/* Chapters list preview */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-[#191919] block">
                학습 로드맵 구성:
              </span>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {previewCourse.chapters.map((chap, cIdx) => (
                  <div key={chap.id} className="rounded-md border border-[#E9E9E7] bg-white p-3 space-y-1.5 text-xs">
                    <div className="font-bold text-[#191919] flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#191919] text-[9px] text-white">
                        {cIdx + 1}
                      </span>
                      <span>{chap.title}</span>
                    </div>
                    <ul className="ml-5 list-disc text-[11px] text-[#787774] space-y-0.5">
                      {chap.lessons.map((les) => (
                        <li key={les.id}>
                          {les.title} <span className="text-[10px] text-[#9B9A97]">({les.estimatedMinutes}분)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#E9E9E7]">
              <button
                type="button"
                onClick={() => setPreviewCourse(null)}
                className="flex-1 rounded-md border border-[#E9E9E7] bg-white py-2.5 text-xs font-semibold text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919] transition cursor-pointer"
              >
                다시 설정하기
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isLoading}
                className="flex-1 rounded-md border border-[#E9E9E7] bg-white py-2.5 text-xs font-semibold text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919] disabled:opacity-50 transition cursor-pointer"
              >
                {isLoading ? "다시 설계 중..." : "다시 생성하기"}
              </button>
              <button
                type="button"
                onClick={handleConfirmCourse}
                className="flex-2 rounded-md bg-[#191919] py-2.5 text-xs font-semibold text-white hover:bg-[#37352F] transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>이대로 공부 시작하기</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Step 1: Questionnaire */
          <form onSubmit={handleGenerate} className="mt-4 space-y-4">
            {/* 1. Subject */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#191919]">
                1. 무엇을 배우고 싶으신가요?
              </label>
              <input
                type="text"
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                placeholder="예: 고등학교 미적분, 중학 일차방정식, 컴퓨터 기초, 파이썬"
                className="w-full rounded-md border border-[#E9E9E7] bg-white px-3.5 py-2 text-xs text-[#191919] placeholder-[#9B9A97] focus:border-[#191919] focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_TOPICS.map((topic) => (
                  <button
                    type="button"
                    key={topic}
                    onClick={() => setSubjectInput(topic)}
                    className="rounded-sm border border-[#E9E9E7] bg-[#FBFBFA] px-2 py-0.5 text-[11px] text-[#787774] transition hover:bg-[#F7F6F3] hover:text-[#191919]"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Goal */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#191919]">
                2. 왜 배우고 싶으신가요? (목적)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_OPTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setGoal(item.id)}
                    className={`rounded-md border p-2 text-left transition cursor-pointer ${
                      goal === item.id
                        ? "border-[#191919] bg-[#191919] text-white"
                        : "border-[#E9E9E7] bg-white text-[#2F3437] hover:bg-[#F7F6F3]"
                    }`}
                  >
                    <div className="text-[11px] font-bold">{item.label}</div>
                    <div className={`text-[10px] ${goal === item.id ? "text-gray-300" : "text-[#787774]"}`}>
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Level & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#191919]">
                  3. 현재 나의 수준은?
                </label>
                <div className="space-y-1">
                  {[
                    ["beginner", "초급 (처음부터 차근차근)"],
                    ["intermediate", "중급 (개념 이해/연계)"],
                    ["advanced", "심화 (고난도/응용)"],
                  ].map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setLevel(id as any)}
                      className={`w-full rounded-md border p-1.5 text-left text-[11px] transition cursor-pointer ${
                        level === id
                          ? "border-[#191919] bg-[#191919] text-white font-medium"
                          : "border-[#E9E9E7] bg-white text-[#787774] hover:bg-[#F7F6F3]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#191919]">
                  4. 하루 목표 공부 시간은?
                </label>
                <div className="space-y-1">
                  {[10, 15, 30].map((mins) => (
                    <button
                      type="button"
                      key={mins}
                      onClick={() => setDailyMinutes(mins)}
                      className={`w-full rounded-md border p-1.5 text-left text-[11px] transition cursor-pointer ${
                        dailyMinutes === mins
                          ? "border-[#191919] bg-[#191919] text-white font-medium"
                          : "border-[#E9E9E7] bg-white text-[#787774] hover:bg-[#F7F6F3]"
                      }`}
                    >
                      하루 {mins}분 (부담 없이 몰입)
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Style */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#191919]">
                5. 선호하는 공부 스타일은?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STYLE_OPTIONS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setLearningStyle(item.id)}
                    className={`rounded-md border p-2 text-left transition cursor-pointer ${
                      learningStyle === item.id
                        ? "border-[#191919] bg-[#191919] text-white font-medium"
                        : "border-[#E9E9E7] bg-white text-[#787774] hover:bg-[#F7F6F3]"
                    }`}
                  >
                    <div className="text-[11px] font-bold">{item.label}</div>
                    <div className={`text-[9px] mt-0.5 ${learningStyle === item.id ? "text-gray-300" : "text-[#9B9A97]"}`}>
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {errorMessage && (
              <p className="rounded-md border border-[#E9E9E7] bg-[#FBFBFA] px-3 py-2 text-xs text-[#191919]">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#191919] py-3 text-xs font-semibold text-white shadow-md transition hover:bg-[#37352F] disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>AI가 나에게 딱 맞는 커리큘럼을 설계하고 있어요...</span>
                </>
              ) : (
                <>
                  <span>AI 커리큘럼 설계하기 (미리보기)</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
