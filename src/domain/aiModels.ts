export type AiProvider = "openai" | "gemini";
export type AiReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AiModelDefinition {
  id: string;
  provider: AiProvider;
  label: string;
  lifecycle: "stable" | "preview";
  reasoningEfforts: AiReasoningEffort[];
  recommendedFor: string;
}

/**
 * Text/JSON models supported by LearnHub's teaching endpoints.
 * Verified against the vendors' official model pages on 2026-09-15.
 * Image, audio, realtime, embedding, and agent-only models are intentionally
 * excluded because the current endpoints require structured text output.
 */
export const AI_MODEL_CATALOG: readonly AiModelDefinition[] = [
  { id: "gpt-6-astra", provider: "openai", label: "GPT-6 Astra", lifecycle: "stable", reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], recommendedFor: "최신 최고 성능의 복잡한 학습 설계와 추론" },
  { id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol", lifecycle: "stable", reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"], recommendedFor: "가장 복잡한 설명과 정밀한 추론" },
  { id: "gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra", lifecycle: "stable", reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"], recommendedFor: "품질과 비용의 균형" },
  { id: "gpt-5.6-luna", provider: "openai", label: "GPT-5.6 Luna", lifecycle: "stable", reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"], recommendedFor: "빠르고 비용 효율적인 반복 학습" },
  { id: "gemini-3.8-flash", provider: "gemini", label: "Gemini 3.8 Flash", lifecycle: "stable", reasoningEfforts: ["low", "medium", "high"], recommendedFor: "최신 Flash 품질과 속도" },
  { id: "gemini-3.7-flash", provider: "gemini", label: "Gemini 3.7 Flash", lifecycle: "stable", reasoningEfforts: ["low", "medium", "high"], recommendedFor: "안정적인 다단계 학습 생성" },
  { id: "gemini-3.6-flash", provider: "gemini", label: "Gemini 3.6 Flash", lifecycle: "stable", reasoningEfforts: ["minimal", "low", "medium", "high"], recommendedFor: "속도와 범용성의 균형" },
  { id: "gemini-3.5-flash", provider: "gemini", label: "Gemini 3.5 Flash", lifecycle: "stable", reasoningEfforts: ["minimal", "low", "medium", "high"], recommendedFor: "일상적인 학습 요청" },
  { id: "gemini-3.5-flash-lite", provider: "gemini", label: "Gemini 3.5 Flash-Lite", lifecycle: "stable", reasoningEfforts: ["minimal", "low", "medium", "high"], recommendedFor: "높은 처리량과 낮은 비용" },
  { id: "gemini-3.1-flash-lite", provider: "gemini", label: "Gemini 3.1 Flash-Lite", lifecycle: "stable", reasoningEfforts: ["minimal", "low", "medium", "high"], recommendedFor: "간단한 질문과 빠른 응답" },
  { id: "gemini-3.1-pro-preview", provider: "gemini", label: "Gemini 3.1 Pro Preview", lifecycle: "preview", reasoningEfforts: ["low", "medium", "high"], recommendedFor: "복잡한 추론 실험" },
  { id: "gemini-3-flash-preview", provider: "gemini", label: "Gemini 3 Flash Preview", lifecycle: "preview", reasoningEfforts: ["minimal", "low", "medium", "high"], recommendedFor: "Gemini 3 preview 호환" },
  { id: "gemini-2.5-pro", provider: "gemini", label: "Gemini 2.5 Pro", lifecycle: "stable", reasoningEfforts: ["low", "medium", "high"], recommendedFor: "2.5 계열 고난도 추론" },
  { id: "gemini-2.5-flash", provider: "gemini", label: "Gemini 2.5 Flash", lifecycle: "stable", reasoningEfforts: ["none", "low", "medium", "high"], recommendedFor: "thinking budget 호환 작업" },
  { id: "gemini-2.5-flash-lite", provider: "gemini", label: "Gemini 2.5 Flash-Lite", lifecycle: "stable", reasoningEfforts: ["none", "low", "medium", "high"], recommendedFor: "2.5 계열 저비용 작업" },
] as const;

export const AI_OUTPUT_TOKEN_OPTIONS = [4_096, 8_192, 16_384] as const;

export interface AiRuntimeSelection {
  provider: AiProvider;
  model: string;
  reasoningEffort: AiReasoningEffort;
  maxOutputTokens: number;
}

export const DEFAULT_AI_SELECTION: AiRuntimeSelection = {
  provider: "gemini",
  model: "gemini-3.8-flash",
  reasoningEffort: "medium",
  maxOutputTokens: 8_192,
};

export const getAiModel = (provider: AiProvider, model: string): AiModelDefinition | null =>
  AI_MODEL_CATALOG.find((candidate) => candidate.provider === provider && candidate.id === model) || null;

export const isAiProvider = (value: unknown): value is AiProvider => value === "openai" || value === "gemini";

export const isAiReasoningEffort = (value: unknown): value is AiReasoningEffort =>
  value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max";

export const isAiRuntimeSelection = (value: unknown): value is AiRuntimeSelection => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!isAiProvider(candidate.provider) || typeof candidate.model !== "string" || !isAiReasoningEffort(candidate.reasoningEffort)) return false;
  const model = getAiModel(candidate.provider, candidate.model);
  return Boolean(
    model &&
    model.reasoningEfforts.includes(candidate.reasoningEffort) &&
    typeof candidate.maxOutputTokens === "number" &&
    AI_OUTPUT_TOKEN_OPTIONS.includes(candidate.maxOutputTokens as (typeof AI_OUTPUT_TOKEN_OPTIONS)[number]),
  );
};

export const normalizeAiSelection = (value: unknown): AiRuntimeSelection => {
  if (isAiRuntimeSelection(value)) return { ...value };
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
