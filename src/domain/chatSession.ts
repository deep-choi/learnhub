import type { ChatCoursePreview, ChatSession, ChatSessionMessage, ChatSetupState, LearningIntent, NewChatMessage } from "../types/chat";
import { SETUP_LIMITS, sanitizeCourseSetup } from "./courseSetup";

/** 저장 상한. 백업(8MB)과 클라우드 스냅샷 한도 안에 충분히 들어가도록 잡았다. */
export const CHAT_LIMITS = {
  maxSessions: 30,
  maxMessagesPerSession: 60,
  maxTextLength: 4_000,
  maxTitleLength: 30,
  /** 모든 세션의 글자 수 합(과목 미리보기 JSON 포함). 넘으면 오래된 세션부터 버린다. */
  maxTotalChars: 1_200_000,
  /** 미리보기 `data` 한 건의 JSON 글자 수. 넘으면 미리보기만 버리고 메시지는 남긴다. */
  maxPreviewChars: 40_000,
  /** 한 세션에서 coursePreview를 유지하는 메시지 수. 오래된 것은 필드만 제거한다. */
  maxPreviewsPerSession: 3,
  /** tutor-chat 요청이 받는 history 한 줄의 최대 길이 */
  historyTextLength: 900,
  historyMessages: 12,
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const nonEmpty = (value: unknown, max: number): value is string => str(value, max) && value.trim().length > 0;
const date = (value: unknown): value is string => str(value, 120) && Number.isFinite(Date.parse(value));

/** 첫 질문에서 제목을 만든다. AI 호출 없이 공백을 정리하고 잘라낸다. */
export function titleFromFirstMessage(firstMessage: string): string {
  const cleaned = firstMessage.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!cleaned) return "새 대화";
  const chars = [...cleaned];
  return chars.length > CHAT_LIMITS.maxTitleLength ? `${chars.slice(0, CHAT_LIMITS.maxTitleLength - 1).join("")}…` : cleaned;
}

export const clampChatText = (text: string): string =>
  text.length > CHAT_LIMITS.maxTextLength ? text.slice(0, CHAT_LIMITS.maxTextLength) : text;

export function isLearningIntent(value: unknown): value is LearningIntent {
  return isRecord(value) && Object.keys(value).every((key) => key === "subject") && nonEmpty(value.subject, 160);
}

const previewJsonLength = (data: unknown): number => {
  try { return JSON.stringify(data)?.length ?? Number.POSITIVE_INFINITY; } catch { return Number.POSITIVE_INFINITY; }
};

export function isChatCoursePreview(value: unknown): value is ChatCoursePreview {
  if (!isRecord(value) || Object.keys(value).some((key) => !["subject", "setup", "data"].includes(key))) return false;
  if (!nonEmpty(value.subject, 160) || !isRecord(value.data) || previewJsonLength(value.data) > CHAT_LIMITS.maxPreviewChars) return false;
  if (value.setup === undefined) return true;
  if (!isRecord(value.setup)) return false;
  const clean = sanitizeCourseSetup(value.setup) as Record<string, unknown>;
  return Object.keys(value.setup).every((key) => clean[key] !== undefined);
}

/** 저장 전 정규화. 형식이 틀리거나 너무 크면 null이라 호출한 쪽이 필드만 버린다. */
export function normalizeCoursePreview(value: unknown): ChatCoursePreview | null {
  if (!isChatCoursePreview(value)) return null;
  const setup = value.setup === undefined ? undefined : sanitizeCourseSetup(value.setup);
  return { subject: value.subject.trim(), ...(setup && Object.keys(setup).length > 0 ? { setup } : {}), data: value.data };
}

export function isChatMessage(value: unknown): value is ChatSessionMessage {
  return isRecord(value) &&
    (value.role === "user" || value.role === "assistant") &&
    nonEmpty(value.text, CHAT_LIMITS.maxTextLength) &&
    (value.studyResultId === undefined || nonEmpty(value.studyResultId, 200)) &&
    date(value.createdAt) &&
    (value.question === undefined || str(value.question, 400)) &&
    (value.conceptName === undefined || str(value.conceptName, 400)) &&
    (value.learningIntent === undefined || isLearningIntent(value.learningIntent)) &&
    (value.coursePreview === undefined || isChatCoursePreview(value.coursePreview)) &&
    (value.setupState === undefined || isChatSetupState(value.setupState));
}

export function isChatSetupState(value: unknown): value is ChatSetupState {
  if (!isRecord(value) || !nonEmpty(value.subject, 160) || !isRecord(value.setup) || !isRecord(value.progress)) return false;
  if (Object.keys(value).some(key => !["subject", "setup", "progress", "stepId", "question"].includes(key))) return false;
  const setup = value.setup;
  const clean = sanitizeCourseSetup(setup) as Record<string, unknown>;
  if (!Object.keys(setup).every(key => clean[key] !== undefined && clean[key] === setup[key])) return false;
  const ids = ["experience", "levelCheck", "goal", "dailyMinutes"];
  const progress = value.progress;
  if (Object.keys(progress).some(key => !["answered", "skipped", "levelCheckCount"].includes(key))) return false;
  return Array.isArray(progress.answered) && progress.answered.length <= ids.length
    && progress.answered.every(id => typeof id === "string" && ids.includes(id)) && typeof progress.skipped === "boolean"
    && (progress.levelCheckCount === undefined || (Number.isInteger(progress.levelCheckCount) && Number(progress.levelCheckCount) >= 0 && Number(progress.levelCheckCount) <= SETUP_LIMITS.maxLevelChecks))
    && (value.stepId === undefined ? value.question === undefined : typeof value.stepId === "string" && ids.includes(value.stepId) && nonEmpty(value.question, 300));
}

