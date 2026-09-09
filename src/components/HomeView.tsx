import React from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  Flame,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  ToggleRight,
} from "lucide-react";
import { Course, LessonMeta, ReviewQuestion, UserProgress } from "../types/learning";
import { INITIAL_COURSES } from "../data/initialData";
import { LearnHubLogo } from "./common/LearnHubLogo";

interface HomeViewProps {
  courses: Course[];
  progress: UserProgress;
  reviews: ReviewQuestion[];
  onSelectCourse: (courseId: string) => void;
  onStartLesson: (course: Course, lesson: LessonMeta, chapterTitle: string) => void;
  onStartReview: () => void;
  onOpenCreateCourse: (subject?: string) => void;
}

const getCourseProgress = (course: Course) => {
  const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
  const completed = lessons.filter((lesson) => lesson.isCompleted).length;
  return lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
};

const getResumeLesson = (course: Course) => {
  for (const chapter of course.chapters) {
    const lesson = chapter.lessons.find((item) => !item.isCompleted);
    if (lesson) return { lesson, chapterTitle: chapter.title };
  }
  const firstLesson = course.chapters[0]?.lessons[0];
  return firstLesson ? { lesson: firstLesson, chapterTitle: course.chapters[0].title } : null;
};

export const HomeView: React.FC<HomeViewProps> = ({
  courses,
  progress,
  reviews,
  onSelectCourse,
  onStartLesson,
  onStartReview,
  onOpenCreateCourse,
}) => {
  const sampleCourseIds = new Set(INITIAL_COURSES.map((course) => course.id));
  const userCourses = courses.filter((course) => !sampleCourseIds.has(course.id));
  const hasUserCourses = userCourses.length > 0;

  let nextLessonToStudy: { course: Course; chapterTitle: string; lesson: LessonMeta } | null = null;
  for (const course of userCourses) {
    const resume = getResumeLesson(course);
    if (resume) {
      nextLessonToStudy = { course, ...resume };
      break;
    }
  }

  // Fallback for preview if no user course
  const firstSampleCourse = courses.find((course) => sampleCourseIds.has(course.id)) || courses[0];
  const firstSampleResume = firstSampleCourse ? getResumeLesson(firstSampleCourse) : null;

  const targetCourse = nextLessonToStudy ? nextLessonToStudy.course : firstSampleCourse;
  const targetLesson = nextLessonToStudy ? nextLessonToStudy.lesson : firstSampleResume?.lesson;
  const targetChapter = nextLessonToStudy ? nextLessonToStudy.chapterTitle : firstSampleResume?.chapterTitle || "단원 1";

  const sampleCourses = courses.filter((course) => sampleCourseIds.has(course.id)).slice(0, 2);
  const displayedCourses = hasUserCourses ? userCourses : sampleCourses;

  return (
    <div className="w-full px-3 sm:px-5 lg:px-6 py-4 sm:py-6 space-y-12 sm:space-y-16 pb-36">
      {/* 1. [배너형: 가로로 꽉 차게 씀] M3 FULL-WIDTH HERO BANNER */}
      <section className="w-full max-w-[1760px] mx-auto relative overflow-hidden rounded-[28px] sm:rounded-[36px] border border-[var(--lh-line)] bg-[var(--lh-surface)] shadow-xs transition-colors duration-200">
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px] lg:min-h-[540px] items-stretch">
          {/* Left Column: Logo + Display Typography + Concise Description + Brand CTA */}
          <div className="lg:col-span-6 flex flex-col justify-center p-8 sm:p-14 lg:p-18 z-10">
            {/* LearnHub Brand Badge with 4-Circle Emblem */}
            <div className="flex items-center gap-3 mb-4">
              <LearnHubLogo size={36} />
              <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-3.5 py-1 text-xs font-medium text-[var(--lh-primary-text)] transition-colors">
                AI 맞춤 자율 학습 플랫폼
              </span>
            </div>

            <h1 className="text-5xl sm:text-7xl lg:text-[80px] font-medium tracking-[-0.04em] text-[var(--lh-ink)] leading-[0.98] transition-colors">
              LearnHub
            </h1>

            <p className="mt-6 text-base sm:text-lg lg:text-xl leading-relaxed text-[var(--lh-ink-secondary)] font-normal max-w-lg transition-colors">
              초등부터 대학 교과까지, AI와 함께 나만의 속도로 깊이 있게 사유하고 지식을 완성하는 자율 학습 공간입니다.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              {targetCourse && targetLesson ? (
                <button
                  type="button"
                  onClick={() => onStartLesson(targetCourse, targetLesson, targetChapter)}
                  className="rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-9 py-4 text-base sm:text-lg font-medium text-white shadow-xs hover:shadow-md transition-all duration-200 inline-flex items-center gap-3 cursor-pointer"
                >
                  <span>{hasUserCourses && nextLessonToStudy ? "이어서 학습하기" : "학습 시작하기"}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenCreateCourse()}
                  className="rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-9 py-4 text-base sm:text-lg font-medium text-white shadow-xs hover:shadow-md transition-all duration-200 inline-flex items-center gap-3 cursor-pointer"
                >
                  <span>새 과목 시작하기</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenCreateCourse()}
                className="rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-surface)] px-6 py-4 text-sm font-medium text-[var(--lh-primary-text)] hover:bg-[var(--lh-primary-subtle)] hover:shadow-xs transition cursor-pointer"
              >
                <span>+ 새 과목 만들기</span>
              </button>
            </div>
          </div>

          {/* Right Column: Clean M3 Visual / Media Slot (Ready for user customization) */}
          <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-10 lg:p-12">
            <div className="w-full h-full min-h-[300px] sm:min-h-[400px] rounded-[24px] sm:rounded-[32px] border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] flex flex-col items-center justify-center p-8 text-center relative overflow-hidden transition-all duration-200 group">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.07]"
                style={{
                  backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
                  backgroundSize: "24px 24px",
                }}
              />
              <div className="relative z-10 flex flex-col items-center gap-4 max-w-md">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--lh-surface)] border border-[var(--lh-line)] shadow-xs transition-all duration-200 group-hover:scale-105">
                  <LearnHubLogo size={36} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-medium text-[var(--lh-ink)] transition-colors">
                    메인 배너 비주얼 영역
                  </p>
                  <p className="text-xs text-[var(--lh-ink-secondary)] font-normal leading-relaxed transition-colors">
                    브랜드 대표 일러스트 또는 배너 이미지를 자유롭게 교체할 수 있는 영역입니다.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-2 text-xs font-medium text-[var(--lh-ink-secondary)] transition-colors">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--lh-primary)]" />
                  <span>AI 기반 자율 학습 공간</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. [다른 카드형: 굳이 꽉 차지 않고 적정 폭 1280px 유지] EXACT M3 FEATURED CARD SET (8px GAP: gap-2) */}
      <section className="w-full max-w-[1280px] mx-auto space-y-4">
        <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-medium tracking-tight text-[var(--lh-ink)]">
          {hasUserCourses ? "추천 및 주요 학습 커리큘럼" : "LearnHub 핵심 대표 과정"}
        </h2>

        {/* M3 Card Set Container with 8px Gap (gap-2) */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Card 1: Top Full-Width Split Card */}
          <div
            onClick={() => {
              if (firstSampleCourse && firstSampleResume) {
                onStartLesson(firstSampleCourse, firstSampleResume.lesson, firstSampleResume.chapterTitle);
              }
            }}
            className="col-span-1 md:col-span-2 overflow-hidden rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3 sm:p-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center shadow-2xs hover:shadow-sm hover:border-[var(--lh-primary-border)] transition-all duration-200 cursor-pointer group"
          >
            {/* Left Media Zone: Clean Cover Slot (Ready for user image) */}
            <div className="md:col-span-5 rounded-[22px] bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] h-64 sm:h-72 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden transition-colors">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--lh-surface)] border border-[var(--lh-line)] text-[var(--lh-primary)] shadow-xs mb-3 group-hover:scale-105 transition-transform">
                <BookOpen className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-[var(--lh-ink)] transition-colors">대표 교과 커버 영역</p>
              <p className="text-xs text-[var(--lh-ink-secondary)] font-normal mt-1 transition-colors">초등 5-2 수학 · 직관 원리</p>
            </div>

            {/* Right Text Content */}
            <div className="md:col-span-7 p-4 sm:p-6 space-y-4">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--lh-primary-text)] bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-3 py-1 rounded-full uppercase tracking-wider transition-colors">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--lh-primary)]" />
                2026 최신 교과 과정
              </span>
              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-medium text-[var(--lh-ink)] tracking-tight group-hover:text-[var(--lh-primary)] transition-colors leading-snug">
                초등 5-2 수학: 분수의 곱셈과 나눗셈 직관 완성
              </h3>
              <p className="text-sm sm:text-base leading-relaxed text-[var(--lh-ink-secondary)] font-normal transition-colors">
                단순 계산 요령이 아닌, 단위분수와 분수 곱셈의 기하학적 면적 모델을 통해 원리를 직관적으로 체득하는 핵심 대표 과정입니다.
              </p>
              <div className="pt-2 flex items-center gap-2 text-sm font-medium text-[var(--lh-primary)]">
                <span>지금 체험하기</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </div>
            </div>
          </div>

          {/* Card 2: Bottom Left Card */}
          <div
            onClick={() => onOpenCreateCourse("개념 중심 원리 학습")}
            className="col-span-1 rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] overflow-hidden shadow-2xs hover:shadow-sm hover:border-[var(--lh-primary-border)] transition-all duration-200 cursor-pointer group flex flex-col justify-between"
          >
            {/* Top Media Zone: Clean Cover Slot */}
            <div className="h-48 sm:h-56 bg-[var(--lh-surface-subtle)] border-b border-[var(--lh-line)] p-6 relative overflow-hidden flex flex-col items-center justify-center gap-2 text-center transition-colors">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--lh-surface)] border border-[var(--lh-line)] text-[var(--lh-primary)] shadow-xs group-hover:scale-105 transition-transform">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-[var(--lh-ink)] transition-colors">개념 중심 학습 가이드</p>
              <p className="text-xs text-[var(--lh-ink-secondary)] font-normal transition-colors">커버 이미지 영역</p>
            </div>

            {/* Bottom Content */}
            <div className="p-6 sm:p-8 space-y-2 flex-1 flex flex-col justify-between">
              <div>
                <span className="text-xs font-medium text-[var(--lh-secondary-text)] uppercase tracking-wider transition-colors">
                  2026 학습 가이드
                </span>
                <h3 className="text-xl sm:text-2xl font-medium text-[var(--lh-ink)] tracking-tight mt-1 group-hover:text-[var(--lh-primary)] transition-colors">
                  문제 풀이보다 원리 탐구가 먼저인 이유
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[var(--lh-ink-secondary)] leading-relaxed font-normal transition-colors">
                  공식을 기계적으로 외우기 전에 원리를 스스로 증명하고 직관을 완성하는 자기주도 학습 방법론을 만나보세요.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Bottom Right Card */}
          <div
            onClick={() => onOpenCreateCourse("소크라테스 AI")}
            className="col-span-1 rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] overflow-hidden shadow-2xs hover:shadow-sm hover:border-[var(--lh-primary-border)] transition-all duration-200 cursor-pointer group flex flex-col justify-between"
          >
            {/* Top Media Zone: Clean Cover Slot */}
            <div className="h-48 sm:h-56 bg-[var(--lh-surface-subtle)] border-b border-[var(--lh-line)] p-6 relative overflow-hidden flex flex-col items-center justify-center gap-2 text-center transition-colors">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--lh-surface)] border border-[var(--lh-line)] text-[var(--lh-primary)] shadow-xs group-hover:scale-105 transition-transform">
                <LearnHubLogo size={24} />
              </div>
              <p className="text-sm font-medium text-[var(--lh-ink)] transition-colors">소크라테스 AI 튜터 가이드</p>
              <p className="text-xs text-[var(--lh-ink-secondary)] font-normal transition-colors">커버 이미지 영역</p>
            </div>

            {/* Bottom Content */}
            <div className="p-6 sm:p-8 space-y-2 flex-1 flex flex-col justify-between">
              <div>
                <span className="text-xs font-medium text-[var(--lh-primary-text)] uppercase tracking-wider transition-colors">
                  AI 튜터링 가이드
                </span>
                <h3 className="text-xl sm:text-2xl font-medium text-[var(--lh-ink)] tracking-tight mt-1 group-hover:text-[var(--lh-primary)] transition-colors">
                  소크라테스 AI 대화형 튜터 가이드
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[var(--lh-ink-secondary)] leading-relaxed font-normal transition-colors">
                  정답을 대신 알려주지 않고 질문을 던져 사용자의 생각을 유도하는 메타인지 대화형 튜터 활용법을 확인하세요.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. [다른 카드형: 굳이 꽉 차지 않고 적정 폭 1280px 유지] 3 METRIC STAT CARDS: 8px GAP (gap-2) */}
      <section aria-label="학습 현황" className="w-full max-w-[1280px] mx-auto space-y-4">
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Card 1: Streak (Secondary Accent) */}
          <div className="rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-7 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
                학습 연속
              </p>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--lh-secondary-subtle)] text-[var(--lh-secondary)] transition-colors">
                <Flame className="h-4.5 w-4.5 fill-current" />
              </span>
            </div>
            <p className="my-2.5 text-3xl sm:text-4xl font-medium tracking-tight text-[var(--lh-secondary)] font-mono transition-colors">
              {progress.streakDays}일
            </p>
            <p className="text-xs text-[var(--lh-ink-secondary)] font-normal transition-colors">
              매일 꾸준히 이어지는 몰입의 기록
            </p>
          </div>

          {/* Card 2: Total Study Time (Primary Point Color) */}
          <div className="rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-7 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
                누적 학습 시간
              </p>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] text-[var(--lh-primary)] transition-colors">
                <Clock3 className="h-4.5 w-4.5" />
              </span>
            </div>
            <p className="my-2.5 text-3xl sm:text-4xl font-medium tracking-tight text-[var(--lh-primary)] font-mono transition-colors">
              {progress.totalMinutesLearned}분
            </p>
            <p className="text-xs text-[var(--lh-ink-secondary)] font-normal transition-colors">
              학습자가 능동적으로 탐구한 총 시간
            </p>
          </div>

          {/* Card 3: Completed Lessons */}
          <div className="rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-7 shadow-xs hover:shadow-sm transition-all duration-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
                완료 레슨
              </p>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--lh-surface-subtle)] text-[var(--lh-ink)] transition-colors">
                <CheckCircle2 className="h-4.5 w-4.5" />
              </span>
            </div>
            <p className="my-2.5 text-3xl sm:text-4xl font-medium tracking-tight text-[var(--lh-ink)] font-mono transition-colors">
              {progress.completedLessonsCount}개
            </p>
            <p className="text-xs text-[var(--lh-ink-secondary)] font-normal transition-colors">
              개념과 퀴즈를 통과한 단원 수
            </p>
          </div>
        </div>
      </section>

      {/* 4. [배너형: 가로로 꽉 차게 씀] REVIEW REMINDER BANNER */}
      {reviews.length > 0 && (
        <section className="w-full max-w-[1760px] mx-auto">
          <button
            type="button"
            onClick={onStartReview}
            className="group flex w-full flex-col sm:flex-row items-start sm:items-center justify-between gap-6 rounded-[28px] border border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] p-7 sm:p-8 text-left shadow-xs transition-all duration-200 hover:border-[var(--lh-secondary)] hover:shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--lh-secondary)] text-white shadow-xs">
                <RotateCcw className="h-6 w-6" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--lh-secondary)] animate-pulse" />
                  <span className="text-xs font-medium uppercase tracking-wider text-[var(--lh-secondary-text)]">
                    망각 방지 복습 알림
                  </span>
                </div>
                <p className="text-lg sm:text-xl font-medium text-[var(--lh-ink)] mt-0.5">
                  복습할 내용이 <span className="text-[var(--lh-secondary)]">{reviews.length}개</span> 있어요
                </p>
                <p className="mt-1 text-xs sm:text-sm text-[var(--lh-ink-secondary)] font-normal">
                  에빙하우스 망각 곡선에 따라 지금 약 3분만 인출 퀴즈를 풀면 기억 유지율이 80% 이상 상승합니다.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--lh-secondary-border)] bg-[var(--lh-surface)] px-5 py-3 text-xs font-medium text-[var(--lh-secondary-text)] shadow-2xs group-hover:bg-[var(--lh-secondary)] group-hover:text-white transition-all duration-200">
                <span>지금 복습하기</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        </section>
      )}

      {/* 5. [다른 카드형: 굳이 꽉 차지 않고 적정 폭 1280px 유지] COURSE CURRICULUM GRID: 8px GAP (gap-2) */}
      <section className="w-full max-w-[1280px] mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--lh-primary-text)]">
              <span>CURRICULUM</span>
              <span className="text-[var(--lh-line-strong)]">/</span>
              <span>LEARNING PATHS</span>
            </div>
            <h2 className="mt-1.5 text-3xl sm:text-4xl font-medium tracking-tight text-[var(--lh-ink)]">
              {hasUserCourses ? "내 등록 과목" : "전체 과목 커리큘럼"}
            </h2>
            <p className="mt-1 text-sm text-[var(--lh-ink-secondary)] font-normal">
              {hasUserCourses
                ? "현재 학습 중인 개인 맞춤 과정입니다. 카드를 클릭하여 단원 구성과 진도를 확인하세요."
                : "배우고 싶은 교과를 선택하거나, 원하는 과목을 직접 생성하여 즉시 학습할 수 있습니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenCreateCourse()}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-5 py-3 text-xs font-medium text-[var(--lh-primary-text)] shadow-xs hover:bg-[var(--lh-primary)] hover:text-white hover:shadow-sm transition-all duration-200 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>새 과정 만들기</span>
          </button>
        </div>

        {displayedCourses.length === 0 ? (
          <div className="rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] py-20 text-center text-sm text-[var(--lh-ink-secondary)] shadow-xs font-normal">
            아직 등록된 과정이 없습니다. 새 과정 만들기를 눌러 시작해보세요.
          </div>
        ) : (
          /* M3 8px gap grid (gap-2) with comfortable proportional card sizing */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {displayedCourses.map((course, index) => {
              const progressPct = getCourseProgress(course);
              const resume = getResumeLesson(course);
              const totalLessons = course.chapters.flatMap((chapter) => chapter.lessons).length;
              const isSample = sampleCourseIds.has(course.id);

              return (
                <div
                  key={course.id}
                  onClick={() => {
                    if (isSample && resume) onStartLesson(course, resume.lesson, resume.chapterTitle);
                    else onSelectCourse(course.id);
                  }}
                  className="group flex flex-col justify-between overflow-hidden rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] text-left shadow-2xs transition-all duration-200 hover:shadow-sm hover:border-[var(--lh-primary-border)] cursor-pointer"
                >
                  {/* Top Preview Surface (mio-thumbnail style) */}
                  <div
                    className={`relative h-48 sm:h-52 p-6 text-white flex flex-col justify-between ${
                      index % 2 === 0 ? "bg-[#141C33] dark:bg-[#161B28]" : "bg-[#1E1E1C] dark:bg-[#202228]"
                    }`}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-15"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
                        backgroundSize: "20px 20px",
                      }}
                    />

                    <div className="relative flex items-center justify-between text-xs font-medium uppercase tracking-wider">
                      <span className="rounded-full bg-white/15 backdrop-blur-md px-3.5 py-1 text-[11px] font-medium text-white tracking-wide border border-white/10">
                        {isSample ? "표준 커리큘럼" : "나의 학습 과정"}
                      </span>
                      <span className="rounded-full bg-white/15 backdrop-blur-md px-3.5 py-1 text-[11px] font-medium text-white tracking-wide border border-white/10">
                        {totalLessons}개 레슨
                      </span>
                    </div>

                    <div className="relative py-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-white/90">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[var(--lh-primary)]" />
                          <span className="h-0.5 w-6 bg-white/40" />
                          <span className="h-2 w-2 rounded-full bg-[var(--lh-secondary)]" />
                          <span className="h-0.5 w-6 bg-white/20" />
                          <span className="h-2 w-2 rounded-full bg-white/30" />
                        </div>
                        <span className="text-[11px] text-white/70 ml-2 font-normal">
                          {course.chapters.length}개 단원 구성
                        </span>
                      </div>
                    </div>

                    <div className="relative flex items-center justify-between text-xs text-white/80">
                      <span className="font-normal">{isSample ? "기초 개념부터 응용까지" : "개인 맞춤 생성 코스"}</span>
                      <span className="font-medium text-[var(--lh-primary-border)] group-hover:text-white group-hover:translate-x-1 transition duration-200">
                        학습 시작 →
                      </span>
                    </div>
                  </div>

                  {/* Bottom Content Container */}
                  <div className="p-6 sm:p-7 space-y-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-xl sm:text-2xl font-medium tracking-tight text-[var(--lh-ink)] group-hover:text-[var(--lh-primary)] transition-colors leading-snug">
                          {course.title}
                        </h3>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] text-[var(--lh-ink)] group-hover:bg-[var(--lh-primary)] group-hover:text-white transition-all duration-200 shadow-2xs">
                          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-2 text-xs sm:text-sm leading-relaxed text-[var(--lh-ink-secondary)] font-normal">
                        {course.summary}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[var(--lh-line)] flex items-center gap-4">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--lh-surface-subtle)]">
                        <div
                          className="h-full rounded-full bg-[var(--lh-primary)] transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <span className="rounded-full bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)] border border-[var(--lh-primary-border)] px-3 py-1 text-xs font-mono font-medium transition-colors">
                        {progressPct}% 완료
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
