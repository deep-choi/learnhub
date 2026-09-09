import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";
import { Course } from "../types/learning";
import { authorizedFetch } from "../services/authClient";
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeModalRef = useRef<() => void>(() => undefined);

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

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) closeModalRef.current();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isLoading, onClose]);

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
      const response = await authorizedFetch("/api/ai/analyze-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, level, goal, dailyMinutes, learningStyle }),
        signal: controller.signal,
      });

      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        setErrorMessage("로그인 후 새 AI 학습을 만들 수 있습니다. 입력한 주제는 그대로 남아 있어요.");
        return;
      }
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
  closeModalRef.current = handleClose;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="create-course-title" className="max-h-[90vh] w-full max-w-xl animate-fade-in overflow-y-auto rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-8 text-[var(--lh-ink)] shadow-2xl space-y-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--lh-line)] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lh-primary)] text-sm font-medium text-white shadow-xs">
              AI
            </span>
            <div>
              <h2 id="create-course-title" className="text-xl font-medium tracking-[-0.02em] text-[var(--lh-ink)]">
                {previewCourse ? "학습 경로 미리보기" : "새 학습 경로 만들기"}
              </h2>
              <p className="text-xs text-[var(--lh-ink-secondary)] font-medium">
                {previewCourse
                  ? "AI가 설계한 구성을 확인하고 시작하세요."
                  : "주제 하나면 충분해요. 나머지는 AI가 구성합니다."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            ref={closeButtonRef}
            aria-label="과정 만들기 닫기"
            className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-[var(--lh-ink-tertiary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 2: Curriculum Preview */}
        {previewCourse ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white shadow-xs">
                  <ArrowRight className="h-4 w-4" />
                </span>
                <h3 className="text-lg font-medium text-[var(--lh-ink)]">{previewCourse.title}</h3>
              </div>
              <p className="text-xs sm:text-sm text-[var(--lh-ink-secondary)] leading-relaxed font-normal">
                {previewCourse.summary}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--lh-primary-border)] text-xs text-[var(--lh-ink-secondary)] font-normal">
                <span className="rounded-full bg-[var(--lh-surface)] border border-[var(--lh-primary-border)] px-3 py-1 font-medium text-[var(--lh-primary-text)]">
                  총 {previewCourse.chapters.length}개 챕터
                </span>
                <span className="rounded-full bg-[var(--lh-surface)] border border-[var(--lh-primary-border)] px-3 py-1 font-medium text-[var(--lh-primary-text)]">
                  총 {totalLessons}개 레슨
                </span>
                <span className="rounded-full bg-[var(--lh-surface)] border border-[var(--lh-primary-border)] px-3 py-1 font-medium text-[var(--lh-primary-text)]">
                  하루 {previewCourse.dailyMinutes}분 목표
                </span>
              </div>
            </div>

            {previewSupport && (
              <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-4 space-y-2 text-xs shadow-xs">
                <div className="font-medium text-[var(--lh-ink)]">{previewSupport.label} · 이번 학습에서 확인할 것</div>
                <p className="text-[var(--lh-ink)] font-normal">{previewSupport.successCriteria[0]}</p>
                <p className="text-[11px] text-[var(--lh-ink-secondary)] font-normal">
                  가능 범위: {previewSupport.notSupported.find((item) => item.includes("코드") || item.includes("음성")) || previewSupport.notSupported[0]}
                </p>
                <button type="button" onClick={() => setShowPreviewSupportDetails((open) => !open)} className="text-[11px] font-medium text-[var(--lh-primary)] underline hover:text-[var(--lh-primary-hover)]">
                  {showPreviewSupportDetails ? "상세 기준 접기" : "학습 방식 상세 보기"}
                </button>
                {showPreviewSupportDetails && (
                  <div className="space-y-1 border-t border-[var(--lh-line)] pt-2 text-[11px] text-[var(--lh-ink-secondary)] font-normal">
                    <p>바로 해볼 일: {previewSupport.adultTaskSuggestions[0]}</p>
                    <p>추가 성공 기준: {previewSupport.successCriteria[1]}</p>
                    <p>지원하는 방식: {previewSupport.supported[0]}</p>
                  </div>
                )}
              </div>
            )}

            {/* Chapters list preview */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-[var(--lh-ink)] block">
                학습 로드맵 구성:
              </span>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {previewCourse.chapters.map((chap, cIdx) => (
                  <div key={chap.id} className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3.5 space-y-1.5 text-xs shadow-xs">
                    <div className="font-medium text-[var(--lh-ink)] flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--lh-primary)] text-[10px] font-medium text-white">
                        {cIdx + 1}
                      </span>
                      <span>{chap.title}</span>
                    </div>
                    <ul className="ml-7 list-disc text-xs text-[var(--lh-ink-secondary)] space-y-0.5 font-normal">
                      {chap.lessons.map((les) => (
                        <li key={les.id}>
                          {les.title} <span className="text-[11px] text-[var(--lh-ink-tertiary)] font-normal">({les.estimatedMinutes}분)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview Actions */}
            <div className="grid grid-cols-2 gap-2 border-t border-[var(--lh-line)] pt-3 sm:flex sm:items-center">
              <button
                type="button"
                onClick={() => setPreviewCourse(null)}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-xs font-medium text-[var(--lh-ink)] shadow-xs hover:bg-[var(--lh-surface-subtle)] transition cursor-pointer"
              >
                다시 설정하기
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={isLoading}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-xs font-medium text-[var(--lh-ink)] shadow-xs hover:bg-[var(--lh-surface-subtle)] transition disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? "다시 설계 중..." : "다시 생성하기"}
              </button>
              <button
                type="button"
                onClick={handleConfirmCourse}
                className="col-span-2 inline-flex min-h-12 flex-[1.5] items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition cursor-pointer sm:col-span-1"
              >
                <span>이대로 공부 시작하기</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Step 1: topic-first setup with optional details */
          <form onSubmit={handleGenerate} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--lh-ink-secondary)]">
                무엇을 배우고 싶으신가요?
              </label>
              <div className="flex items-center rounded-full border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-3 py-1 shadow-xs focus-within:border-[var(--lh-primary)] transition">
                <Sparkles className="ml-2 h-4 w-4 shrink-0 text-[var(--lh-primary)]" />
                <input
                  type="text"
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  placeholder="예: 초보자를 위한 파이썬, 삼각함수의 원리"
                  aria-label="배우고 싶은 과목 또는 주제"
                  className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-[var(--lh-ink)] outline-none placeholder:text-[var(--lh-ink-tertiary)] font-normal"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {PRESET_TOPICS.slice(0, 3).map((topic) => (
                  <button
                    type="button"
                    key={topic}
                    onClick={() => setSubjectInput(topic)}
                    className="inline-flex min-h-8 items-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-3 text-xs font-medium text-[var(--lh-ink-secondary)] hover:border-[var(--lh-primary)] hover:text-[var(--lh-primary)] transition cursor-pointer"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            <details className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 shadow-xs">
              <summary className="cursor-pointer list-none text-xs font-medium text-[var(--lh-ink)]">
                학습 방식 세부 설정 <span className="ml-1 font-normal text-[var(--lh-ink-tertiary)]">· 선택</span>
              </summary>
              <div className="mt-4 space-y-4 border-t border-[var(--lh-line)] pt-4">
                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-[var(--lh-ink-secondary)]">학습 목적</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {GOAL_OPTIONS.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setGoal(item.id)}
                        className={`rounded-2xl border p-3 text-left transition cursor-pointer ${
                          goal === item.id
                            ? "border-[var(--lh-primary)] bg-[var(--lh-primary)] text-white shadow-xs"
                            : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] hover:border-[var(--lh-primary)]"
                        }`}
                      >
                        <span className="block text-xs font-medium">{item.label}</span>
                        <span className={`mt-0.5 block text-[10px] font-normal ${goal === item.id ? "text-white/80" : "text-[var(--lh-ink-tertiary)]"}`}>
                          {item.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-3 sm:grid-cols-2">
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium text-[var(--lh-ink-secondary)]">현재 수준</legend>
                    <div className="flex gap-2">
                      {[["beginner", "초급"], ["intermediate", "중급"], ["advanced", "심화"]].map(([id, label]) => (
                        <button
                          type="button"
                          key={id}
                          onClick={() => setLevel(id as any)}
                          className={`min-h-9 flex-1 rounded-full border px-2 text-xs font-medium transition cursor-pointer ${
                            level === id
                              ? "border-[var(--lh-primary)] bg-[var(--lh-primary)] text-white shadow-xs"
                              : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] hover:border-[var(--lh-primary)]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium text-[var(--lh-ink-secondary)]">하루 학습 시간</legend>
                    <div className="flex gap-2">
                      {[10, 15, 30].map((mins) => (
                        <button
                          type="button"
                          key={mins}
                          onClick={() => setDailyMinutes(mins)}
                          className={`min-h-9 flex-1 rounded-full border px-2 text-xs font-medium transition cursor-pointer ${
                            dailyMinutes === mins
                              ? "border-[var(--lh-primary)] bg-[var(--lh-primary)] text-white shadow-xs"
                              : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] hover:border-[var(--lh-primary)]"
                          }`}
                        >
                          {mins}분
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>

                <fieldset>
                  <legend className="mb-2 text-xs font-medium text-[var(--lh-ink-secondary)]">선호 학습 방식</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {STYLE_OPTIONS.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setLearningStyle(item.id)}
                        className={`rounded-2xl border p-3 text-left transition cursor-pointer ${
                          learningStyle === item.id
                            ? "border-[var(--lh-primary)] bg-[var(--lh-primary)] text-white shadow-xs"
                            : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] hover:border-[var(--lh-primary)]"
                        }`}
                      >
                        <span className="block text-xs font-medium">{item.label}</span>
                        <span className={`mt-0.5 hidden text-[10px] font-normal sm:block ${learningStyle === item.id ? "text-white/80" : "text-[var(--lh-ink-tertiary)]"}`}>
                          {item.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            </details>

            {errorMessage && (
              <p className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-2.5 text-xs font-medium text-[var(--lh-danger)]">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !subjectInput.trim()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition disabled:cursor-not-allowed disabled:bg-[var(--lh-surface-strong)] disabled:text-[var(--lh-ink-tertiary)] cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>학습 경로를 설계하고 있어요...</span>
                </>
              ) : (
                <>
                  <span>학습 경로 만들기</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
