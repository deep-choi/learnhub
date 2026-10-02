import type { SidebarCourse } from "../types/chat";
import type { Course } from "../types/learning";
import type { LearningPosition } from "../types/knowledgeGraph";
import { StorageService } from "./storage";
import { getKnowledgeGraph } from "./knowledgeGraphStore";

/** LearningConversationView가 레슨별 대화를 저장하는 키와 같아야 한다. */
export const lessonConversationKey = (courseId: string, lessonId: string): string =>
  `learnhub_tutor_history_v3_${encodeURIComponent(`${courseId}:${lessonId}`)}`;

const hasStoredConversation = (courseId: string, lessonId: string, storage?: Pick<Storage, "getItem">): boolean => {
  try {
    const raw = (storage ?? localStorage).getItem(lessonConversationKey(courseId, lessonId));
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
};

/** 보관(취소)한 과목은 빼고, 현재 위치가 있는 과목을 맨 위에 둔다. 나머지는 저장 순서(최신 과목 먼저)를 따른다. */
export function buildSidebarCourses(courses: Course[], position?: LearningPosition | null, storage?: Pick<Storage, "getItem">): SidebarCourse[] {
  return courses
    .filter((course) => course.status !== "cancelled")
    .map((course) => {
      const lessons = course.chapters.flatMap((chapter) => chapter.lessons).map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        isCompleted: lesson.isCompleted,
        isCurrent: position?.courseId === course.id && position.lessonId === lesson.id,
        hasConversation: hasStoredConversation(course.id, lesson.id, storage),
      }));
      return {
        id: course.id,
        title: course.title,
        isCurrent: lessons.some((lesson) => lesson.isCurrent),
        completedCount: lessons.filter((lesson) => lesson.isCompleted).length,
        totalCount: lessons.length,
        lessons,
      };
    })
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

/** 사이드바 "과목" 폴더 목록. 저장된 과목과 마지막 학습 위치를 읽어 만든다. */
export function getSidebarCourses(): SidebarCourse[] {
  let position: LearningPosition | undefined;
  try { position = getKnowledgeGraph().lastPosition; } catch { /* 지도를 읽지 못해도 목록은 보여 줍니다. */ }
  return buildSidebarCourses(StorageService.getCourses(), position);
}
