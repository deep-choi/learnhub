import type { Course } from "../types/learning";
import type { CurriculumConceptLinks } from "../types/knowledgeGraph";
import { authorizedFetch } from "./authClient";
import { StorageService } from "./storage";
import { existingConceptNames, mergeCourseLinks, normalizeConceptKey } from "../components/graph/graphBridge";

const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 6)
    : [];

/** 개요에 이미 선수·관련 개념이 들어 있으면(이전 방식으로 만든 미리보기) 다시 받지 않습니다. */
export const hasConceptLinks = (links?: CurriculumConceptLinks): boolean =>
  Boolean(links?.lessons?.some((lesson) => lesson.prerequisites?.length || lesson.relatedConcepts?.length));

/**
 * 과정은 개요만 받아 바로 시작하고, 개념 사이 연결은 뒤에서 받아 지도에 합칩니다.
 * 실패해도 수업은 그대로 이어지고 지도에는 레슨 개념만 남습니다.
 */
export const fillConceptLinks = async (course: Course, domain?: string): Promise<void> => {
  const lessons = course.chapters.flatMap((chapter) => chapter.lessons).slice(0, 48);
  if (lessons.length === 0) return;
  const own = new Set(lessons.map((lesson) => normalizeConceptKey(lesson.conceptName)));
  try {
    const response = await authorizedFetch("/api/ai/concept-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: course.subject.slice(0, 160),
        ...(domain ? { domain } : {}),
        lessons: lessons.map((lesson) => ({ title: lesson.title, conceptName: lesson.conceptName })),
        existingConceptNames: existingConceptNames().filter((name) => !own.has(normalizeConceptKey(name))).slice(0, 60),
      }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { lessons?: Array<Record<string, unknown>> };
    if (!Array.isArray(data?.lessons)) return;
    // 기다리는 동안 과목을 지웠다면 지도에 다시 살려 내지 않습니다.
    if (!StorageService.getCourseById(course.id)) return;
    const linked = lessons.flatMap((lesson) => {
      const item = data.lessons!.find((entry) => typeof entry?.conceptName === "string" && normalizeConceptKey(entry.conceptName) === normalizeConceptKey(lesson.conceptName));
      return item ? [{ lessonId: lesson.id, conceptName: lesson.conceptName, aliases: names(item.aliases), prerequisites: names(item.prerequisites), relatedConcepts: names(item.relatedConcepts) }] : [];
    });
    if (linked.length > 0) mergeCourseLinks(course, { domain, lessons: linked });
  } catch (error) {
    console.warn("[learnhub] 개념 연결을 채우지 못했습니다.", error);
  }
};
