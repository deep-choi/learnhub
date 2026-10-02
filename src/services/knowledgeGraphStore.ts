import type { Course } from "../types/learning";
import type { ConceptNode, CurriculumConceptLinks, ExplanationDepth, KnowledgeGraph, LearningPosition, ResumeContext } from "../types/knowledgeGraph";
import { conceptEdgeId, emptyKnowledgeGraph, findMatchingConcept, isKnowledgeGraph, mergeCourseGraph, normalizeConceptKey } from "../domain/knowledgeGraph";
import { LEARNHUB_STORAGE_KEYS, StorageService, notifyLearningDataChanged } from "./storage";
export type { CurriculumConceptLinks } from "../types/knowledgeGraph";

const save = (graph: KnowledgeGraph): KnowledgeGraph => {
  if (!isKnowledgeGraph(graph)) throw new Error("개념 지도 형식을 확인해 주세요.");
  try { localStorage.setItem(LEARNHUB_STORAGE_KEYS.KNOWLEDGE_GRAPH, JSON.stringify(graph)); }
  catch { throw new Error("개념 지도를 저장하지 못했습니다. 저장 공간을 확인해 주세요."); }
  notifyLearningDataChanged(); return graph;
};
export function getKnowledgeGraph(): KnowledgeGraph {
  if (typeof localStorage === "undefined") return emptyKnowledgeGraph();
  const raw = localStorage.getItem(LEARNHUB_STORAGE_KEYS.KNOWLEDGE_GRAPH);
  if (raw !== null) {
    try { const parsed: unknown = JSON.parse(raw); if (isKnowledgeGraph(parsed)) return parsed; } catch { /* keep damaged data for recovery */ }
    throw new Error("저장된 개념 지도를 읽을 수 없습니다. 백업을 확인해 주세요.");
  }
  let graph = emptyKnowledgeGraph();
  for (const course of StorageService.getCourses()) graph = mergeCourseGraph(graph, course);
  for (const skill of StorageService.getSkills()) {
    let node = findMatchingConcept(graph, skill.conceptName) || findMatchingConcept(graph, skill.conceptId);
    if (!node) {
      node = { id: normalizeConceptKey(skill.conceptName), name: skill.conceptName, aliases: [skill.conceptId], domain: "기타", courseRefs: [{ courseId: skill.courseId }], state: "unseen", createdAt: new Date().toISOString() };
      graph.nodes.push(node);
    }
    const timestamp = Number.isFinite(Date.parse(skill.lastStudiedAt)) ? skill.lastStudiedAt : undefined;
    if (!node.lastStudiedAt || (timestamp && timestamp >= node.lastStudiedAt)) {
      node.state = skill.wrongCount > 0 ? "needs_review" : skill.correctCount > 0 ? "verified" : node.state;
      node.lastStudiedAt = timestamp;
    }
  }
  for (const review of StorageService.getReviews()) {
    if (findMatchingConcept(graph, review.conceptName) || findMatchingConcept(graph, review.conceptId)) continue;
    graph.nodes.push({ id: normalizeConceptKey(review.conceptName), name: review.conceptName, aliases: [review.conceptId], domain: "기타", courseRefs: review.courseId ? [{ courseId: review.courseId, ...(review.lessonId ? { lessonId: review.lessonId } : {}) }] : [], state: "learned", createdAt: new Date().toISOString() });
  }
  return save(graph);
}
export function mergeCourseIntoGraph(course: Course, links?: CurriculumConceptLinks): KnowledgeGraph { return save(mergeCourseGraph(getKnowledgeGraph(), course, links)); }
export function getExistingConceptNames(): string[] { return getKnowledgeGraph().nodes.slice(0, 60).map(n => n.name); }
const update = (conceptId: string, change: (node: ConceptNode) => void): void => {
  const graph = getKnowledgeGraph(); const node = findMatchingConcept(graph, conceptId);
  if (!node) throw new Error("개념을 찾을 수 없습니다.");
  change(node); node.updatedAt = new Date().toISOString(); save(graph);
};
export function markConceptLearned(conceptId: string, ref: { courseId: string; lessonId?: string }): void {
  update(conceptId, node => {
    if (!node.courseRefs.some(r => r.courseId === ref.courseId && r.lessonId === ref.lessonId)) node.courseRefs.push(ref);
    if (node.state === "unseen" || node.state === "curious") node.state = "learned";
    node.lastStudiedAt = new Date().toISOString();
  });
}
export function markQuizResult(conceptId: string, isCorrect: boolean): void { update(conceptId, n => { n.state = isCorrect ? "verified" : "needs_review"; n.lastStudiedAt = new Date().toISOString(); }); }
export function recordQuizConcept(conceptId: string, conceptName: string, courseId: string, isCorrect: boolean): void {
  const graph = getKnowledgeGraph();
  let node = findMatchingConcept(graph, conceptName) || findMatchingConcept(graph, conceptId);
  if (!node) { node = { id: normalizeConceptKey(conceptName), name: conceptName, aliases: [conceptId], domain: "기타", courseRefs: [{ courseId }], state: "unseen", createdAt: new Date().toISOString() }; graph.nodes.push(node); }
  node.state = isCorrect ? "verified" : "needs_review";
  node.lastStudiedAt = new Date().toISOString(); node.updatedAt = node.lastStudiedAt; save(graph);
}
export function markPracticalDone(conceptId: string, reflection?: string): void {
  update(conceptId, n => { n.state = "verified"; n.practicalDoneAt = new Date().toISOString(); n.lastStudiedAt = n.practicalDoneAt; if (reflection !== undefined) n.reflection = reflection.trim().slice(0, 2000); });
}
export function setDepthReached(conceptId: string, depth: ExplanationDepth): void {
  const order: ExplanationDepth[] = ["easy", "formal", "example"];
  if (!order.includes(depth)) throw new Error("설명 단계를 확인해 주세요.");
  update(conceptId, n => { if (!n.depthReached || order.indexOf(depth) > order.indexOf(n.depthReached)) n.depthReached = depth; });
}
export function markKnown(conceptId: string, known: boolean): void {
  // Self-report is not quiz evidence. Preserve verified/needs_review states.
  update(conceptId, n => { n.userMarkedKnown = known; if (known && (n.state === "unseen" || n.state === "curious")) n.state = "learned"; else if (!known && n.state === "learned" && !n.lastStudiedAt) n.state = n.curiosityQuestion ? "curious" : "unseen"; });
}
export function disputeEdge(edgeId: string, disputed: boolean): void {
  const graph = getKnowledgeGraph(); const edge = graph.edges.find(e => e.id === edgeId);
  if (!edge) throw new Error("연결을 찾을 수 없습니다.");
  edge.disputed = disputed; edge.updatedAt = new Date().toISOString(); save(graph);
}
export function addCuriosity(fromConceptId: string | null, conceptName: string, question: string): ConceptNode {
  if (!conceptName.trim() || conceptName.length > 500 || !question.trim() || question.length > 2000) throw new Error("궁금한 개념과 질문을 확인해 주세요.");
  const graph = getKnowledgeGraph(); const from = fromConceptId ? findMatchingConcept(graph, fromConceptId) : undefined;
  if (fromConceptId && !from) throw new Error("출발 개념을 찾을 수 없습니다.");
  let node = findMatchingConcept(graph, conceptName);
  if (!node) { node = { id: normalizeConceptKey(conceptName), name: conceptName.trim(), aliases: [], domain: from?.domain || "기타", courseRefs: [], state: "curious", createdAt: new Date().toISOString() }; graph.nodes.push(node); }
  else if (node.state === "unseen") node.state = "curious";
  node.curiosityQuestion = question.trim();
  node.updatedAt = new Date().toISOString();
  if (from && from.id !== node.id) {
    const id = conceptEdgeId(from.id, node.id, "curiosity");
    if (!graph.edges.some(e => e.id === id)) graph.edges.push({ id, from: from.id, to: node.id, kind: "curiosity", source: "user" });
  }
  save(graph); return node;
}
export function setLastPosition(position: LearningPosition): void {
  const graph = getKnowledgeGraph(); const node = findMatchingConcept(graph, position.conceptId);
  if (!node || !node.courseRefs.some(r => r.courseId === position.courseId && r.lessonId === position.lessonId)) throw new Error("학습 위치를 확인해 주세요.");
  graph.lastPosition = { ...position, conceptId: node.id }; save(graph);
}
export function getResumeContext(now = new Date()): ResumeContext | null {
  const graph = getKnowledgeGraph(); const position = graph.lastPosition;
  if (!position || !Number.isFinite(now.getTime())) return null;
  const node = graph.nodes.find(n => n.id === position.conceptId); const course = StorageService.getCourseById(position.courseId);
  if (!node || !course || course.status === "cancelled" || !course.chapters.some(c => c.lessons.some(l => l.id === position.lessonId))) return null;
  return { position, daysAway: Math.max(0, Math.floor((now.getTime() - Date.parse(position.at)) / 86400000)), dueReviewCount: StorageService.getDueReviews(now).length, conceptName: node.name, courseTitle: course.title };
}
