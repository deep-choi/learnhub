import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/CreateCourseModal.tsx", import.meta.url), "utf8");

test("CreateCourseModal keeps every hook before its closed render return", () => {
  const closedReturn = source.indexOf("if (!isOpen) return null;");
  assert.ok(closedReturn > source.lastIndexOf("useEffect(", closedReturn), "closed return must follow all effects");
  assert.ok(closedReturn > source.lastIndexOf("useState(", closedReturn), "closed return must follow all state hooks");
});

test("auto generation is once per open subject and strict-mode cleanup is deferred", () => {
  assert.match(source, /const requestKey = `\$\{isOpen\}:\$\{subject\}`/);
  assert.match(source, /if \(!isOpen\) \{\s*autoGenerateKeyRef\.current = null;/);
  assert.doesNotMatch(source, /requestIdRef\.current \+ 1/);
  assert.match(source, /deferredUnmountAbortRef/);
  assert.match(source, /setTimeout\(/);
  assert.match(source, /clearTimeout\(/);
});
