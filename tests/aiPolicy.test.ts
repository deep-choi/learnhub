import assert from "node:assert/strict";
import test from "node:test";
import { AiAdmissionController, isAllowedLoopbackRequest } from "../server/aiPolicy";
import { AiGateway, AiGatewayError } from "../server/aiGateway";

test("admission caps concurrent work and releases exactly once", () => {
  const policy = new AiAdmissionController({ maxConcurrent: 1, dailyOutputTokenBudget: 100 });
  const first = policy.tryAcquire("127.0.0.1", 20);
  const second = policy.tryAcquire("127.0.0.1", 20);

  assert.ok(first.lease);
  assert.equal(second.lease, null);
  assert.equal(second.reason, "global_concurrency");
  first.lease.release();
  first.lease.release();
  assert.equal(policy.getSnapshot().activeRequests, 0);
  assert.ok(policy.tryAcquire("127.0.0.1", 20).lease);
});

test("admission applies per-client rate and process-local daily token caps", () => {
  let now = new Date("2026-09-09T00:00:00.000Z");
  const policy = new AiAdmissionController({
    maxConcurrent: 3,
    maxRequestsPerClientPerMinute: 1,
    dailyOutputTokenBudget: 100,
    dailyRequestBudget: 2,
    now: () => now,
  });

  const first = policy.tryAcquire("client-a", 20);
  assert.ok(first.lease);
  first.lease.release();
  assert.equal(policy.tryAcquire("client-a", 1).reason, "client_rate_limit");
  assert.ok(policy.tryAcquire("client-b", 10).lease);
  assert.equal(policy.tryAcquire("client-c", 1).reason, "daily_request_budget");

  now = new Date("2026-09-10T00:00:00.000Z");
  assert.ok(policy.tryAcquire("client-a", 1).lease);
});

test("invalid numeric limits and requests fail closed", () => {
  assert.throws(() => new AiAdmissionController({ dailyOutputTokenBudget: Number.NaN }), TypeError);
  assert.throws(() => new AiAdmissionController({ maxConcurrent: Number.POSITIVE_INFINITY }), TypeError);
  const policy = new AiAdmissionController();
  assert.equal(policy.tryAcquire("client-a", Number.NaN).reason, "invalid_request");
  assert.equal(policy.tryAcquire("client-a", Number.POSITIVE_INFINITY).reason, "invalid_request");
  assert.equal(policy.tryAcquire("client-a", 1.5).reason, "invalid_request");
  assert.equal(policy.tryAcquire("client-a", 0).reason, "invalid_request");
});

test("expired client windows are cleaned and gateway logs metadata only", async () => {
  let now = new Date("2026-09-09T00:00:00.000Z");
  const policy = new AiAdmissionController({ maxTrackedClients: 2, now: () => now });
  const oldA = policy.tryAcquire("old-a", 1);
  const oldB = policy.tryAcquire("old-b", 1);
  assert.ok(oldA.lease);
  assert.ok(oldB.lease);
  oldA.lease.release();
  oldB.lease.release();
  assert.equal(policy.getSnapshot().trackedClients, 2);
  now = new Date("2026-09-09T00:01:01.000Z");
  assert.ok(policy.tryAcquire("new-c", 1).lease);
  assert.equal(policy.getSnapshot().trackedClients, 1);

  const events: unknown[] = [];
  const gateway = new AiGateway({
    client: { models: { generateContent: async () => ({ text: '{"ok":true}', usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 5, totalTokenCount: 9 } } as never) } },
    logger: (event) => events.push(event),
  });
  await gateway.generateJson({
    endpoint: "test",
    requestId: "req-1",
    clientKey: "client-a",
    prompt: "secret prompt and answer",
    config: {},
    maxOutputTokens: 10,
    validate: (payload) => payload && typeof payload === "object" && "ok" in payload ? [] : ["invalid"],
  });
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /secret prompt|answer/);
  assert.match(serialized, /promptTokenCount/);
});

test("gateway fails closed without an API key", async () => {
  const gateway = new AiGateway({ apiKey: "" });
  await assert.rejects(
    gateway.generateJson({ endpoint: "test", requestId: "req-no-key", clientKey: "client-a", prompt: "prompt", config: {}, maxOutputTokens: 10, validate: () => [] }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_NOT_CONFIGURED" && error.httpStatus === 503,
  );
});

test("gateway rejects invalid JSON and structural output without exposing provider errors", async () => {
  const events: unknown[] = [];
  const gateway = new AiGateway({
    client: { models: { generateContent: async () => ({ text: "not-json" } as never) } },
    logger: (event) => events.push(event),
  });
  await assert.rejects(
    gateway.generateJson({ endpoint: "invalid-json", requestId: "req-json", clientKey: "client-a", prompt: "private answer", config: {}, maxOutputTokens: 10, validate: () => [] }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_INVALID_OUTPUT" && error.httpStatus === 502,
  );

  const structuralGateway = new AiGateway({
    client: { models: { generateContent: async () => ({ text: '{"unexpected":true}' } as never) } },
    logger: (event) => events.push(event),
  });
  await assert.rejects(
    structuralGateway.generateJson({ endpoint: "invalid-structure", requestId: "req-structure", clientKey: "client-a", prompt: "private answer", config: {}, maxOutputTokens: 10, validate: () => ["required field"] }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_INVALID_OUTPUT" && error.httpStatus === 502,
  );
  assert.doesNotMatch(JSON.stringify(events), /private answer|required field|unexpected/);
});

test("gateway hides provider failures and logs only safe aggregate metadata", async () => {
  const events: unknown[] = [];
  const gateway = new AiGateway({
    client: { models: { generateContent: async () => { throw new Error("provider secret response"); } } },
    logger: (event) => events.push(event),
  });
  await assert.rejects(
    gateway.generateJson({ endpoint: "provider-error", requestId: "req-provider", clientKey: "client-a", prompt: "private prompt", config: {}, maxOutputTokens: 10, validate: () => [] }),
    (error: unknown) => error instanceof AiGatewayError && error.code === "AI_UNAVAILABLE" && error.httpStatus === 503,
  );
  assert.doesNotMatch(JSON.stringify(events), /provider secret response|private prompt/);
});

test("local development exception requires loopback socket, host, and same origin", () => {
  assert.equal(isAllowedLoopbackRequest({ remoteAddress: "::1", host: "[::1]:3000", origin: "http://[::1]:3000" }), true);
  assert.equal(isAllowedLoopbackRequest({ remoteAddress: "::ffff:127.0.0.1", host: "localhost:3000", origin: "http://localhost:3000" }), true);
  assert.equal(isAllowedLoopbackRequest({ remoteAddress: "::1", host: "[::1]:3000", origin: "http://evil.test:3000" }), false);
  assert.equal(isAllowedLoopbackRequest({ remoteAddress: "::1", host: "[::1]:3000", origin: "null" }), false);
  assert.equal(isAllowedLoopbackRequest({ remoteAddress: "192.168.0.4", host: "localhost:3000", origin: "http://localhost:3000" }), false);
  assert.equal(isAllowedLoopbackRequest({ remoteAddress: "::1", host: "[::1]:3000", origin: "http://[::1]:4000" }), false);
});
