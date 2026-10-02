import Anthropic from "@anthropic-ai/sdk";
import type { AiReasoningEffort } from "../src/domain/aiModels";

/**
 * Anthropic Claude provider for the AI gateway.
 * Only the gateway calls this module; it never runs in the browser and the API key stays server-side.
 */

/** Server-side refusal fallback, `fallbacks: "default"` form. The header must be exactly this for that form. */
export const ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Haiku 4.5 takes a fixed thinking budget instead of `effort`. Each budget is ≥ 1024 and below max_tokens. */
export const HAIKU_THINKING_BUDGETS: Partial<Record<AiReasoningEffort, number>> = { low: 2_048, medium: 4_096, high: 8_192 };

type ClaudeEffort = NonNullable<Anthropic.OutputConfig["effort"]>;
type JsonSchema = Record<string, unknown>;

const GEMINI_TYPES: Record<string, string> = {
  STRING: "string",
  NUMBER: "number",
  INTEGER: "integer",
  BOOLEAN: "boolean",
  ARRAY: "array",
  OBJECT: "object",
  NULL: "null",
};

/**
 * Converts the endpoints' Gemini `Type.*` response schema into standard JSON Schema for Claude structured outputs:
 * lowercase types, `properties`/`items`/`required`/`enum` kept, and `additionalProperties: false` on every object.
 */
export const toClaudeJsonSchema = (input: unknown): JsonSchema => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const output: JsonSchema = {};
  const type = typeof source.type === "string" ? GEMINI_TYPES[source.type.toUpperCase()] : undefined;
  if (type) output.type = type;
  if (typeof source.description === "string") output.description = source.description;
  if (Array.isArray(source.enum)) output.enum = [...source.enum];
  if (source.items) output.items = toClaudeJsonSchema(source.items);
  const properties = source.properties && typeof source.properties === "object" && !Array.isArray(source.properties)
    ? source.properties as Record<string, unknown>
    : null;
  if (properties) output.properties = Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, toClaudeJsonSchema(value)]));
  if (Array.isArray(source.required)) output.required = [...source.required];
  if (type === "object" || properties) output.additionalProperties = false;
  return output;
};

export interface ClaudeRequestPlan {
  /** `max_tokens` sent to the API. Includes Haiku's thinking budget on top of the endpoint's output limit. */
  maxTokens: number;
  /** `output_config.effort`. Omitted for Haiku 4.5, which does not accept it. */
  effort?: ClaudeEffort;
  /** Only Haiku 4.5 sends `thinking`; Opus/Sonnet 5.5 think adaptively and reject an explicit disable or budget. */
  thinking?: { type: "enabled"; budget_tokens: number };
  /** Opus/Sonnet 5.5 opt into server-side refusal fallback. */
  fallbacks: boolean;
}

const BUDGET_THINKING_MODELS = new Set(["claude-haiku-4-5"]);
const CLAUDE_EFFORTS: readonly ClaudeEffort[] = ["low", "medium", "high", "xhigh", "max"];

/** How the selected reasoning step maps onto one Claude request. Pure; the gateway validates the model first. */
export const claudeRequestPlan = (model: string, effort: AiReasoningEffort, maxOutputTokens: number): ClaudeRequestPlan => {
  if (BUDGET_THINKING_MODELS.has(model)) {
    const budget = HAIKU_THINKING_BUDGETS[effort];
    return budget
      ? { maxTokens: budget + maxOutputTokens, thinking: { type: "enabled", budget_tokens: budget }, fallbacks: false }
      : { maxTokens: maxOutputTokens, fallbacks: false };
  }
  // Always send effort explicitly: Opus 5.5 defaults to `medium`, Sonnet 5.5 to `high`.
  const claudeEffort = (CLAUDE_EFFORTS as readonly string[]).includes(effort) ? effort as ClaudeEffort : "low";
  return { maxTokens: maxOutputTokens, effort: claudeEffort, fallbacks: true };
};

export interface ClaudeJsonRequest {
  model: string;
  reasoningEffort: AiReasoningEffort;
  system?: string;
  prompt: string;
  /** Gemini `Type.*` schema from the endpoint, converted with `toClaudeJsonSchema`. */
  responseSchema?: unknown;
  maxOutputTokens: number;
}

