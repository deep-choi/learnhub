import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  deleteNote,
  getConceptIdsWithNotes,
  getNote,
  getNoteForLesson,
  getNotesForConcept,
  getNotesLinkingTo,
  listNotes,
  saveNote,
} from "../src/services/noteStore";
import { clearLessonProgress, getLessonProgress, saveLessonProgress } from "../src/services/lessonProgressStore";
import { completeLesson } from "../src/services/lessonCompletion";
import { StorageService, LEARNHUB_STORAGE_KEYS } from "../src/services/storage";
import { createLearningBackup, importLearningBackup, validateLearningBackup } from "../src/services/learningBackup";
import { getKnowledgeGraph } from "../src/services/knowledgeGraphStore";
import { NOTE_LIMITS, extractNoteLinkNames, mergeNotes, noteTitleFromBody, resolveNoteLinks } from "../src/domain/learningNote";
import { mergeLessonProgress } from "../src/domain/lessonProgress";
import { emptyKnowledgeGraph } from "../src/domain/knowledgeGraph";
import type { Course } from "../src/types/learning";
import type { LearningNote } from "../src/types/learningNotes";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

const course = (): Course => ({
  id: "c1", title: "카메라 입문", subject: "사진", learningType: "practical", learningTypeExplanation: "", summary: "", level: "beginner", goal: "", dailyMinutes: 10,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  chapters: [{ id: "ch", title: "1", description: "", lessons: [
    { id: "l1", chapterId: "ch", courseId: "c1", title: "카메라 파지법", description: "", estimatedMinutes: 5, conceptId: "grip", conceptName: "카메라 파지법", isCompleted: false },
    { id: "l2", chapterId: "ch", courseId: "c1", title: "반셔터와 초점", description: "", estimatedMinutes: 5, conceptId: "focus", conceptName: "반셔터와 초점", isCompleted: false },
    { id: "l3", chapterId: "ch", courseId: "c1", title: "노출", description: "", estimatedMinutes: 5, conceptId: "exposure", conceptName: "노출", isCompleted: false },
  ] }],
});
const seed = () => StorageService.addCourse(course());
const nodeState = (name: string) => getKnowledgeGraph().nodes.find((node) => node.name === name)?.state;

test("[[개념]] 파싱: 별칭·중복·코드 블록·잘못된 형태를 처리한다", () => {
  const body = "오늘은 [[카메라 파지법]]과 [[ 반셔터와   초점 |초점]]을 봤다. 또 [[카메라 파지법]]\n```\n[[코드 안]]\n```\n인라인 `[[코드]]` [[ ]] [[a\nb]] [[[삼중]]]";
  assert.deepEqual(extractNoteLinkNames(body), ["카메라 파지법", "반셔터와 초점", "삼중"]);
  assert.equal(extractNoteLinkNames(`[[${"가".repeat(81)}]]`).length, 0);
  assert.equal(noteTitleFromBody("## 파지법 [[카메라 파지법]] 정리\n본문"), "파지법 카메라 파지법 정리");
  assert.equal(noteTitleFromBody("  \n"), "제목 없음");

  seed();
  const resolved = resolveNoteLinks("[[카메라 파지법]] [[없는 개념]] [[반셔터와 초점]]", getKnowledgeGraph());
  assert.deepEqual(resolved.links, ["카메라파지법", "반셔터와초점"]);
  assert.deepEqual(resolved.unresolved, ["없는 개념"]);
  assert.deepEqual(resolveNoteLinks("[[x]]", emptyKnowledgeGraph()), { links: [], unresolved: ["x"] });
});

