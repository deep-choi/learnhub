import test from "node:test";
import assert from "node:assert/strict";
import { getEmailActionSettings, shouldUseGoogleRedirect } from "../src/services/firebaseClient";

test("local Google login keeps the app open even with a mobile user agent", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.equal(shouldUseGoogleRedirect(hostname, true), false);
    assert.equal(shouldUseGoogleRedirect(hostname, false), false);
  }
  assert.equal(shouldUseGoogleRedirect("learnhub-1de94.web.app", true), true);
  assert.equal(shouldUseGoogleRedirect("learnhub-1de94.web.app", false), false);
  assert.equal(shouldUseGoogleRedirect("localhost.example.com", true), true);
});

test("email links retain the current local origin and port", () => {
  for (const origin of ["http://localhost:3000", "http://localhost:3002", "http://127.0.0.1:5173", "https://learnhub-1de94.web.app"]) {
    const settings = getEmailActionSettings(origin);
    assert.equal(new URL(settings.url).origin, origin);
    assert.equal(settings.url, `${origin}/`);
    assert.equal(settings.handleCodeInApp, true);
  }
});