export function isChatSession(value: unknown): value is ChatSession {
  return isRecord(value) &&
    nonEmpty(value.id, 200) &&
    nonEmpty(value.title, 200) &&
    date(value.createdAt) &&
    date(value.updatedAt) &&
    Array.isArray(value.messages) &&
    value.messages.length <= CHAT_LIMITS.maxMessagesPerSession &&
    value.messages.every(isChatMessage) &&
    value.messages.filter((message) => message.coursePreview !== undefined).length <= CHAT_LIMITS.maxPreviewsPerSession;
}

export const chatSessionChars = (session: ChatSession): number =>
  session.title.length + session.messages.reduce((sum, message) => sum + message.text.length + (message.coursePreview ? previewJsonLength(message.coursePreview) : 0) + (message.setupState ? JSON.stringify(message.setupState).length : 0), 0);

/** coursePreview가 있는 메시지는 가장 최근 N건만 남기고, 오래된 것은 필드만 지운다(메시지는 유지). */
export function limitCoursePreviews(session: ChatSession): ChatSession {
  const indexes = session.messages.flatMap((message, index) => (message.coursePreview ? [index] : []));
  if (indexes.length <= CHAT_LIMITS.maxPreviewsPerSession) return session;
  const drop = new Set(indexes.slice(0, indexes.length - CHAT_LIMITS.maxPreviewsPerSession));
  return { ...session, messages: session.messages.map((message, index) => {
    if (!drop.has(index)) return message;
    const { coursePreview: _removed, ...rest } = message;
    return rest;
  }) };
}

/** 목록 전체가 상한 안에 있고 id가 겹치지 않는지 확인한다. */
export function isChatSessionList(value: unknown): value is ChatSession[] {
  if (!Array.isArray(value) || value.length > CHAT_LIMITS.maxSessions || !value.every(isChatSession)) return false;
  if (new Set(value.map((session) => session.id)).size !== value.length) return false;
  return value.reduce((sum, session) => sum + chatSessionChars(session), 0) <= CHAT_LIMITS.maxTotalChars;
}

/** 상한을 맞춘다: 세션당 메시지 수, 세션 수, 전체 글자 수 순서이며 오래된 것부터 버린다. */
export function enforceChatLimits(sessions: ChatSession[]): ChatSession[] {
  const sorted = [...sessions]
    .map((session) => limitCoursePreviews(session.messages.length > CHAT_LIMITS.maxMessagesPerSession
      ? { ...session, messages: session.messages.slice(-CHAT_LIMITS.maxMessagesPerSession) }
      : session))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, CHAT_LIMITS.maxSessions);
  let total = 0;
  const kept: ChatSession[] = [];
  for (const session of sorted) {
    const size = chatSessionChars(session);
    // 가장 최근 세션은 항상 남긴다. 세션 하나는 상한(60개 × 4,000자)보다 작을 수 없다.
    if (kept.length > 0 && total + size > CHAT_LIMITS.maxTotalChars) continue;
    kept.push(session);
    total += size;
  }
  return kept;
}

/** 두 기기의 목록을 합친다. 같은 id는 더 늦게 바뀐 쪽을 쓰고, 상한은 다시 맞춘다. */
export function mergeChatSessions(current: ChatSession[], incoming: ChatSession[]): ChatSession[] {
  const byId = new Map<string, ChatSession>();
  for (const session of [...current, ...incoming]) {
    const existing = byId.get(session.id);
    if (!existing || Date.parse(session.updatedAt) > Date.parse(existing.updatedAt)) byId.set(session.id, session);
  }
  return enforceChatLimits([...byId.values()]);
}

export function normalizeNewMessage(message: NewChatMessage, now: string): ChatSessionMessage | null {
  const text = clampChatText(message.text).trim();
  if (!text || (message.role !== "user" && message.role !== "assistant")) return null;
  const result: ChatSessionMessage = { role: message.role, text, createdAt: message.createdAt && date(message.createdAt) ? message.createdAt : now };
  if (message.studyResultId && nonEmpty(message.studyResultId, 200)) result.studyResultId = message.studyResultId;
  if (message.question) result.question = message.question.slice(0, 400);
  if (message.conceptName) result.conceptName = message.conceptName.slice(0, 400);
  if (message.learningIntent && isLearningIntent(message.learningIntent)) result.learningIntent = { subject: message.learningIntent.subject.trim() };
  const preview = message.coursePreview === undefined ? null : normalizeCoursePreview(message.coursePreview);
  if (preview) result.coursePreview = preview;
  if (message.setupState && isChatSetupState(message.setupState)) result.setupState = { ...message.setupState, setup: sanitizeCourseSetup(message.setupState.setup), progress: { ...message.setupState.progress, answered: [...message.setupState.progress.answered] } };
  return result;
}

/** tutor-chat `history` 형식으로 바꾼다: 최근 12개, 한 줄 900자 이내. */
export function toTutorHistory(messages: Pick<ChatSessionMessage, "role" | "text">[]): { role: "user" | "assistant"; text: string }[] {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .slice(-CHAT_LIMITS.historyMessages)
    .map((message) => ({ role: message.role, text: message.text.trim().slice(0, CHAT_LIMITS.historyTextLength) }));
}
