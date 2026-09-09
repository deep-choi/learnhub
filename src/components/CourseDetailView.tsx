import React from "react";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  CheckCircle2,
  Play,
  FileText,
  Target,
} from "lucide-react";
import { Course, LessonMeta } from "../types/learning";

interface CourseDetailViewProps {
  course: Course;
  onBack: () => void;
  onStartLesson: (course: Course, lesson: LessonMeta, chapterTitle: string) => void;
}

export const CourseDetailView: React.FC<CourseDetailViewProps> = ({
  course,
  onBack,
  onStartLesson,
}) => {
  const allLessons = course.chapters.flatMap((c) => c.lessons);
  const completedLessons = allLessons.filter((l) => l.isCompleted);
  const totalMinutes = allLessons.reduce((acc, l) => acc + (l.estimatedMinutes || 10), 0);
  const progressPercent = allLessons.length > 0 ? Math.round((completedLessons.length / allLessons.length) * 100) : 0;

  // Find next lesson to resume
  const nextLesson = allLessons.find((l) => !l.isCompleted) || allLessons[0];
  const nextChapter = course.chapters.find((c) => c.lessons.some((l) => l.id === nextLesson?.id)) || course.chapters[0];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-fade-in">
      {/* Top Back Navigation */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-1.5 text-xs font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>내 과목 목록으로 돌아가기</span>
        </button>
      </div>

      {/* Course Hero Banner */}
      <section className="rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-3 py-1 text-xs font-medium text-[var(--lh-primary)]">
              {course.subject}
            </span>
            <span className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-2.5 py-1 text-xs font-normal text-[var(--lh-ink-secondary)]">
              {course.level === "beginner" ? "입문" : course.level === "intermediate" ? "중급" : "심화"}
            </span>
            <span className="rounded-full border border-[var(--lh-line)] px-2.5 py-1 text-xs font-normal text-[var(--lh-ink-secondary)]">
              하루 {course.dailyMinutes}분 권장
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-[var(--lh-ink)]">
            {course.title}
          </h1>

          <p className="text-sm font-normal text-[var(--lh-ink-secondary)] leading-relaxed max-w-3xl">
            {course.summary}
          </p>
        </div>

        {/* Goal & Type Box */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--lh-line)]">
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--lh-ink)]">
              <Target className="h-4 w-4 text-[var(--lh-point)]" />
              <span>학습 목표</span>
            </div>
            <p className="text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
              {course.goal}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--lh-ink)]">
              <BookOpen className="h-4 w-4 text-[var(--lh-point)]" />
              <span>학습 방법론</span>
            </div>
            <p className="text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
              {course.learningTypeExplanation || "개념의 본질을 원리부터 증명하고 스스로 깨우칩니다."}
            </p>
          </div>
        </div>

        {/* Progress & Primary Resume Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-4 border-t border-[var(--lh-line)]">
          <div className="space-y-1.5 flex-1 max-w-md">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--lh-ink)]">
              <span>학습 진행률</span>
              <span>
                {completedLessons.length} / {allLessons.length} 완료 ({progressPercent}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)]">
              <div
                className="h-full bg-[var(--lh-primary)] transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {nextLesson && nextChapter && (
            <button
              type="button"
              onClick={() => onStartLesson(course, nextLesson, nextChapter.title)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-6 py-2.5 text-xs font-medium text-white shadow-xs transition cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{completedLessons.length > 0 ? "이어서 학습하기" : "첫 레슨 시작하기"}</span>
            </button>
          )}
        </div>
      </section>

      {/* Chapters & Lessons Syllabus */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-[var(--lh-ink)]">
            전체 커리큘럼 ({course.chapters.length}개 챕터 · {allLessons.length}개 레슨)
          </h2>
          <span className="text-xs font-normal text-[var(--lh-ink-tertiary)] flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>총 소요 시간 약 {totalMinutes}분</span>
          </span>
        </div>

        <div className="space-y-4">
          {course.chapters.map((chapter, cIdx) => (
            <div
              key={chapter.id}
              className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-[var(--lh-line)] pb-3">
                <div>
                  <span className="text-[11px] font-medium text-[var(--lh-point)] uppercase tracking-wider">
                    Chapter {cIdx + 1}
                  </span>
                  <h3 className="text-sm font-medium text-[var(--lh-ink)] mt-0.5">
                    {chapter.title}
                  </h3>
                </div>
                <span className="text-xs font-normal text-[var(--lh-ink-tertiary)]">
                  {chapter.lessons.length}개 레슨
                </span>
              </div>

              {chapter.description && (
                <p className="text-xs font-normal text-[var(--lh-ink-secondary)]">
                  {chapter.description}
                </p>
              )}

              {/* Lesson Items */}
              <div className="space-y-2 pt-1">
                {chapter.lessons.map((lesson, lIdx) => (
                  <div
                    key={lesson.id}
                    onClick={() => onStartLesson(course, lesson, chapter.title)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3.5 hover:bg-[var(--lh-surface)] hover:border-[var(--lh-point)]/50 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lh-surface)] border border-[var(--lh-line)] text-xs font-medium text-[var(--lh-ink-secondary)]">
                        {lesson.isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 text-[var(--lh-point)]" />
                        ) : (
                          <span>{lIdx + 1}</span>
                        )}
                      </div>

                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--lh-ink)] group-hover:text-[var(--lh-point)] transition-colors truncate">
                            {lesson.title}
                          </span>
                          {lesson.conceptName && (
                            <span className="hidden sm:inline rounded-md bg-[var(--lh-surface)] border border-[var(--lh-line)] px-2 py-0.2 text-[10px] font-normal text-[var(--lh-ink-tertiary)]">
                              {lesson.conceptName}
                            </span>
                          )}
                        </div>
                        {lesson.description && (
                          <p className="text-[11px] font-normal text-[var(--lh-ink-secondary)] truncate mt-0.5">
                            {lesson.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-normal text-[var(--lh-ink-tertiary)] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{lesson.estimatedMinutes}분</span>
                      </span>

                      <button
                        type="button"
                        className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] p-1.5 text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-primary)] group-hover:text-white group-hover:border-[var(--lh-primary)] transition"
                      >
                        <Play className="h-3 w-3 fill-current" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