/** Request body for `messages.create` / `beta.messages.create`. No prefill, temperature or top_p. */
export const buildClaudeParams = (request: ClaudeJsonRequest) => {
  const plan = claudeRequestPlan(request.model, request.reasoningEffort, request.maxOutputTokens);
  const schema = request.responseSchema ? toClaudeJsonSchema(request.responseSchema) : null;
  const outputConfig: Anthropic.OutputConfig = {
    ...(plan.effort ? { effort: plan.effort } : {}),
    ...(schema ? { format: { type: "json_schema" as const, schema } } : {}),
  };
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: request.model,
    max_tokens: plan.maxTokens,
    ...(request.system ? { system: request.system } : {}),
    messages: [{ role: "user", content: request.prompt }],
    ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    ...(plan.thinking ? { thinking: plan.thinking } : {}),
  };
  return { plan, params };
};

/** The subset of the SDK client the gateway uses. Tests pass a mock with the same shape. */
export interface AnthropicClientLike {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming, options?: Anthropic.RequestOptions): PromiseLike<Anthropic.Message>;
  };
  beta: {
    messages: {
      create(params: Anthropic.Beta.MessageCreateParamsNonStreaming, options?: Anthropic.RequestOptions): PromiseLike<Anthropic.Beta.BetaMessage>;
    };
  };
}

/** Created only when ANTHROPIC_API_KEY exists. One attempt, same timeout as the other providers. */
export const createAnthropicClient = (apiKey: string, timeoutMs: number): AnthropicClientLike =>
  new Anthropic({ apiKey, authToken: null, timeout: timeoutMs, maxRetries: 0, defaultHeaders: { "User-Agent": "learnhub-server" } });

export interface ClaudeUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export type ClaudeJsonResult =
  | { kind: "text"; text: string; usage: ClaudeUsage }
  | { kind: "refusal"; category: string | null; usage: ClaudeUsage };

export type ClaudeFailureKind = "rate_limited" | "auth" | "bad_request" | "unavailable";

export class AnthropicProviderError extends Error {
  constructor(public readonly kind: ClaudeFailureKind, public readonly status?: number) {
    super(`anthropic_${kind}`);
    this.name = "AnthropicProviderError";
  }
}

/** Maps the SDK's typed errors, most specific first. Never inspects message text. */
export const classifyAnthropicError = (error: unknown): ClaudeFailureKind => {
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return "auth";
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.UnprocessableEntityError) return "bad_request";
  // Other APIError subclasses (404, 5xx, overloaded, connection, timeout, abort) and anything unexpected.
  return "unavailable";
};

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * One JSON-generation call. Checks `stop_reason` before reading content: a refusal is returned as `kind: "refusal"`
 * (with its `stop_details.category`) so the gateway can treat it as a failed call. SDK errors become `AnthropicProviderError`.
 */
export const generateClaudeJson = async (
  client: AnthropicClientLike,
  request: ClaudeJsonRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ClaudeJsonResult> => {
  const { plan, params } = buildClaudeParams(request);
  const requestOptions: Anthropic.RequestOptions = {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
  };
  let message: Anthropic.Message | Anthropic.Beta.BetaMessage;
  try {
    message = plan.fallbacks
      ? await client.beta.messages.create({ ...params, betas: [ANTHROPIC_FALLBACK_BETA], fallbacks: "default" }, requestOptions)
      : await client.messages.create(params, requestOptions);
  } catch (error) {
    const kind = classifyAnthropicError(error);
    throw new AnthropicProviderError(kind, error instanceof Anthropic.APIError ? error.status : undefined);
  }
  const usage: ClaudeUsage = {
    inputTokens: finiteOrNull(message.usage?.input_tokens),
    outputTokens: finiteOrNull(message.usage?.output_tokens),
  };
  if (message.stop_reason === "refusal") {
    return { kind: "refusal", category: message.stop_details?.category ?? null, usage };
  }
  const textBlock = message.content.find((block) => block.type === "text");
  return { kind: "text", text: textBlock && "text" in textBlock ? textBlock.text : "", usage };
};
