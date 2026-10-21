import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentConfig,
  type ContentListUnion,
  type GenerateContentResponse,
} from "@google/genai";
import {
  DEFAULT_AI_SELECTION,
  getAiModel,
  isAiRuntimeSelection,
  type AiReasoningEffort,
  type AiRuntimeSelection,
} from "../src/domain/aiModels";
import { AiAdmissionController } from "./aiPolicy";
import {
  AnthropicProviderError,
  claudeRequestPlan,
  createAnthropicClient,
  generateClaudeJson,
  type AnthropicClientLike,
  type ClaudeFailureKind,
} from "./anthropicProvider";
import { generalLearningSafetyPrompt } from "./learningSafety";
import { OperationsError } from "./operationsPolicy";

export const AI_TIMEOUT_MS = 20_000;
/** 커리큘럼과 레슨 본문처럼 길게 쓰는 생성은 20초를 넘기기 쉬워 따로 늘립니다. 함수 기본 제한(60초) 안에 둡니다. */
export const AI_SLOW_TIMEOUT_MS = 50_000;
const SLOW_ENDPOINTS = new Set(["analyze-subject", "preview-course", "generate-lesson"]);
export const aiTimeoutFor = (endpoint: string): number => SLOW_ENDPOINTS.has(endpoint) ? AI_SLOW_TIMEOUT_MS : AI_TIMEOUT_MS;
export const AI_MAX_RESPONSE_CHARS = 160_000;
export const AI_MAX_PROMPT_CHARS = 24_000;

export interface AiUsageMetadata {
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
  totalTokenCount: number | null;
}

export interface AiGatewayRequest<T> {
  endpoint: string;
  requestId: string;
  clientKey: string;
  prompt: string;
  media?: { mimeType: string; data: string };
  plainText?: boolean;
  config: GenerateContentConfig;
  maxOutputTokens: number;
  /**
   * Small-output endpoints set this so reasoning ("thinking") tokens cannot eat the output budget:
   * Gemini counts them against maxOutputTokens, and a medium effort can leave 1 token for the JSON.
   * It only lowers the caller's chosen effort, to the nearest level the model supports.
   */
  maxReasoningEffort?: AiReasoningEffort;
  selection?: AiRuntimeSelection;
  normalize?: (payload: unknown) => unknown;
  validate: (payload: unknown) => string[];
}

export interface AiGatewayResult<T> {
  payload: T;
  grounding?: { sources: { title: string; url: string }[]; searchHtml?: string };
  usage: AiUsageMetadata;
  selection: AiRuntimeSelection;
}

export interface AiGatewayLoggerEvent {
  event: "ai_request";
  requestId: string;
  endpoint: string;
  provider: AiRuntimeSelection["provider"];
  model: string;
  reasoningEffort: AiRuntimeSelection["reasoningEffort"];
  status: "success" | "invalid_input" | "invalid_output" | "unavailable" | "admission_rejected";
  durationMs: number;
  usage: AiUsageMetadata | null;
  admissionReason?: string;
}

export interface AiModelsClient {
  models: {
    generateContent(input: {
      model: string;
      contents: ContentListUnion;
      config?: GenerateContentConfig;
    }): Promise<GenerateContentResponse>;
  };
}

export class AiGatewayError extends Error {
  constructor(
    public readonly code: "AI_NOT_CONFIGURED" | "AI_UNAVAILABLE" | "AI_ADMISSION_REJECTED" | "AI_INVALID_OUTPUT" | "AI_INVALID_REQUEST",
    public readonly httpStatus: 400 | 429 | 502 | 503,
    public readonly admissionReason?: string,
    /** Extra detail for the user-facing message, e.g. a model refusal reported as AI_INVALID_OUTPUT. */
    public readonly detail?: "refusal" | "truncated",
  ) {
    super(code);
    this.name = "AiGatewayError";
  }
}

const emptyUsage = (): AiUsageMetadata => ({
  promptTokenCount: null,
  candidatesTokenCount: null,
  totalTokenCount: null,
});

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readGeminiUsage = (response: GenerateContentResponse): AiUsageMetadata => ({
  promptTokenCount: finiteOrNull(response.usageMetadata?.promptTokenCount),
  candidatesTokenCount: finiteOrNull(response.usageMetadata?.candidatesTokenCount),
  totalTokenCount: finiteOrNull(response.usageMetadata?.totalTokenCount),
});

