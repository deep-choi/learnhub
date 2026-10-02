/** 로그인 전에 입력한 첫 메시지를 로그인 뒤(리다이렉트 포함)에도 이어 쓰기 위한 임시 보관입니다. */
const KEY = "learnhub_pending_chat_v1";
const MAX_AGE_MS = 60 * 60 * 1000;

export const savePendingChat = (text: string): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ text, savedAt: Date.now() }));
  } catch {
    // 저장하지 못하면 로그인 뒤 다시 입력하면 됩니다.
  }
};

export const takePendingChat = (): string => {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
    if (!value || typeof value.text !== "string" || typeof value.savedAt !== "number") return "";
    return Date.now() - value.savedAt > MAX_AGE_MS ? "" : value.text;
  } catch {
    return "";
  }
};
