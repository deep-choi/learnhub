import React, { useState, useMemo } from "react";
import {
  Search,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowRight,
  X,
  Target,
  GraduationCap,
  Archive,
  RotateCcw,
  Calculator,
  FlaskConical,
  Scale,
  Landmark,
  Languages,
  BookOpenText,
} from "lucide-react";
import { Course, LessonMeta } from "../types/learning";
import { LEARNING_ROADMAPS, LearningRoadmap } from "../data/roadmapData";
import { courseIsComplete, nextUnfinishedLesson } from "../domain/assessment";

interface CoursesViewProps {
  courses: Course[];
  onSelectCourse: (course: Course) => void;
  onStartLesson: (course: Course, lesson: LessonMeta, chapterTitle: string) => void;
  onEnrollRoadmap: (course: Course) => void;
  onOpenCreateCourse?: () => void;
  onStartAssessment: (course: Course) => void;
  onUpdateCourseStatus?: (courseId: string, status: "completed" | "cancelled" | "active") => void;
}

const SUBJECT_FILTERS = [
  { label: "전체", key: "all" },
  { label: "수학", key: "math" },
  { label: "과학", key: "science" },
  { label: "사회", key: "social" },
  { label: "역사", key: "history" },
  { label: "영어", key: "english" },
  { label: "일본어", key: "japanese" },
] as const;

const SUBJECT_VISUALS: Record<
  LearningRoadmap["subjectKey"],
  { gradient: string; Icon: React.ElementType }
> = {
  math: { gradient: "from-blue-600 via-indigo-600 to-violet-700", Icon: Calculator },
  science: { gradient: "from-emerald-500 via-teal-600 to-cyan-700", Icon: FlaskConical },
  social: { gradient: "from-amber-500 via-orange-600 to-rose-600", Icon: Scale },
  history: { gradient: "from-stone-600 via-amber-800 to-stone-900", Icon: Landmark },
  english: { gradient: "from-rose-500 via-pink-600 to-fuchsia-700", Icon: Languages },
  japanese: { gradient: "from-red-500 via-rose-600 to-red-800", Icon: BookOpenText },
};

