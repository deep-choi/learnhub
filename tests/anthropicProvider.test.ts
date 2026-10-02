import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { Type } from "@google/genai";
import {
  ANTHROPIC_FALLBACK_BETA,
  buildClaudeParams,
  claudeRequestPlan,
  generateClaudeJson,
  toClaudeJsonSchema,
  type AnthropicClientLike,
} from "../server/anthropicProvider";
import { AiGateway, AiGatewayError, reservedAiOutputTokens, type AiGatewayLoggerEvent } from "../server/aiGateway";
import { AiAdmissionController } from "../server/aiPolicy";
import { graphCurriculumSchema } from "../server/knowledgeGraphApi";
import { AI_MODEL_CATALOG, type AiReasoningEffort, type AiRuntimeSelection } from "../src/domain/aiModels";

const message = (overrides: Partial<Anthropic.Message> & Record<string, unknown> = {}): Anthropic.Message => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: '{"ok":true}', citations: null }],
  stop_reason: "end_turn",
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 120, output_tokens: 30 },
  ...overrides,
} as unknown as Anthropic.Message);

interface Calls {
  plain: Anthropic.MessageCreateParamsNonStreaming[];
  beta: Anthropic.Beta.MessageCreateParamsNonStreaming[];
}

const mockClient = (respond: () => Anthropic.Message | Promise<Anthropic.Message>): { client: AnthropicClientLike; calls: Calls } => {
  const calls: Calls = { plain: [], beta: [] };
  const client: AnthropicClientLike = {
    messages: { create: async (params) => { calls.plain.push(params); return respond(); } },
    beta: { messages: { create: async (params) => { calls.beta.push(params); return respond() as unknown as Anthropic.Beta.BetaMessage; } } },
  };
  return { client, calls };
};

/** Every object node in a converted schema, with its path. */
const objectNodes = (schema: Record<string, unknown>, path = "$"): Array<[string, Record<string, unknown>]> => {
  const found: Array<[string, Record<string, unknown>]> = [];
  if (schema.type === "object") found.push([path, schema]);
  for (const [key, value] of Object.entries((schema.properties as Record<string, Record<string, unknown>>) || {})) found.push(...objectNodes(value, `${path}.${key}`));
  if (schema.items) found.push(...objectNodes(schema.items as Record<string, unknown>, `${path}[]`));
  return found;
};

test("toClaudeJsonSchema converts Gemini Type.* schemas to standard JSON Schema with closed objects", () => {
  const gemini = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      level: { type: Type.STRING, enum: ["easy", "hard"] },
      minutes: { type: Type.INTEGER },
      score: { type: Type.NUMBER },
      done: { type: Type.BOOLEAN },
      matrix: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.INTEGER } } },
      steps: {
        type: Type.ARRAY,
        items: { type: Type.OBJECT, properties: { body: { type: Type.STRING }, meta: { type: Type.OBJECT, properties: { tags: { type: Type.ARRAY, items: { type: Type.STRING } } } } }, required: ["body"] },
      },
      empty: { type: Type.OBJECT },
    },
    required: ["title", "steps"],
  };
  assert.deepEqual(toClaudeJsonSchema(gemini), {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      level: { type: "string", enum: ["easy", "hard"] },
      minutes: { type: "integer" },
      score: { type: "number" },
      done: { type: "boolean" },
      matrix: { type: "array", items: { type: "array", items: { type: "integer" } } },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: { body: { type: "string" }, meta: { type: "object", properties: { tags: { type: "array", items: { type: "string" } } }, additionalProperties: false } },
          required: ["body"],
          additionalProperties: false,
        },
      },
      empty: { type: "object", additionalProperties: false },
    },
    required: ["title", "steps"],
    additionalProperties: false,
  });
  assert.deepEqual(gemini.required, ["title", "steps"], "the source schema is not mutated");

  const curriculum = toClaudeJsonSchema(graphCurriculumSchema);
  const objects = objectNodes(curriculum);
  assert.ok(objects.length >= 3, "the real curriculum schema has nested objects");
  for (const [path, node] of objects) assert.equal(node.additionalProperties, false, path);
  assert.doesNotMatch(JSON.stringify(curriculum), /"(STRING|OBJECT|ARRAY|INTEGER|NUMBER|BOOLEAN)"/u);
});

