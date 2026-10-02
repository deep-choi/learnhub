/** 로그인 전에 본 지도 미리보기를 로그인 뒤(리다이렉트 포함)에도 같은 결과로 이어 쓰기 위한 임시 보관입니다. */
export interface PendingPreview {
  subject: string;
  /** /api/ai/preview-course 응답 그대로 */
  data: Record<string, any>;
  /** 미리보기를 만들 때 대화로 정한 수준·목적·하루 시간 */
  setup?: Record<string, any>;
  savedAt: number;
}

const KEY = "learnhub_pending_preview_v1";
const MAX_AGE_MS = 60 * 60 * 1000;

export const savePendingPreview = (subject: string, data: Record<string, any>, setup?: Record<string, any>): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ subject, data, setup, savedAt: Date.now() } satisfies PendingPreview));
  } catch {
    // 저장하지 못하면 로그인 뒤 일반 과목 만들기로 이어집니다.
  }
};

export const readPendingPreview = (): PendingPreview | null => {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!value || typeof value.subject !== "string" || !value.data || typeof value.savedAt !== "number") return null;
    if (Date.now() - value.savedAt > MAX_AGE_MS) return null;
    return value as PendingPreview;
  } catch {
    return null;
  }
};

export const clearPendingPreview = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 이미 없거나 접근할 수 없으면 무시합니다.
  }
};