test("메모 저장·조회: 레슨 메모는 개념에 붙고 링크가 연결되며 메모 있는 개념을 조회할 수 있다", () => {
  seed();
  const saved = saveNote({ body: "# 파지 정리\n[[반셔터와 초점]]도 함께 보기", courseId: "c1", lessonId: "l1" });
  assert.ok(saved.ok);
  const note = saved.note;
  assert.equal(note.title, "파지 정리");
  assert.equal(note.conceptId, "카메라파지법", "레슨의 개념이 자동으로 붙는다");
  assert.deepEqual(note.links, ["반셔터와초점"]);
  assert.equal(getNoteForLesson("c1", "l1")?.id, note.id);
  assert.equal(getNoteForLesson("c1", "l2"), undefined);
  assert.deepEqual(getNotesForConcept("카메라 파지법").map((n) => n.id), [note.id], "이름으로도 찾는다");
  assert.deepEqual(getNotesForConcept("카메라파지법").map((n) => n.id), [note.id]);
  assert.deepEqual(getNotesLinkingTo("반셔터와 초점").map((n) => n.id), [note.id], "백링크");
  assert.deepEqual(getNotesLinkingTo("카메라 파지법"), [], "직접 붙은 메모는 백링크에서 뺀다");
  assert.deepEqual(getConceptIdsWithNotes().sort(), ["반셔터와초점", "카메라파지법"]);
  assert.deepEqual(getConceptIdsWithNotes({ includeLinked: false }), ["카메라파지법"]);

  // 고치기: 입력에 없는 연결은 유지하고, 링크는 새 본문으로 다시 계산한다.
  const edited = saveNote({ id: note.id, body: "[[노출]]만 남김" });
  assert.ok(edited.ok);
  assert.equal(edited.note.createdAt, note.createdAt);
  assert.equal(edited.note.lessonId, "l1");
  assert.deepEqual(edited.note.links, ["노출"]);
  assert.equal(edited.note.title, "노출만 남김");
  assert.equal(listNotes().length, 1);

  const blank = saveNote({ body: "   ", conceptId: "노출" });
  assert.ok(blank.ok);
  assert.equal(getNotesForConcept("노출").length, 1);
  assert.equal(getConceptIdsWithNotes({ includeLinked: false }).filter((id) => id === "노출").length, 0, "본문이 빈 메모는 표시하지 않는다");

  assert.equal(deleteNote(note.id), true);
  assert.equal(deleteNote(note.id), false);
  assert.equal(getNote(note.id), undefined);
});

test("메모 상한: 본문 크기·전체 글자 수·개수는 저장을 거절하고 기존 메모는 지키며, 없는 id는 not_found", () => {
  assert.deepEqual(saveNote({ body: "가".repeat(NOTE_LIMITS.maxBodyLength + 1) }), { ok: false, reason: "too_large" });
  assert.deepEqual(saveNote({ id: "없는-id", body: "x" }), { ok: false, reason: "not_found" });
  assert.deepEqual(saveNote({ body: 1 as never }), { ok: false, reason: "invalid" });

  for (let i = 0; i < 11; i += 1) assert.ok(saveNote({ body: "가".repeat(NOTE_LIMITS.maxBodyLength) }).ok, `${i}`);
  assert.deepEqual(saveNote({ body: "가".repeat(NOTE_LIMITS.maxBodyLength) }), { ok: false, reason: "too_large" });
  assert.equal(listNotes().length, 11, "거절해도 기존 메모는 그대로");

  storage.clear();
  for (let i = 0; i < NOTE_LIMITS.maxNotes; i += 1) assert.ok(saveNote({ body: `메모 ${i}` }).ok);
  assert.deepEqual(saveNote({ body: "하나 더" }), { ok: false, reason: "too_many" });
  const first = listNotes()[0];
  assert.ok(saveNote({ id: first.id, body: "기존 메모는 고칠 수 있다" }).ok);
});

test("저장 실패는 예외 없이 storage 사유로 돌려준다", () => {
  const failing = new MemoryStorage();
  failing.setItem = () => { throw new Error("quota"); };
  Object.defineProperty(globalThis, "localStorage", { value: failing, configurable: true });
  const original = console.error; console.error = () => undefined;
  try { assert.deepEqual(saveNote({ body: "x" }), { ok: false, reason: "storage" }); } finally { console.error = original; }
});