test("reasoning mapping: Opus/Sonnet 5.5 send effort only, Haiku 4.5 sends a thinking budget and no effort", () => {
  for (const model of ["claude-opus-5-5", "claude-sonnet-5-5"]) {
    const efforts = AI_MODEL_CATALOG.find((item) => item.id === model)!.reasoningEfforts;
    assert.deepEqual(efforts, ["low", "medium", "high", "xhigh", "max"]);
    for (const effort of efforts) {
      const { plan, params } = buildClaudeParams({ model, reasoningEffort: effort, prompt: "p", maxOutputTokens: 4_096 });
      assert.equal(params.output_config?.effort, effort, `${model}/${effort} sends effort explicitly`);
      assert.equal("thinking" in params, false, `${model} never sends thinking (no disabled, no budget_tokens)`);
      assert.equal(params.max_tokens, 4_096);
      assert.equal(plan.fallbacks, true);
    }
  }

  const haiku = (effort: AiReasoningEffort) => buildClaudeParams({ model: "claude-haiku-4-5", reasoningEffort: effort, prompt: "p", maxOutputTokens: 1_500 });
  const none = haiku("none");
  assert.equal("thinking" in none.params, false, "none → no thinking");
  assert.equal("output_config" in none.params, false, "Haiku never gets effort; nothing else to configure without a schema");
  assert.equal(none.params.max_tokens, 1_500);
  for (const [effort, budget] of [["low", 2_048], ["medium", 4_096], ["high", 8_192]] as const) {
    const { plan, params } = haiku(effort);
    assert.deepEqual(params.thinking, { type: "enabled", budget_tokens: budget });
    assert.equal(params.max_tokens, budget + 1_500, "max_tokens = budget + the endpoint's output limit");
    assert.ok(budget >= 1_024 && budget < params.max_tokens);
    assert.equal(params.output_config?.effort, undefined, "Haiku does not accept effort");
    assert.equal(plan.fallbacks, false);
  }

  const withSchema = buildClaudeParams({ model: "claude-haiku-4-5", reasoningEffort: "none", system: "safety", prompt: "질문", maxOutputTokens: 900, responseSchema: { type: Type.OBJECT, properties: { a: { type: Type.STRING } } } });
  assert.deepEqual(withSchema.params.output_config, { format: { type: "json_schema", schema: { type: "object", properties: { a: { type: "string" } }, additionalProperties: false } } });
  assert.deepEqual(withSchema.params.messages, [{ role: "user", content: "질문" }], "one user turn, no assistant prefill");
  assert.equal(withSchema.params.system, "safety");
  for (const key of ["temperature", "top_p", "top_k", "output_format"]) assert.equal(key in withSchema.params, false, key);
  assert.equal(claudeRequestPlan("claude-opus-5-5", "medium", 2_000).effort, "medium");
});

test("Opus/Sonnet calls use the server-side fallback beta; Haiku uses the plain endpoint; text comes from the first text block", async () => {
  const { client, calls } = mockClient(() => message({ content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: '{"answer":1}', citations: null }] as never }));
  const opus = await generateClaudeJson(client, { model: "claude-opus-5-5", reasoningEffort: "high", prompt: "p", maxOutputTokens: 1_000 });
  assert.deepEqual(opus, { kind: "text", text: '{"answer":1}', usage: { inputTokens: 120, outputTokens: 30 } });
  assert.equal(calls.beta.length, 1);
  assert.deepEqual(calls.beta[0].betas, [ANTHROPIC_FALLBACK_BETA]);
  assert.equal(ANTHROPIC_FALLBACK_BETA, "server-side-fallback-2026-07-01");
  assert.equal(calls.beta[0].fallbacks, "default");
  assert.equal(calls.beta[0].output_config?.effort, "high");

  await generateClaudeJson(client, { model: "claude-sonnet-5-5", reasoningEffort: "low", prompt: "p", maxOutputTokens: 1_000 });
  assert.equal(calls.beta.length, 2);
  await generateClaudeJson(client, { model: "claude-haiku-4-5", reasoningEffort: "medium", prompt: "p", maxOutputTokens: 1_000 });
  assert.equal(calls.plain.length, 1, "Haiku goes through messages.create");
  assert.equal("fallbacks" in calls.plain[0], false);
});