export const CoursesView: React.FC<CoursesViewProps> = ({
  courses,
  onSelectCourse,
  onStartLesson,
  onEnrollRoadmap,
  onOpenCreateCourse,
  onStartAssessment,
  onUpdateCourseStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enrolled">("all");
  const [selectedRoadmapForDetail, setSelectedRoadmapForDetail] = useState<LearningRoadmap | null>(null);
  const activeCourses = courses.filter((course) => course.status !== "completed" && course.status !== "cancelled");
  const archivedCourses = courses.filter((course) => course.status === "completed" || course.status === "cancelled");
  const createdCourses = activeCourses.filter((course) => !LEARNING_ROADMAPS.some((roadmap) => roadmap.course.id === course.id));

  // Set of IDs of courses currently in user's library
  const enrolledCourseIds = useMemo(() => {
    return new Set(activeCourses.map((c) => c.id));
  }, [activeCourses]);

  // Filter roadmaps by subject, status, and search query
  const filteredRoadmaps = useMemo(() => {
    return LEARNING_ROADMAPS.filter((roadmap) => {
      // 1. Subject filter
      if (selectedSubject !== "all" && roadmap.subjectKey !== selectedSubject) {
        return false;
      }

      // 2. Enrolled status filter
      const isEnrolled = enrolledCourseIds.has(roadmap.course.id);
      if (statusFilter === "enrolled" && !isEnrolled) {
        return false;
      }

      // 3. Search query
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const inTitle = roadmap.title.toLowerCase().includes(q);
      const inSubject = roadmap.subject.toLowerCase().includes(q);
      const inStepLabel = roadmap.stepLevelLabel?.toLowerCase().includes(q);
      const inDesc = roadmap.description.toLowerCase().includes(q);
      const inTagline = roadmap.tagline.toLowerCase().includes(q);
      const inTopics = roadmap.stages.some((s) =>
        s.topics.some((t) => t.toLowerCase().includes(q)) || s.title.toLowerCase().includes(q)
      );

      return inTitle || inSubject || inStepLabel || inDesc || inTagline || inTopics;
    });
  }, [selectedSubject, statusFilter, searchQuery, enrolledCourseIds]);

  const handleStartRoadmap = (roadmap: LearningRoadmap, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isEnrolled = enrolledCourseIds.has(roadmap.course.id);
    const course = activeCourses.find((c) => c.id === roadmap.course.id) || roadmap.course;

    // 처음 시작하는 로드맵은 등록과 동시에 첫 레슨으로 이동합니다.
    if (!isEnrolled) {
      onEnrollRoadmap(course);
    }

    const next = nextUnfinishedLesson(course);
    if (courseIsComplete(course)) {
      onStartAssessment(course);
    } else if (next) {
      onStartLesson(course, next.lesson, next.chapterTitle);
    } else {
      onSelectCourse(course);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-fade-in">
      {createdCourses.length > 0 && <section className="space-y-4">
        <h1 className="text-2xl font-medium">내가 만든 과목</h1>
        <div className="grid gap-3 sm:grid-cols-2">{createdCourses.map((course) => {
          const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
          const completed = lessons.filter((lesson) => lesson.isCompleted).length;
          return <button key={course.id} onClick={() => onSelectCourse(course)} className="space-y-3 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 text-left transition hover:border-[var(--lh-primary)]">
            <span className="block font-medium">{course.title}</span>
            <span className="block text-xs text-[var(--lh-ink-secondary)]">{completed} / {lessons.length} 레슨 완료</span>
            <span className="block text-sm text-[var(--lh-primary)]">{courseIsComplete(course) ? "문제로 실력 확인하기 →" : "커리큘럼 보기 →"}</span>
          </button>;
        })}</div>
      </section>}

      {archivedCourses.length > 0 && onUpdateCourseStatus && <section className="space-y-3">
        <details className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
            <Archive className="h-4 w-4 text-[var(--lh-ink-secondary)]" />
            보관함 <span className="text-xs font-normal text-[var(--lh-ink-secondary)]">{archivedCourses.length}개</span>
          </summary>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {archivedCourses.map((course) => (
              <div key={course.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{course.title}</p>
                  <p className="mt-1 text-xs text-[var(--lh-ink-secondary)]">{course.status === "cancelled" ? "수강 취소됨" : "학습 완료"}</p>
                </div>
                <button type="button" onClick={() => onUpdateCourseStatus(course.id, "active")} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--lh-line)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--lh-surface-subtle)] cursor-pointer">
                  <RotateCcw className="h-3.5 w-3.5" />복구
                </button>
              </div>
            ))}
          </div>
        </details>
      </section>}

      {/* Header Area */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[var(--lh-line)] pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-3 py-1 text-xs font-medium text-[var(--lh-ink-secondary)]">
                <BookOpen className="h-3.5 w-3.5 text-[var(--lh-point)]" />
                <span>내 과목 & 학습 로드맵</span>
              </span>
              <span className="rounded-full bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--lh-ink-secondary)]">
                총 {LEARNING_ROADMAPS.length}개 로드맵
              </span>
              {enrolledCourseIds.size > 0 && (
                <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--lh-primary)]">
                  {enrolledCourseIds.size}개 수강 중
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-[var(--lh-ink)]">
              체계적인 과목별 학습 로드맵
            </h1>
            <p className="text-sm font-normal text-[var(--lh-ink-secondary)] max-w-2xl leading-relaxed">
              수학, 과학, 사회, 역사, 영어, 일본어 등 다양한 교과의 체계적인 학습 로드맵을 둘러보고, 원하는 로드맵을 직접 선택하여 나만의 자율 학습을 시작하세요.
            </p>
          </div>

          {onOpenCreateCourse && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenCreateCourse}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-2 text-xs font-medium text-[var(--lh-ink)] shadow-xs transition hover:bg-[var(--lh-surface-subtle)] hover:border-[var(--lh-point)] cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-[var(--lh-point)]" />
                <span>AI로 맞춤 과목 만들기</span>
              </button>
            </div>
          )}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-2">
          {/* Subject Pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="과목 필터">
            {SUBJECT_FILTERS.map((item) => {
              const isSelected = selectedSubject === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedSubject(item.key)}
                  className={`rounded-full px-3.5 py-1.5 text-xs transition cursor-pointer ${
                    isSelected
                      ? "bg-[var(--lh-primary)] text-white font-medium shadow-xs"
                      : "border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] font-normal"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Right: Search Box + Status Tab */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Status Segment (전체 vs 내가 수강 중) */}
            <div className="inline-flex rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`rounded-full px-3 py-1 font-medium transition cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-2xs"
                    : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)]"
                }`}
              >
                전체 로드맵
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("enrolled")}
                className={`rounded-full px-3 py-1 font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === "enrolled"
                    ? "bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-2xs"
                    : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)]"
                }`}
              >
                <span>수강 중</span>
                <span className="rounded-full bg-[var(--lh-line)] px-1.5 py-0.2 text-[10px]">
                  {enrolledCourseIds.size}
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--lh-ink-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="과목, 로드맵, 주제 검색..."
                className="w-full rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] pl-9 pr-8 py-1.5 text-xs text-[var(--lh-ink)] placeholder-[var(--lh-ink-tertiary)] outline-none focus:border-[var(--lh-point)] transition font-normal"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--lh-ink-tertiary)] hover:text-[var(--lh-ink)] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3-Column Roadmap Card Grid */}
      <section className="space-y-4">
        {filteredRoadmaps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] py-16 text-center space-y-3">
            <Layers className="mx-auto h-8 w-8 text-[var(--lh-ink-tertiary)]" />
            <p className="text-sm font-medium text-[var(--lh-ink)]">
              일치하는 학습 로드맵이 없습니다.
            </p>
            <p className="text-xs font-normal text-[var(--lh-ink-secondary)]">
              검색어나 과목 필터를 변경하거나 필터를 초기화해 보세요.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedSubject("all");
                setStatusFilter("all");
              }}
              className="mt-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-1.5 text-xs font-medium text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] transition cursor-pointer"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRoadmaps.map((roadmap) => {
              const isEnrolled = enrolledCourseIds.has(roadmap.course.id);

              const visual = SUBJECT_VISUALS[roadmap.subjectKey];
              const SubjectIcon = visual.Icon;

              return (
                <article
                  key={roadmap.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--lh-point)]/40 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRoadmapForDetail(roadmap)}
                    className={`relative h-36 w-full overflow-hidden bg-gradient-to-br ${visual.gradient} p-5 text-left text-white cursor-pointer`}
                    aria-label={`${roadmap.title} 자세히 보기`}
                  >
                    <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/20" />
                    <div className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-white/10" />
                    <div className="relative flex h-full flex-col justify-between">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-black/15 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">
                          {roadmap.subject}
                        </span>
                        <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] backdrop-blur-sm">
                          {roadmap.levelLabel}
                        </span>
                      </div>
                      <SubjectIcon className="h-10 w-10 text-white/90" strokeWidth={1.4} aria-hidden="true" />
                    </div>
                  </button>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="line-clamp-2 text-base font-medium leading-snug text-[var(--lh-ink)] transition-colors group-hover:text-[var(--lh-point)]">
                          {roadmap.title}
                        </h2>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--lh-ink-secondary)]">
                          {roadmap.tagline}
                        </p>
                      </div>
                      {isEnrolled && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--lh-primary-subtle)] px-2 py-1 text-[10px] font-medium text-[var(--lh-primary)]">
                          <CheckCircle2 className="h-3 w-3 text-[var(--lh-point)]" />
                          수강 중
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleStartRoadmap(roadmap, e)}
                      className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--lh-primary)] px-3.5 py-2.5 text-xs font-medium text-white shadow-xs transition hover:bg-[var(--lh-primary-hover)] cursor-pointer"
                    >
                      <span>{isEnrolled ? "이어서 학습하기" : "시작하기"}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Roadmap Detail Modal */}
      {selectedRoadmapForDetail && (
        <div
          className="fixed inset-0 z-50 flex min-h-0 items-center justify-center overflow-hidden bg-black/40 p-4 backdrop-blur-xs animate-fade-in"
          onClick={() => setSelectedRoadmapForDetail(null)}
        >
          <div
            className="relative flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] text-left shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 sm:p-7">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 border-b border-[var(--lh-line)] pb-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-full bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-2.5 py-0.5 text-xs font-medium text-[var(--lh-ink)]">
                    {selectedRoadmapForDetail.subject}
                  </span>
                  <span className="rounded-full border border-[var(--lh-line)] px-2 py-0.5 text-[11px] font-normal text-[var(--lh-ink-secondary)]">
                    {selectedRoadmapForDetail.levelLabel}
                  </span>
                  {selectedRoadmapForDetail.badge && (
                    <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--lh-primary)]">
                      {selectedRoadmapForDetail.badge}
                    </span>
                  )}
                  {enrolledCourseIds.has(selectedRoadmapForDetail.course.id) && (
                    <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--lh-primary)]">
                      ✓ 수강 중인 과목
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-medium text-[var(--lh-ink)]">
                  {selectedRoadmapForDetail.title}
                </h2>
                <p className="text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
                  {selectedRoadmapForDetail.description}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRoadmapForDetail(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--lh-ink-tertiary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              </div>

              {/* Target & Outcomes */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--lh-ink)]">
                  <Target className="h-3.5 w-3.5 text-[var(--lh-point)]" />
                  <span>추천 대상</span>
                </div>
                <p className="text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
                  {selectedRoadmapForDetail.targetAudience}
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--lh-ink)]">
                  <GraduationCap className="h-3.5 w-3.5 text-[var(--lh-point)]" />
                  <span>선수 지식 / 권장 사항</span>
                </div>
                <p className="text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
                  {selectedRoadmapForDetail.recommendedPrerequisites.join(", ")}
                </p>
              </div>
              </div>

              {/* 4 Stages Detailed Breakdown */}
              <div className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
                4단계 학습 로드맵 상세 단계
              </h3>

              <div className="space-y-3">
                {selectedRoadmapForDetail.stages.map((stage) => (
                  <div
                    key={stage.step}
                    className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white text-[10px] font-medium">
                          {stage.step}
                        </span>
                        <span className="text-xs font-medium text-[var(--lh-ink)]">
                          {stage.title}
                        </span>
                      </div>
                      <span className="text-[11px] font-normal text-[var(--lh-ink-tertiary)]">
                        약 {stage.durationWeeks}주
                      </span>
                    </div>

                    <p className="text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed pl-7">
                      {stage.description}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pl-7 pt-1">
                      {stage.topics.map((topic, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-2 py-0.5 text-[10px] font-normal text-[var(--lh-ink-secondary)]"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              </div>

              {/* Learning Outcomes */}
              <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 space-y-2">
              <h4 className="text-xs font-medium text-[var(--lh-ink)]">
                이 로드맵을 완수하면 얻게 되는 핵심 역량
              </h4>
              <ul className="space-y-1 text-xs font-normal text-[var(--lh-ink-secondary)]">
                {selectedRoadmapForDetail.learningOutcomes.map((outcome, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[var(--lh-point)] font-medium">•</span>
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--lh-line)] bg-[var(--lh-surface)] px-6 py-4 sm:px-7">
              <button
                type="button"
                onClick={() => setSelectedRoadmapForDetail(null)}
                className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-2 text-xs font-medium text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] transition cursor-pointer"
              >
                닫기
              </button>

              {enrolledCourseIds.has(selectedRoadmapForDetail.course.id) ? (
                <button
                  type="button"
                  onClick={() => {
                    handleStartRoadmap(selectedRoadmapForDetail);
                    setSelectedRoadmapForDetail(null);
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-5 py-2 text-xs font-medium text-white shadow-xs transition cursor-pointer"
                >
                  <span>이어서 학습하기</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleStartRoadmap(selectedRoadmapForDetail);
                    setSelectedRoadmapForDetail(null);
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-5 py-2 text-xs font-medium text-white shadow-xs transition cursor-pointer"
                >
                  <span>시작하기</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