const EFFORT_ORDER: readonly AiReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/** The highest supported effort that does not exceed `cap`; the lowest supported one if all exceed it. */
export const capReasoningEffort = (
  effort: AiReasoningEffort,
  cap: AiReasoningEffort | undefined,
  supported: readonly AiReasoningEffort[],
): AiReasoningEffort => {
  if (!cap || EFFORT_ORDER.indexOf(effort) <= EFFORT_ORDER.indexOf(cap)) return effort;
  const ranked = [...supported].sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b));
  const allowed = ranked.filter((candidate) => EFFORT_ORDER.indexOf(candidate) <= EFFORT_ORDER.indexOf(cap));
  return allowed.length > 0 ? allowed[allowed.length - 1] : (ranked[0] ?? effort);
};

/** Shared by durable account quotas and the gateway's process-local admission limits. */
export const reservedAiOutputTokens = (
  selection: AiRuntimeSelection,
  outputLimit: number,
  effortCap?: AiReasoningEffort,
): number => {
  const outputTokens = Math.min(outputLimit, selection.maxOutputTokens);
  if (selection.provider !== "anthropic") return outputTokens;
  const model = getAiModel(selection.provider, selection.model);
  const effort = capReasoningEffort(selection.reasoningEffort, effortCap, model?.reasoningEfforts ?? []);
  return claudeRequestPlan(selection.model, effort, outputTokens).maxTokens;
};

const thinkingLevel = (effort: AiRuntimeSelection["reasoningEffort"]): ThinkingLevel => {
  if (effort === "minimal" || effort === "none") return ThinkingLevel.MINIMAL;
  if (effort === "low") return ThinkingLevel.LOW;
  if (effort === "high" || effort === "xhigh" || effort === "max") return ThinkingLevel.HIGH;
  return ThinkingLevel.MEDIUM;
};

const geminiThinkingConfig = (selection: AiRuntimeSelection) => {
  if (selection.model.startsWith("gemini-2.5")) {
    const budgets = { none: 0, minimal: 512, low: 1_024, medium: 8_192, high: 24_576, xhigh: 24_576, max: 24_576 } as const;
    return { thinkingBudget: budgets[selection.reasoningEffort] };
  }
  return { thinkingLevel: thinkingLevel(selection.reasoningEffort) };
};

type JsonSchema = Record<string, unknown>;

const toJsonSchema = (input: unknown): JsonSchema => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const typeMap: Record<string, string> = {
    STRING: "string",
    NUMBER: "number",
    INTEGER: "integer",
    BOOLEAN: "boolean",
    ARRAY: "array",
    OBJECT: "object",
    NULL: "null",
  };
  const output: JsonSchema = {};
  if (typeof source.type === "string" && typeMap[source.type]) output.type = typeMap[source.type];
  if (Array.isArray(source.enum)) output.enum = source.enum;
  if (Array.isArray(source.required)) output.required = source.required;
  if (source.items) output.items = toJsonSchema(source.items);
  if (source.properties && typeof source.properties === "object" && !Array.isArray(source.properties)) {
    output.properties = Object.fromEntries(
      Object.entries(source.properties as Record<string, unknown>).map(([key, value]) => [key, toJsonSchema(value)]),
    );
    output.additionalProperties = false;
  }
  return output;
};

interface OpenAiResponseBody {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

const openAiText = (body: OpenAiResponseBody): string =>
  (body.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text!)
    .join("");

/**
 * Providers occasionally wrap otherwise valid JSON in a Markdown code fence or
 * add a short sentence before/after it. Structured-output is still preferred,
 * but accepting these harmless wrappers keeps the tutor usable across model
 * versions without weakening the endpoint-specific validation below.
 */
const parseJsonText = (text: string): unknown => {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim(),
  ];
  const objectStart = trimmed.search(/[\[{]/u);
  const objectEnd = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next provider-compatible representation.
    }
  }
  return null;
};

