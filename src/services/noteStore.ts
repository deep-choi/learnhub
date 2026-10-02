import type { KnowledgeGraph } from "../types/knowledgeGraph";
import type { LearningNote, NoteInput, SaveNoteResult } from "../types/learningNotes";
import {
  LEGACY_NOTE_ID_PREFIX,
  LEGACY_NOTE_TIMESTAMP,
  NOTE_LIMITS,
  enforceNoteLimits,
  isLearningNote,
  isLearningNoteList,
  noteChars,
  noteTitleFromBody,
  resolveNoteLinks,
} from "../domain/learningNote";
import { findMatchingConcept, normalizeConceptKey } from "../domain/knowledgeGraph";
import { getKnowledgeGraph } from "./knowledgeGraphStore";
import { LEARNHUB_SCOPED_STORAGE_PREFIXES, LEARNHUB_STORAGE_KEYS, StorageService, notifyLearningDataChanged } from "./storage";

const LEGACY_PREFIX = LEARNHUB_SCOPED_STORAGE_PREFIXES.NOTES;

const newId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `note-${crypto.randomUUID()}`
    : `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const readGraph = (): KnowledgeGraph | null => {
  try { return getKnowledgeGraph(); } catch { return null; }
};

/** 새 저장소(`ai_learnhub_learning_notes_v1`)의 메모. 손상된 항목만 버린다. */
const readStored = (): LearningNote[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEARNHUB_STORAGE_KEYS.LEARNING_NOTES);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (isLearningNoteList(parsed)) return parsed;
    if (Array.isArray(parsed)) {
      const seen = new Set<string>();
      return enforceNoteLimits(parsed.filter((item): item is LearningNote => isLearningNote(item) && !seen.has(item.id) && !!seen.add(item.id)));
    }
  } catch { /* 손상된 값은 비어 있는 것으로 봅니다. */ }
  return [];
};

const writeStored = (notes: LearningNote[]): boolean => {
  try {
    localStorage.setItem(LEARNHUB_STORAGE_KEYS.LEARNING_NOTES, JSON.stringify(notes));
    notifyLearningDataChanged();
    return true;
  } catch (error) {
    console.error("Failed to save notes:", error);
    return false;
  }
};

/**
 * 옛 메모(`learnhub_note_<이름>` → 마크다운 문자열)를 읽기 전용 메모로 보여 준다.
 * 키는 지우지 않으므로 메모가 사라지지 않고, 사용자가 고쳐 저장하면 같은 id(`legacy:<이름>`)의 새 메모가 이 항목을 가린다.
 * 이름이 레슨 id(또는 `과목id:레슨id`)와 같으면 그 레슨·개념에 붙인다.
 */
const readLegacy = (graph: KnowledgeGraph | null): LearningNote[] => {
  if (typeof localStorage === "undefined") return [];
  const courses = StorageService.getCourses();
  const result: LearningNote[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(LEGACY_PREFIX) || key.length === LEGACY_PREFIX.length || key.length > 500) continue;
      const raw = localStorage.getItem(key);
      if (raw === null || raw.trim() === "") continue;
      const suffix = key.slice(LEGACY_PREFIX.length);
      let decoded = suffix;
      try { decoded = decodeURIComponent(suffix); } catch { /* 이름 그대로 씁니다. */ }
      const attached = courses.flatMap((course) => course.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ course, lesson })))).find(({ course, lesson }) => lesson.id === decoded || `${course.id}:${lesson.id}` === decoded);
      const body = raw.slice(0, NOTE_LIMITS.maxBodyLength);
      const conceptName = attached?.lesson.conceptName;
      result.push({
        id: `${LEGACY_NOTE_ID_PREFIX}${suffix}`.slice(0, 200),
        title: noteTitleFromBody(body),
        body,
        ...(attached ? { courseId: attached.course.id, lessonId: attached.lesson.id, conceptId: (conceptName && graph && findMatchingConcept(graph, conceptName)?.id) || normalizeConceptKey(conceptName || "") } : {}),
        links: graph ? resolveNoteLinks(body, graph).links : [],
        createdAt: LEGACY_NOTE_TIMESTAMP,
        updatedAt: LEGACY_NOTE_TIMESTAMP,
      });
    }
  } catch { /* 저장소를 읽지 못하면 새 메모만 보여 줍니다. */ }
  return result.filter((note) => isLearningNote(note));
};

const readAll = (graph: KnowledgeGraph | null): LearningNote[] => {
  const stored = readStored();
  const shadowed = new Set(stored.map((note) => note.id));
  return [...stored, ...readLegacy(graph).filter((note) => !shadowed.has(note.id))];
};

const byRecent = (a: LearningNote, b: LearningNote) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

const sameConcept = (a: string | undefined, b: string, graph: KnowledgeGraph | null): boolean => {
  if (!a) return false;
  if (normalizeConceptKey(a) === normalizeConceptKey(b)) return true;
  const node = graph && findMatchingConcept(graph, b);
  return !!node && normalizeConceptKey(a) === normalizeConceptKey(node.id);
};

/** 모든 메모. 최근에 고친 순서이며, 옛 메모는 맨 아래다. */
export function listNotes(): LearningNote[] {
  return readAll(readGraph()).sort(byRecent);
}

export function getNote(id: string): LearningNote | undefined {
  return listNotes().find((note) => note.id === id);
}

/** 이 개념에 붙은 메모(`conceptId`가 같은 메모). 개념 id·이름·별칭 모두 받는다. */
export function getNotesForConcept(conceptId: string): LearningNote[] {
  const graph = readGraph();
  return readAll(graph).filter((note) => sameConcept(note.conceptId, conceptId, graph)).sort(byRecent);
}

/** 다른 메모의 `[[개념]]`이 이 개념을 가리키는 메모(백링크). 이 개념에 직접 붙은 메모는 뺀다. */
export function getNotesLinkingTo(conceptId: string): LearningNote[] {
  const graph = readGraph();
  return readAll(graph)
    .filter((note) => !sameConcept(note.conceptId, conceptId, graph) && note.links.some((link) => sameConcept(link, conceptId, graph)))
    .sort(byRecent);
}

/** 이 레슨에 붙은 메모 하나(가장 최근). 레슨 메모장은 이걸 열고, 없으면 `saveNote`로 만든다. */
export function getNoteForLesson(courseId: string, lessonId: string): LearningNote | undefined {
  return readAll(readGraph()).filter((note) => note.courseId === courseId && note.lessonId === lessonId).sort(byRecent)[0];
}

/**
 * 그래프에 메모 표시를 달 개념 id 목록(중복 없음). 본문이 빈 메모는 세지 않는다.
 * 기본은 메모가 직접 붙은 개념과 `[[링크]]로 가리킨 개념을 모두 담고, `includeLinked: false`면 직접 붙은 개념만 담는다.
 */
