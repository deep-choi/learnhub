import type { Course, LessonMeta } from "../types/learning";

const TEXT_LIMITS = { goal: 80, courseSummary: 1200, lessonDescription: 1200, levelEvidence: 2400, previousLesson: 200, nextLesson: 200 } as const;
export type LessonLearningContext = Partial<Record<keyof typeof TEXT_LIMITS, string>> & { firstLesson: boolean };

/** 시작 대화와 과정의 순서를 수업 생성에 전달한다. 오래된 과목에도 적용할 수 있다. */
export function lessonLearningContext(course: Course, lesson: LessonMeta): LessonLearningContext {
  const lessons = course.chapters.flatMap(chapter => chapter.lessons);
  const index = lessons.findIndex(item => item.id === lesson.id);
  const raw = {
    goal: course.goal,
    courseSummary: course.summary,
    lessonDescription: lesson.description,
    levelEvidence: course.setup?.levelEvidence,
    previousLesson: index > 0 ? lessons[index - 1].title : undefined,
    nextLesson: index >= 0 ? lessons[index + 1]?.title : undefined,
  };
  const context: LessonLearningContext = { firstLesson: index === 0 };
  for (const key of Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[]) {
    if (raw[key]?.trim()) context[key] = raw[key]!.trim().slice(0, TEXT_LIMITS[key]);
  }
  return context;
}

export function isLessonLearningContext(value: unknown): value is LessonLearningContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (typeof input.firstLesson !== "boolean") return false;
  return Object.keys(input).every(key => key === "firstLesson" || (
    Object.hasOwn(TEXT_LIMITS, key) && typeof input[key] === "string" && input[key].trim().length > 0
    && input[key].length <= TEXT_LIMITS[key as keyof typeof TEXT_LIMITS]
  ));
}