const selection = (model: string, reasoningEffort: AiReasoningEffort): AiRuntimeSelection => ({ provider: "anthropic", model, reasoningEffort, maxOutputTokens: 8_192 });
const request = (sel: AiRuntimeSelection, validate: (payload: unknown) => string[] = () => []) => ({
  endpoint: "tutor-chat", requestId: "req-1", clientKey: "user:1", prompt: "설명해 주세요",
  config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { ok: { type: Type.BOOLEAN } }, required: ["ok"] } },
  maxOutputTokens: 1_000, selection: sel, validate,
});

test("gateway: a Claude success is validated, and usage is mapped into the ai_request log", async () => {
  const { client, calls } = mockClient(() => message());
  const events: AiGatewayLoggerEvent[] = [];
  const validated: unknown[] = [];
  const gateway = new AiGateway({ anthropicClient: client, logger: (event) => events.push(event) });
  assert.equal(gateway.isConfigured("anthropic"), true);
  const result = await gateway.generateJson(request(selection("claude-opus-5-5", "medium"), (payload) => { validated.push(payload); return []; }));
  assert.deepEqual(result.payload, { ok: true });
  assert.deepEqual(validated, [{ ok: true }]);
  assert.deepEqual(result.usage, { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 });
  assert.equal(calls.beta[0].system && typeof calls.beta[0].system === "string" && calls.beta[0].system.length > 0, true, "the learning safety prompt goes in system");
  assert.equal(calls.beta[0].messages[0].content, "설명해 주세요");
  assert.deepEqual(events.map(({ event, provider, model, reasoningEffort, status, usage }) => ({ event, provider, model, reasoningEffort, status, usage })), [
    { event: "ai_request", provider: "anthropic", model: "claude-opus-5-5", reasoningEffort: "medium", status: "success", usage: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 } },
  ]);

  const invalid = new AiGateway({ anthropicClient: client, logger: () => {} });
  await assert.rejects(invalid.generateJson(request(selection("claude-opus-5-5", "medium"), () => ["bad"])), (error: unknown) => error instanceof AiGatewayError && error.code === "AI_INVALID_OUTPUT");
});

test("gateway: stop_reason refusal is a failed call (AI_INVALID_OUTPUT, refusal detail) and its category is logged", async (t) => {
  const { client } = mockClient(() => message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: null }, content: [{ type: "text", text: '{"ok":true}', citations: null }] as never }));
  const events: AiGatewayLoggerEvent[] = [];
  const errors: string[] = [];
  t.mock.method(console, "error", (line: string) => { errors.push(line); });
  const gateway = new AiGateway({ anthropicClient: client, logger: (event) => events.push(event) });
  let validateCalls = 0;
  await assert.rejects(
    gateway.generateJson(request(selection("claude-sonnet-5-5", "high"), () => { validateCalls++; return []; })),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_INVALID_OUTPUT" && error.httpStatus === 502 && error.detail === "refusal",
  );
  assert.equal(validateCalls, 0, "refused content is never read or validated");
  assert.equal(events[0].status, "invalid_output");
  assert.deepEqual(events[0].usage, { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 });
  const logged = errors.map((line) => JSON.parse(line));
  assert.deepEqual(logged, [{ event: "ai_output_rejected", endpoint: "tutor-chat", requestId: "req-1", reason: "refusal", provider: "anthropic", category: "cyber" }]);
});

