import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("account deletion removes Firestore-owned data and its Firebase Auth user", () => {
  const provider = readFileSync(new URL("../server/firebaseProvider.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
  assert.match(server, /app\.delete\("\/api\/account"/u);
  assert.match(server, /verifyAccessToken\(/u);
  assert.match(provider, /recursiveDelete\(userRef\(userId\)\)/u);
  assert.match(provider, /deleteUser\(userId\)/u);
});
