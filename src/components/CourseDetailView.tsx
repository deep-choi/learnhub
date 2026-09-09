import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock3,
  PlayCircle,
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
  const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
  const completedLessons = lessons.filter((lesson) => lesson.isCompleted).length;
  const progressPct = lessons.length ? Math.round((completedLessons / lessons.length) * 100) : 0;
  const nextLesson = course.chapters
    .flatMap((chapter) => chapter.lessons.map((lesson) => ({ lesson, chapterTitle: chapter.title })))
    .find(({ lesson }) => !lesson.isCompleted);

  return (
    <div className="space-y-6 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#787774] transition hover:text-[#191919]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 전체 과목 목록으로 돌아가기
      </button>

      {/* Course Header (Notion Page Banner) */}
      <section className="rounded-lg border border-[#E9E9E7] bg-white p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#787774]">
          <span className="inline-block rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-2 py-0.5 text-[11px] font-semibold text-[#191919]">
            {course.learningType === "concept" && "개념 원리 탐구"}
            {course.learningType === "problem_solving" && "문제 해결 및 증명"}
            {course.learningType === "practical" && "수식 실습"}
            {course.learningType === "language" && "언어"}
            {course.learningType === "memorization" && "암기"}
          </span>
          <span>•</span>
          <span>권장 몰입 일일 {course.dailyMinutes}분</span>
          <span>•</span>
          <span>{completedLessons} / {lessons.length} 레슨 이수</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-[#191919] sm:text-3xl">{course.title}</h1>
          <p className="text-sm leading-relaxed text-[#787774]">{course.summary}</p>
        </div>

        <div className="flex flex-col gap-4 border-t border-[#E9E9E7] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 max-w-sm">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-[#787774]">학습 완결도</span>
              <span className="font-mono font-bold text-[#191919]">{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#E9E9E7]">
              <div className="h-full bg-[#191919] transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          {nextLesson && (
            <button
              type="button"
              onClick={() => onStartLesson(course, nextLesson.lesson, nextLesson.chapterTitle)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#191919] px-4 py-2.5 text-xs font-medium text-white transition hover:bg-[#37352F]"
            >
              {completedLessons ? "이어서 사유하기" : "첫 번째 레슨 탐구 시작"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </section>

      {/* Chapters & Lessons (Notion Outlines) */}
      <section className="space-y-4">
        <div className="border-b border-[#E9E9E7] pb-2">
          <h2 className="text-sm font-bold text-[#191919]">커리큘럼 목차</h2>
        </div>

        <div className="space-y-3">
          {course.chapters.map((chapter, chapterIndex) => (
            <div key={chapter.id} className="overflow-hidden rounded-lg border border-[#E9E9E7] bg-white">
              <div className="flex items-start justify-between gap-4 border-b border-[#E9E9E7] bg-[#F7F6F3] px-5 py-3.5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#787774]">
                    Chapter {chapterIndex + 1}
                  </span>
                  <h3 className="text-sm font-bold text-[#191919]">{chapter.title}</h3>
                  <p className="mt-0.5 text-xs text-[#787774]">{chapter.description}</p>
                </div>
                <span className="shrink-0 text-xs text-[#787774]">{chapter.lessons.length}개 레슨</span>
              </div>

              <div className="divide-y divide-[#E9E9E7]">
                {chapter.lessons.map((lesson) => (
                  <div key={lesson.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-[#FBFBFA]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        {lesson.isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#191919]" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-[#9B9A97]" />
                        )}
                        <h4 className="truncate text-xs font-semibold text-[#191919]">{lesson.title}</h4>
                      </div>
                      <p className="mt-0.5 pl-6.5 text-[11px] text-[#787774]">
                        개념: {lesson.conceptName} · 약 {lesson.estimatedMinutes}분 소요
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onStartLesson(course, lesson, chapter.title)}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#E9E9E7] bg-white px-3 py-1.5 text-xs font-medium text-[#2F3437] transition hover:bg-[#F7F6F3]"
                    >
                      <PlayCircle className="h-3 w-3" />
                      {lesson.isCompleted ? "다시 복습" : "학습 시작"}
                    </button>
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