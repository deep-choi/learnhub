import type { Chapter, Course, LearningType } from "../../types/learning";
import { normalizeConceptKey } from "./graphBridge";
import type { ConceptEdge, ConceptNode, CurriculumConceptLinks, KnowledgeGraph } from "./graphTypes";

export interface CurriculumSettings {
  level: Course["level"];
  goal: string;
  dailyMinutes: number;
}

const LEARNING_TYPES: LearningType[] = ["concept", "problem_solving", "memorization", "language", "practical"];

const names = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 6)
    : [];

/**
 * analyze-subject 응답(커리큘럼 자체)과 preview-course 응답({ curriculum, conceptLinks, preview })을
 * 모두 받아서 챕터가 들어 있는 커리큘럼 객체만 꺼냅니다.
 */
export const unwrapCurriculum = (data: unknown): Record<string, any> | null => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, any>;
  const inner = record.curriculum && typeof record.curriculum === "object" ? record.curriculum : record.course && typeof record.course === "object" ? record.course : record;
  return Array.isArray(inner.chapters) ? inner : null;
};

/** 과목과 개념 연결을 함께 만듭니다. 연결은 응답의 conceptLinks가 있으면 그것을, 없으면 레슨 안의 필드를 씁니다. */
export const buildCourseFromPayload = (
  raw: Record<string, any>,
  subject: string,
  settings: CurriculumSettings,
  now = Date.now(),
): { course: Course; links: CurriculumConceptLinks } => {
  const data = unwrapCurriculum(raw);
  if (!data) throw new Error("커리큘럼 응답 형식이 올바르지 않습니다.");
  const supplied: CurriculumConceptLinks | undefined = raw.conceptLinks && typeof raw.conceptLinks === "object" ? raw.conceptLinks : undefined;
  const courseId = `course-${now}`;
  const linkLessons: NonNullable<CurriculumConceptLinks["lessons"]> = [];

  const chapters: Chapter[] = data.chapters.map((chapter: any, chapterIndex: number) => {
    const chapterId = `${courseId}-chapter-${chapterIndex}`;
    return {
      id: chapterId,
      title: chapter.title,
      description: chapter.description,
      lessons: Array.isArray(chapter.lessons)
        ? chapter.lessons.map((lesson: any, lessonIndex: number) => {
            const lessonId = `${chapterId}-lesson-${lessonIndex}`;
            const conceptName: string = lesson.conceptName || lesson.title;
            const fromResponse = supplied?.lessons?.find((item) => normalizeConceptKey(item.conceptName) === normalizeConceptKey(conceptName));
            linkLessons.push({
              lessonId,
              conceptName,
              aliases: fromResponse?.aliases,
              prerequisites: fromResponse?.prerequisites ?? names(lesson.prerequisites),
              relatedConcepts: fromResponse?.relatedConcepts ?? names(lesson.relatedConcepts),
            });
            return {
              id: lessonId,
              chapterId,
              courseId,
              title: lesson.title,
              description: lesson.description,
              estimatedMinutes: lesson.estimatedMinutes || settings.dailyMinutes,
              conceptId: lesson.conceptId || `concept_${chapterIndex}_${lessonIndex}`,
              conceptName,
              isCompleted: false,
              isGenerated: false,
            };
          })
        : [],
    };
  });

  const learningType = LEARNING_TYPES.includes(data.learningType) ? (data.learningType as LearningType) : "concept";
  const iso = new Date(now).toISOString();
  const domainText = supplied?.domain ?? data.domain;
  const course: Course = {
    id: courseId,
    title: data.courseTitle || subject,
    subject,
    learningType,
    learningTypeExplanation: data.learningTypeExplanation || "AI 맞춤 학습 커리큘럼입니다.",
    summary: data.summary || "AI가 설계한 맞춤형 학습 경로입니다.",
    level: settings.level,
    goal: settings.goal,
    dailyMinutes: settings.dailyMinutes,
    createdAt: iso,
    updatedAt: iso,
    chapters,
  };
  return { course, links: { domain: typeof domainText === "string" ? domainText.trim().slice(0, 30) || undefined : undefined, lessons: linkLessons } };
};

/** 미리보기 화면용 그래프: 모든 개념은 아직 안 배운 상태(unseen)로 시작합니다. */
export const previewGraph = (course: Course, links: CurriculumConceptLinks): KnowledgeGraph => {
  const domain = links.domain || course.subject.slice(0, 14) || "새 주제";
  const nodes = new Map<string, ConceptNode>();
  const edges = new Map<string, ConceptEdge>();
  const createdAt = course.createdAt;
  const ensure = (name: string, ref?: { courseId: string; lessonId?: string }) => {
    const id = normalizeConceptKey(name);
    if (!id) return null;
    if (!nodes.has(id)) nodes.set(id, { id, name, aliases: [], domain, courseRefs: ref ? [ref] : [], state: "unseen", createdAt });
    return id;
  };
  const addEdge = (from: string, to: string, kind: ConceptEdge["kind"]) => {
    if (from === to) return;
    const id = `${from}->${to}`;
    if (!edges.has(id) && !edges.has(`${to}->${from}`)) edges.set(id, { id, from, to, kind, source: "ai" });
  };

  let previous: string | null = null;
  course.chapters.flatMap((chapter) => chapter.lessons).forEach((lesson) => {
    const id = ensure(lesson.conceptName || lesson.title, { courseId: course.id, lessonId: lesson.id });
    if (!id) return;
    const link = links.lessons?.find((item) => item.lessonId === lesson.id);
    let hasPrerequisite = false;
    for (const name of link?.prerequisites ?? []) {
      const from = ensure(name);
      if (from) {
        addEdge(from, id, "prerequisite");
        hasPrerequisite = true;
      }
    }
    for (const name of link?.relatedConcepts ?? []) {
      const other = ensure(name);
      if (other) addEdge(id, other, "related");
    }
    // AI가 선수 개념을 주지 않았다면 미리보기에서는 레슨 순서를 연결로 보여줍니다.
    if (!hasPrerequisite && previous) addEdge(previous, id, "prerequisite");
    previous = id;
  });
  return { version: 1, nodes: [...nodes.values()], edges: [...edges.values()] };
};
