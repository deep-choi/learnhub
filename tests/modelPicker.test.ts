import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  AI_MODEL_CATALOG,
  DEFAULT_AI_SELECTION,
  REASONING_EFFORT_LABELS,
  getAiModel,
  isAiRuntimeSelection,
  isCostlyReasoningEffort,
  nearestReasoningEffort,
  selectionForModel,
  sortReasoningEfforts,
  type AiRuntimeSelection,
} from "../src/domain/aiModels";
import { defaultAiSelectionFor, publicAiAvailability } from "../server/aiAvailability";
import { fetchAiAvailability, parseAiAvailability, resetAiAvailabilityCache } from "../src/services/aiAvailability";
import { knowledgeGraphRouter } from "../server/knowledgeGraphApi";
import { PreviewQuota } from "../server/previewQuota";
import type { AiGatewayRequest, AiGatewayResult } from "../server/aiGateway";

test("reasoning labels are Korean and the cost hint starts at 높음", () => {
  assert.deepEqual(REASONING_EFFORT_LABELS, { none: "끄기", minimal: "최소", low: "낮음", medium: "중간", high: "높음", xhigh: "매우 높음", max: "최대" });
  assert.deepEqual(["none", "minimal", "low", "medium", "high", "xhigh", "max"].map((effort) => isCostlyReasoningEffort(effort as never)), [false, false, false, false, true, true, true]);
  assert.deepEqual(sortReasoningEfforts(["high", "none", "medium", "max"]), ["none", "medium", "high", "max"]);
});

test("switching models snaps reasoning to the nearest supported level (ties go lower)", () => {
  assert.equal(nearestReasoningEffort("medium", ["low", "medium", "high"]), "medium");
  assert.equal(nearestReasoningEffort("none", ["low", "medium", "high"]), "low");
  assert.equal(nearestReasoningEffort("minimal", ["none", "low", "medium"]), "none", "equal distance picks the lower level");
  assert.equal(nearestReasoningEffort("xhigh", ["low", "medium", "high"]), "high");
  assert.equal(nearestReasoningEffort("max", ["minimal", "low", "medium", "high"]), "high");

  const sol: AiRuntimeSelection = { provider: "openai", model: "gpt-5.6-sol", reasoningEffort: "max", maxOutputTokens: 8_192 };
  const flash = selectionForModel(sol, "gemini", "gemini-3.8-flash");
  assert.deepEqual(flash, { provider: "gemini", model: "gemini-3.8-flash", reasoningEffort: "high", maxOutputTokens: 8_192 });
  assert.equal(isAiRuntimeSelection(flash), true, "snapped selection is always storable");
  assert.equal(selectionForModel({ ...sol, reasoningEffort: "none" }, "gemini", "gemini-3.6-flash")?.reasoningEffort, "minimal");
  assert.equal(selectionForModel({ ...sol, reasoningEffort: "none" }, "openai", "gpt-6-astra")?.reasoningEffort, "low");
  assert.equal(selectionForModel(DEFAULT_AI_SELECTION, "openai", "gpt-5.6-terra")?.reasoningEffort, "medium", "supported level is kept");
  assert.equal(selectionForModel(DEFAULT_AI_SELECTION, "gemini", "gpt-5.6-terra"), null, "provider/model mismatch");
  assert.equal(selectionForModel(DEFAULT_AI_SELECTION, "gemini", "unknown-model"), null);

  for (const from of AI_MODEL_CATALOG) {
    for (const effort of from.reasoningEfforts) {
      for (const to of AI_MODEL_CATALOG) {
        const next = selectionForModel({ provider: from.provider, model: from.id, reasoningEffort: effort, maxOutputTokens: 8_192 }, to.provider, to.id);
        assert.ok(next && to.reasoningEfforts.includes(next.reasoningEffort), `${from.id}/${effort} → ${to.id}`);
      }
    }
  }
});

