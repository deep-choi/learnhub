/** 새로고침해도 보던 대화로 돌아오도록, 지금 열린 대화 id를 이 탭에만 기억합니다. */
const KEY = "learnhub_active_chat_v1";

export const readActiveChatId = (): string | null => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const writeActiveChatId = (id: string | null): void => {
  try {
    if (id) sessionStorage.setItem(KEY, id);
    else sessionStorage.removeItem(KEY);
  } catch {
    // 저장할 수 없으면 새로고침 때 첫 화면으로 돌아갑니다.
  }
};
