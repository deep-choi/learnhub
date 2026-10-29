import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  appendChatMessage,
  createChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  renameChatSession,
  setMessageCoursePreview,
  setMessageCourseId,
} from "../src/services/chatSessionStore";
import { CHAT_LIMITS, chatSessionChars, mergeChatSessions, titleFromFirstMessage, toTutorHistory } from "../src/domain/chatSession";
import { detectLearningIntent, resolveLearningIntent } from "../src/domain/learningIntent";
import { buildLearnerContext } from "../src/domain/learnerContext";
import { buildSidebarCourses, lessonConversationKey } from "../src/services/sidebarData";
import { LEARNHUB_STORAGE_KEYS } from "../src/services/storage";
import { createLearningBackup, importLearningBackup, validateLearningBackup } from "../src/services/learningBackup";
import { validTutorRequest, validateTutorResponse, normalizeTutorResponse, tutorPrompt, TUTOR_BRANCH_LIMIT } from "../server/knowledgeGraphApi";
import type { ChatSession } from "../src/types/chat";
import type { KnowledgeGraph } from "../src/types/knowledgeGraph";
import type { Course } from "../src/types/learning";

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

const session = (id: string, updatedAt: string, texts: string[] = ["안녕하세요"]): ChatSession => ({
  id, title: id, createdAt: updatedAt, updatedAt,
  messages: texts.map((text, index) => ({ role: index % 2 === 0 ? "user" as const : "assistant" as const, text, createdAt: updatedAt })),
});

test("started courses remain linked after preview pruning and backup round trips", () => {
  const chat = createChatSession("생활 과학을 배우고 싶어요")!;
  appendChatMessage(chat.id, { role: "assistant", text: "이제 함께 배워볼게요." });
  assert.equal(setMessageCourseId(chat.id, 1, "course-started"), true);
  for (let index = 0; index < CHAT_LIMITS.maxPreviewsPerSession + 1; index++) {
    appendChatMessage(chat.id, { role: "assistant", text: `과정 ${index}`, coursePreview: { subject: "과학", data: {} } });
  }
  assert.equal(getChatSession(chat.id)?.messages[1].courseId, "course-started");
  assert.equal(setMessageCourseId(chat.id, 999, "missing"), false);
  assert.equal(setMessageCourseId(chat.id, 1, ""), false);
  const setup = { level: "beginner" as const, levelEvidence: "생활 속 과학이 궁금해요" };
  storage.setItem(LEARNHUB_STORAGE_KEYS.COURSES, JSON.stringify([{ ...course(), setup }]));
  const backup = createLearningBackup();
  assert.equal(validateLearningBackup(backup).ok, true);
  const malformed = structuredClone(backup);
  malformed.data.courses![0].setup = { levelEvidence: "가".repeat(2401) };
  assert.equal(validateLearningBackup(malformed).ok, false);
  storage.clear();
  importLearningBackup(backup, { strategy: "merge", storage: storage as unknown as Storage });
  assert.equal(getChatSession(chat.id)?.messages[1].courseId, "course-started");
  assert.deepEqual(JSON.parse(storage.getItem(LEARNHUB_STORAGE_KEYS.COURSES)!)[0].setup, setup);
});

test("자유 대화: 만들기·덧붙이기·이름 바꾸기·삭제와 최신순 목록", async () => {
  const first = createChatSession("  낚시 미끼를   고르는 법이 궁금해요  ");
  assert.ok(first);
  assert.equal(first.title, "낚시 미끼를 고르는 법이 궁금해요");
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0].role, "user");
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = createChatSession("분수 나눗셈")!;
  assert.deepEqual(listChatSessions().map((item) => item.id), [second.id, first.id]);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const appended = appendChatMessage(first.id, { role: "assistant", text: "미끼는 대상 어종에 맞춰 고릅니다.", question: "낚시 미끼", conceptName: "미끼 선택" });
  assert.equal(appended?.messages.length, 2);
  assert.equal(listChatSessions()[0].id, first.id, "덧붙인 대화가 최근으로 올라옵니다");
  assert.equal(getChatSession(first.id)?.messages[1].conceptName, "미끼 선택");

  assert.equal(renameChatSession(first.id, "낚시 미끼"), true);
  assert.equal(getChatSession(first.id)?.title, "낚시 미끼");
  assert.equal(renameChatSession(first.id, "   "), false);
  assert.equal(renameChatSession("없는-id", "제목"), false);
  assert.equal(appendChatMessage("없는-id", { role: "user", text: "안녕" }), null);
  assert.equal(appendChatMessage(first.id, { role: "user", text: "   " }), null);

  assert.equal(deleteChatSession(second.id), true);
  assert.equal(deleteChatSession(second.id), false);
  assert.deepEqual(listChatSessions().map((item) => item.id), [first.id]);
  assert.equal(createChatSession("   "), null);
});

