import React from "react";
import {
  ArrowRight,
  Clock3,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Course, LessonMeta, ReviewQuestion, UserProgress } from "../types/learning";
import { INITIAL_COURSES } from "../data/initialData";

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
  return firstLesson
    ? { lesson: firstLesson, chapterTitle: course.chapters[0].title }
    : null;
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
  const [subject, setSubject] = React.useState("");
  const sampleCourseIds = new Set(INITIAL_COURSES.map((course) => course.id));
  const userCourses = courses.filter((course) => !sampleCourseIds.has(course.id));
  const hasStartedLearning = userCourses.some((course) =>
    course.chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.isCompleted)),
  );

  let nextLessonToStudy: {
    course: Course;
    chapterTitle: string;
    lesson: LessonMeta;
  } | null = null;

  for (const course of userCourses) {
    for (const chapter of course.chapters) {
      const lesson = chapter.lessons.find((item) => !item.isCompleted);
      if (lesson) {
        nextLessonToStudy = { course, chapterTitle: chapter.title, lesson };
        break;
      }
    }
    if (nextLessonToStudy) break;
  }

  const sampleCourses = courses.filter((course) => sampleCourseIds.has(course.id)).slice(0, 2);

  return (
    <div className="space-y-8 pb-16">
      {/* 1. One primary action, with direct topic entry for a new learner. */}
      <section className="space-y-4 rounded-xl border border-[#E9E9E7] bg-white p-6 shadow-xs">
        <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-[#787774]">
              <span>🌱</span>
              <span className="font-semibold text-[#191919]">나만의 맞춤 자율 학습</span>
              <span>•</span>
              <span>{new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#191919]">
              {hasStartedLearning && nextLessonToStudy ? "이어서 공부할까요?" : "무엇을 배우고 싶으신가요?"}
            </h1>
            <p className="text-xs sm:text-sm text-[#787774]">
              {hasStartedLearning && nextLessonToStudy
                ? `${nextLessonToStudy.course.title} · ${nextLessonToStudy.lesson.title}에서 이어갑니다.`
                : "배우고 싶은 주제를 입력하면 학습 계획을 만들 수 있습니다."}
            </p>
          </div>

        {hasStartedLearning && nextLessonToStudy ? (
          <button
            type="button"
            onClick={() => onStartLesson(nextLessonToStudy!.course, nextLessonToStudy!.lesson, nextLessonToStudy!.chapterTitle)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191919] px-4 py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-[#37352F] cursor-pointer sm:w-auto"
          >
            <Clock3 className="h-4 w-4" />
            <span>이어서 학습하기 · 약 {nextLessonToStudy.lesson.estimatedMinutes}분</span>
          </button>
        ) : (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = subject.trim();
              if (!trimmed) return;
              onOpenCreateCourse(trimmed);
            }}
          >
            <label htmlFor="home-subject" className="sr-only">배우고 싶은 주제</label>
            <input
              id="home-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="예: 사진 구도, 스페인어 회화, 재무 기초"
              className="min-w-0 flex-1 rounded-lg border border-[#D3D3D0] bg-white px-3 py-2.5 text-sm text-[#191919] outline-none placeholder:text-[#9B9A97] focus:border-[#191919] focus:ring-2 focus:ring-[#191919]/10"
            />
            <button
              type="submit"
              disabled={!subject.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#191919] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#37352F] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              <span>학습 계획 만들기</span>
            </button>
          </form>
        )}

        <p className="text-[11px] text-[#9B9A97]">로그인 없이 이 기기에서 시작할 수 있습니다.</p>

        {/* Quick Sample Discovery Row */}
        <div className="border-t border-[#E9E9E7] pt-3">
          <div className="text-[11px] font-semibold text-[#787774] mb-2">
            수학 예시 과목 (선택):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sampleCourses.map((c) => {
              const resume = getResumeLesson(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (resume) {
                      onStartLesson(c, resume.lesson, resume.chapterTitle);
                    } else {
                      onSelectCourse(c.id);
                    }
                  }}
                  className="flex items-center justify-between rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-2.5 text-left transition hover:bg-white hover:border-[#191919] cursor-pointer"
                >
                  <div className="space-y-0.5 truncate">
                    <div className="text-xs font-bold text-[#191919] truncate">{c.title}</div>
                    <div className="text-[10px] text-[#787774] truncate">{c.summary}</div>
                  </div>
                  <span className="text-[11px] font-semibold text-[#191919] shrink-0 ml-2">
                    체험하기 ➔
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </section>

      {/* 2. Review Banner if pending */}
      {reviews.length > 0 && (
        <button
          type="button"
          onClick={onStartReview}
          className="flex w-full items-center justify-between rounded-lg border border-[#E9E9E7] bg-white p-4 text-left transition hover:border-[#191919] hover:bg-[#FBFBFA] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#191919] text-white">
              <RotateCcw className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#191919]">예정된 복습</span>
                <span className="rounded-sm bg-[#191919] px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {reviews.length}개
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#787774]">
                저장된 일정이 현재 시각까지 도달한 문제입니다. (약 3분 소요)
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#191919]">
            지금 복습하기 <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      {/* 3. Notion Database Style Course Registry */}
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#191919]">내 과목</span>
            <span className="rounded-sm bg-[#F7F6F3] px-1.5 py-0.5 text-[11px] font-medium text-[#787774]">
              {courses.length}개 과목 등록됨
            </span>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto rounded-lg border border-[#E9E9E7] bg-white">
          <table className="min-w-[560px] w-full text-left text-xs">
            <thead className="border-b border-[#E9E9E7] bg-[#F7F6F3] text-[11px] font-semibold text-[#787774]">
              <tr>
                <th className="px-4 py-2.5">과목 및 목표</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">학습 유형</th>
                <th className="hidden px-4 py-2.5 md:table-cell">일일 목표</th>
                <th className="px-4 py-2.5">진도율</th>
                <th className="px-4 py-2.5 text-right">열기</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E9E7]">
              {courses.map((course) => {
                const progressPct = getCourseProgress(course);
                const totalLessons = course.chapters.flatMap((c) => c.lessons).length;
                const completedCount = course.chapters.flatMap((c) => c.lessons).filter((l) => l.isCompleted).length;

                return (
                  <tr
                    key={course.id}
                    onClick={() => onSelectCourse(course.id)}
                    className="cursor-pointer transition hover:bg-[#F7F6F3]"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-[#191919]">{course.title}</div>
                      <div className="mt-0.5 line-clamp-1 text-[#787774]">{course.summary}</div>
                    </td>
                    <td className="hidden px-4 py-3.5 text-[#787774] sm:table-cell">
                      <span className="inline-block rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-1.5 py-0.5 text-[10px] font-medium text-[#2F3437]">
                        {course.learningType === "concept" && "개념 원리"}
                        {course.learningType === "problem_solving" && "문제 풀이"}
                        {course.learningType === "practical" && "수식 실습"}
                        {course.learningType === "language" && "언어"}
                        {course.learningType === "memorization" && "암기"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3.5 text-[#787774] md:table-cell">
                      {course.dailyMinutes}분 / 일
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E9E9E7]">
                          <div
                            className="h-full bg-[#191919]"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] text-[#787774]">
                          {completedCount}/{totalLessons} ({progressPct}%)
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <ArrowRight className="inline-block h-4 w-4 text-[#9B9A97]" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
