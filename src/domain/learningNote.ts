import type { KnowledgeGraph } from "../types/knowledgeGraph";
import type { LearningNote, NoteLinkResolution } from "../types/learningNotes";
import { findMatchingConcept, normalizeConceptKey } from "./knowledgeGraph";

export const NOTE_LIMITS = {
  maxNotes: 300,
  maxBodyLength: 50_000,
  maxTitleLength: 120,
  /** 모든 메모의 제목+본문 글자 수 합. 백업(8MB) 안에 여유 있게 들어가도록 잡았다. */
  maxTotalChars: 600_000,
  maxLinks: 50,
  maxLinkNameLength: 80,
} as const;

/** 한 번도 저장한 적 없는 옛 메모(`learnhub_note_*`)에 붙이는 시각. 목록 맨 아래로 간다. */
export const LEGACY_NOTE_TIMESTAMP = "1970-01-01T00:00:00.000Z";
export const LEGACY_NOTE_ID_PREFIX = "legacy:";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const nonEmpty = (value: unknown, max: number): value is string => str(value, max) && value.trim().length > 0;
const date = (value: unknown): value is string => str(value, 120) && Number.isFinite(Date.parse(value));

/** 코드 블록과 인라인 코드 안의 `[[ ]]`는 링크가 아니다. */
const stripCode = (markdown: string): string => markdown.replace(/```[\s\S]*?(?:```|$)/gu, " ").replace(/`[^`\n]*`/gu, " ");

/**
 * 본문의 `[[개념]]`, `[[개념|보이는 글]]`에서 개념 이름만 뽑는다(등장 순서, 같은 이름은 한 번).
 * 빈 이름·80자 초과·줄바꿈이 낀 이름은 무시한다.
 */
export function extractNoteLinkNames(body: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of stripCode(body).matchAll(/\[\[([^\[\]\n|]+)(?:\|[^\[\]\n]*)?\]\]/gu)) {
    const name = match[1].replace(/\s+/gu, " ").trim();
    const key = normalizeConceptKey(name);
    if (!key || name.length > NOTE_LIMITS.maxLinkNameLength || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** `[[이름]]`을 지도의 개념 노드에 매칭한다. 이름·별칭이 하나로 정해지는 경우만 연결한다. */
export function resolveNoteLinks(body: string, graph: KnowledgeGraph): NoteLinkResolution {
  const links: string[] = [];
  const unresolved: string[] = [];
  for (const name of extractNoteLinkNames(body)) {
    const node = findMatchingConcept(graph, name);
    if (!node) unresolved.push(name);
    else if (!links.includes(node.id)) links.push(node.id);
  }
  return { links: links.slice(0, NOTE_LIMITS.maxLinks), unresolved };
}

/** 제목을 비웠을 때 본문 첫 줄(마크다운 기호 제외)로 만든다. */
export function noteTitleFromBody(body: string): string {
  const first = body.split(/\r?\n/u).map((line) => line.replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gu, "$1").replace(/^[\s>#*\-+\d.)]+/u, "").trim()).find(Boolean);
  if (!first) return "제목 없음";
  const chars = [...first];
  return chars.length > 60 ? `${chars.slice(0, 59).join("")}…` : first;
}

export function isLearningNote(value: unknown): value is LearningNote {
  return isRecord(value) &&
    nonEmpty(value.id, 200) &&
    nonEmpty(value.title, NOTE_LIMITS.maxTitleLength) &&
    str(value.body, NOTE_LIMITS.maxBodyLength) &&
    (value.conceptId === undefined || nonEmpty(value.conceptId, 500)) &&
    (value.courseId === undefined || nonEmpty(value.courseId, 200)) &&
    (value.lessonId === undefined || nonEmpty(value.lessonId, 200)) &&
    Array.isArray(value.links) && value.links.length <= NOTE_LIMITS.maxLinks && value.links.every((link) => nonEmpty(link, 500)) &&
    date(value.createdAt) && date(value.updatedAt);
}

export const noteChars = (note: LearningNote): number => note.title.length + note.body.length;

export function isLearningNoteList(value: unknown): value is LearningNote[] {
  if (!Array.isArray(value) || value.length > NOTE_LIMITS.maxNotes || !value.every(isLearningNote)) return false;
  if (new Set(value.map((note) => note.id)).size !== value.length) return false;
  return value.reduce((sum, note) => sum + noteChars(note), 0) <= NOTE_LIMITS.maxTotalChars;
}

/**
 * 동기화 병합용 상한 맞추기. 직접 쓴 메모를 조용히 버리지 않도록 가장 최근에 고친 메모부터 남기고,
 * 개수·글자 수 상한을 넘는 오래된 메모만 뺀다.
 */
export function enforceNoteLimits(notes: LearningNote[]): LearningNote[] {
  const sorted = [...notes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, NOTE_LIMITS.maxNotes);
  let total = 0;
  const kept: LearningNote[] = [];
  for (const note of sorted) {
    const size = noteChars(note);
    if (total + size > NOTE_LIMITS.maxTotalChars) continue;
    kept.push(note);
    total += size;
  }
  return kept;
}

/** 두 기기의 메모를 합친다. 같은 id는 더 늦게 고친 쪽을 쓴다. */
export function mergeNotes(current: LearningNote[], incoming: LearningNote[]): LearningNote[] {
  const byId = new Map<string, LearningNote>();
  for (const note of [...current, ...incoming]) {
    const existing = byId.get(note.id);
    if (!existing || Date.parse(note.updatedAt) > Date.parse(existing.updatedAt)) byId.set(note.id, note);
  }
  return enforceNoteLimits([...byId.values()]);
}
