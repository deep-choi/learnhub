export type AiProvider = "anthropic" | "openai" | "gemini";
export type AiReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AiModelDefinition {
  id: string;
  provider: AiProvider;
  label: string;
  lifecycle: "stable" | "preview";
  /** 비용 때문에 목록에 '준비 중'으로만 보이고 고를 수 없는 모델. */
  preparing?: boolean;
  reasoningEfforts: AiReasoningEffort[];
  recommendedFor: string;
}

/**
 * Text/JSON models supported by LearnHub's teaching endpoints.
 * Verified against the vendors' official model pages on 2026-09-15 (Claude models on 2026-10-02, GPT-6.1 Sol, GPT-6 Luna and Gemini 4 Argon on 2026-10-22).
 * Claude IDs are the exact API aliases; never append date suffixes.
 * Image, audio, realtime, embedding, and agent-only models are intentionally
 * excluded because the current endpoints require structured text output.
 */
export const AI_MODEL_CATALOG: readonly AiModelDefinition[] = [
  { id: "claude-opus-5-5", provider: "anthropic", label: "Claude Opus 5.5", lifecycle: "stable", reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], recommendedFor: "가장 깊이 있는 설명과 복잡한 추론" },
  { id: "claude-sonnet-5-5", provider: "anthropic", label: "Claude Sonnet 5.5", lifecycle: "stable", reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], recommendedFor: "품질과 속도의 균형" },
  { id: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5", lifecycle: "stable", reasoningEfforts: ["none", "low", "medium", "high"], recommendedFor: "빠르고 가벼운 반복 학습" },
  { id: "gpt-6-astra", provider: "openai", label: "GPT-6 Astra", lifecycle: "stable", preparing: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], recommendedFor: "최신 최고 성능의 복잡한 학습 설계와 추론" },
  { id: "gpt-6.1-sol", provider: "openai", label: "GPT-6.1 Sol", lifecycle: "stable", reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], recommendedFor: "Astra에 가까운 품질을 더 낮은 비용으로" },
  { id: "gpt-6-luna", provider: "openai", label: "GPT-6 Luna", lifecycle: "stable", reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"], recommendedFor: "빠르고 저렴한 반복 학습" },
  { id: "gemini-4-argon", provider: "gemini", label: "Gemini 4 Argon", lifecycle: "stable", preparing: true, reasoningEfforts: ["low", "medium", "high"], recommendedFor: "최신 최고 성능의 깊은 추론" },
  { id: "gemini-3.8-flash", provider: "gemini", label: "Gemini 3.8 Flash", lifecycle: "stable", reasoningEfforts: ["low", "medium", "high"], recommendedFor: "최신 Flash 품질과 속도" },
  { id: "gemini-3.1-pro-preview", provider: "gemini", label: "Gemini 3.1 Pro Preview", lifecycle: "preview", reasoningEfforts: ["low", "medium", "high"], recommendedFor: "복잡한 추론" },
] as const;

export const AI_OUTPUT_TOKEN_OPTIONS = [4_096, 8_192, 16_384] as const;

export interface AiRuntimeSelection {
  provider: AiProvider;
  model: string;
  reasoningEffort: AiReasoningEffort;
  maxOutputTokens: number;
}

export const DEFAULT_AI_SELECTION: AiRuntimeSelection = {
  provider: "openai",
  model: "gpt-6-luna",
  reasoningEffort: "medium",
  maxOutputTokens: 8_192,
};

/** 서버에 OpenAI 키가 없고 Gemini 키만 있을 때 쓰는 기본 모델. */
export const DEFAULT_GEMINI_SELECTION: AiRuntimeSelection = {
  provider: "gemini",
  model: "gemini-3.8-flash",
  reasoningEffort: "medium",
  maxOutputTokens: 8_192,
};

/**
 * 목록에서 뺐거나 '준비 중'으로 막아 둔 모델 → 대신 쓸 모델.
 * 저장해 둔 선택이나 예전 화면의 요청이 오류 없이 이어지게 합니다.
 */
export const AI_MODEL_REPLACEMENTS: Readonly<Record<string, string>> = {
  "gpt-6-astra": "gpt-6.1-sol",
  "gpt-6-sol": "gpt-6.1-sol",
  "gpt-5.6-sol": "gpt-6.1-sol",
  "gpt-5.6-terra": "gpt-6-luna",
  "gpt-5.6-luna": "gpt-6-luna",
  "gemini-4-argon": "gemini-3.1-pro-preview",
  "gemini-2.5-pro": "gemini-3.1-pro-preview",
  "gemini-3.7-flash": "gemini-3.8-flash",
  "gemini-3.6-flash": "gemini-3.8-flash",
  "gemini-3.5-flash": "gemini-3.8-flash",
  "gemini-3.5-flash-lite": "gemini-3.8-flash",
  "gemini-3.1-flash-lite": "gemini-3.8-flash",
  "gemini-3-flash-preview": "gemini-3.8-flash",
  "gemini-2.5-flash": "gemini-3.8-flash",
  "gemini-2.5-flash-lite": "gemini-3.8-flash",
};

