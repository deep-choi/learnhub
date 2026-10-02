import type { Course } from "../types/learning";
import type { KnowledgeGraph } from "../types/knowledgeGraph";
import type { LearnerContext } from "../types/chat";

/** 자유 대화 요청에 실리는 학습자 요약의 상한. 서버 검증(`validLearnerContext`)과 같은 값을 쓴다. */
export const LEARNER_CONTEXT_LIMITS = { names: 5, nameLength: 60 } as const;

const clip = (name: string): string => {
  const chars = [...name.replace(/\s+/gu, " ").trim()];
  return chars.length > LEARNER_CONTEXT_LIMITS.nameLength ? `${chars.slice(0, LEARNER_CONTEXT_LIMITS.nameLength - 1).join("")}…` : chars.join("");
};

const byRecent = (a?: string, b?: string) => (Date.parse(b || "") || 0) - (Date.parse(a || "") || 0);

/**
 * 현재 위치, 최근 배운 개념, 다시 볼 개념, 진행 중인 과목을 이름만 짧게 모은다.
 * 학습 기록이 전혀 없으면 null이다(요청에 필드를 싣지 않는다).
 */
export function buildLearnerContext(graph: KnowledgeGraph, courses: Course[]): LearnerContext | null {
  const max = LEARNER_CONTEXT_LIMITS.names;
  const active = courses.filter((course) => course.status !== "cancelled" && course.status !== "completed");
  const position = graph.lastPosition;
  const currentNode = position ? graph.nodes.find((node) => node.id === position.conceptId) : undefined;
  const currentCourse = position ? active.find((course) => course.id === position.courseId) : undefined;

  const recent = graph.nodes
    .filter((node) => (node.state === "learned" || node.state === "verified") && node.id !== currentNode?.id)
    .sort((a, b) => byRecent(a.lastStudiedAt, b.lastStudiedAt))
    .slice(0, max)
    .map((node) => clip(node.name));
  const review = graph.nodes
    .filter((node) => node.state === "needs_review")
    .sort((a, b) => byRecent(a.lastStudiedAt, b.lastStudiedAt))
    .slice(0, max)
    .map((node) => clip(node.name));
  const activeCourses = [...active].sort((a, b) => byRecent(a.updatedAt, b.updatedAt)).slice(0, max).map((course) => clip(course.title));

  if (!currentNode && !currentCourse && recent.length === 0 && review.length === 0 && activeCourses.length === 0) return null;
  return {
    ...(currentCourse ? { currentCourse: clip(currentCourse.title) } : {}),
    ...(currentNode && currentCourse ? { currentConcept: clip(currentNode.name) } : {}),
    recentConcepts: recent,
    reviewConcepts: review,
    activeCourses,
  };
}
