import { getAiModel, isAiProvider, isAiRuntimeSelection, type AiModelDefinition, type AiRuntimeSelection } from "../domain/aiModels";

export interface AiAvailability {
  providers: Record<"openai" | "gemini", { configured: boolean }>;
  /** 쓸 수 있는 모델만, 이 앱의 카탈로그 정의(지원 추론 단계 포함)로 담는다. */
  models: Array<AiModelDefinition & { available: true }>;
  outputTokenOptions: number[];
  defaultSelection: AiRuntimeSelection;
}

let cached: Promise<AiAvailability | null> | null = null;

const configured = (value: unknown): boolean =>
  !!value && typeof value === "object" && (value as Record<string, unknown>).configured === true;

/**
 * `/api/public-config` 응답에서 `ai`를 읽는다. 형식이 틀리면 null.
 * 서버가 보낸 모델은 id로 카탈로그와 맞춰 보고, 모르는 모델이나 키가 없는 제공자의 모델은 뺀다.
 */
export const parseAiAvailability = (value: unknown): AiAvailability | null => {
  if (!value || typeof value !== "object") return null;
  const ai = (value as Record<string, unknown>).ai as Record<string, unknown> | undefined;
  if (!ai || typeof ai !== "object" || !Array.isArray(ai.models) || !isAiRuntimeSelection(ai.defaultSelection)) return null;
  const rawProviders = ai.providers as Record<string, unknown> | undefined;
  if (!rawProviders || typeof rawProviders !== "object" || !rawProviders.openai || !rawProviders.gemini) return null;
  const providers = { openai: { configured: configured(rawProviders.openai) }, gemini: { configured: configured(rawProviders.gemini) } };
  const seen = new Set<string>();
  const models: AiAvailability["models"] = [];
  for (const item of ai.models) {
    if (!item || typeof item !== "object") continue;
    const { id, provider, available } = item as Record<string, unknown>;
    if (available !== true || !isAiProvider(provider) || typeof id !== "string" || !providers[provider].configured) continue;
    const model = getAiModel(provider, id);
    const key = `${provider}:${id}`;
    if (!model || seen.has(key)) continue;
    seen.add(key);
    models.push({ ...model, reasoningEfforts: [...model.reasoningEfforts], available: true });
  }
  return {
    providers,
    models,
    outputTokenOptions: Array.isArray(ai.outputTokenOptions) ? ai.outputTokenOptions.filter((n): n is number => typeof n === "number") : [],
    defaultSelection: ai.defaultSelection,
  };
};

/**
 * 서버에 키가 설정된 제공자의 모델 목록(`/api/public-config`의 `ai`). 사용할 수 있는 모델만 담고, 실패하면 null이다.
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
