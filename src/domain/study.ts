export const STUDY_ACTIONS = {
  chat: "대화",
  summary: "핵심 정리",
  explain: "쉽게 설명",
  correction: "교정",
  flashcards: "암기 카드",
  quiz: "퀴즈",
  visual: "설명 그림",
  slides: "슬라이드",
  video: "설명 영상",
} as const;
export type StudyAction = keyof typeof STUDY_ACTIONS;
export interface StudySource {
  id: string;
  title: string;
  text: string;
  kind: "file" | "web" | "note";
  url?: string;
  courseId?: string;
  updatedAt: string;
}
export interface StudyCitation {
  sourceId: string;
  quote: string;
}
export interface StudySlide {
  title: string;
  body: string;
  points: string[];
}
export interface StudyResult {
  id: string;
  scope: string;
  createdAt: string;
  action: StudyAction;
  title: string;
  reply: string;
  citations: StudyCitation[];
  cards?: { front: string; back: string }[];
  questions?: {
    question: string;
    options: string[];
    answer: number;
    explanation: string;
  }[];
  slides?: StudySlide[];
  diagram?: StudyDiagram;
  learningContext?: { courseId: string; lessonId: string; conceptId: string; conceptName: string };
  quizProgress?: { round: number; answers: Record<string, number>; updatedAt: string };
  corrections?: {
    sourceId: string;
    before: string;
    after: string;
    reason: string;
  }[];
}
export interface StudyDiagram {
  nodes: { id: string; label: string; items: string[]; kept: string[] }[];
  edges: { from: string; to: string; label: string }[];
}
export function isStudyDiagram(x: unknown): x is StudyDiagram {
  if (!record(x) || !Array.isArray(x.nodes) || x.nodes.length < 2 || x.nodes.length > 6 ||
    !x.nodes.every(n => record(n) && str(n.id, 40) && str(n.label, 60) && Array.isArray(n.items) && n.items.length <= 12 && n.items.every(i => str(i, 10)) && new Set(n.items).size === n.items.length && Array.isArray(n.kept) && n.kept.length <= 12 && n.kept.every(i => n.items.includes(i)))) return false;
  const ids = new Set(x.nodes.map(n => n.id));
  return ids.size === x.nodes.length && Array.isArray(x.edges) && x.edges.length >= 1 && x.edges.length <= 8 && x.edges.every(e => record(e) && ids.has(e.from) && ids.has(e.to) && e.from !== e.to && str(e.label, 36, true));
}
export interface StudyBinding {
  scope: string;
  ids: string[];
  updatedAt: string;
}
export interface StudyLibrary {
  sources: StudySource[];
  results: StudyResult[];
  bindings: StudyBinding[];
}
export const STUDY_LIMITS = {
  sourceChars: 120_000,
  totalChars: 900_000,
  sources: 60,
  results: 40,
  requestChars: 14_000,
  selected: 8,
  fileBytes: 4_000_000,
};
export const emptyStudyLibrary = (): StudyLibrary => ({
  sources: [],
  results: [],
  bindings: [],
});
const record = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max: number, empty = false): x is string =>
  typeof x === "string" && x.length <= max && (empty || !!x.trim());