export const getAiModel = (provider: AiProvider, model: string): AiModelDefinition | null =>
  AI_MODEL_CATALOG.find((candidate) => candidate.provider === provider && candidate.id === model) || null;

export const isAiProvider = (value: unknown): value is AiProvider => value === "anthropic" || value === "openai" || value === "gemini";

/** 모델 목록에서 제공자를 보여 주는 순서와 이름. */
export const AI_PROVIDER_ORDER: readonly AiProvider[] = ["anthropic", "openai", "gemini"];
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = { anthropic: "Claude", openai: "GPT", gemini: "Gemini" };

/** 모델을 제공자별로 묶는다. 순서는 Claude → GPT → Gemini이고, 각 묶음 안에서는 받은 순서를 지킨다. */
export const groupModelsByProvider = <T extends { provider: AiProvider }>(models: readonly T[]): Array<{ provider: AiProvider; models: T[] }> =>
  AI_PROVIDER_ORDER.map((provider) => ({ provider, models: models.filter((model) => model.provider === provider) }))
    .filter((group) => group.models.length > 0);

export const isAiReasoningEffort = (value: unknown): value is AiReasoningEffort =>
  value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max";

export const isAiRuntimeSelection = (value: unknown): value is AiRuntimeSelection => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!isAiProvider(candidate.provider) || typeof candidate.model !== "string" || !isAiReasoningEffort(candidate.reasoningEffort)) return false;
  const model = getAiModel(candidate.provider, candidate.model);
  return Boolean(
    model &&
    !model.preparing &&
    model.reasoningEfforts.includes(candidate.reasoningEffort) &&
    typeof candidate.maxOutputTokens === "number" &&
    AI_OUTPUT_TOKEN_OPTIONS.includes(candidate.maxOutputTokens as (typeof AI_OUTPUT_TOKEN_OPTIONS)[number]),
  );
};

/** 뺐거나 막아 둔 모델을 고른 선택은 대신 쓸 모델로 옮기고, 그 모델이 지원하는 가장 가까운 추론 단계로 맞춥니다. */
export const migrateAiSelection = (value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  const replacement = typeof candidate.model === "string" ? AI_MODEL_REPLACEMENTS[candidate.model] : undefined;
  const model = replacement && isAiProvider(candidate.provider) ? getAiModel(candidate.provider, replacement) : null;
  if (!model) return value;
  const reasoningEffort = isAiReasoningEffort(candidate.reasoningEffort) ? nearestReasoningEffort(candidate.reasoningEffort, model.reasoningEfforts) : candidate.reasoningEffort;
  return { ...candidate, model: model.id, reasoningEffort };
};

export const normalizeAiSelection = (value: unknown): AiRuntimeSelection => {
  const migrated = migrateAiSelection(value);
  if (isAiRuntimeSelection(migrated)) return { ...migrated };
  return { ...DEFAULT_AI_SELECTION };
};

export const REASONING_EFFORT_LABELS: Record<AiReasoningEffort, string> = {
  none: "끄기",
  minimal: "최소",
  low: "낮음",
  medium: "중간",
  high: "높음",
  xhigh: "매우 높음",
  max: "최대",
};

const EFFORT_ORDER: readonly AiReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/** 모델이 지원하는 단계를 낮은 것부터 정렬한다. 슬라이더 눈금 순서다. */
export const sortReasoningEfforts = (efforts: readonly AiReasoningEffort[]): AiReasoningEffort[] =>
  [...efforts].sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b));

/** "높음" 이상이면 답이 느려지고 하루 사용량을 더 쓴다는 안내를 보여 준다. */
export const isCostlyReasoningEffort = (effort: AiReasoningEffort): boolean =>
  EFFORT_ORDER.indexOf(effort) >= EFFORT_ORDER.indexOf("high");

/** 지원하는 단계 중 `effort`에 가장 가까운 것(같은 거리면 낮은 쪽). 지원 목록이 비면 그대로 돌려준다. */
export const nearestReasoningEffort = (effort: AiReasoningEffort, supported: readonly AiReasoningEffort[]): AiReasoningEffort => {
  if (supported.includes(effort) || supported.length === 0) return effort;
  const target = EFFORT_ORDER.indexOf(effort);
  return [...supported].sort((a, b) => {
    const da = Math.abs(EFFORT_ORDER.indexOf(a) - target);
    const db = Math.abs(EFFORT_ORDER.indexOf(b) - target);
    return da - db || EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b);
  })[0];
};

/** 모델을 바꿀 때의 새 선택. 지금 추론 단계를 지원하지 않으면 가장 가까운 지원 단계로 맞춘다. 알 수 없는 모델이면 null. */
export const selectionForModel = (current: AiRuntimeSelection, provider: AiProvider, modelId: string): AiRuntimeSelection | null => {
  const model = getAiModel(provider, modelId);
  if (!model) return null;
  return { ...current, provider, model: model.id, reasoningEffort: nearestReasoningEffort(current.reasoningEffort, model.reasoningEfforts) };
};
