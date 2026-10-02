import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldIgnoreAuthEvent } from "../src/components/authEvents";

test("auth events that arrive before the provider is configured are ignored", () => {
  for (const event of ["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT"]) {
    assert.equal(shouldIgnoreAuthEvent(event, false), true, event);
    assert.equal(shouldIgnoreAuthEvent(event, true), false, event);
  }
});

test("configuration and recovery events are still handled without a provider", () => {
  for (const event of ["CONFIGURATION_ERROR", "PASSWORD_RECOVERY", "PASSWORD_RECOVERY_INVALID", "GOOGLE_REDIRECT_ERROR", undefined]) {
    assert.equal(shouldIgnoreAuthEvent(event, false), false, String(event));
  }
});

test("App uses the guard so the first rail click is not lost to an auth reload", () => {
  const source = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /shouldIgnoreAuthEvent\(authEvent, authStatus\.configured\)/);
});
