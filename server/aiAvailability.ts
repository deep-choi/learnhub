import { AI_MODEL_CATALOG, AI_OUTPUT_TOKEN_OPTIONS, DEFAULT_AI_SELECTION, type AiProvider, type AiRuntimeSelection } from "../src/domain/aiModels";

type IsConfigured = (provider: AiProvider) => boolean;

/** 요청에 모델 선택이 없을 때(비로그인 미리보기 포함) 쓰는 기본 모델. 키가 있는 제공자를 고른다. */
export const defaultAiSelectionFor = (isConfigured: IsConfigured): AiRuntimeSelection => {
  if (isConfigured("gemini")) return { ...DEFAULT_AI_SELECTION };
  if (isConfigured("openai")) return { provider: "openai", model: "gpt-5.6-terra", reasoningEffort: "medium", maxOutputTokens: 8_192 };
  return { ...DEFAULT_AI_SELECTION };
};

/**
 * `/api/public-config`의 `ai`: 서버에 키가 설정된 제공자와 그 모델. 비밀 값은 없고 설정 여부만 담는다.
 * 입력바 모델 선택은 `available`인 모델만 보여 준다.
 */
export const publicAiAvailability = (isConfigured: IsConfigured) => ({
  providers: {
    openai: { configured: isConfigured("openai") },
    gemini: { configured: isConfigured("gemini") },
  },
  models: AI_MODEL_CATALOG.map((model) => ({ ...model, reasoningEfforts: [...model.reasoningEfforts], available: isConfigured(model.provider) })),
  outputTokenOptions: [...AI_OUTPUT_TOKEN_OPTIONS],
  defaultSelection: defaultAiSelectionFor(isConfigured),
});