const outputShape = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (value === null) return { type: "null" };
  if (typeof value !== "object") return { type: typeof value };
  const record = value as Record<string, unknown>;
  return {
    type: "object",
    keys: Object.keys(record).slice(0, 20),
    valueTypes: Object.fromEntries(Object.entries(record).slice(0, 20).map(([key, item]) => [key, Array.isArray(item) ? "array" : typeof item])),
  };
};

/** Claude SDK failures mapped onto the gateway's existing codes. */
const CLAUDE_FAILURES: Record<ClaudeFailureKind, { code: AiGatewayError["code"]; httpStatus: AiGatewayError["httpStatus"]; status: AiGatewayLoggerEvent["status"]; admissionReason?: string }> = {
  rate_limited: { code: "AI_ADMISSION_REJECTED", httpStatus: 429, status: "admission_rejected", admissionReason: "provider_rate_limited" },
  auth: { code: "AI_NOT_CONFIGURED", httpStatus: 503, status: "unavailable" },
  bad_request: { code: "AI_INVALID_REQUEST", httpStatus: 400, status: "invalid_input" },
  unavailable: { code: "AI_UNAVAILABLE", httpStatus: 503, status: "unavailable" },
};

export class AiGateway {
  private readonly geminiClient: AiModelsClient | null;
  private readonly openAiApiKey: string | null;
  private readonly openAiFetch: typeof fetch;
  private readonly anthropicApiKey: string | null;
  private anthropicClient: AnthropicClientLike | null;
  private readonly policy: AiAdmissionController;
  private readonly logger: (event: AiGatewayLoggerEvent) => unknown;
  private readonly beforeGenerate?: (request: AiGatewayRequest<unknown>, selection: AiRuntimeSelection, tokens: number) => Promise<void>;

  constructor(options: {
    /** Backward-compatible alias for geminiApiKey. */
    apiKey?: string;
    geminiApiKey?: string;
    openAiApiKey?: string;
    client?: AiModelsClient | null;
    openAiFetch?: typeof fetch;
    anthropicApiKey?: string;
    /** Tests inject a mock; otherwise the SDK client is created on first use, only when the key exists. */
    anthropicClient?: AnthropicClientLike | null;
    policy?: AiAdmissionController;
    logger?: (event: AiGatewayLoggerEvent) => unknown;
    beforeGenerate?: (request: AiGatewayRequest<unknown>, selection: AiRuntimeSelection, tokens: number) => Promise<void>;
  } = {}) {
    const geminiApiKey = (options.geminiApiKey || options.apiKey)?.trim();
    this.geminiClient = options.client === undefined
      ? geminiApiKey
        ? new GoogleGenAI({
            apiKey: geminiApiKey,
            httpOptions: {
              timeout: AI_TIMEOUT_MS,
              retryOptions: { attempts: 1 },
              headers: { "User-Agent": "learnhub-server" },
            },
          })
        : null
      : options.client;
    this.openAiApiKey = options.openAiApiKey?.trim() || null;
    this.openAiFetch = options.openAiFetch || fetch;
    this.anthropicApiKey = options.anthropicApiKey?.trim() || null;
    this.anthropicClient = options.anthropicClient ?? null;
    this.policy = options.policy ?? new AiAdmissionController();
    this.logger = options.logger ?? ((event) => console.info(JSON.stringify(event)));
    this.beforeGenerate = options.beforeGenerate;
  }

  isConfigured(provider?: AiRuntimeSelection["provider"]): boolean {
    if (provider === "openai") return this.openAiApiKey !== null;
    if (provider === "gemini") return this.geminiClient !== null;
    if (provider === "anthropic") return this.anthropicApiKey !== null || this.anthropicClient !== null;
    return this.openAiApiKey !== null || this.geminiClient !== null || this.anthropicApiKey !== null || this.anthropicClient !== null;
  }

  private claudeClient(): AnthropicClientLike {
    this.anthropicClient ??= createAnthropicClient(this.anthropicApiKey!, AI_TIMEOUT_MS);
    return this.anthropicClient;
  }

  getQuotaSnapshot(clientKey: string) {
    return this.policy.getSnapshot(clientKey);
  }

