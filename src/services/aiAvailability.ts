import { isAiRuntimeSelection, type AiModelDefinition, type AiRuntimeSelection } from "../domain/aiModels";

export interface AiAvailability {
  providers: Record<"openai" | "gemini", { configured: boolean }>;
  models: Array<AiModelDefinition & { available: boolean }>;
  outputTokenOptions: number[];
  defaultSelection: AiRuntimeSelection;
}

let cached: Promise<AiAvailability | null> | null = null;

const parse = (value: unknown): AiAvailability | null => {
  if (!value || typeof value !== "object") return null;
  const ai = (value as Record<string, unknown>).ai as Record<string, unknown> | undefined;
  if (!ai || !Array.isArray(ai.models) || !isAiRuntimeSelection(ai.defaultSelection)) return null;
  const providers = ai.providers as AiAvailability["providers"] | undefined;
  if (!providers?.openai || !providers?.gemini) return null;
  const models = ai.models.filter((model): model is AiAvailability["models"][number] =>
    !!model && typeof model === "object" && typeof (model as Record<string, unknown>).id === "string" && (model as Record<string, unknown>).available === true);
  return { providers, models, outputTokenOptions: Array.isArray(ai.outputTokenOptions) ? ai.outputTokenOptions.filter((n): n is number => typeof n === "number") : [], defaultSelection: ai.defaultSelection };
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
        return parse(await response.json());
      } catch { return null; }
    })().then((result) => { if (!result) cached = null; return result; });
  }
  return cached;
}
