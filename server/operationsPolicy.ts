import { AI_MODEL_CATALOG } from "../src/domain/aiModels";
import type { OperationsSettings } from "../src/types/admin";

export class OperationsError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
const positive = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};
export const defaultOperationsSettings = (): OperationsSettings => ({
  revision: 0, aiPaused: false, limitsEnabled: process.env.AI_USAGE_LIMITS_ENABLED?.trim().toLowerCase() !== "false",
  requestLimit: positive("AI_REQUESTS_PER_USER_PER_DAY", 100),
  outputTokenLimit: positive("AI_RESERVED_OUTPUT_TOKENS_PER_USER_PER_DAY", 100_000),
  globalRequestLimit: positive("AI_GLOBAL_REQUESTS_PER_DAY", 10_000),
  globalOutputTokenLimit: positive("AI_GLOBAL_RESERVED_OUTPUT_TOKENS_PER_DAY", 1_000_000),
  disabledModels: [],
});
export const validateOperationsSettings = (body: unknown): OperationsSettings => {
  const invalid = () => { throw new OperationsError(400, "INVALID_SETTINGS", "운영 설정 값을 확인해 주세요."); };
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalid();
  const settings = body as OperationsSettings;
  const keys = Object.keys(defaultOperationsSettings());
  if (Object.keys(body).length !== keys.length || Object.keys(body).some(key => !keys.includes(key)) ||
    !Number.isSafeInteger(settings.revision) || settings.revision < 0 || typeof settings.aiPaused !== "boolean" ||
    typeof settings.limitsEnabled !== "boolean") return invalid();
  for (const key of ["requestLimit", "outputTokenLimit", "globalRequestLimit", "globalOutputTokenLimit"] as const) {
    if (!Number.isSafeInteger(settings[key]) || settings[key] < 1 || settings[key] > 1_000_000_000) return invalid();
  }
  if (!Array.isArray(settings.disabledModels) || settings.disabledModels.length > AI_MODEL_CATALOG.length ||
    settings.disabledModels.some(id => typeof id !== "string" || !AI_MODEL_CATALOG.some(model => model.id === id)) ||
    new Set(settings.disabledModels).size !== settings.disabledModels.length) return invalid();
  return { ...settings, disabledModels: [...settings.disabledModels] };
};
export const enforceOperationsPolicy = (settings: OperationsSettings, model: string, blocked = false) => {
  if (settings.aiPaused) throw new OperationsError(503, "AI_PAUSED", "AI 수업 생성을 잠시 쉬고 있어요. 기존 수업과 기록은 계속 볼 수 있습니다.");
  if (blocked) throw new OperationsError(403, "AI_ACCOUNT_RESTRICTED", "이 계정의 AI 이용이 제한되어 있습니다. 운영자에게 문의해 주세요.");
  if (settings.disabledModels.includes(model)) throw new OperationsError(503, "AI_MODEL_DISABLED", "운영자가 이 모델의 사용을 중지했습니다. 다른 모델을 선택해 주세요.");
};
export const reserveGlobalAiUsage = (settings: OperationsSettings, current: { admittedRequests?: unknown; reservedOutputTokens?: unknown }, tokens: number) => {
  const requests = current.admittedRequests ?? 0;
  const reservedOutputTokens = current.reservedOutputTokens ?? 0;
  if (!Number.isSafeInteger(requests) || Number(requests) < 0 || !Number.isSafeInteger(reservedOutputTokens) || Number(reservedOutputTokens) < 0 ||
    !Number.isSafeInteger(tokens) || tokens < 1 || !Number.isSafeInteger(Number(reservedOutputTokens) + tokens) || !Number.isSafeInteger(Number(requests) + 1)) {
    throw new OperationsError(503, "AI_USAGE_INVALID", "AI 사용량을 확인하지 못했습니다.");
  }
  if (settings.limitsEnabled && (Number(requests) + 1 > settings.globalRequestLimit || Number(reservedOutputTokens) + tokens > settings.globalOutputTokenLimit)) {
    throw new OperationsError(429, "AI_GLOBAL_QUOTA_EXCEEDED", "오늘의 전체 AI 이용 한도에 도달했습니다. 잠시 후 다시 이용해 주세요.");
  }
  return { admittedRequests: Number(requests) + 1, reservedOutputTokens: Number(reservedOutputTokens) + tokens };
};
export const validDocumentId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128 && !/[\x00-\x1f/]/u.test(value) && value !== "." && value !== "..";
