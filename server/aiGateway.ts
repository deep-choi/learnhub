import {
  GoogleGenAI,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from "@google/genai";
import { AiAdmissionController } from "./aiPolicy";

export const AI_TIMEOUT_MS = 20_000;
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
  config: GenerateContentConfig;
  maxOutputTokens: number;
  validate: (payload: unknown) => string[];
}

export interface AiGatewayResult<T> {
  payload: T;
  usage: AiUsageMetadata;
}

export interface AiGatewayLoggerEvent {
  event: "ai_request";
  requestId: string;
  endpoint: string;
  status: "success" | "invalid_input" | "invalid_output" | "unavailable" | "admission_rejected";
  durationMs: number;
  usage: AiUsageMetadata | null;
  admissionReason?: string;
}

export interface AiModelsClient {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config?: GenerateContentConfig;
    }): Promise<GenerateContentResponse>;
  };
}

export class AiGatewayError extends Error {
  constructor(
    public readonly code: "AI_NOT_CONFIGURED" | "AI_UNAVAILABLE" | "AI_ADMISSION_REJECTED" | "AI_INVALID_OUTPUT" | "AI_INVALID_REQUEST",
    public readonly httpStatus: 400 | 429 | 502 | 503,
    public readonly admissionReason?: string,
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

const readUsage = (response: GenerateContentResponse): AiUsageMetadata => ({
  promptTokenCount: finiteOrNull(response.usageMetadata?.promptTokenCount),
  candidatesTokenCount: finiteOrNull(response.usageMetadata?.candidatesTokenCount),
  totalTokenCount: finiteOrNull(response.usageMetadata?.totalTokenCount),
});

export class AiGateway {
  private readonly client: AiModelsClient | null;
  private readonly policy: AiAdmissionController;
  private readonly logger: (event: AiGatewayLoggerEvent) => void;
  private readonly model: string;

  constructor(options: {
    apiKey?: string;
    client?: AiModelsClient | null;
    policy?: AiAdmissionController;
    model?: string;
    logger?: (event: AiGatewayLoggerEvent) => void;
  } = {}) {
    const apiKey = options.apiKey?.trim();
    this.client = options.client === undefined
      ? apiKey
        ? new GoogleGenAI({
            apiKey,
            httpOptions: {
              timeout: AI_TIMEOUT_MS,
              retryOptions: { attempts: 1 },
              headers: { "User-Agent": "learnhub-server" },
            },
          })
        : null
      : options.client;
    this.policy = options.policy ?? new AiAdmissionController();
    this.model = options.model ?? "gemini-3.6-flash";
    this.logger = options.logger ?? ((event) => console.info(JSON.stringify(event)));
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async generateJson<T>(request: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> {
    const startedAt = Date.now();
    let status: AiGatewayLoggerEvent["status"] = "unavailable";
    let usage: AiUsageMetadata | null = null;
    let admissionReason: string | undefined;

    if (!request.prompt.trim() || request.prompt.length > AI_MAX_PROMPT_CHARS || !Number.isFinite(request.maxOutputTokens) || request.maxOutputTokens <= 0 || !Number.isInteger(request.maxOutputTokens)) {
      status = "invalid_input";
      this.log(request, startedAt, status, usage);
      throw new AiGatewayError("AI_INVALID_REQUEST", 400);
    }

    if (!this.client) {
      this.log(request, startedAt, status, usage);
      throw new AiGatewayError("AI_NOT_CONFIGURED", 503);
    }

    const maxOutputTokens = Math.floor(request.maxOutputTokens);
    const admission = this.policy.tryAcquire(request.clientKey, maxOutputTokens);
    if (!admission.lease) {
      status = "admission_rejected";
      admissionReason = admission.reason;
      this.log(request, startedAt, status, usage, admissionReason);
      throw new AiGatewayError("AI_ADMISSION_REJECTED", 429, admissionReason);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: request.prompt,
        config: {
          ...request.config,
          maxOutputTokens,
          abortSignal: abortController.signal,
          httpOptions: {
            ...request.config.httpOptions,
            timeout: AI_TIMEOUT_MS,
            retryOptions: { attempts: 1 },
          },
        },
      });
      usage = readUsage(response);
      const text = response.text || "";
      if (text.length === 0 || text.length > AI_MAX_RESPONSE_CHARS) {
        status = "invalid_output";
        throw new AiGatewayError("AI_INVALID_OUTPUT", 502);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        status = "invalid_output";
        throw new AiGatewayError("AI_INVALID_OUTPUT", 502);
      }
      const validationErrors = request.validate(payload);
      if (validationErrors.length > 0) {
        status = "invalid_output";
        throw new AiGatewayError("AI_INVALID_OUTPUT", 502);
      }
      status = "success";
      return { payload: payload as T, usage };
    } catch (error) {
      if (error instanceof AiGatewayError) throw error;
      status = "unavailable";
      throw new AiGatewayError("AI_UNAVAILABLE", 503);
    } finally {
      clearTimeout(timeout);
      // The lease is released only after the SDK promise settles. The SDK's
      // documented abort is client-side, so no retry is started after it.
      admission.lease.release();
      this.log(request, startedAt, status, usage, admissionReason);
    }
  }

  private log(
    request: AiGatewayRequest<unknown>,
    startedAt: number,
    status: AiGatewayLoggerEvent["status"],
    usage: AiUsageMetadata | null,
    admissionReason?: string,
  ) {
    this.logger({
      event: "ai_request",
      requestId: request.requestId,
      endpoint: request.endpoint,
      status,
      durationMs: Math.max(0, Date.now() - startedAt),
      usage,
      ...(admissionReason ? { admissionReason } : {}),
    });
  }
}
