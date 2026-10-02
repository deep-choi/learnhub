import type { ChatSession, NewChatMessage } from "../types/chat";
import {
  clampChatText,
  enforceChatLimits,
  isChatSessionList,
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

export function renameChatSession(id: string, title: string): boolean {
  const next = titleFromFirstMessage(clampChatText(title));
  if (!title.trim()) return false;
  const sessions = read();
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0) return false;
  sessions[index] = { ...sessions[index], title: next };
  return write(sessions);
}

export function deleteChatSession(id: string): boolean {
  const sessions = read();
  const remaining = sessions.filter((session) => session.id !== id);
  if (remaining.length === sessions.length) return false;
  return write(remaining);
}
