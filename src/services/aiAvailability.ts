import {
  AI_MODEL_CATALOG,
  AI_PROVIDER_ORDER,
  isAiProvider,
  isAiRuntimeSelection,
  type AiModelDefinition,
  type AiProvider,
  type AiRuntimeSelection,
} from "../domain/aiModels";

export interface AiAvailability {
  providers: Record<AiProvider, { configured: boolean }>;
  /**
   * 이 앱 카탈로그의 모든 모델(지원 추론 단계 포함)을 Claude → GPT → Gemini 순서로 담는다.
   * 서버에 키가 없는 제공자의 모델은 `available: false`이며 입력바에서 "준비 중"으로 보인다.
   */
  models: Array<AiModelDefinition & { available: boolean }>;
  outputTokenOptions: number[];
  defaultSelection: AiRuntimeSelection;
}

let cached: Promise<AiAvailability | null> | null = null;

const configured = (value: unknown): boolean =>
  !!value && typeof value === "object" && (value as Record<string, unknown>).configured === true;

/**
 * `/api/public-config` 응답에서 `ai`를 읽는다. 형식이 틀리면 null.
 * 모델은 카탈로그를 기준으로 만들고, 서버가 `available: true`로 보낸 모델 중 키가 설정된 제공자의 것만 쓸 수 있다고 표시한다.
 * Claude를 모르는 이전 서버의 응답이면 Claude는 키가 없는 것으로 본다.
 */
export const parseAiAvailability = (value: unknown): AiAvailability | null => {
  if (!value || typeof value !== "object") return null;
  const ai = (value as Record<string, unknown>).ai as Record<string, unknown> | undefined;
  if (!ai || typeof ai !== "object" || !Array.isArray(ai.models) || !isAiRuntimeSelection(ai.defaultSelection)) return null;
  const rawProviders = ai.providers as Record<string, unknown> | undefined;
  if (!rawProviders || typeof rawProviders !== "object" || !rawProviders.openai || !rawProviders.gemini) return null;
  const providers = Object.fromEntries(AI_PROVIDER_ORDER.map((provider) => [provider, { configured: configured(rawProviders[provider]) }])) as AiAvailability["providers"];
  const availableKeys = new Set<string>();
  for (const item of ai.models) {
    if (!item || typeof item !== "object") continue;
    const { id, provider, available } = item as Record<string, unknown>;
    if (available !== true || !isAiProvider(provider) || typeof id !== "string" || !providers[provider].configured) continue;
    availableKeys.add(`${provider}:${id}`);
  }
  const models = AI_PROVIDER_ORDER.flatMap((provider) => AI_MODEL_CATALOG.filter((model) => model.provider === provider))
    .map((model) => ({ ...model, reasoningEfforts: [...model.reasoningEfforts], available: availableKeys.has(`${model.provider}:${model.id}`) }));
  return {
    providers,
    models,
    outputTokenOptions: Array.isArray(ai.outputTokenOptions) ? ai.outputTokenOptions.filter((n): n is number => typeof n === "number") : [],
    defaultSelection: ai.defaultSelection,
  };
};

/**
 * 서버에 키가 설정된 제공자와 모델 목록(`/api/public-config`의 `ai`). 실패하면 null이다.
 * 한 번 성공한 결과는 이 탭에서 재사용한다.
 */
export function fetchAiAvailability(fetchImpl: typeof fetch = fetch): Promise<AiAvailability | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const response = await fetchImpl("/api/public-config", { headers: { Accept: "application/json" } });
        if (!response.ok) return null;
        return parseAiAvailability(await response.json());
      } catch { return null; }
    })().then((result) => { if (!result) cached = null; return result; });
  }
  return cached;
}

/** 테스트용: 캐시를 비운다. */
export const resetAiAvailabilityCache = (): void => { cached = null; };