test("옛 learnhub_note_ 메모: 사라지지 않고 보이며, 고치면 새 메모가 가리고, 지우면 키도 지운다", () => {
  seed();
  storage.setItem("learnhub_note_l1", "# 예전 메모\n[[노출]] 기억하기");
  storage.setItem("learnhub_note_free-note", "과목과 무관한 메모");
  storage.setItem("learnhub_note_", "이름 없는 키");
  const listed = listNotes();
  assert.equal(listed.length, 2);
  const lessonNote = listed.find((n) => n.id === "legacy:l1")!;
  assert.deepEqual([lessonNote.title, lessonNote.courseId, lessonNote.lessonId, lessonNote.conceptId, lessonNote.links], ["예전 메모", "c1", "l1", "카메라파지법", ["노출"]]);
  assert.equal(getNoteForLesson("c1", "l1")?.id, "legacy:l1");
  assert.equal(listed.find((n) => n.id === "legacy:free-note")?.lessonId, undefined);
  assert.equal(storage.getItem("learnhub_note_l1"), "# 예전 메모\n[[노출]] 기억하기", "원본 키는 건드리지 않는다");

  const edited = saveNote({ id: "legacy:l1", body: "# 새 내용" });
  assert.ok(edited.ok);
  assert.equal(edited.note.lessonId, "l1");
  assert.equal(listNotes().length, 2, "같은 id의 새 메모가 옛 메모를 가린다");
  assert.equal(getNote("legacy:l1")?.body, "# 새 내용");

  assert.equal(deleteNote("legacy:l1"), true);
  assert.equal(storage.getItem("learnhub_note_l1"), null);
  assert.equal(listNotes().length, 1, "지운 옛 메모가 다시 나타나지 않는다");
  assert.equal(deleteNote("legacy:free-note"), true);
  assert.equal(listNotes().length, 0);

  // 옛 백업의 notes 필드도 그대로 내보내진다.
  storage.setItem("learnhub_note_keep", "백업에도 남는다");
  assert.equal(createLearningBackup(storage as unknown as Storage).data.notes?.learnhub_note_keep, "백업에도 남는다");
});

test("레슨 진행 상태: 저장·복원·덮어쓰기·초기화와 잘못된 값 거절", () => {
  assert.equal(getLessonProgress("c1", "l1"), undefined);
  const saved = saveLessonProgress({ courseId: "c1", lessonId: "l1", stepIndex: 2, phase: "steps" })!;
  assert.deepEqual([saved.stepIndex, saved.phase], [2, "steps"]);
  assert.equal(getLessonProgress("c1", "l1")?.stepIndex, 2);
  saveLessonProgress({ courseId: "c1", lessonId: "l1", stepIndex: 3, phase: "check", checkResult: "skipped" });
  saveLessonProgress({ courseId: "c1", lessonId: "l2", stepIndex: 0, phase: "steps" });
  assert.deepEqual(JSON.parse(storage.getItem(LEARNHUB_STORAGE_KEYS.LESSON_PROGRESS)!).length, 2, "레슨마다 하나");
  assert.equal(getLessonProgress("c1", "l1")?.phase, "check");
  assert.equal(saveLessonProgress({ courseId: "c1", lessonId: "l1", stepIndex: -1, phase: "steps" }), null);
  assert.equal(saveLessonProgress({ courseId: "c1", lessonId: "l1", stepIndex: 1, phase: "later" as never }), null);
  assert.equal(getLessonProgress("c1", "l1")?.stepIndex, 3, "거절하면 기존 상태 유지");
  assert.equal(clearLessonProgress("c1", "l1"), true);
  assert.equal(clearLessonProgress("c1", "l1"), false);
  assert.equal(getLessonProgress("c1", "l1"), undefined);
  storage.setItem(LEARNHUB_STORAGE_KEYS.LESSON_PROGRESS, "{broken");
  assert.equal(getLessonProgress("c1", "l2"), undefined);
});

test("완료 처리: 넘어감=learned, 정답=verified, 오답=needs_review이고 두 번 불러도 안전하다", () => {
  seed();
  assert.deepEqual(completeLesson("c1", "nope", "skipped"), { ok: false, alreadyCompleted: false, reason: "lesson_not_found" });

  const skipped = completeLesson("c1", "l1", "skipped");
  assert.deepEqual([skipped.ok, skipped.alreadyCompleted, skipped.conceptState], [true, false, "learned"]);
  assert.equal(StorageService.getCourseById("c1")!.chapters[0].lessons[0].isCompleted, true);
  assert.equal(getLessonProgress("c1", "l1")?.phase, "done");
  assert.equal(getLessonProgress("c1", "l1")?.checkResult, "skipped");
  const minutes = StorageService.getProgress().totalMinutesLearned;
  const again = completeLesson("c1", "l1", "skipped");
  assert.deepEqual([again.ok, again.alreadyCompleted], [true, true]);
  assert.equal(StorageService.getProgress().totalMinutesLearned, minutes, "시간을 다시 쌓지 않는다");

  const correct = completeLesson("c1", "l2", "correct");
  assert.equal(correct.conceptState, "verified");
  assert.equal(nodeState("반셔터와 초점"), "verified");
  assert.equal(StorageService.getSkills().length, 0, "정답 기록이 없으면 점수를 만들어 내지 않는다");

  // 정답 기록을 먼저 한 경우에도 verified가 유지된다.
  StorageService.recordQuizAnswer("c1", "카메라 입문", "exposure", "노출", true);
  assert.equal(completeLesson("c1", "l3", "correct").conceptState, "verified");
  assert.equal(StorageService.getSkills().find((s) => s.conceptName === "노출")?.correctCount, 1, "점수는 한 번만");
  // verified 개념은 넘어가도 내려가지 않는다.
  assert.equal(completeLesson("c1", "l3", "skipped").conceptState, "verified");
});

