import type { Course } from "./learning";

export type ConceptState = "unseen" | "learned" | "verified" | "needs_review" | "curious";
export type ExplanationDepth = "easy" | "formal" | "example";
export interface ConceptNode {
  id: string;
  name: string;
  aliases: string[];
  domain: string;
  courseRefs: { courseId: string; lessonId?: string }[];
  state: ConceptState;
  depthReached?: ExplanationDepth;
  userMarkedKnown?: boolean;
  practicalDoneAt?: string;
  reflection?: string;
  curiosityQuestion?: string;
  lastStudiedAt?: string;
  createdAt: string;
  /** Timestamp for resolving explicit edits across devices. */
  updatedAt?: string;
}
export type ConceptEdgeKind = "prerequisite" | "related" | "curiosity";
export interface ConceptEdge {
  id: string;
  from: string;
  to: string;
  kind: ConceptEdgeKind;
  source: "ai" | "user";
  disputed?: boolean;
  updatedAt?: string;
}
export interface LearningPosition { courseId: string; lessonId: string; conceptId: string; at: string }
export interface KnowledgeGraph { version: 1; nodes: ConceptNode[]; edges: ConceptEdge[]; lastPosition?: LearningPosition }
export type NextStepKind = "review" | "next_lesson" | "connected" | "curiosity" | "deepen" | "wrap_up";
export interface NextStep {
  kind: NextStepKind;
  conceptId?: string;
  courseId?: string;
  lessonId?: string;
  becauseOfConceptId?: string;
  score: number;
}
export interface ResumeContext {
  position: LearningPosition;
  daysAway: number;
  dueReviewCount: number;
  conceptName: string;
  courseTitle: string;
}
// Optional metadata keeps existing Course/LessonMeta consumers compatible.
export interface CurriculumConceptLinks {
  domain?: string;
  lessons?: { lessonId?: string; conceptName: string; aliases?: string[]; prerequisites?: string[]; relatedConcepts?: string[] }[];
}
export type GraphCourse = Course & { domain?: string; targetAudience?: string; conceptLinks?: CurriculumConceptLinks };
export interface NudgeResponse { question: string; reason: string; fallback?: boolean }
export interface CoursePreview { curriculum: Record<string, unknown>; conceptLinks: CurriculumConceptLinks; preview: true }
