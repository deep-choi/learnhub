import type { ChatCoursePreview, ChatSession, NewChatMessage } from "../types/chat";
import {
  clampChatText,
  enforceChatLimits,
  isChatSessionList,
  normalizeCoursePreview,
  normalizeNewMessage,
  titleFromFirstMessage,
} from "../domain/chatSession";
import { LEARNHUB_STORAGE_KEYS, notifyLearningDataChanged } from "./storage";

const newId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `chat-${crypto.randomUUID()}`
    : `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** 저장값이 손상됐거나 상한을 넘으면 읽을 수 있는 세션만 골라 상한에 맞춰 돌려준다. */
const read = (): ChatSession[] => {
  if (typeof localStorage === "undefined") return [];
  let raw: string | null;
  try { raw = localStorage.getItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS); } catch { return []; }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isChatSessionList(parsed)) return parsed;
    if (Array.isArray(parsed)) return enforceChatLimits(parsed.filter((item): item is ChatSession => isChatSessionList([item])));
  } catch { /* 손상된 값은 비어 있는 것으로 보고, 다음 저장에서 덮어씁니다. */ }
  return [];
};

const write = (sessions: ChatSession[]): boolean => {
  try {
    localStorage.setItem(LEARNHUB_STORAGE_KEYS.CHAT_SESSIONS, JSON.stringify(enforceChatLimits(sessions)));
    notifyLearningDataChanged();
    return true;
  } catch (error) {
    console.error("Failed to save chat sessions:", error);
    return false;
  }
};

/** 최근 대화 목록. 최신순(updatedAt 내림차순). */
export function listChatSessions(): ChatSession[] {
  return read().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function getChatSession(id: string): ChatSession | undefined {
  return read().find((session) => session.id === id);
}

/**
 * 첫 질문으로 새 대화를 만든다. 첫 질문은 user 메시지로 이미 들어 있고, 제목은 질문에서 잘라 만든다.
 * 저장하지 못하면 null이다. 이때 화면 상태로는 계속 대화할 수 있다.
 */
export function createChatSession(firstMessage: string): ChatSession | null {
  const now = new Date().toISOString();
  const first = normalizeNewMessage({ role: "user", text: firstMessage }, now);
  if (!first) return null;
  const session: ChatSession = { id: newId(), title: titleFromFirstMessage(firstMessage), createdAt: now, updatedAt: now, messages: [first] };
  return write([session, ...read()]) ? session : null;
}

/** 메시지를 덧붙인다. 세션당 상한을 넘으면 오래된 메시지부터 버린다. 대화가 없거나 저장에 실패하면 null이다. */
export function appendChatMessage(id: string, message: NewChatMessage): ChatSession | null {
  const sessions = read();
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0) return null;
  const now = new Date().toISOString();
  const normalized = normalizeNewMessage(message, now);
  if (!normalized) return null;
  const updated: ChatSession = { ...sessions[index], updatedAt: now, messages: [...sessions[index].messages, normalized] };
  sessions[index] = updated;
  if (!write(sessions)) return null;
  return getChatSession(id) ?? updated;
}

/**
 * 이미 저장된 메시지의 과목 미리보기를 바꾸거나(`null`이면 지운다) 붙인다. `messageIndex`는 `session.messages` 안의 위치다.
 * 형식이 틀리거나 40,000자를 넘으면 아무것도 바꾸지 않고 null을 돌려준다. 세션당 3건 상한은 저장할 때 맞춘다.
 * 다른 기기와 병합될 때 이 변경이 이기도록 updatedAt을 갱신한다.
 */
export function setMessageCoursePreview(id: string, messageIndex: number, preview: ChatCoursePreview | null): ChatSession | null {
  const sessions = read();
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0 || !Number.isInteger(messageIndex)) return null;
  const session = sessions[index];
  const target = session.messages[messageIndex];
  if (!target) return null;
  const normalized = preview === null ? null : normalizeCoursePreview(preview);
  if (preview !== null && !normalized) return null;
  const { coursePreview: _previous, ...withoutPreview } = target;
  const messages = [...session.messages];
  messages[messageIndex] = normalized ? { ...withoutPreview, coursePreview: normalized } : withoutPreview;
  sessions[index] = { ...session, updatedAt: new Date().toISOString(), messages };
  if (!write(sessions)) return null;
  return getChatSession(id) ?? sessions[index];
}

export function renameChatSession(id: string, title: string): boolean {
  const next = titleFromFirstMessage(clampChatText(title));
  if (!title.trim()) return false;
  const sessions = read();
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0) return false;
  sessions[index] = { ...sessions[index], title: next };
  return write(sessions);
}

/** 생성한 과목을 연결해 대화를 다시 열어도 같은 과목에서 이어간다. */
export function setMessageCourseId(id: string, messageIndex: number, courseId: string): boolean {
  if (!courseId.trim() || courseId.length > 200 || !Number.isInteger(messageIndex)) return false;
  const sessions = read();
  const index = sessions.findIndex(session => session.id === id);
  const session = sessions[index];
  if (!session?.messages[messageIndex]) return false;
  const messages = [...session.messages];
  messages[messageIndex] = { ...messages[messageIndex], courseId };
  sessions[index] = { ...session, updatedAt: new Date().toISOString(), messages };
  return write(sessions);
}

export function deleteChatSession(id: string): boolean {
  const sessions = read();
  const remaining = sessions.filter((session) => session.id !== id);
  if (remaining.length === sessions.length) return false;
  return write(remaining);
}
