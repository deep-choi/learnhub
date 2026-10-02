import { AI_MODEL_CATALOG, AI_OUTPUT_TOKEN_OPTIONS, DEFAULT_AI_SELECTION, type AiProvider, type AiRuntimeSelection } from "../src/domain/aiModels";

type IsConfigured = (provider: AiProvider) => boolean;

/** 요청에 모델 선택이 없을 때(비로그인 미리보기 포함) 쓰는 기본 모델. 키가 있는 제공자를 고른다. Gemini가 있으면 Gemini다. */
export const defaultAiSelectionFor = (isConfigured: IsConfigured): AiRuntimeSelection => {
  if (isConfigured("gemini")) return { ...DEFAULT_AI_SELECTION };
  if (isConfigured("openai")) return { provider: "openai", model: "gpt-5.6-terra", reasoningEffort: "medium", maxOutputTokens: 8_192 };
  if (isConfigured("anthropic")) return { provider: "anthropic", model: "claude-sonnet-5-5", reasoningEffort: "medium", maxOutputTokens: 8_192 };
  return { ...DEFAULT_AI_SELECTION };
};

/**
 * 저장된 선택이 키가 없는 제공자(입력바에 "준비 중"으로 보이는 모델)를 가리키면 기본 모델로 바꾼다.
 * 사용자가 고른 출력 한도는 그대로 둔다.
 */
export const configuredSelectionOrDefault = (selection: AiRuntimeSelection, isConfigured: IsConfigured): AiRuntimeSelection =>
  isConfigured(selection.provider)
    ? selection
    : { ...defaultAiSelectionFor(isConfigured), maxOutputTokens: selection.maxOutputTokens };

/**
 * `/api/public-config`의 `ai`: 서버에 키가 설정된 제공자와 그 모델. 비밀 값은 없고 설정 여부만 담는다.
 * 모든 제공자의 모델을 보내고, 키가 없는 제공자의 모델은 `available: false`로 표시한다(입력바에서 "준비 중").
 */
export const publicAiAvailability = (isConfigured: IsConfigured) => ({
  providers: {
    anthropic: { configured: isConfigured("anthropic") },
    openai: { configured: isConfigured("openai") },
    gemini: { configured: isConfigured("gemini") },
  },
  models: AI_MODEL_CATALOG.map((model) => ({ ...model, reasoningEfforts: [...model.reasoningEfforts], available: isConfigured(model.provider) })),
  outputTokenOptions: [...AI_OUTPUT_TOKEN_OPTIONS],
  defaultSelection: defaultAiSelectionFor(isConfigured),
});