test("완료 처리: 오답은 needs_review로 남고, 실기형 해봤어요는 learned까지만 간다", () => {
  seed();
  StorageService.recordQuizAnswer("c1", "카메라 입문", "grip", "카메라 파지법", false);
  const wrong = completeLesson("c1", "l1", "incorrect");
  assert.equal(wrong.conceptState, "needs_review");
  assert.equal(getLessonProgress("c1", "l1")?.checkResult, "incorrect");
  const practiced = completeLesson("c1", "l2", "practiced");
  assert.equal(practiced.conceptState, "learned");
});

test("백업·동기화: 메모와 레슨 진행이 내보내기·병합되고 옛 스냅샷은 그대로 유효하다", () => {
  const old = createLearningBackup(storage as unknown as Storage);
  assert.equal(old.data.learningNotes, undefined);
  assert.equal(old.data.lessonProgress, undefined);
  assert.equal(validateLearningBackup(old).ok, true);

  seed();
  const mine = saveNote({ body: "# 내 메모", courseId: "c1", lessonId: "l1" });
  assert.ok(mine.ok);
  saveLessonProgress({ courseId: "c1", lessonId: "l1", stepIndex: 2, phase: "steps" });
  const backup = createLearningBackup(storage as unknown as Storage);
  assert.equal(backup.data.learningNotes?.length, 1);
  assert.equal(backup.data.lessonProgress?.[0].stepIndex, 2);
  assert.equal(validateLearningBackup(backup).ok, true);

  const badNote = structuredClone(backup);
  badNote.data.learningNotes![0].body = "가".repeat(NOTE_LIMITS.maxBodyLength + 1);
  assert.equal(validateLearningBackup(badNote).ok, false);
  const dupNote = structuredClone(backup);
  dupNote.data.learningNotes!.push(dupNote.data.learningNotes![0]);
  assert.equal(validateLearningBackup(dupNote).ok, false, "id 중복");
  const badProgress = structuredClone(backup);
  badProgress.data.lessonProgress![0].stepIndex = 1000;
  assert.equal(validateLearningBackup(badProgress).ok, false);

  // 다른 기기에서 병합: 둘 다 남고, 같은 레슨의 진행은 더 늦게 바뀐 쪽이 이긴다.
  const other = new MemoryStorage();
  const remoteNote: LearningNote = { id: "remote-note", title: "원격", body: "다른 기기", links: [], createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
  other.setItem(LEARNHUB_STORAGE_KEYS.LEARNING_NOTES, JSON.stringify([remoteNote]));
  other.setItem(LEARNHUB_STORAGE_KEYS.LESSON_PROGRESS, JSON.stringify([{ courseId: "c1", lessonId: "l1", stepIndex: 0, phase: "steps", updatedAt: "2000-01-01T00:00:00.000Z" }]));
  const result = importLearningBackup(backup, { strategy: "merge", storage: other as unknown as Storage });
  assert.equal(result.ok, true);
  const notes = JSON.parse(other.getItem(LEARNHUB_STORAGE_KEYS.LEARNING_NOTES)!) as LearningNote[];
  assert.deepEqual(notes.map((n) => n.id).sort(), ["remote-note", mine.ok ? mine.note.id : ""].sort());
  assert.equal(JSON.parse(other.getItem(LEARNHUB_STORAGE_KEYS.LESSON_PROGRESS)!)[0].stepIndex, 2);

  const merged = mergeNotes([remoteNote], [{ ...remoteNote, body: "예전", updatedAt: "2000-01-01T00:00:00.000Z" }]);
  assert.equal(merged[0].body, "다른 기기");
  assert.equal(mergeLessonProgress([], []).length, 0);
});