test("gateway: typed SDK errors map onto the existing error codes", async () => {
  const cases: Array<[Error, AiGatewayError["code"], number, AiGatewayLoggerEvent["status"]]> = [
    [new Anthropic.RateLimitError(429, {}, "rate", new Headers()), "AI_ADMISSION_REJECTED", 429, "admission_rejected"],
    [new Anthropic.AuthenticationError(401, {}, "auth", new Headers()), "AI_NOT_CONFIGURED", 503, "unavailable"],
    [new Anthropic.PermissionDeniedError(403, {}, "denied", new Headers()), "AI_NOT_CONFIGURED", 503, "unavailable"],
    [new Anthropic.BadRequestError(400, {}, "bad", new Headers()), "AI_INVALID_REQUEST", 400, "invalid_input"],
    [new Anthropic.InternalServerError(529, {}, "overloaded", new Headers()), "AI_UNAVAILABLE", 503, "unavailable"],
    [new Anthropic.APIConnectionTimeoutError(), "AI_UNAVAILABLE", 503, "unavailable"],
    [new Error("unexpected"), "AI_UNAVAILABLE", 503, "unavailable"],
  ];
  for (const [thrown, code, httpStatus, status] of cases) {
    const { client } = mockClient(() => { throw thrown; });
    const events: AiGatewayLoggerEvent[] = [];
    const gateway = new AiGateway({ anthropicClient: client, logger: (event) => events.push(event) });
    await assert.rejects(
      gateway.generateJson(request(selection("claude-haiku-4-5", "none"))),
      (error: unknown) => error instanceof AiGatewayError && error.code === code && error.httpStatus === httpStatus,
      thrown.constructor.name,
    );
    assert.equal(events[0].status, status, thrown.constructor.name);
  }
});

test("gateway: Claude is configured only with ANTHROPIC_API_KEY, and Haiku's thinking budget is reserved", async () => {
  assert.equal(new AiGateway({ geminiApiKey: "g" }).isConfigured("anthropic"), false);
  assert.equal(new AiGateway({ anthropicApiKey: "  " }).isConfigured("anthropic"), false);
  assert.equal(new AiGateway({ anthropicApiKey: "sk-ant-test" }).isConfigured("anthropic"), true, "the key alone configures it; the SDK client is created on first call");
  await assert.rejects(
    new AiGateway({ geminiApiKey: "g", logger: () => {} }).generateJson(request(selection("claude-opus-5-5", "low"))),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_NOT_CONFIGURED",
  );

  const { client, calls } = mockClient(() => message());
  const policy = new AiAdmissionController({ perClientDailyOutputTokenBudget: 5_000 });
  const gateway = new AiGateway({ anthropicClient: client, policy, logger: () => {} });
  await assert.rejects(
    gateway.generateJson(request(selection("claude-haiku-4-5", "high"))),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_ADMISSION_REJECTED",
    "8192 budget + 1000 output exceeds the 5000 daily reservation",
  );
  await gateway.generateJson(request(selection("claude-haiku-4-5", "none")));
  assert.equal(calls.plain.length, 1);
  assert.equal(calls.plain[0].max_tokens, 1_000);
});

test("account quota reservation includes Haiku thinking and respects endpoint effort caps", () => {
  assert.equal(reservedAiOutputTokens(selection("claude-haiku-4-5", "high"), 900), 9_092);
  assert.equal(reservedAiOutputTokens(selection("claude-haiku-4-5", "high"), 250, "minimal"), 250);
  assert.equal(reservedAiOutputTokens(selection("claude-haiku-4-5", "high"), 250, "low"), 2_298);
  assert.equal(reservedAiOutputTokens(selection("claude-opus-5-5", "max"), 900), 900);
  assert.equal(reservedAiOutputTokens({ ...selection("claude-haiku-4-5", "none"), maxOutputTokens: 4_096 }, 8_192), 4_096);
});