export function getConceptIdsWithNotes(options: { includeLinked?: boolean } = {}): string[] {
  const includeLinked = options.includeLinked !== false;
  const ids = new Set<string>();
  for (const note of readAll(readGraph())) {
    if (note.body.trim() === "") continue;
    if (note.conceptId) ids.add(normalizeConceptKey(note.conceptId));
    if (includeLinked) note.links.forEach((link) => ids.add(normalizeConceptKey(link)));
  }
  ids.delete("");
  return [...ids];
}

/**
 * 메모를 만들거나 고친다(자동 저장에서 반복 호출해도 된다).
 * - 제목을 비우면 본문 첫 줄에서 만들고, 본문의 `[[개념]]`은 지도 노드에 매칭해 `links`로 저장한다.
 * - 레슨(courseId+lessonId)만 주면 그 레슨의 개념이 `conceptId`로 채워진다.
 * - 고칠 때 입력에 없는 `conceptId`/`courseId`/`lessonId`는 기존 값을 유지한다.
 * - 실패 사유: `too_large`(본문 5만 자 또는 전체 60만 자 초과), `too_many`(300개), `not_found`(없는 id), `invalid`, `storage`.
 *   직접 쓴 메모를 조용히 버리지 않으므로 상한은 저장을 거절하는 방식이다.
 */
export function saveNote(input: NoteInput): SaveNoteResult {
  if (typeof input.body !== "string") return { ok: false, reason: "invalid" };
  if (input.body.length > NOTE_LIMITS.maxBodyLength) return { ok: false, reason: "too_large" };
  const graph = readGraph();
  const all = readAll(graph);
  const existing = input.id === undefined ? undefined : all.find((note) => note.id === input.id);
  if (input.id !== undefined && !existing) return { ok: false, reason: "not_found" };
  const stored = readStored();
  if (!existing && stored.length >= NOTE_LIMITS.maxNotes) return { ok: false, reason: "too_many" };

  const courseId = input.courseId ?? existing?.courseId;
  const lessonId = input.lessonId ?? existing?.lessonId;
  let conceptId = input.conceptId ?? existing?.conceptId;
  if (conceptId) conceptId = (graph && findMatchingConcept(graph, conceptId)?.id) || normalizeConceptKey(conceptId);
  else if (courseId && lessonId) {
    const lesson = StorageService.getCourseById(courseId)?.chapters.flatMap((chapter) => chapter.lessons).find((item) => item.id === lessonId);
    if (lesson) conceptId = (graph && findMatchingConcept(graph, lesson.conceptName)?.id) || normalizeConceptKey(lesson.conceptName);
  }

  const now = new Date().toISOString();
  const title = (input.title?.trim() ? input.title.replace(/\s+/gu, " ").trim() : noteTitleFromBody(input.body)).slice(0, NOTE_LIMITS.maxTitleLength);
  const note: LearningNote = {
    id: existing?.id ?? newId(),
    title,
    body: input.body,
    ...(conceptId ? { conceptId } : {}),
    ...(courseId ? { courseId } : {}),
    ...(lessonId ? { lessonId } : {}),
    // 지도를 읽을 수 없을 때는 이전 링크를 유지해 연결이 사라지지 않게 한다.
    links: graph ? resolveNoteLinks(input.body, graph).links : existing?.links ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!isLearningNote(note)) return { ok: false, reason: "invalid" };

  const others = stored.filter((item) => item.id !== note.id);
  if (others.reduce((sum, item) => sum + noteChars(item), noteChars(note)) > NOTE_LIMITS.maxTotalChars) return { ok: false, reason: "too_large" };
  return writeStored([note, ...others]) ? { ok: true, note } : { ok: false, reason: "storage" };
}

/** 메모를 지운다. 옛 메모(`legacy:`)는 원래 저장 키도 함께 지워 다시 나타나지 않게 한다. */
export function deleteNote(id: string): boolean {
  const stored = readStored();
  const remaining = stored.filter((note) => note.id !== id);
  let removedLegacy = false;
  if (id.startsWith(LEGACY_NOTE_ID_PREFIX)) {
    try {
      const key = `${LEGACY_PREFIX}${id.slice(LEGACY_NOTE_ID_PREFIX.length)}`;
      if (localStorage.getItem(key) !== null) { localStorage.removeItem(key); removedLegacy = true; }
    } catch { return false; }
  }
  if (remaining.length === stored.length) {
    if (removedLegacy) notifyLearningDataChanged();
    return removedLegacy;
  }
  return writeStored(remaining);
}
