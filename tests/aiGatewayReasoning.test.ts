import test from "node:test";
import assert from "node:assert/strict";
import { AiGateway, capReasoningEffort, type AiModelsClient } from "../server/aiGateway";
import { AI_MODEL_CATALOG, DEFAULT_AI_SELECTION } from "../src/domain/aiModels";

test("capReasoningEffort: 선택한 단계를 낮추기만 하고, 모델이 지원하는 가장 가까운 단계로 맞춘다", () => {
  const flash38 = AI_MODEL_CATALOG.find((m) => m.id === "gemini-3.8-flash")!.reasoningEfforts; // low/medium/high
  const flash36 = AI_MODEL_CATALOG.find((m) => m.id === "gemini-3.6-flash")!.reasoningEfforts; // minimal 지원
  assert.equal(capReasoningEffort("medium", "minimal", flash38), "low", "minimal이 없으면 가장 낮은 지원 단계");
  assert.equal(capReasoningEffort("high", "minimal", flash36), "minimal");
  assert.equal(capReasoningEffort("low", "minimal", flash38), "low");
  assert.equal(capReasoningEffort("minimal", "low", flash36), "minimal", "사용자가 더 낮게 고른 값은 올리지 않는다");
  assert.equal(capReasoningEffort("high", "low", flash36), "low");
  assert.equal(capReasoningEffort("high", undefined, flash38), "high");
});

test("게이트웨이는 상한을 Gemini thinkingLevel에 반영하고, 기본 요청은 선택 그대로 둔다", async () => {
  const configs: Array<{ thinkingConfig?: { thinkingLevel?: string }; maxOutputTokens?: number }> = [];
  const client: AiModelsClient = { models: { async generateContent(input) { configs.push(input.config as never); return { text: '{"ok":true}', usageMetadata: {} } as never; } } };
  const events: string[] = [];
  const gateway = new AiGateway({ client, geminiApiKey: "x", logger: (event) => events.push(event.reasoningEffort) });
  const base = { endpoint: "t", requestId: "r", clientKey: "c", prompt: "p", config: { responseMimeType: "application/json" }, maxOutputTokens: 1024, selection: { ...DEFAULT_AI_SELECTION }, validate: () => [] as string[] };
  await gateway.generateJson({ ...base, maxReasoningEffort: "minimal" });
  await gateway.generateJson(base);
  assert.equal(configs[0].thinkingConfig?.thinkingLevel, "LOW", "gemini-3.8-flash는 minimal이 없어 low");
  assert.equal(configs[1].thinkingConfig?.thinkingLevel, "MEDIUM");
  assert.deepEqual(events, ["low", "medium"]);
});
