import type { Course } from "../types/learning";
import type { ConceptNode, CurriculumConceptLinks, GraphCourse, KnowledgeGraph, NextStep } from "../types/knowledgeGraph";

export function normalizeConceptKey(name: string): string {
  // Preserve semantic symbols: C++, C# and mathematical signs must stay distinct.
  return name.normalize("NFKC").toLowerCase().replace(/[\s_\-·.,'"“”‘’()[\]{}]+/gu, "").trim();
}
export function findMatchingConcept(graph: KnowledgeGraph, name: string): ConceptNode | undefined {
  const key = normalizeConceptKey(name);
  if (!key) return undefined;
  const exact = graph.nodes.find(n => n.id === key || normalizeConceptKey(n.name) === key);
  if (exact) return exact;
  const matches = graph.nodes.filter(n => n.aliases.some(a => normalizeConceptKey(a) === key));
  return matches.length === 1 ? matches[0] : undefined;
}
export function getLocalGraph(graph: KnowledgeGraph, conceptId: string, hops = 1): KnowledgeGraph {
  const root = findMatchingConcept(graph, conceptId);
  if (!root) return emptyKnowledgeGraph();
  const ids = new Set([root.id]);
  const count = Number.isFinite(hops) ? Math.max(0, Math.min(6, Math.floor(hops))) : 1;
  for (let i = 0; i < count; i++) {
    const previous = new Set(ids);
    for (const edge of graph.edges) {
      if (edge.disputed) continue;
      if (previous.has(edge.from)) ids.add(edge.to);
      if (previous.has(edge.to)) ids.add(edge.from);
    }
  }
  return {
    version: 1, nodes: graph.nodes.filter(n => ids.has(n.id)).map(n => structuredClone(n)),
    edges: graph.edges.filter(e => !e.disputed && ids.has(e.from) && ids.has(e.to)).map(e => ({ ...e })),
    ...(graph.lastPosition && ids.has(graph.lastPosition.conceptId) ? { lastPosition: { ...graph.lastPosition } } : {}),
  };
}
export interface RecommendationContext {
  currentConceptId?: string;
  courses: Course[];
  dueReviewConceptIds: string[];
  sessionMinutes?: number;
  lessonsThisSession?: number;
}
export function recommendNextSteps(graph: KnowledgeGraph, ctx: RecommendationContext, limit = 3): NextStep[] {
  const max = Number.isFinite(limit) ? Math.max(0, Math.min(20, Math.floor(limit))) : 3;
  const steps: NextStep[] = [];
  const active = ctx.courses.filter(c => c.status !== "cancelled" && c.status !== "completed");
  const current = ctx.currentConceptId ? findMatchingConcept(graph, ctx.currentConceptId) : undefined;
  const due = new Set(ctx.dueReviewConceptIds.map(id => findMatchingConcept(graph, id)?.id).filter(Boolean));
  const actionable = (node: ConceptNode) => node.courseRefs.length === 0 || node.courseRefs.some(r => ctx.courses.some(c => c.id === r.courseId && c.status !== "cancelled"));
  const refFor = (node: ConceptNode) => node.courseRefs.find(r => active.some(c => c.id === r.courseId)) || {};
  if ((ctx.sessionMinutes ?? 0) >= 30 || (ctx.lessonsThisSession ?? 0) >= 3) steps.push({ kind: "wrap_up", score: 1000 });
  for (const node of graph.nodes) {
    if (actionable(node) && (node.state === "needs_review" || due.has(node.id))) steps.push({ kind: "review", conceptId: node.id, ...refFor(node), score: 900 });
  }
  const position = graph.lastPosition;
  const currentCourse = active.find(c => c.id === position?.courseId && (!current || current.courseRefs.some(r => r.courseId === c.id))) || active.find(c => current?.courseRefs.some(r => r.courseId === c.id));
  if (currentCourse) {
    const lessons = currentCourse.chapters.flatMap(c => c.lessons);
    const lastIndex = lessons.findIndex(l => l.id === position?.lessonId);
    const currentIndex = lessons.findIndex(l => findMatchingConcept(graph, l.conceptName)?.id === current?.id);
    const index = current ? currentIndex : lastIndex;
    const next = lessons.slice(Math.max(0, index + 1)).find(l => !l.isCompleted);
    const node = next && findMatchingConcept(graph, next.conceptName);
    if (next && node) steps.push({ kind: "next_lesson", conceptId: node.id, courseId: currentCourse.id, lessonId: next.id, becauseOfConceptId: current?.id, score: 800 });
  }
  if (current) {
    const neighbors = new Set(graph.edges.filter(e => !e.disputed && (e.from === current.id || e.to === current.id)).map(e => e.from === current.id ? e.to : e.from));
    for (const node of graph.nodes) {
      if (node.state !== "unseen" || !neighbors.has(node.id) || !actionable(node)) continue;
      const ready = graph.edges.filter(e => !e.disputed && e.kind === "prerequisite" && e.to === node.id).every(e => {
        const n = graph.nodes.find(n => n.id === e.from); return n && (n.userMarkedKnown || n.state === "learned" || n.state === "verified");
      });
      steps.push({ kind: "connected", conceptId: node.id, ...refFor(node), becauseOfConceptId: current.id, score: ready ? 700 : 650 });
    }
  }
  for (const node of graph.nodes) {
    if (!actionable(node)) continue;
    if (node.state === "curious") steps.push({ kind: "curiosity", conceptId: node.id, ...refFor(node), score: 600 });
    if (node.depthReached === "easy" && (node.state === "learned" || node.state === "verified")) steps.push({ kind: "deepen", conceptId: node.id, ...refFor(node), score: 500 });
  }
  const seen = new Set<string>();
  return steps.sort((a, b) => b.score - a.score || (a.conceptId || "").localeCompare(b.conceptId || "")).filter(step => {
    const key = step.conceptId || step.kind;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, max);
}

export function emptyKnowledgeGraph(): KnowledgeGraph { return { version: 1, nodes: [], edges: [] }; }
export function conceptEdgeId(from: string, to: string, kind: string): string {
  return JSON.stringify([kind, ...(kind === "related" ? [from, to].sort() : [from, to])]);
}
export function mergeCourseGraph(graph: KnowledgeGraph, course: Course, links?: CurriculumConceptLinks): KnowledgeGraph {
  const result = structuredClone(graph);
  const metadata = links || (course as GraphCourse).conceptLinks;
  const domain = metadata?.domain || (course as GraphCourse).domain || course.subject || "기타";
  const ensure = (name: string, aliases: string[] = [], ref?: { courseId: string; lessonId?: string }) => {
    const key = normalizeConceptKey(name);
    if (!key) throw new Error("개념 이름을 확인해 주세요.");
    let node = findMatchingConcept(result, name) || aliases.map(a => findMatchingConcept(result, a)).find(Boolean);
    if (!node) { node = { id: key, name: name.trim(), aliases: [], domain, courseRefs: [], state: "unseen", createdAt: course.createdAt }; result.nodes.push(node); }
    node.aliases = [...new Set([...node.aliases, ...aliases, ...(node.name !== name.trim() ? [name.trim()] : [])])];
    if (ref && !node.courseRefs.some(r => r.courseId === ref.courseId && r.lessonId === ref.lessonId)) node.courseRefs.push(ref);
    return node;
  };
  for (const lesson of course.chapters.flatMap(c => c.lessons)) {
    const typed = lesson as typeof lesson & { aliases?: string[]; prerequisites?: string[]; relatedConcepts?: string[] };
    const supplied = metadata?.lessons?.find(l => l.lessonId === lesson.id || (!l.lessonId && normalizeConceptKey(l.conceptName) === normalizeConceptKey(lesson.conceptName)));
    const details = supplied || typed;
    const node = ensure(lesson.conceptName, details.aliases || [], { courseId: course.id, lessonId: lesson.id });
    if (lesson.conceptId && !node.aliases.includes(lesson.conceptId) && normalizeConceptKey(lesson.conceptId) !== node.id) node.aliases.push(lesson.conceptId);
    if (lesson.isCompleted && (node.state === "unseen" || node.state === "curious")) node.state = "learned";
    for (const kind of ["prerequisite", "related"] as const) {
      for (const name of (kind === "prerequisite" ? details.prerequisites : details.relatedConcepts) || []) {
        const other = ensure(name, [], { courseId: course.id });
        if (other.id === node.id) continue;
        const from = kind === "prerequisite" ? other.id : node.id; const to = kind === "prerequisite" ? node.id : other.id;
        const id = conceptEdgeId(from, to, kind);
        if (!result.edges.some(e => e.id === id)) result.edges.push({ id, from, to, kind, source: "ai" });
      }
    }
  }
  return result;
}

export function mergeKnowledgeGraphs(current: KnowledgeGraph, incoming: KnowledgeGraph): KnowledgeGraph {
  const result = structuredClone(current); const remap = new Map<string, string>();
  for (const node of incoming.nodes) {
    const old = findMatchingConcept(result, node.id) || findMatchingConcept(result, node.name) || node.aliases.map(a => findMatchingConcept(result, a)).find(Boolean);
    if (!old) { result.nodes.push(structuredClone(node)); remap.set(node.id, node.id); continue; }
    remap.set(node.id, old.id);
    const winner = Date.parse(node.updatedAt || node.lastStudiedAt || node.createdAt) > Date.parse(old.updatedAt || old.lastStudiedAt || old.createdAt) ? node : old;
    const refs = [...old.courseRefs, ...node.courseRefs];
    Object.assign(old, { ...old, ...winner, id: old.id, aliases: [...new Set([...old.aliases, ...node.aliases, node.name])], courseRefs: refs.filter((r, i) => refs.findIndex(x => x.courseId === r.courseId && x.lessonId === r.lessonId) === i) });
  }
  for (const edge of incoming.edges) {
    const from = remap.get(edge.from)!; const to = remap.get(edge.to)!;
    if (from === to) continue;
    const id = conceptEdgeId(from, to, edge.kind);
    const old = result.edges.find(e => e.id === id || (e.kind === edge.kind && e.from === from && e.to === to));
    if (!old) result.edges.push({ ...edge, id, from, to });
    else if (edge.updatedAt && (!old.updatedAt || Date.parse(edge.updatedAt) > Date.parse(old.updatedAt))) Object.assign(old, { disputed: edge.disputed, updatedAt: edge.updatedAt });
    else if (!old.updatedAt && edge.disputed) old.disputed = true;
  }
  if (incoming.lastPosition && (!result.lastPosition || Date.parse(incoming.lastPosition.at) > Date.parse(result.lastPosition.at))) result.lastPosition = { ...incoming.lastPosition, conceptId: remap.get(incoming.lastPosition.conceptId)! };
  return result;
}

export function isKnowledgeGraph(value: unknown): value is KnowledgeGraph {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const str = (v: unknown, max = 500): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
  const date = (v: unknown) => str(v, 120) && Number.isFinite(Date.parse(v));
  const optional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
  if (!obj(value) || value.version !== 1 || !Array.isArray(value.nodes) || value.nodes.length > 5000 || !Array.isArray(value.edges) || value.edges.length > 20000) return false;
  const ids = new Set<string>();
  for (const n of value.nodes) {
    if (!obj(n) || !str(n.id) || normalizeConceptKey(n.id) !== n.id || ids.has(n.id) || !str(n.name) || !str(n.domain, 200) || !Array.isArray(n.aliases) || n.aliases.length > 100 || !n.aliases.every(a => str(a)) || !Array.isArray(n.courseRefs) || n.courseRefs.length > 1000 || !n.courseRefs.every(r => obj(r) && str(r.courseId, 200) && optional(r.lessonId, v => str(v, 200))) || !["unseen", "learned", "verified", "needs_review", "curious"].includes(String(n.state)) || !date(n.createdAt) || !optional(n.lastStudiedAt, date) || !optional(n.practicalDoneAt, date) || !optional(n.depthReached, v => ["easy", "formal", "example"].includes(String(v))) || !optional(n.userMarkedKnown, v => typeof v === "boolean") || !optional(n.reflection, v => typeof v === "string" && v.length <= 2000) || !optional(n.curiosityQuestion, v => str(v, 2000))) return false;
    ids.add(n.id);
    if (!optional(n.updatedAt, date)) return false;
  }
  const edgeIds = new Set<string>();
  for (const e of value.edges) {
    if (!obj(e) || !str(e.id, 2000) || edgeIds.has(e.id) || !str(e.from) || !str(e.to) || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to || !["prerequisite", "related", "curiosity"].includes(String(e.kind)) || !["ai", "user"].includes(String(e.source)) || !optional(e.disputed, v => typeof v === "boolean")) return false;
    edgeIds.add(e.id);
    if (!optional(e.updatedAt, date)) return false;
  }
  const p = value.lastPosition;
  return p === undefined || (obj(p) && str(p.courseId, 200) && str(p.lessonId, 200) && str(p.conceptId) && ids.has(p.conceptId) && date(p.at) && value.nodes.some(n => n.id === p.conceptId && n.courseRefs.some((r: { courseId: string; lessonId?: string }) => r.courseId === p.courseId && r.lessonId === p.lessonId)));
}

/**
 * 대화하다 곁가지로 뻗어 나간 개념들(2차, 3차…)을 최근 것부터 돌려줍니다.
 * 튜터에게 넘겨서, 새 곁가지가 이 중 어느 가지에서 또 뻗었는지 고르게 합니다.
 */
export function getBranchConcepts(graph: KnowledgeGraph, conceptId: string, limit = 12): ConceptNode[] {
  const root = findMatchingConcept(graph, conceptId);
  if (!root) return [];
  const seen = new Set([root.id]);
  const found: ConceptNode[] = [];
  let frontier = [root.id];
  while (frontier.length) {
    const next: string[] = [];
    for (const edge of graph.edges) {
      if (edge.kind !== "curiosity" || edge.disputed || !frontier.includes(edge.from) || seen.has(edge.to)) continue;
      const node = graph.nodes.find(n => n.id === edge.to);
      if (!node) continue;
      seen.add(node.id); found.push(node); next.push(node.id);
    }
    frontier = next;
  }
  const at = (node: ConceptNode) => Date.parse(node.updatedAt || node.createdAt) || 0;
  return found.sort((a, b) => at(b) - at(a)).slice(0, Math.max(0, limit));
}