test("제목은 첫 질문에서 30자 이내로 자동 생성한다", () => {
  assert.equal(titleFromFirstMessage("   "), "새 대화");
  const title = titleFromFirstMessage("가".repeat(100));
  assert.equal([...title].length, CHAT_LIMITS.maxTitleLength);
  assert.ok(title.endsWith("…"));
});

test("상한: 세션 수·세션당 메시지 수·글자 수를 넘으면 오래된 것부터 버린다", () => {
  for (let i = 0; i < CHAT_LIMITS.maxSessions + 5; i += 1) {
    createChatSession(`질문 ${i}`);
  }
  assert.equal(listChatSessions().length, CHAT_LIMITS.maxSessions);
  assert.ok(!listChatSessions().some((item) => item.title === "질문 0"), "가장 오래된 대화가 버려집니다");

  storage.clear();
  const only = createChatSession("긴 대화")!;
  for (let i = 0; i < CHAT_LIMITS.maxMessagesPerSession + 10; i += 1) appendChatMessage(only.id, { role: i % 2 ? "assistant" : "user", text: `메시지 ${i}` });
  const stored = getChatSession(only.id)!;
  assert.equal(stored.messages.length, CHAT_LIMITS.maxMessagesPerSession);
  assert.equal(stored.messages.at(-1)?.text, `메시지 ${CHAT_LIMITS.maxMessagesPerSession + 9}`);

  const long = appendChatMessage(only.id, { role: "assistant", text: "가".repeat(CHAT_LIMITS.maxTextLength + 500) })!;
  assert.equal(long.messages.at(-1)?.text.length, CHAT_LIMITS.maxTextLength);

  const big = Array.from({ length: 20 }, (_, i) => session(`s${i}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), Array.from({ length: 20 }, () => "가".repeat(CHAT_LIMITS.maxTextLength))));
  const merged = mergeChatSessions([], big);
  assert.ok(merged.reduce((sum, item) => sum + item.title.length + item.messages.reduce((n, m) => n + m.text.length, 0), 0) <= CHAT_LIMITS.maxTotalChars);
  assert.equal(merged[0].id, "s19", "최신 대화는 항상 남습니다");
});

test("손상된 저장값은 읽을 수 있는 세션만 남기고 대화를 막지 않는다", () => {
  storage.setItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS, "{broken");
  assert.deepEqual(listChatSessions(), []);
  assert.ok(createChatSession("다시 시작"));
  storage.setItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify([session("ok", "2026-10-01T00:00:00.000Z"), { id: "bad" }]));
  assert.deepEqual(listChatSessions().map((item) => item.id), ["ok"]);
});

test("저장에 실패하면 null/false를 돌려주고 예외를 던지지 않는다", () => {
  const failing = new MemoryStorage();
  failing.setItem = () => { throw new Error("quota"); };
  Object.defineProperty(globalThis, "localStorage", { value: failing, configurable: true });
  const original = console.error; console.error = () => undefined;
  try {
    assert.equal(createChatSession("질문"), null);
    assert.equal(deleteChatSession("x"), false);
  } finally { console.error = original; }
});

test("백업: chatSessions가 내보내기·검증·가져오기·병합에 포함되고 옛 스냅샷도 그대로 유효하다", () => {
  const old = createLearningBackup(storage as unknown as Storage);
  assert.equal(old.data.chatSessions, undefined);
  assert.equal(validateLearningBackup(old).ok, true, "chatSessions가 없는 옛 스냅샷");

  const mine = createChatSession("낚시 질문")!;
  const backup = createLearningBackup(storage as unknown as Storage);
  assert.equal(backup.data.chatSessions?.length, 1);
  assert.equal(validateLearningBackup(backup).ok, true);

  const bad = structuredClone(backup) as unknown as { data: { chatSessions: unknown[] } };
  bad.data.chatSessions.push({ id: "x" });
  assert.equal(validateLearningBackup(bad).ok, false);
  const dup = structuredClone(backup) as unknown as { data: { chatSessions: unknown[] } };
  dup.data.chatSessions.push(dup.data.chatSessions[0]);
  assert.equal(validateLearningBackup(dup).ok, false, "id 중복");
  const tooMany = structuredClone(backup);
  tooMany.data.chatSessions = Array.from({ length: CHAT_LIMITS.maxSessions + 1 }, (_, i) => session(`s${i}`, "2026-10-01T00:00:00.000Z"));
  assert.equal(validateLearningBackup(tooMany).ok, false, "세션 수 상한");

  const other = new MemoryStorage();
  const theirs = session("remote", "2026-10-02T00:00:00.000Z", ["다른 기기 질문"]);
  const incoming = { ...backup, data: { chatSessions: [theirs, { ...mine, title: "옛 제목", updatedAt: "2000-01-01T00:00:00.000Z" }] } };
  const result = importLearningBackup(incoming, { strategy: "merge", storage: other as unknown as Storage });
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(other.getItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS)!).length, 2);

  // 같은 기기에서 병합하면 id가 겹치는 대화는 더 늦게 바뀐 쪽을 쓴다.
  const merged = importLearningBackup(incoming, { strategy: "merge", storage: storage as unknown as Storage });
  assert.equal(merged.ok, true);
  const list = listChatSessions();
  assert.deepEqual(list.map((item) => item.id).sort(), [mine.id, "remote"].sort());
  assert.equal(list.find((item) => item.id === mine.id)?.title, "낚시 질문");
});

test("tutor-chat: learningIntent 스키마·자유 대화 요청 검증", () => {
  const base = { courseTitle: "자유 학습", lessonTitle: "AI 학습 대화", conceptName: "사용자 질문", currentStepContent: "자유 대화", userQuestion: "낚시 배우고 싶어", history: toTutorHistory([{ role: "user", text: "안녕" }]) };
  assert.ok(validTutorRequest(base));
  assert.ok(validTutorRequest({ ...base, mode: "free", learnerContext: { recentConcepts: ["분수"], reviewConcepts: [], activeCourses: ["낚시 입문"], currentCourse: "낚시 입문", currentConcept: "물가 안전" } }));
  assert.equal(validTutorRequest({ ...base, mode: "other" }), false);
  assert.equal(validTutorRequest({ ...base, learnerContext: { recentConcepts: [], reviewConcepts: [], activeCourses: [] } }), false, "자유 대화가 아니면 요약을 받지 않습니다");
  assert.equal(validTutorRequest({ ...base, mode: "free", learnerContext: { recentConcepts: Array(6).fill("a"), reviewConcepts: [], activeCourses: [] } }), false, "개수 상한");
  assert.equal(validTutorRequest({ ...base, mode: "free", learnerContext: { recentConcepts: ["가".repeat(61)], reviewConcepts: [], activeCourses: [] } }), false, "길이 상한");
  assert.equal(validTutorRequest({ ...base, mode: "free", learnerContext: { recentConcepts: [], reviewConcepts: [], activeCourses: [], extra: 1 } }), false);

  assert.deepEqual(validateTutorResponse({ reply: "좋아요" }, "사용자 질문", { free: true }), []);
  assert.deepEqual(validateTutorResponse({ reply: "좋아요", learningIntent: { subject: "낚시" } }, "사용자 질문", { free: true }), []);
  assert.deepEqual(validateTutorResponse({ reply: "좋아요", learningIntent: null }, "사용자 질문", { free: true }), []);
  assert.notEqual(validateTutorResponse({ reply: "좋아요", learningIntent: { subject: "" } }, "사용자 질문", { free: true }).length, 0);
  assert.notEqual(validateTutorResponse({ reply: "좋아요", learningIntent: { subject: 3 } }, "사용자 질문", { free: true }).length, 0);
  assert.notEqual(validateTutorResponse({ reply: "좋아요", learningIntent: { subject: "낚시" } }, "물가 안전").length, 0, "레슨 대화에는 의도를 받지 않습니다");

  assert.match(tutorPrompt({ ...base, mode: "free" }), /learningIntent/);
  assert.doesNotMatch(tutorPrompt(base), /learningIntent/);
});

test("학습 의도 규칙: 배우고 싶다는 뜻만 잡고 질문·막연한 말은 놓아준다", () => {
  const cases: [string, string | null][] = [
    ["낚시 배우고 싶어", "낚시"],
    ["낚시를 배우고 싶어요", "낚시"],
    ["기타 좀 처음부터 배워보고 싶어요.", "기타"],
    ["UI 디자인 공부하고 싶어", "UI 디자인"],
    ["나는 파이썬을 공부하려고 해", "파이썬"],
    ["분수 나눗셈에 대해 배우고 싶어요", "분수 나눗셈"],
    ["요리 가르쳐 줘", "요리"],
    ["I want to learn photography", "photography"],
    ["낚시가 뭐야?", null],
    ["뭔가 배우고 싶어", null],
    ["배우고 싶어", null],
    ["낚시 배우고 싶지 않아", null],
    ["", null],
    ["가".repeat(300) + " 배우고 싶어", null],
  ];
  for (const [input, subject] of cases) assert.equal(detectLearningIntent(input)?.subject ?? null, subject, input);
  assert.deepEqual(resolveLearningIntent("아무 말", { subject: " 낚시 " }), { subject: "낚시" }, "서버 응답이 우선");
  assert.deepEqual(resolveLearningIntent("낚시 배우고 싶어", null), { subject: "낚시" }, "서버가 놓치면 규칙으로 보완");
  assert.equal(resolveLearningIntent("안녕", { subject: "" }), null);
});

const graph = (): KnowledgeGraph => ({
  version: 1,
  nodes: [
    { id: "a", name: "물가 안전", aliases: [], domain: "낚시", courseRefs: [{ courseId: "c1", lessonId: "l1" }], state: "learned", createdAt: "2026-10-01T00:00:00.000Z", lastStudiedAt: "2026-10-01T00:00:00.000Z" },
    { id: "b", name: "미끼 고르기", aliases: [], domain: "낚시", courseRefs: [{ courseId: "c1", lessonId: "l2" }], state: "needs_review", createdAt: "2026-10-01T00:00:00.000Z", lastStudiedAt: "2026-10-01T01:00:00.000Z" },
    { id: "c", name: "매듭", aliases: [], domain: "낚시", courseRefs: [], state: "verified", createdAt: "2026-10-01T00:00:00.000Z", lastStudiedAt: "2026-10-02T00:00:00.000Z" },
  ],
  edges: [],
  lastPosition: { courseId: "c1", lessonId: "l1", conceptId: "a", at: "2026-10-01T00:00:00.000Z" },
});
const course = (): Course => ({
  id: "c1", title: "원리로 배우는 낚시 입문", subject: "낚시", learningType: "practical", learningTypeExplanation: "", summary: "", level: "beginner", goal: "", dailyMinutes: 10,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  chapters: [{ id: "ch", title: "1", description: "", lessons: [
    { id: "l1", chapterId: "ch", courseId: "c1", title: "물가 안전과 보호 장구", description: "", estimatedMinutes: 5, conceptId: "a", conceptName: "물가 안전", isCompleted: true },
    { id: "l2", chapterId: "ch", courseId: "c1", title: "미끼 고르기", description: "", estimatedMinutes: 5, conceptId: "b", conceptName: "미끼 고르기", isCompleted: false },
  ] }],
});

test("학습자 요약: 이름만, 상한 안에서, 기록이 없으면 null", () => {
  assert.equal(buildLearnerContext({ version: 1, nodes: [], edges: [] }, []), null);
  const context = buildLearnerContext(graph(), [course()])!;
  assert.equal(context.currentCourse, "원리로 배우는 낚시 입문");
  assert.equal(context.currentConcept, "물가 안전");
  assert.deepEqual(context.recentConcepts, ["매듭"], "현재 개념은 최근 목록에서 뺍니다");
  assert.deepEqual(context.reviewConcepts, ["미끼 고르기"]);
  assert.deepEqual(context.activeCourses, ["원리로 배우는 낚시 입문"]);
  assert.equal(validTutorRequest({ courseTitle: "a", lessonTitle: "b", conceptName: "c", currentStepContent: "d", userQuestion: "e", mode: "free", learnerContext: context }), true, "서버 검증을 통과합니다");

  const many = graph();
  many.nodes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, name: "개".repeat(100), aliases: [], domain: "x", courseRefs: [], state: "learned" as const, createdAt: "2026-10-01T00:00:00.000Z" }));
  many.lastPosition = undefined;
  const capped = buildLearnerContext(many, [])!;
  assert.equal(capped.recentConcepts.length, 5);
  assert.ok(capped.recentConcepts.every((name) => [...name].length <= 60));
  assert.equal(buildLearnerContext({ ...graph(), lastPosition: undefined }, [{ ...course(), status: "completed" }])?.activeCourses.length, 0);
});

test("사이드바 데이터: 레슨 상태·현재 위치·대화 기록 존재 여부", () => {
  storage.setItem(lessonConversationKey("c1", "l2"), JSON.stringify([{ sender: "user", text: "질문" }]));
  storage.setItem(lessonConversationKey("c1", "l1"), "[]");
  const archived = { ...course(), id: "c2", status: "cancelled" as const };
  const result = buildSidebarCourses([archived, course()], graph().lastPosition, storage);
  assert.equal(result.length, 1, "보관한 과목은 제외");
  assert.equal(result[0].isCurrent, true);
  assert.deepEqual([result[0].completedCount, result[0].totalCount], [1, 2]);
  assert.deepEqual(result[0].lessons.map((lesson) => [lesson.isCurrent, lesson.isCompleted, lesson.hasConversation]), [[true, true, false], [false, false, true]]);
});

test("toTutorHistory: 최근 12개, 한 줄 900자 이내", () => {
  const history = toTutorHistory(Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" as const : "user" as const, text: `${i}${"가".repeat(2000)}` })));
  assert.equal(history.length, 12);
  assert.ok(history.every((item) => item.text.length <= 900));
});

const preview = (subject: string, extra: Record<string, unknown> = {}) => ({
  subject,
  setup: { level: "intermediate" as const, experience: "experienced" as const, levelEvidence: "채비는 어종에 맞춥니다.", goal: "취미·교양", dailyMinutes: 15 },
  data: { preview: true, curriculum: { courseTitle: subject, chapters: [] }, ...extra },
});

test("coursePreview: 저장·정규화, 크기 초과·형식 오류는 필드만 버리고 메시지는 유지", () => {
  const chat = createChatSession("낚시 배우고 싶어")!;
  const ok = appendChatMessage(chat.id, { role: "assistant", text: "지도를 만들어 볼까요?", coursePreview: preview("낚시") })!;
  assert.deepEqual(ok.messages[1].coursePreview, preview("낚시"));
  assert.equal(JSON.parse(storage.getItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS)!)[0].messages[1].coursePreview.setup.levelEvidence, "채비는 어종에 맞춥니다.");

  const big = appendChatMessage(chat.id, { role: "assistant", text: "너무 큰 미리보기", coursePreview: preview("낚시", { blob: "가".repeat(CHAT_LIMITS.maxPreviewChars) }) })!;
  assert.equal(big.messages.at(-1)?.text, "너무 큰 미리보기");
  assert.equal(big.messages.at(-1)?.coursePreview, undefined);
  const edge = appendChatMessage(chat.id, { role: "assistant", text: "경계", coursePreview: { subject: "낚시", data: { s: "a".repeat(CHAT_LIMITS.maxPreviewChars - 8) } } })!;
  assert.ok(edge.messages.at(-1)?.coursePreview, "JSON 40,000자 이하는 허용");

  for (const bad of [{ subject: "", data: {} }, { subject: "낚시", data: [] }, { subject: "낚시", data: {}, extra: 1 }, { subject: "낚시", setup: { level: "expert" }, data: {} }, { subject: "낚시", setup: { nickname: "a" }, data: {} }]) {
    const result = appendChatMessage(chat.id, { role: "assistant", text: "나쁜 미리보기", coursePreview: bad as never })!;
    assert.equal(result.messages.at(-1)?.coursePreview, undefined);
  }
});

test("coursePreview: 세션당 가장 최근 3건만 유지하고 오래된 것은 필드만 지운다", () => {
  const chat = createChatSession("질문")!;
  for (let i = 0; i < 5; i += 1) appendChatMessage(chat.id, { role: "assistant", text: `답 ${i}`, coursePreview: preview(`주제 ${i}`) });
  const stored = getChatSession(chat.id)!;
  assert.equal(stored.messages.length, 6, "메시지는 모두 남는다");
  assert.deepEqual(stored.messages.filter((m) => m.coursePreview).map((m) => m.coursePreview!.subject), ["주제 2", "주제 3", "주제 4"]);
  assert.equal(stored.messages[1].text, "답 0");
});

test("setMessageCoursePreview: 저장된 메시지의 미리보기를 갱신·삭제한다", () => {
  const chat = createChatSession("질문")!;
  appendChatMessage(chat.id, { role: "assistant", text: "카드", coursePreview: preview("낚시") });
  const updated = setMessageCoursePreview(chat.id, 1, { ...preview("낚시"), setup: { level: "beginner", experience: "none" } })!;
  assert.deepEqual(updated.messages[1].coursePreview?.setup, { level: "beginner", experience: "none" });
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(chat.updatedAt));
  assert.equal(setMessageCoursePreview(chat.id, 0, preview("첫 메시지"))?.messages[0].coursePreview?.subject, "첫 메시지");
  assert.equal(setMessageCoursePreview(chat.id, 9, preview("x")), null, "없는 메시지");
  assert.equal(setMessageCoursePreview("없는-id", 0, preview("x")), null);
  assert.equal(setMessageCoursePreview(chat.id, 1, { subject: "낚시", data: { blob: "가".repeat(CHAT_LIMITS.maxPreviewChars) } }), null, "너무 크면 바꾸지 않음");
  assert.equal(getChatSession(chat.id)?.messages[1].coursePreview?.setup?.level, "beginner");
  assert.equal(setMessageCoursePreview(chat.id, 1, null)?.messages[1].coursePreview, undefined);
  assert.equal(getChatSession(chat.id)?.messages[1].text, "카드");
});

test("coursePreview: 전체 글자 수에 포함되고, 백업·병합에서 보존되며 옛 스냅샷은 그대로 유효하다", () => {
  const chat = createChatSession("질문")!;
  const withPreview = appendChatMessage(chat.id, { role: "assistant", text: "카드", coursePreview: preview("낚시") })!;
  const without = { ...withPreview, messages: withPreview.messages.map(({ coursePreview: _p, ...rest }) => rest) };
  assert.ok(chatSessionChars(withPreview) > chatSessionChars(without) + 50, "미리보기 JSON이 글자 수에 포함");

  // 미리보기가 큰 세션이 많으면 오래된 세션부터 밀려난다.
  const heavy = Array.from({ length: 12 }, (_, i) => ({ id: `h${i}`, title: `h${i}`, createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), updatedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    messages: Array.from({ length: 3 }, () => ({ role: "assistant" as const, text: "카드", createdAt: "2026-10-01T00:00:00.000Z", coursePreview: { subject: "a", data: { s: "a".repeat(39_000) } } })) }));
  const kept = mergeChatSessions([], heavy);
  assert.ok(kept.length < heavy.length && kept[0].id === "h11");
  assert.ok(kept.reduce((sum, item) => sum + chatSessionChars(item), 0) <= CHAT_LIMITS.maxTotalChars);

  const backup = createLearningBackup(storage as unknown as Storage);
  assert.equal(validateLearningBackup(backup).ok, true);
  assert.deepEqual(backup.data.chatSessions?.[0].messages[1].coursePreview, preview("낚시"));
  const four = structuredClone(backup);
  four.data.chatSessions![0].messages = Array.from({ length: 4 }, () => ({ role: "assistant" as const, text: "x", createdAt: "2026-10-01T00:00:00.000Z", coursePreview: preview("a") }));
  assert.equal(validateLearningBackup(four).ok, false, "한 세션에 4건은 거부");
  const oversize = structuredClone(backup);
  oversize.data.chatSessions![0].messages[1].coursePreview = { subject: "a", data: { s: "a".repeat(CHAT_LIMITS.maxPreviewChars) } };
  assert.equal(validateLearningBackup(oversize).ok, false);

  const other = new MemoryStorage();
  const remote = { ...withPreview, id: "remote", updatedAt: "2026-10-03T00:00:00.000Z", messages: [{ role: "user" as const, text: "다른 기기", createdAt: "2026-10-03T00:00:00.000Z" }, { role: "assistant" as const, text: "카드", createdAt: "2026-10-03T00:00:00.000Z", coursePreview: preview("요리") }] };
  other.setItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify([remote]));
  const result = importLearningBackup(backup, { strategy: "merge", storage: other as unknown as Storage });
  assert.equal(result.ok, true);
  const merged = JSON.parse(other.getItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS)!) as ChatSession[];
  assert.deepEqual(merged.map((item) => item.id).sort(), [chat.id, "remote"].sort());
  assert.equal(merged.find((item) => item.id === "remote")?.messages[1].coursePreview?.subject, "요리");
  assert.equal(merged.find((item) => item.id === chat.id)?.messages[1].coursePreview?.subject, "낚시");

  // preview 필드가 없는 기존 저장값·스냅샷도 그대로 읽힌다.
  storage.setItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify([session("legacy", "2026-10-01T00:00:00.000Z")]));
  assert.equal(getChatSession("legacy")?.messages.length, 1);
  assert.equal(validateLearningBackup(createLearningBackup(storage as unknown as Storage)).ok, true);
});

test("tutor-chat: 대화로 펼친 곁가지를 받아 새 곁가지가 어느 가지에서 뻗었는지 고르게 합니다", () => {
  const base = { courseTitle: "사진 촬영 기초", lessonTitle: "초점 조절", conceptName: "초점 조절", currentStepContent: "초점", userQuestion: "싱글 AF는 언제 써요?" };
  assert.ok(validTutorRequest({ ...base, branchConcepts: ["AF 모드"] }));
  assert.equal(validTutorRequest({ ...base, branchConcepts: Array(TUTOR_BRANCH_LIMIT + 1).fill("가지") }), false, "개수 상한");
  assert.equal(validTutorRequest({ ...base, branchConcepts: ["가".repeat(81)] }), false, "길이 상한");
  assert.equal(validTutorRequest({ ...base, branchConcepts: "AF 모드" }), false);

  assert.match(tutorPrompt({ ...base, branchConcepts: ["AF 모드"] }), /parentConceptName/);
  assert.doesNotMatch(tutorPrompt(base), /parentConceptName/, "펼친 가지가 없으면 묻지 않습니다");

  const tangent = { conceptName: "싱글 AF", question: "싱글 AF는 언제 써요?" };
  assert.deepEqual(validateTutorResponse({ reply: "좋아요", tangent: { ...tangent, parentConceptName: "AF 모드" } }, "초점 조절"), []);
  assert.notEqual(validateTutorResponse({ reply: "좋아요", tangent: { ...tangent, parentConceptName: 3 } }, "초점 조절").length, 0);
  // 비었거나 자기 자신을 가리키는 부모는 지우고 곁가지는 살립니다.
  for (const parentConceptName of ["", "싱글 AF", null]) {
    const normalized = normalizeTutorResponse({ reply: "좋아요", tangent: { ...tangent, parentConceptName } }) as { tangent: Record<string, unknown> };
    assert.deepEqual(normalized.tangent, tangent);
  }
});