test("public config exposes provider availability and models without secrets", () => {
  const onlyOpenAi = publicAiAvailability((provider) => provider === "openai");
  assert.deepEqual(Object.keys(onlyOpenAi).sort(), ["defaultSelection", "models", "outputTokenOptions", "providers"]);
  assert.deepEqual(onlyOpenAi.providers, { openai: { configured: true }, gemini: { configured: false } });
  assert.equal(onlyOpenAi.models.length, AI_MODEL_CATALOG.length);
  assert.ok(onlyOpenAi.models.every((model) => model.available === (model.provider === "openai")));
  for (const model of onlyOpenAi.models) {
    assert.deepEqual(Object.keys(model).sort(), ["available", "id", "label", "lifecycle", "provider", "reasoningEfforts", "recommendedFor"]);
  }
  assert.deepEqual(onlyOpenAi.defaultSelection, { provider: "openai", model: "gpt-5.6-terra", reasoningEffort: "medium", maxOutputTokens: 8_192 });
  assert.doesNotMatch(JSON.stringify(onlyOpenAi), /api[_-]?key|secret|token"/iu);
  assert.deepEqual(defaultAiSelectionFor(() => true), DEFAULT_AI_SELECTION);
  assert.deepEqual(defaultAiSelectionFor(() => false), DEFAULT_AI_SELECTION);
});

test("client availability keeps only available catalog models and rejects malformed config", async () => {
  const config = { firebaseConfig: {}, ai: publicAiAvailability((provider) => provider === "gemini") };
  const parsed = parseAiAvailability(JSON.parse(JSON.stringify(config)));
  assert.ok(parsed);
  assert.ok(parsed.models.length > 0 && parsed.models.every((model) => model.provider === "gemini" && model.available));
  assert.deepEqual(parsed.models[0].reasoningEfforts, getAiModel("gemini", parsed.models[0].id)?.reasoningEfforts);
  assert.deepEqual(parsed.defaultSelection, DEFAULT_AI_SELECTION);

  const tampered = JSON.parse(JSON.stringify(config));
  tampered.ai.models.push({ id: "made-up", provider: "gemini", available: true, reasoningEfforts: ["max"] });
  tampered.ai.models.find((model: { provider: string }) => model.provider === "openai").available = true;
  tampered.ai.models.push({ ...tampered.ai.models[0] });
  const filtered = parseAiAvailability(tampered);
  assert.equal(filtered?.models.length, parsed.models.length, "unknown models, unconfigured providers and duplicates are dropped");

  assert.equal(parseAiAvailability(null), null);
  assert.equal(parseAiAvailability({ firebaseConfig: {} }), null, "older servers without ai config");
  assert.equal(parseAiAvailability({ ai: { ...config.ai, defaultSelection: { provider: "gemini", model: "x" } } }), null);
  assert.equal(parseAiAvailability({ ai: { ...config.ai, providers: { gemini: { configured: true } } } }), null);

  resetAiAvailabilityCache();
  let calls = 0;
  const failing = (async () => { calls++; return new Response("{}", { status: 503 }); }) as typeof fetch;
  assert.equal(await fetchAiAvailability(failing), null);
  const working = (async () => { calls++; return new Response(JSON.stringify(config), { status: 200 }); }) as typeof fetch;
  assert.equal((await fetchAiAvailability(working))?.models.length, parsed.models.length, "a failure is not cached");
  assert.ok(await fetchAiAvailability(failing), "a success is reused for the tab");
  assert.equal(calls, 2);
  resetAiAvailabilityCache();
});

test("signed-out preview-course ignores client model/reasoning headers and uses the server default", async (t) => {
  const curriculum = { courseTitle: "낚시 입문", domain: "낚시", learningType: "practical", learningTypeExplanation: "관찰", summary: "기초", chapters: [{ title: "준비", description: "개념", lessons: [{ title: "물때", description: "자료", estimatedMinutes: 10, conceptId: "물때", conceptName: "물때", prerequisites: [], relatedConcepts: [], aliases: [] }] }] };
  const used: AiRuntimeSelection[] = [];
  let headerSelectionCalls = 0;
  const gateway = {
    async generateJson<T>(req: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> {
      used.push(req.selection);
      return { payload: curriculum as T, selection: req.selection, usage: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } };
    },
  };
  const serverDefault: AiRuntimeSelection = { provider: "openai", model: "gpt-5.6-terra", reasoningEffort: "medium", maxOutputTokens: 8_192 };
  const start = async (previewSelection?: () => AiRuntimeSelection) => {
    const app = express();
    app.use(express.json());
    app.use("/api/ai", knowledgeGraphRouter({
      gateway, previewGateway: gateway, previewQuota: new PreviewQuota(), authorize: async () => true,
      selection: () => { headerSelectionCalls++; return { provider: "openai", model: "gpt-6-astra", reasoningEffort: "max", maxOutputTokens: 16_384 }; },
      ...(previewSelection ? { previewSelection } : {}),
      reserveUser: async () => {}, clientKey: () => "t", error: (res) => res.status(503).end(),
    }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/preview-course`;
  };
  const headers = { "Content-Type": "application/json", "x-learnhub-ai-provider": "openai", "x-learnhub-ai-model": "gpt-6-astra", "x-learnhub-ai-reasoning": "max", "x-learnhub-ai-max-output-tokens": "16384" };

  const withDefault = await start(() => serverDefault);
  assert.equal((await fetch(withDefault, { method: "POST", headers, body: JSON.stringify({ subject: "낚시" }) })).status, 200);
  const fallback = await start();
  assert.equal((await fetch(fallback, { method: "POST", headers, body: JSON.stringify({ subject: "요리" }) })).status, 200);
  assert.deepEqual(used, [serverDefault, DEFAULT_AI_SELECTION]);
  assert.equal(headerSelectionCalls, 0, "request headers are never consulted for the anonymous preview");
});
