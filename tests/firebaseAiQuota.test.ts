import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("durable Firebase AI quota is user-scoped, transactional, and bounded", () => {
  const provider = readFileSync(new URL("../server/firebaseProvider.ts", import.meta.url), "utf8");
  assert.match(provider, /collection\("aiUsage"\)\.doc\(usageDay\)/u);
  assert.match(provider, /firestore\(\)\.runTransaction/u);
  assert.match(provider, /requests \+ 1 > policy\.requestLimit/u);
  assert.match(provider, /reservedOutputTokens \+ requestedTokens > policy\.outputTokenLimit/u);
});
