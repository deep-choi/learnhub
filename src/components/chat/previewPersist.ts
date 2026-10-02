import { validateCurriculumPayload } from "../../domain/contentValidation";
import type { ChatCoursePreview } from "../../types/chat";
import { unwrapCurriculum } from "../graph/courseFromPayload";

/** 저장된 미리보기 결과를 카드가 바로 그려도 되는지: 커리큘럼 형식과 검증을 통과해야 합니다. 아니면 새로 만듭니다. */
export const isUsablePreviewData = (data: unknown): data is Record<string, any> => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const curriculum = unwrapCurriculum(data);
  return Boolean(curriculum) && validateCurriculumPayload(curriculum as Record<string, any>).length === 0;
};

/**
 * 미리보기 안내 메시지가 저장된 대화에서 몇 번째인지 찾습니다. 저장하지 않은 메시지(오류 안내 등)나 오래된 메시지 정리로
 * 화면 위치와 저장 위치가 어긋날 수 있어서, 글과 주제가 같은 가장 최근 메시지를 씁니다.
 */
export const findPreviewMessageIndex = (
  messages: Array<{ role: string; text: string; learningIntent?: { subject: string } }>,
  text: string,
  subject: string,
): number => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "assistant" && message.text === text && message.learningIntent?.subject === subject) return i;
  }
  return -1;
};

export const toChatCoursePreview = (subject: string, data: Record<string, unknown>, setup: ChatCoursePreview["setup"]): ChatCoursePreview => ({ subject, data, ...(setup ? { setup } : {}) });
