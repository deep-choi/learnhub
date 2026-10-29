import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Printer } from "lucide-react";
import { Course, LessonMeta, MistakeItem, UserSkill } from "../types/learning";
import { MistakeArchiveView } from "./notion/MistakeArchiveView";
import { NotionPageView } from "./notion/Sidebar";
import { CourseAssessmentView } from "./CourseAssessmentView";
import { StorageService } from "../services/storage";
import { loadAssessment } from "../services/assessment";
import type { AssessmentSession } from "../domain/assessment";

interface LearningRecordsViewProps {
  skills: UserSkill[];
  courses: Course[];
  onSelectView: (view: NotionPageView) => void;
  onDataChanged: () => void;
}

type RecordsTab = "practice" | "mistakes";
interface PracticeRun { courseId: string; lessonIds: string[]; startInSetup: boolean; preferPrint?: boolean }

const allLessons = (course: Course) => course.chapters.flatMap((chapter) => chapter.lessons);
const studiedLessons = (course: Course) => allLessons(course).filter((lesson) => lesson.isCompleted);

export const LearningRecordsView: React.FC<LearningRecordsViewProps> = ({
  skills,
  courses,
  onSelectView,
  onDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<RecordsTab>("practice");
  const [run, setRun] = useState<PracticeRun | null>(null);
  const [mistakes, setMistakes] = useState<MistakeItem[]>(() => StorageService.getMistakes());

  useEffect(() => {
    const load = () => setMistakes(StorageService.getMistakes());
    window.addEventListener("learnhub:data-changed", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("learnhub:data-changed", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const runCourse = run ? courses.find((course) => course.id === run.courseId) : undefined;
  if (run && runCourse) {
    return (
      <CourseAssessmentView
        key={`${runCourse.id}:${run.lessonIds.join(",")}:${run.startInSetup}`}
        course={runCourse}
        practiceLessonIds={run.lessonIds}
        startInSetup={run.startInSetup}
        preferPrint={run.preferPrint}
        backLabel="학습 기록으로"
        onBack={() => setRun(null)}
        onDataChanged={onDataChanged}
        onReviewLesson={(lessonId) => {
          const chapter = runCourse.chapters.find((item) => item.lessons.some((lesson) => lesson.id === lessonId));
          const lesson = chapter?.lessons.find((item) => item.id === lessonId);
          if (chapter && lesson) onSelectView({ type: "lesson", course: runCourse, lesson, chapterTitle: chapter.title });
        }}
      />
    );
  }

  const openMistakes = mistakes.filter((item) => !item.isResolved).length;
  const completedLessons = courses.reduce((count, course) => count + studiedLessons(course).length, 0);
  const solvedCount = skills.reduce((sum, skill) => sum + skill.correctCount + skill.wrongCount, 0);
  const tabs: Array<{ id: RecordsTab; label: string; count?: number }> = [
    { id: "practice", label: "문제 풀기" },
    { id: "mistakes", label: "오답 기록", count: openMistakes },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 pb-24 text-sm text-[var(--lh-ink)] sm:px-8 sm:py-10">
      <header className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-medium tracking-[-0.03em] sm:text-4xl">학습 기록</h1>
          <p className="text-[var(--lh-ink-secondary)]">
            레슨 {completedLessons}개 완료 · 개념 {skills.length}개 · 문제 {solvedCount}개 풀이
          </p>
        </div>
        {/* 페이지 내용을 바꾸는 탭은 밑줄, 그 안의 거르기는 알약 모양으로 구분합니다. */}
        <div className="flex gap-6 border-b border-[var(--lh-line)]" role="tablist" aria-label="학습 기록 보기">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 text-sm transition cursor-pointer ${
                activeTab === tab.id
                  ? "border-[var(--lh-primary)] font-medium text-[var(--lh-ink)]"
                  : "border-transparent text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)]"
              }`}
            >
              {tab.label}
              {!!tab.count && (
                <span className="rounded-full bg-[var(--lh-secondary-subtle)] px-2 py-0.5 font-mono text-xs text-[var(--lh-secondary-text)]">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      {activeTab === "practice" && (
        <section role="tabpanel" aria-label="문제 풀기">
          <PracticeCourseGrid
            courses={courses}
            mistakes={mistakes}
            onStart={setRun}
            onBrowseCourses={() => onSelectView({ type: "courses" })}
          />
        </section>
      )}

      {activeTab === "mistakes" && (
        <section role="tabpanel" aria-label="오답 기록">
          <MistakeArchiveView courses={courses} onSelectView={onSelectView} embedded />
        </section>
      )}
    </div>
  );
};

interface PracticeCourseGridProps {
  courses: Course[];
  mistakes: MistakeItem[];
  onStart: (run: PracticeRun) => void;
  onBrowseCourses: () => void;
}

const PracticeCourseGrid: React.FC<PracticeCourseGridProps> = ({ courses, mistakes, onStart, onBrowseCourses }) => {
  const studiedCourses = useMemo(
    () => courses.filter((course) => studiedLessons(course).length > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [courses],
  );
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const owner = StorageService.getUser().id;

  if (!studiedCourses.length) {
    return (
      <div className="space-y-4 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-6 py-12 text-center">
        <p className="text-base font-medium">아직 끝낸 레슨이 없어요</p>
        <p className="text-[var(--lh-ink-secondary)]">레슨을 하나 마치면 배운 개념으로 문제를 풀거나 시험지로 인쇄할 수 있어요.</p>
        <button type="button" onClick={onBrowseCourses} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lh-line)] px-5 transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">
          과목 둘러보기<ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {studiedCourses.map((course) => {
        let saved: AssessmentSession | null = null;
        try { saved = loadAssessment(owner, course.id, true); } catch { saved = null; }
        const studied = studiedLessons(course);
        const ids = studied.map((lesson) => lesson.id);
        const selected = picked[course.id] ?? ids;
        return (
          <PracticeCourseCard
            key={course.id}
            course={course}
            studied={studied}
            total={allLessons(course).length}
            selected={selected}
            mistakes={mistakes}
            saved={saved}
            onToggle={(id) => setPicked((prev) => ({
              ...prev,
              [course.id]: selected.includes(id) ? selected.filter((item) => item !== id) : ids.filter((item) => item === id || selected.includes(item)),
            }))}
            onStart={(preferPrint) => onStart({ courseId: course.id, lessonIds: selected, startInSetup: true, preferPrint })}
            onResume={() => saved && onStart({ courseId: course.id, lessonIds: saved.lessonIds || selected, startInSetup: false })}
          />
        );
      })}
    </div>
  );
};

interface PracticeCourseCardProps {
  course: Course;
  studied: LessonMeta[];
  total: number;
  selected: string[];
  mistakes: MistakeItem[];
  saved: AssessmentSession | null;
  onToggle: (lessonId: string) => void;
  onStart: (preferPrint: boolean) => void;
  onResume: () => void;
}

const PracticeCourseCard: React.FC<PracticeCourseCardProps> = ({ course, studied, total, selected, mistakes, saved, onToggle, onStart, onResume }) => {
  const percent = total ? Math.round((studied.length / total) * 100) : 0;
  const answered = saved ? saved.questions.filter((q) => saved.answers[q.id]?.trim()).length : 0;
  const openMistakesFor = (lesson: LessonMeta) => mistakes.filter((item) => !item.isResolved && (item.lessonId === lesson.id ||
    (item.courseId === course.id && !!item.conceptId && item.conceptId === lesson.conceptId))).length;
  const disabled = selected.length === 0;

  return (
    <article className="flex flex-col gap-5 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 shadow-xs">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs text-[var(--lh-ink-tertiary)]">{course.subject}</p>
          <h2 className="line-clamp-2 text-base font-medium leading-snug">{course.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--lh-surface-strong)]" role="progressbar" aria-label="레슨 진도" aria-valuenow={studied.length} aria-valuemin={0} aria-valuemax={total}>
            <div className="h-full rounded-full bg-[var(--lh-primary)]" style={{ width: `${percent}%` }} />
          </div>
          <span className="flex-none text-xs text-[var(--lh-ink-secondary)]">레슨 {studied.length} / {total}</span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-[var(--lh-ink-secondary)]">
          배운 개념 {studied.length}개{studied.length > 1 ? ` · ${selected.length}개 선택` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {studied.map((lesson) => {
            const on = selected.includes(lesson.id);
            const open = openMistakesFor(lesson);
            return (
              <button
                key={lesson.id}
                type="button"
                aria-pressed={on}
                title={lesson.title}
                onClick={() => onToggle(lesson.id)}
                className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs transition cursor-pointer ${
                  on
                    ? "border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]"
                    : "border-[var(--lh-line)] text-[var(--lh-ink-tertiary)] hover:bg-[var(--lh-surface-subtle)]"
                }`}
              >
                {on && <Check size={13} className="flex-none" />}
                <span className="truncate">{lesson.conceptName || lesson.title}</span>
                {open > 0 && <span className="flex-none rounded-full bg-[var(--lh-secondary-subtle)] px-1.5 font-mono text-[10px] text-[var(--lh-secondary-text)]" aria-label={`다시 볼 오답 ${open}개`}>{open}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {saved && (
        <button
          type="button"
          onClick={onResume}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--lh-surface-subtle)] px-4 py-3 text-left transition hover:bg-[var(--lh-surface-strong)] cursor-pointer"
        >
          <span className="text-[var(--lh-ink-secondary)]">
            {saved.stage === "results" ? "지난 연습 결과" : `풀던 문제 · ${saved.questions.length}문제 중 ${answered}문제 답함`}
          </span>
          <span className="inline-flex flex-none items-center gap-1 text-[var(--lh-primary)]">
            {saved.stage === "results" ? "결과 보기" : "이어서 풀기"}<ArrowRight size={14} />
          </span>
        </button>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onStart(false)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-4 font-medium text-white transition hover:bg-[var(--lh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          문제 풀기
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onStart(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--lh-line)] px-4 transition hover:bg-[var(--lh-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <Printer size={15} />시험지 PDF
        </button>
      </div>
    </article>
  );
};