const date = (x: unknown) => str(x, 40) && Number.isFinite(Date.parse(x));
export const safeWebUrl = (value: unknown): string | null => {
  if (!str(value, 2048)) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      !/^(localhost|.*\.localhost|.*\.local|.*\.internal|\d[\d.]*|\[.*\])$/i.test(
        u.hostname,
      ) &&
      u.hostname.includes(".")
      ? u.href
      : null;
  } catch {
    return null;
  }
};
export function isStudySource(x: unknown): x is StudySource {
  return (
    record(x) &&
    str(x.id, 200) &&
    str(x.title, 200) &&
    str(x.text, STUDY_LIMITS.sourceChars) &&
    ["file", "web", "note"].includes(x.kind) &&
    date(x.updatedAt) &&
    (x.courseId === undefined || str(x.courseId, 200)) &&
    (x.url === undefined || !!safeWebUrl(x.url))
  );
}
export function validStudyOutput(x: unknown, action: StudyAction): boolean {
  if (
    !record(x) ||
    !str(x.title, 160) ||
    !str(x.reply, 4000) ||
    !Array.isArray(x.citations) ||
    x.citations.length > 12 ||
    !x.citations.every(
      (c) => record(c) && str(c.sourceId, 200) && str(c.quote, 600),
    )
  )
    return false;
  if (x.diagram !== undefined && !isStudyDiagram(x.diagram)) return false;
  if (
    x.cards !== undefined &&
    (!Array.isArray(x.cards) ||
      x.cards.length > 12 ||
      !x.cards.every(
        (c) => record(c) && str(c.front, 500) && str(c.back, 1000),
      ))
  )
    return false;
  if (
    x.questions !== undefined &&
    (!Array.isArray(x.questions) ||
      x.questions.length > 10 ||
      !x.questions.every(
        (q) =>
          record(q) &&
          str(q.question, 800) &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          q.options.every((o) => str(o, 300)) &&
          new Set(q.options).size === 4 &&
          Number.isInteger(q.answer) &&
          q.answer >= 0 &&
          q.answer < 4 &&
          str(q.explanation, 1000),
      ))
  )
    return false;
  if (
    x.slides !== undefined &&
    (!Array.isArray(x.slides) ||
      x.slides.length > 8 ||
      !x.slides.every(
        (s) =>
          record(s) &&
          str(s.title, 100) &&
          str(s.body, 700) &&
          Array.isArray(s.points) &&
          s.points.length <= 4 &&
          s.points.every((p) => str(p, 200)),
      ))
  )
    return false;
  if (
    x.corrections !== undefined &&
    (!Array.isArray(x.corrections) ||
      x.corrections.length > 10 ||
      !x.corrections.every(
        (c) =>
          record(c) &&
          str(c.sourceId, 200) &&
          str(c.before, 2000) &&
          str(c.after, 2500) &&
          str(c.reason, 700),
      ))
  )
    return false;
  if (
    (action === "flashcards" && !x.cards?.length) ||
    (action === "quiz" && !x.questions?.length) ||
    (action === "visual" && !x.diagram && !x.slides?.length) ||
    (["slides", "video"].includes(action) && !x.slides?.length)
  )
    return false;
  return true;
}
export function isStudyResult(x: unknown): x is StudyResult {
  return (
    record(x) &&
    str(x.id, 200) &&
    str(x.scope, 200) &&
    date(x.createdAt) &&
    Object.hasOwn(STUDY_ACTIONS, x.action) &&
    validStudyOutput(x, x.action) &&
    (x.learningContext === undefined || (record(x.learningContext) && ["courseId", "lessonId", "conceptId", "conceptName"].every(k => str(x.learningContext[k], 200)))) &&
    (x.quizProgress === undefined || (x.action === "quiz" && record(x.quizProgress) && Number.isInteger(x.quizProgress.round) && x.quizProgress.round >= 0 && x.quizProgress.round <= 10000 && date(x.quizProgress.updatedAt) && record(x.quizProgress.answers) && Object.entries(x.quizProgress.answers).every(([k, v]) => /^(0|[1-9]\d*)$/.test(k) && Number(k) < x.questions.length && Number.isInteger(v) && Number(v) >= 0 && Number(v) < 4))) &&
    JSON.stringify(x).length <= 40_000
  );
}
export function isStudyLibrary(x: unknown): x is StudyLibrary {
  return (
    record(x) &&
    Array.isArray(x.sources) &&
    x.sources.length <= STUDY_LIMITS.sources &&
    x.sources.every(isStudySource) &&
    new Set(x.sources.map((s) => s.id)).size === x.sources.length &&
    Array.isArray(x.results) &&
    x.results.length <= STUDY_LIMITS.results &&
    x.results.every(isStudyResult) &&
    new Set(x.results.map((s) => s.id)).size === x.results.length &&
    Array.isArray(x.bindings) &&
    x.bindings.length <= 100 &&
    new Set(x.bindings.map((b) => b.scope)).size === x.bindings.length &&
    x.bindings.every(
      (b) =>
        record(b) &&
        str(b.scope, 200) &&
        date(b.updatedAt) &&
        Array.isArray(b.ids) &&
        b.ids.length <= STUDY_LIMITS.selected &&
        b.ids.every((id) => str(id, 200)),
    ) &&
    JSON.stringify(x).length <= STUDY_LIMITS.totalChars
  );
}
/** Deterministic bounded retrieval. Each excerpt retains the document's page markers. */
export function studyExcerpts(
  sources: StudySource[],
  question: string,
): StudySource[] {
  const terms: string[] =
    question.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const budget = Math.floor(
    STUDY_LIMITS.requestChars / Math.max(1, sources.length),
  );
  return sources.slice(0, STUDY_LIMITS.selected).map((source) => {
    if (source.text.length <= budget) return source;
    const chunks = source.text.match(/[\s\S]{1,1000}/g) || [];
    const ranked = chunks
      .map((text, i) => ({
        text,
        i,
        score: terms.reduce(
          (n, term) => n + (text.toLocaleLowerCase().includes(term) ? 1 : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    const chosen = ranked
      .slice(0, Math.max(1, Math.floor(budget / 1100)))
      .sort((a, b) => a.i - b.i);
    return {
      ...source,
      text: chosen
        .map((c) => `[발췌 ${c.i + 1}]\n${c.text}`)
        .join("\n\n")
        .slice(0, budget),
    };
  });
}
export function groundedStudyOutput(
  result: Pick<StudyResult, "citations" | "corrections">,
  sources: StudySource[],
): boolean {
  return (
    result.citations.every((c) =>
      sources.some((s) => s.id === c.sourceId && s.text.includes(c.quote)),
    ) &&
    (result.corrections || []).every((c) =>
      sources.some(
        (s) =>
          s.id === c.sourceId &&
          s.text.includes(c.before) &&
          s.text.indexOf(c.before) === s.text.lastIndexOf(c.before),
      ),
    )
  );
}

export function buildStudyRequest(
  action: StudyAction,
  question: string,
  sources: StudySource[],
  history: { role: string; text: string }[],
  context = "",
) {
  const request = {
    action,
    question: question.slice(0, 2000),
    sources: studyExcerpts(
      sources,
      [question, ...history.slice(-2).map((m) => m.text)].join("\n"),
    ).map((s) => ({
      id: s.id,
      title: s.title,
      text: s.text,
      kind: s.kind,
      updatedAt: s.updatedAt,
    })),
    history: history
      .slice(-4)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 400) })),
    ...(context ? { context: context.slice(0, 1200) } : {}),
  };
  // Budget the serialized request, including escaped quotation marks, not only raw text.
  while (JSON.stringify(request).length > 20_000) {
    const largest = request.sources.reduce(
      (best, s) => (s.text.length > (best?.text.length || 0) ? s : best),
      undefined as StudySource | undefined,
    );
    if (!largest || largest.text.length < 200)
      throw new Error("자료와 질문이 너무 깁니다.");
    largest.text = largest.text.slice(0, Math.floor(largest.text.length * 0.8));
  }
  return request;
}
export function mergeStudyLibraries(
  a: StudyLibrary,
  b: StudyLibrary,
): StudyLibrary {
  const merge = <T>(
    left: T[],
    right: T[],
    key: (x: T) => string,
    stamp: (x: T) => string,
  ): T[] => {
    const map = new Map<string, T>();
    for (const x of [...left, ...right]) {
      const old = map.get(key(x));
      if (!old || stamp(x) > stamp(old)) map.set(key(x), x);
    }
    return [...map.values()];
  };
  const result = {
    sources: merge(
      a.sources,
      b.sources,
      (x) => x.id,
      (x) => x.updatedAt,
    ),
    results: merge(
      a.results,
      b.results,
      (x) => x.id,
      (x) => x.quizProgress?.updatedAt || x.createdAt,
    ),
    bindings: merge(
      a.bindings,
      b.bindings,
      (x) => x.scope,
      (x) => x.updatedAt,
    ),
  };
  if (!isStudyLibrary(result)) throw new Error("자료함 용량을 초과했습니다.");
  return result;
}
