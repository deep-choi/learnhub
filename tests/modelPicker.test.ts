import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AI_MODEL_CATALOG,
  AI_PROVIDER_LABELS,
  AI_PROVIDER_ORDER,
  DEFAULT_AI_SELECTION,
  REASONING_EFFORT_LABELS,
  getAiModel,
  groupModelsByProvider,
  isAiProvider,
  isAiRuntimeSelection,
  nearestReasoningEffort,
  normalizeAiSelection,
  selectableReasoningEfforts,
  selectionForModel,
  sortReasoningEfforts,
  type AiRuntimeSelection,
} from "../src/domain/aiModels";
import { configuredSelectionOrDefault, defaultAiSelectionFor, publicAiAvailability } from "../server/aiAvailability";
import { fetchAiAvailability, parseAiAvailability, resetAiAvailabilityCache } from "../src/services/aiAvailability";
import { LEARNHUB_BACKUP_SCHEMA, LEARNHUB_BACKUP_VERSION, validateLearningBackup } from "../src/services/learningBackup";
import { knowledgeGraphRouter } from "../server/knowledgeGraphApi";
import { PreviewQuota } from "../server/previewQuota";
import { AiGateway, type AiGatewayRequest, type AiGatewayResult } from "../server/aiGateway";
import { ModelList, ModelSummary } from "../src/components/chat/ModelReasoningPicker";

