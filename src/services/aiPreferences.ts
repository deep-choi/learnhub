import {
  DEFAULT_AI_SELECTION,
  normalizeAiSelection,
  type AiProvider,
  type AiRuntimeSelection,
} from "../domain/aiModels";
import { notifyLearningDataChanged } from "./storage";

export const AI_PREFERENCES_STORAGE_KEY = "learnhub_ai_preferences_v1";

export interface AiQuotaSnapshot {
  limits: {
    enabled?: boolean;
    requestsPerMinute: number;
    requestsPerDay: number;
    reservedOutputTokensPerDay: number;
    globalRequestsPerDay: number;
    globalReservedOutputTokensPerDay: number;
  };
  usage: {
    day: string;
    requestsToday: number;
    reservedOutputTokensToday: number;
    remainingRequestsToday: number;
    remainingReservedOutputTokensToday: number;
  };
}

export interface AiPublicConfiguration extends AiQuotaSnapshot {
  /** Claude를 모르는 이전 서버는 `anthropic`을 보내지 않는다. */
  providers: Partial<Record<AiProvider, { configured: boolean }>>;
  models: Array<{
    id: string;
    provider: AiProvider;
    label: string;
    lifecycle: "stable" | "preview";
    reasoningEfforts: AiRuntimeSelection["reasoningEffort"][];
    recommendedFor: string;
    available: boolean;
  }>;
  outputTokenOptions: number[];
}

export const getAiPreferences = (): AiRuntimeSelection => {
  try {
    const raw = localStorage.getItem(AI_PREFERENCES_STORAGE_KEY);
    return raw ? normalizeAiSelection(JSON.parse(raw)) : { ...DEFAULT_AI_SELECTION };
  } catch {
    return { ...DEFAULT_AI_SELECTION };
  }
};

export const saveAiPreferences = (selection: AiRuntimeSelection): boolean => {
  const normalized = normalizeAiSelection(selection);
  if (JSON.stringify(normalized) !== JSON.stringify(selection)) return false;
  try {
    localStorage.setItem(AI_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
    notifyLearningDataChanged();
    return true;
  } catch {
    return false;
  }
};

export const applyAiPreferenceHeaders = (headers: Headers): Headers => {
  const preference = getAiPreferences();
  headers.set("x-learnhub-ai-provider", preference.provider);
  headers.set("x-learnhub-ai-model", preference.model);
  headers.set("x-learnhub-ai-reasoning", preference.reasoningEffort);
  headers.set("x-learnhub-ai-max-output-tokens", String(preference.maxOutputTokens));
  return headers;
};
