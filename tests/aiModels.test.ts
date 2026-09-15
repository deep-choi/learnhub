import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_MODEL_CATALOG,
  DEFAULT_AI_SELECTION,
  isAiRuntimeSelection,
  normalizeAiSelection,
} from "../src/domain/aiModels";

test("AI catalog has unique provider/model pairs and current GPT/Gemini defaults", () => {
  const keys = AI_MODEL_CATALOG.map((model) => `${model.provider}:${model.id}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes("openai:gpt-6-astra"));
  assert.ok(keys.includes("openai:gpt-5.6-sol"));
  assert.ok(keys.includes("openai:gpt-5.6-terra"));
  assert.ok(keys.includes("openai:gpt-5.6-luna"));
  assert.ok(keys.includes("gemini:gemini-3.8-flash"));
  assert.equal(isAiRuntimeSelection(DEFAULT_AI_SELECTION), true);
});

test("AI selection rejects mismatched providers, unsupported reasoning, and arbitrary token caps", () => {
  assert.equal(isAiRuntimeSelection({ provider: "openai", model: "gemini-3.8-flash", reasoningEffort: "medium", maxOutputTokens: 8_192 }), false);
  assert.equal(isAiRuntimeSelection({ provider: "gemini", model: "gemini-3.8-flash", reasoningEffort: "none", maxOutputTokens: 8_192 }), false);
  assert.equal(isAiRuntimeSelection({ provider: "openai", model: "gpt-5.6-sol", reasoningEffort: "high", maxOutputTokens: 123 }), false);
  assert.deepEqual(normalizeAiSelection({ provider: "unknown" }), DEFAULT_AI_SELECTION);
});