test("reasoning labels are Korean and only 낮음–매우 높음 can be picked", () => {
  assert.deepEqual(REASONING_EFFORT_LABELS, { none: "끄기", minimal: "최소", low: "낮음", medium: "중간", high: "높음", xhigh: "매우 높음", max: "최대" });
  assert.deepEqual(selectableReasoningEfforts(["none", "low", "medium", "high", "xhigh", "max"]), ["low", "medium", "high", "xhigh"]);
  assert.deepEqual(selectableReasoningEfforts(["high", "low", "medium"]), ["low", "medium", "high"]);
  assert.deepEqual(selectableReasoningEfforts(["none"]), ["none"], "a model without selectable levels keeps what it supports");
  assert.equal(normalizeAiSelection({ ...DEFAULT_AI_SELECTION, reasoningEffort: "none" }).reasoningEffort, "low", "saved 끄기 moves to 낮음");
  assert.equal(normalizeAiSelection({ ...DEFAULT_AI_SELECTION, reasoningEffort: "max" }).reasoningEffort, "xhigh", "saved 최대 moves to 매우 높음");
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
  assert.deepEqual(onlyOpenAi.providers, { anthropic: { configured: false }, openai: { configured: true }, gemini: { configured: false } });
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

test("client availability lists every catalog model, marks only configured ones available, and rejects malformed config", async () => {
  const config = { firebaseConfig: {}, ai: publicAiAvailability((provider) => provider === "gemini") };
  const parsed = parseAiAvailability(JSON.parse(JSON.stringify(config)));
  assert.ok(parsed);
  assert.equal(parsed.models.length, AI_MODEL_CATALOG.length, "unconfigured providers still appear (as 준비 중)");
  const available = parsed.models.filter((model) => model.available);
  assert.ok(available.length > 0 && available.every((model) => model.provider === "gemini"));
  assert.deepEqual(available[0].reasoningEfforts, getAiModel("gemini", available[0].id)?.reasoningEfforts);
  assert.deepEqual(parsed.providers, { anthropic: { configured: false }, openai: { configured: false }, gemini: { configured: true } });
  assert.deepEqual(parsed.defaultSelection, DEFAULT_AI_SELECTION);

  const tampered = JSON.parse(JSON.stringify(config));
  tampered.ai.models.push({ id: "made-up", provider: "gemini", available: true, reasoningEfforts: ["max"] });
  tampered.ai.models.find((model: { provider: string }) => model.provider === "openai").available = true;
  tampered.ai.models.push({ ...tampered.ai.models[0] });
  const filtered = parseAiAvailability(tampered);
  assert.equal(filtered?.models.length, parsed.models.length, "unknown models and duplicates are dropped");
  assert.equal(filtered?.models.filter((model) => model.available).length, available.length, "a model of an unconfigured provider never becomes available");

  const olderServer = JSON.parse(JSON.stringify(config));
  delete olderServer.ai.providers.anthropic;
  olderServer.ai.models = olderServer.ai.models.filter((model: { provider: string }) => model.provider !== "anthropic");
  const fromOlder = parseAiAvailability(olderServer);
  assert.equal(fromOlder?.providers.anthropic.configured, false, "a server that predates Claude reports it as not configured");
  assert.equal(fromOlder?.models.filter((model) => model.provider === "anthropic").length, 3);

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

test("models are grouped Claude → GPT → Gemini and the catalog carries the three Claude models", () => {
  assert.deepEqual(AI_PROVIDER_ORDER, ["anthropic", "openai", "gemini"]);
  assert.deepEqual(AI_PROVIDER_ORDER.map((provider) => AI_PROVIDER_LABELS[provider]), ["Claude", "GPT", "Gemini"]);
  const groups = groupModelsByProvider([...AI_MODEL_CATALOG].reverse());
  assert.deepEqual(groups.map((group) => group.provider), ["anthropic", "openai", "gemini"]);
  assert.equal(groups.reduce((sum, group) => sum + group.models.length, 0), AI_MODEL_CATALOG.length);
  assert.deepEqual(groupModelsByProvider(AI_MODEL_CATALOG.filter((model) => model.provider !== "openai")).map((group) => group.provider), ["anthropic", "gemini"], "empty groups are dropped");

  const claude = AI_MODEL_CATALOG.filter((model) => model.provider === "anthropic").map(({ id, label, reasoningEfforts }) => ({ id, label, reasoningEfforts }));
  assert.deepEqual(claude, [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", reasoningEfforts: ["low", "medium", "high", "xhigh", "max"] },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", reasoningEfforts: ["low", "medium", "high", "xhigh", "max"] },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", reasoningEfforts: ["none", "low", "medium", "high"] },
  ]);
  assert.ok(claude.every((model) => !/\d{8}/u.test(model.id)), "no date suffixes");
});

test("anthropic is accepted wherever saved preferences are validated", () => {
  const claude: AiRuntimeSelection = { provider: "anthropic", model: "claude-haiku-4-5", reasoningEffort: "none", maxOutputTokens: 4_096 };
  assert.equal(isAiProvider("anthropic"), true);
  assert.equal(isAiRuntimeSelection(claude), true);
  assert.equal(isAiRuntimeSelection({ ...claude, reasoningEffort: "max" }), false, "Haiku has no max level");
  assert.equal(isAiRuntimeSelection({ ...claude, provider: "gemini" }), false, "provider/model mismatch");
  const backup = validateLearningBackup({ schema: LEARNHUB_BACKUP_SCHEMA, version: LEARNHUB_BACKUP_VERSION, exportedAt: new Date().toISOString(), data: { aiPreferences: claude } });
  assert.equal(backup.ok, true, backup.errors.join(", "));
});

test("public config reports Claude as configured only when ANTHROPIC_API_KEY is set", () => {
  const withoutKey = new AiGateway({ geminiApiKey: "g" });
  const withKey = new AiGateway({ geminiApiKey: "g", anthropicApiKey: "sk-ant-test" });
  const off = publicAiAvailability((provider) => withoutKey.isConfigured(provider));
  const on = publicAiAvailability((provider) => withKey.isConfigured(provider));
  assert.deepEqual(off.providers.anthropic, { configured: false });
  assert.deepEqual(on.providers.anthropic, { configured: true });
  const claudeIds = (config: typeof on, available: boolean) => config.models.filter((model) => model.provider === "anthropic" && model.available === available).map((model) => model.id);
  assert.deepEqual(claudeIds(off, false), ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"], "listed but not available without the key");
  assert.deepEqual(claudeIds(on, true), ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]);
  assert.deepEqual(on.defaultSelection, DEFAULT_AI_SELECTION, "Gemini stays the default when configured");
  assert.doesNotMatch(JSON.stringify(on), /sk-ant/u, "the key never reaches the browser");
  assert.deepEqual(defaultAiSelectionFor((provider) => provider === "anthropic"), { provider: "anthropic", model: "claude-sonnet-5-5", reasoningEffort: "medium", maxOutputTokens: 8_192 });
});

test("a saved selection of an unconfigured provider falls back to the server default", () => {
  const claude: AiRuntimeSelection = { provider: "anthropic", model: "claude-opus-5-5", reasoningEffort: "max", maxOutputTokens: 16_384 };
  const onlyGemini = (provider: string) => provider === "gemini";
  assert.deepEqual(configuredSelectionOrDefault(claude, onlyGemini), { ...DEFAULT_AI_SELECTION, maxOutputTokens: 16_384 });
  assert.deepEqual(configuredSelectionOrDefault(claude, () => true), claude, "configured providers are used as chosen");
  const openai: AiRuntimeSelection = { provider: "openai", model: "gpt-5.6-terra", reasoningEffort: "low", maxOutputTokens: 4_096 };
  assert.deepEqual(configuredSelectionOrDefault(openai, (provider) => provider === "anthropic"), { provider: "anthropic", model: "claude-sonnet-5-5", reasoningEffort: "medium", maxOutputTokens: 4_096 });
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(server, /configuredSelectionOrDefault\(candidate,/u, "request headers go through the fallback");
});

test("the picker shows model names only (no descriptions), grouped Claude → GPT → Gemini, with 준비 중 for unconfigured providers", () => {
  const availability = parseAiAvailability({ ai: publicAiAvailability((provider) => provider !== "anthropic") });
  assert.ok(availability);
  const selection: AiRuntimeSelection = { provider: "anthropic", model: "claude-sonnet-5-5", reasoningEffort: "high", maxOutputTokens: 8_192 };
  const html = renderToStaticMarkup(createElement(ModelList, { models: availability.models, selection, onChoose: () => {} }));
  for (const model of AI_MODEL_CATALOG) {
    assert.ok(html.includes(model.label), model.label);
    assert.equal(html.includes(model.recommendedFor), false, `description of ${model.id} is not rendered`);
  }
  const headers = ["Claude", "GPT", "Gemini"].map((label) => html.indexOf(`>${label}</p>`));
  assert.ok(headers.every((index) => index >= 0) && headers[0] < headers[1] && headers[1] < headers[2], "section headers in Claude → GPT → Gemini order");
  assert.equal(html.match(/준비 중/gu)?.length, 3 * 2, "each Claude row shows the badge (and says it in its aria-label)");
  assert.equal(html.match(/disabled=""/gu)?.length, 3, "only the Claude rows are disabled");
  assert.ok(html.includes("미리보기"), "the preview badge stays");
  assert.match(html, /role="radio" aria-checked="false"[^>]*tabindex="0"/u, "a selectable model stays reachable by keyboard when the saved one is unavailable");

  const summary = renderToStaticMarkup(createElement(ModelSummary, { label: "Gemini 3.8 Flash", available: true }));
  assert.equal(summary.includes("최신 Flash 품질과 속도"), false);
  assert.ok(renderToStaticMarkup(createElement(ModelSummary, { label: "Claude Opus 5.5", available: false })).includes("준비 중"));

  for (const file of ["../src/components/chat/ModelReasoningPicker.tsx", "../src/components/notion/SettingsModal.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /recommendedFor/u, `${file} renders no model descriptions`);
  }
});