  async generateJson<T>(request: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> {
    const safePrompt = `${generalLearningSafetyPrompt()}\n${request.prompt}`;
    const startedAt = Date.now();
    const requested = request.selection || { ...DEFAULT_AI_SELECTION };
    const requestedModel = isAiRuntimeSelection(requested) ? getAiModel(requested.provider, requested.model) : null;
    const selection = requestedModel
      ? { ...requested, reasoningEffort: capReasoningEffort(requested.reasoningEffort, request.maxReasoningEffort, requestedModel.reasoningEfforts) }
      : requested;
    let status: AiGatewayLoggerEvent["status"] = "unavailable";
    let usage: AiUsageMetadata | null = null;
    let admissionReason: string | undefined;
    const model = getAiModel(selection.provider, selection.model);

    if (
      (!!request.media && (selection.provider !== "gemini" || request.media.data.length > 5_400_000)) ||
      !request.prompt.trim() ||
      safePrompt.length > AI_MAX_PROMPT_CHARS ||
      !Number.isFinite(request.maxOutputTokens) ||
      request.maxOutputTokens <= 0 ||
      !Number.isInteger(request.maxOutputTokens) ||
      !isAiRuntimeSelection(selection) ||
      !model ||
      !model.reasoningEfforts.includes(selection.reasoningEffort)
    ) {
      status = "invalid_input";
      await this.log(request, selection, startedAt, status, usage);
      throw new AiGatewayError("AI_INVALID_REQUEST", 400);
    }

    if (!this.isConfigured(selection.provider)) {
      await this.log(request, selection, startedAt, status, usage);
      throw new AiGatewayError("AI_NOT_CONFIGURED", 503);
    }

    const maxOutputTokens = Math.min(Math.floor(request.maxOutputTokens), selection.maxOutputTokens);
    // Claude Haiku's thinking budget is sent on top of the output limit, so reserve it too.
    const reservedOutputTokens = reservedAiOutputTokens(selection, maxOutputTokens);
    const admission = this.policy.tryAcquire(request.clientKey, reservedOutputTokens);
    if (!admission.lease) {
      status = "admission_rejected";
      admissionReason = admission.reason;
      await this.log(request, selection, startedAt, status, usage, admissionReason);
      throw new AiGatewayError("AI_ADMISSION_REJECTED", 429, admissionReason);
    }

    const abortController = new AbortController();
    const timeoutMs = aiTimeoutFor(request.endpoint);
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);
    try {
      await this.beforeGenerate?.(request, selection, reservedOutputTokens);
      let grounding: AiGatewayResult<T>["grounding"];
      let text = "";
      let finishReason: string | undefined;
      let thinkingTokenCount: number | null = null;
      if (selection.provider === "gemini") {
        const response = await this.geminiClient!.models.generateContent({
          model: selection.model,
          contents: request.media ? [{ role: "user", parts: [{ text: safePrompt }, { inlineData: request.media }] }] : safePrompt,
          config: {
            ...request.config,
            maxOutputTokens,
            thinkingConfig: geminiThinkingConfig(selection),
            abortSignal: abortController.signal,
            httpOptions: {
              ...request.config.httpOptions,
              timeout: timeoutMs,
              retryOptions: { attempts: 1 },
            },
          },
        });
        usage = readGeminiUsage(response);
        finishReason = response.candidates?.[0]?.finishReason;
        thinkingTokenCount = finiteOrNull(response.usageMetadata?.thoughtsTokenCount);
        text = response.text || "";
        const metadata = response.candidates?.[0]?.groundingMetadata;
        if (metadata) grounding = { sources: (metadata.groundingChunks || []).flatMap(c => c.web?.uri ? [{ title: c.web.title || c.web.uri, url: c.web.uri }] : []), searchHtml: metadata.searchEntryPoint?.renderedContent };
      } else if (selection.provider === "anthropic") {
        const result = await generateClaudeJson(this.claudeClient(), {
          model: selection.model,
          reasoningEffort: selection.reasoningEffort,
          system: generalLearningSafetyPrompt(),
          prompt: request.prompt,
          responseSchema: request.config.responseSchema,
          maxOutputTokens,
        }, { signal: abortController.signal, timeoutMs });
        const { inputTokens, outputTokens } = result.usage;
        usage = {
          promptTokenCount: inputTokens,
          candidatesTokenCount: outputTokens,
          totalTokenCount: inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
        };
        if (result.kind === "refusal") {
          console.error(JSON.stringify({ event: "ai_output_rejected", endpoint: request.endpoint, requestId: request.requestId, reason: "refusal", provider: "anthropic", category: result.category }));
          status = "invalid_output";
          throw new AiGatewayError("AI_INVALID_OUTPUT", 502, undefined, "refusal");
        }
        text = result.text;
      } else {
        const schema = request.config.responseSchema ? toJsonSchema(request.config.responseSchema) : null;
        const response = await this.openAiFetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.openAiApiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "learnhub-server",
          },
          signal: abortController.signal,
          body: JSON.stringify({
            model: selection.model,
            input: safePrompt,
            reasoning: { effort: selection.reasoningEffort },
            max_output_tokens: maxOutputTokens,
            store: false,
            ...(schema ? { text: { format: { type: "json_schema", name: "learnhub_response", strict: false, schema } } } : {}),
          }),
        });
        if (!response.ok) throw new Error("OpenAI request failed");
        const body = await response.json() as OpenAiResponseBody;
        text = openAiText(body);
        usage = {
          promptTokenCount: finiteOrNull(body.usage?.input_tokens),
          candidatesTokenCount: finiteOrNull(body.usage?.output_tokens),
          totalTokenCount: finiteOrNull(body.usage?.total_tokens),
        };
      }

      if (text.length === 0 || text.length > AI_MAX_RESPONSE_CHARS) {
        console.error(JSON.stringify({ event: "ai_output_rejected", endpoint: request.endpoint, requestId: request.requestId, reason: "response_size", responseChars: text.length, maxOutputTokens, finishReason, thinkingTokenCount }));
        status = "invalid_output";
        throw new AiGatewayError("AI_INVALID_OUTPUT", 502, undefined, finishReason === "MAX_TOKENS" ? "truncated" : undefined);
      }
      let payload = request.plainText ? { text } : parseJsonText(text);
      if (payload === null) {
        console.error(JSON.stringify({ event: "ai_output_rejected", endpoint: request.endpoint, requestId: request.requestId, reason: "json_parse", responseChars: text.length, maxOutputTokens, finishReason, thinkingTokenCount }));
        status = "invalid_output";
        throw new AiGatewayError("AI_INVALID_OUTPUT", 502, undefined, finishReason === "MAX_TOKENS" ? "truncated" : undefined);
      }
      if (request.normalize) payload = request.normalize(payload);
      const validationErrors = request.validate(payload);
      if (validationErrors.length > 0) {
        console.error(JSON.stringify({ event: "ai_output_rejected", endpoint: request.endpoint, requestId: request.requestId, reason: "schema_validation", responseChars: text.length, shape: outputShape(payload), validationErrors }));
        status = "invalid_output";
        throw new AiGatewayError("AI_INVALID_OUTPUT", 502);
      }
      status = "success";
      return { payload: payload as T, usage: usage || emptyUsage(), selection, ...(grounding ? { grounding } : {}) };
    } catch (error) {
      if (error instanceof OperationsError) {
        status = "admission_rejected";
        admissionReason = error.code;
        throw error;
      }
      if (error instanceof AiGatewayError) throw error;
      if (error instanceof AnthropicProviderError) {
        const failure = CLAUDE_FAILURES[error.kind];
        status = failure.status;
        admissionReason = failure.admissionReason;
        throw new AiGatewayError(failure.code, failure.httpStatus, failure.admissionReason);
      }
      status = "unavailable";
      throw new AiGatewayError("AI_UNAVAILABLE", 503);
    } finally {
      clearTimeout(timeout);
      admission.lease.release();
      await this.log(request, selection, startedAt, status, usage, admissionReason);
    }
  }

  private log(
    request: AiGatewayRequest<unknown>,
    selection: AiRuntimeSelection,
    startedAt: number,
    status: AiGatewayLoggerEvent["status"],
    usage: AiUsageMetadata | null,
    admissionReason?: string,
  ) {
    return this.logger({
      event: "ai_request",
      requestId: request.requestId,
      endpoint: request.endpoint,
      provider: selection.provider,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort,
      status,
      durationMs: Math.max(0, Date.now() - startedAt),
      usage,
      ...(admissionReason ? { admissionReason } : {}),
    });
  }
}
