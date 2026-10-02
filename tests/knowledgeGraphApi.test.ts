import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { DEFAULT_AI_SELECTION, type AiRuntimeSelection } from "../src/domain/aiModels";
import { validateCurriculumPayload } from "../src/domain/contentValidation";
import { coursePrompt, lessonPrompt, extractConceptLinks, knowledgeGraphRouter, normalizeNudgeRequest, nudgeFallback, nudgePrompt, validCourseRequest, validTutorRequest, validateTutorResponse, tutorPrompt } from "../server/knowledgeGraphApi";
import { PreviewQuota, PreviewQuotaExceededError, reservePreviewCount } from "../server/previewQuota";
import { generalLearningSafetyPrompt, learningSafetyPrompt } from "../server/learningSafety";
import { withKoreanParticle } from "../server/koreanText";
import { AiGateway, type AiGatewayRequest, type AiGatewayResult } from "../server/aiGateway";

const curriculum = { courseTitle: "안전한 낚시 입문", domain: "낚시", learningType: "practical", learningTypeExplanation: "안전한 관찰로 배웁니다.", summary: "기초를 익힙니다.", chapters: [{ title: "준비", description: "개념을 연결합니다.", lessons: [{ title: "물때", description: "자료를 읽습니다.", estimatedMinutes: 10, conceptId: "물때", conceptName: "물때", prerequisites: ["조석"], relatedConcepts: ["포인트"], aliases: [] }] }] };

test("curriculum graph metadata validates while old curriculum remains compatible", () => {
  assert.deepEqual(validateCurriculumPayload(curriculum, { requireConceptLinks: true }), []);
  const legacy = structuredClone(curriculum) as Record<string, any>; delete legacy.domain;
  delete legacy.chapters[0].lessons[0].prerequisites; delete legacy.chapters[0].lessons[0].relatedConcepts;
  assert.deepEqual(validateCurriculumPayload(legacy), []);
  assert.ok(validateCurriculumPayload(legacy, { requireConceptLinks: true }).length);
  const bad = structuredClone(curriculum); bad.chapters[0].lessons[0].prerequisites = ["同じ", "同じ"];
  assert.ok(validateCurriculumPayload(bad).length);
  assert.equal(extractConceptLinks(curriculum).domain, "낚시");
});
test("course requests bound existing names and prompts support all ages/practical subjects", () => {
  assert.ok(validCourseRequest({ subject: "UI 디자인", existingConceptNames: ["대비"], targetAudience: "초등" }));
  assert.equal(validCourseRequest({ subject: "낚시", existingConceptNames: Array(61).fill("물때") }), false);
  assert.equal(validCourseRequest({ subject: "낚시", dailyMinutes: Infinity }), false);
  const prompt = coursePrompt({ subject: "낚시", existingConceptNames: ["물때"], targetAudience: "초등" });
  assert.match(prompt, /독학자/u); assert.match(prompt, /practical/u); assert.match(prompt, /정확히 그 이름/u); assert.match(prompt, /보호자/u);
  assert.doesNotMatch(prompt, /성인을 위한/u);
});

const lessonRequest = { courseTitle: "낚시 입문", chapterTitle: "준비", lessonTitle: "물때 읽기", learningType: "practical", level: "beginner", conceptId: "물때", conceptName: "물때" };

test("unspecified or adult audiences stay neutral instead of inheriting elementary safety", () => {
  for (const targetAudience of [undefined, "성인", "대학생", "어린이"]) {
    const body = { ...lessonRequest, ...(targetAudience ? { targetAudience } : {}) };
    for (const prompt of [learningSafetyPrompt(targetAudience), coursePrompt({ subject: "낚시 입문", ...body }), lessonPrompt(body)]) {
      assert.doesNotMatch(prompt, /보호자와 함께|대상은 초등|초등학생에게|온 가족|어린 학습자/u);
      assert.match(prompt, /임의로 덧붙이지|가정하지/u);
      assert.match(prompt, /보호자 동반을 기본 조건으로 제시하지/u);
    }
  }
  assert.match(coursePrompt({ subject: "낚시 입문" }), /제목·요약·예시에도 위의 대상 기준/u);
  assert.match(lessonPrompt(lessonRequest), /중립적인 학습자/u);
  assert.match(lessonPrompt(lessonRequest), /처음 배우는 학습자/u);
  assert.doesNotMatch(generalLearningSafetyPrompt(), /대상 정보|초등|보호자/u);
});

test("explicit elementary audience retains protective guidance in course, lesson and tutor prompts", () => {
  for (const targetAudience of ["초등 4학년", "elementary school"]) {
    for (const prompt of [coursePrompt({ subject: "낚시", targetAudience }), lessonPrompt({ ...lessonRequest, targetAudience }), tutorPrompt({ conceptName: "물때", targetAudience })]) {
      assert.match(prompt, /대상은 초등 학습자/u);
      assert.match(prompt, /보호자와 함께/u);
      assert.doesNotMatch(prompt, /대상 정보가 없습니다/u);
    }
  }
});

test("practical lesson guides real learner actions without advertising system limitations", () => {
  const prompt = lessonPrompt(lessonRequest);
  assert.match(prompt, /학습자가 직접 시도할 수 있는 작은 활동/u);
  assert.match(prompt, /구체적인 단계와 자기 점검 기준/u);
  assert.match(prompt, /본문에 서비스의 내부 기능이나 도구 제약을 설명하지/u);
  assert.match(prompt, /AI가 실제 작업을 실행하거나 결과를 검증했다고 주장하지/u);
  assert.doesNotMatch(prompt, /하지 않는다고 명시|실행·파일 생성·외부 도구 검증|생각과 글로만 진행/u);
});

test("gateway preserves neutral or explicit elementary audience through provider requests", async () => {
  const prompts: string[] = [];
  const gateway = new AiGateway({ client: { models: { generateContent: async request => {
    prompts.push(String(request.contents)); return { text: '{"ok":true}' } as never;
  } } }, logger: () => {} });
  for (const targetAudience of [undefined, "초등 4학년"]) {
    await gateway.generateJson({ endpoint: "generate-lesson", requestId: "audience-test", clientKey: "audience-test", prompt: lessonPrompt({ ...lessonRequest, ...(targetAudience ? { targetAudience } : {}) }), config: {}, maxOutputTokens: 100, validate: () => [] });
  }
  assert.match(prompts[0], /중립적인 학습자/u); assert.doesNotMatch(prompts[0], /대상은 초등|보호자와 함께/u);
  assert.match(prompts[0], /보호자 동반을 기본 조건으로 제시하지/u);
  assert.match(prompts[1], /대상은 초등 학습자/u); assert.doesNotMatch(prompts[1], /대상 정보가 없습니다/u);
});

test("Korean particles follow final consonants even outside quotes and after numeric names", () => {
  for (const [name, object, withOther] of [
    ["통분", "통분을", "통분과"], ["물때", "물때를", "물때와"],
    ["‘통분’", "‘통분’을", "‘통분’과"], ["‘물때’", "‘물때’를", "‘물때’와"],
    ["분수 덧셈", "분수 덧셈을", "분수 덧셈과"],
    ["레벨 3", "레벨 3을", "레벨 3과"], ["레벨 2", "레벨 2를", "레벨 2와"],
    ["C++", "C++ 개념을", "C++ 개념과"], ["UI", "UI 개념을", "UI 개념과"],
  ]) {
    assert.equal(withKoreanParticle(name, "을/를"), object);
    assert.equal(withKoreanParticle(name, "과/와"), withOther);
  }
  assert.equal(withKoreanParticle(" 물때 ", "을/를"), "물때를");
  assert.equal(withKoreanParticle("통분".normalize("NFD"), "을/를"), `${"통분".normalize("NFD")}을`);
});

test("all nudge fallbacks and prompt examples use correct particles without alternatives in parentheses", () => {
  for (const kind of ["review", "deepen", "next_lesson", "connected", "curiosity"] as const) {
    assert.match(nudgeFallback({ kind, score: 1 }, "통분", "물때").question, /^물때를 /u);
    assert.match(nudgeFallback({ kind, score: 1 }, "물때", "통분").question, /^통분을 /u);
  }
  assert.match(nudgeFallback({ kind: "review", score: 1 }, "물때").question, /^물때를 /u);
  assert.match(nudgeFallback({ kind: "deepen", score: 1 }, "‘물때’").question, /^‘물때’를 /u);
  const body = normalizeNudgeRequest({ currentConceptName: "물때", steps: [{ kind: "connected", conceptName: "통분" }] })!;
  const prompt = nudgePrompt(body);
  assert.match(prompt, /물때를/u); assert.match(prompt, /물때와/u); assert.match(prompt, /통분을/u);
  assert.doesNotMatch(prompt, /을\(를\)|와\(과\)|과\(와\)/u);
});

test("real course and lesson routes forward neutral and elementary prompts without system-limit instructions", async t => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  const { app } = await import("../server");
  const original = AiGateway.prototype.generateJson;
  const captured: { endpoint: string; prompt: string }[] = [];
  const lesson = { title: "물때 읽기", steps: ["concept", "example", "practice", "summary"].map(type => ({ type, title: "물때표 확인", content: "물때표에서 만조와 간조 시각을 찾고 그 사이의 차이를 비교합니다. 관측 지역과 날짜가 같은지 먼저 확인한 뒤 시간의 변화를 직접 기록하고 예상과 비교해 보세요." })) };
  AiGateway.prototype.generateJson = async function<T>(request: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> {
    captured.push({ endpoint: request.endpoint, prompt: request.prompt });
    const payload = request.endpoint === "analyze-subject" ? curriculum : lesson;
    assert.deepEqual(request.validate(payload), []);
    return { payload: payload as T, selection: DEFAULT_AI_SELECTION, usage: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } };
  };
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    AiGateway.prototype.generateJson = original;
    if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const targetAudience of [undefined, "초등 4학년"]) {
    for (const [endpoint, settings] of [["analyze-subject", { subject: "낚시 입문" }], ["generate-lesson", lessonRequest]] as const) {
      const response = await fetch(`${base}/api/ai/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, ...(targetAudience ? { targetAudience } : {}) }) });
      assert.equal(response.status, 200);
      const prompt = captured.at(-1)!.prompt;
      if (targetAudience) { assert.match(prompt, /보호자와 함께/u); assert.doesNotMatch(prompt, /대상 정보가 없습니다/u); }
      else { assert.match(prompt, /중립적인 학습자/u); assert.doesNotMatch(prompt, /대상은 초등|보호자와 함께/u); assert.match(prompt, /보호자 동반을 기본 조건으로 제시하지/u); }
      assert.doesNotMatch(prompt, /실행·파일 생성·외부 도구 검증은 하지 않는다고 명시/u);
    }
  }
  assert.equal(captured.length, 4);
});
test("tutor depth, tangent and learned concept are optional and validated against current concept", () => {
  const body = { courseTitle: "분수", lessonTitle: "통분", conceptName: "통분", currentStepContent: "같은 분모", userQuestion: "이해했어요", depth: "example", targetAudience: "초등" };
  assert.ok(validTutorRequest(body)); assert.equal(validTutorRequest({ ...body, depth: "other" }), false);
  assert.deepEqual(validateTutorResponse({ reply: "좋아요.", learnedConcept: "통분", tangent: { conceptName: "분수 비교", question: "비교는 어떻게 하나요?" } }, "통분"), []);
  assert.ok(validateTutorResponse({ reply: "좋아요.", learnedConcept: "새로운 개념" }, "통분").length);
  assert.ok(validateTutorResponse({ reply: "좋아요.", tangent: { conceptName: "비교" } }, "통분").length);
  assert.match(tutorPrompt(body), /중간 과정/u); assert.match(tutorPrompt(body), /이해를 확인했을 때만/u);
  assert.match(learningSafetyPrompt(), /그만두겠다고/u);
});
test("preview IP and global budgets are independent, atomic within a process and reset daily", async () => {
  let now = new Date("2026-10-01T00:00:00Z");
  const quota = new PreviewQuota({ perIp: 3, globalLimit: 4, now: () => now });
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => quota.reserve("127.0.0.1")));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 3);
  await quota.reserve("127.0.0.2");
  await assert.rejects(quota.reserve("127.0.0.3"), PreviewQuotaExceededError);
  now = new Date("2026-10-02T00:00:00Z"); await quota.reserve("127.0.0.1");
  assert.throws(() => reservePreviewCount({ total: -1, clients: {} }, "key"));
});
test("durable preview reservation shares hashed IP counters across separate instances", async () => {
  let usage = { total: 0, clients: {} as Record<string, number> };
  const durableReserve = async (day: string, key: string, perIp: number, globalLimit: number) => {
    assert.equal(day, "2026-10-01"); assert.equal(key.length, 64); assert.ok(!key.includes("127.0"));
    usage = reservePreviewCount(usage, key, perIp, globalLimit);
  };
  const options = { durableReserve, now: () => new Date("2026-10-01T00:00:00Z") };
  const a = new PreviewQuota(options), b = new PreviewQuota(options);
  await a.reserve("127.0.0.1"); await b.reserve("::ffff:127.0.0.1"); await a.reserve("127.0.0.1");
  await assert.rejects(b.reserve("127.0.0.1"), PreviewQuotaExceededError);
});
test("preview API is anonymous, preserves reusable response, rejects spoofed IPs and malformed requests", async t => {
  const app = express(); app.use(express.json());
  let calls = 0; let authCalls = 0;
  const gateway = { async generateJson<T>(req: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> {
    calls++; assert.deepEqual(req.validate(curriculum), []); assert.equal(req.maxOutputTokens, 2600);
    return { payload: curriculum as T, selection: DEFAULT_AI_SELECTION, usage: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } };
  } };
  app.use("/api/ai", knowledgeGraphRouter({ gateway, previewGateway: gateway, previewQuota: new PreviewQuota({ perIp: 1 }), authorize: async () => { authCalls++; return true; }, selection: () => DEFAULT_AI_SELECTION, defaultSelection: () => DEFAULT_AI_SELECTION, reserveUser: async () => {}, clientKey: () => "test", error: (res) => res.status(503).json({ code: "AI_UNAVAILABLE" }) }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/preview-course`;
  const request = (body: unknown, ip = "198.51.100.1") => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify(body) });
  assert.equal((await request({ subject: "" })).status, 400); assert.equal(calls, 0);
  const result = await request({ subject: "낚시" }); assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { preview: true, curriculum, conceptLinks: extractConceptLinks(curriculum) });
  assert.equal((await request({ subject: "요리" }, "198.51.100.2")).status, 429);
  assert.equal(calls, 1); assert.equal(authCalls, 0);
});
test("anonymous preview ignores client model and reasoning headers and always uses the default selection", async t => {
  const app = express(); app.use(express.json());
  const fallback: AiRuntimeSelection = { ...DEFAULT_AI_SELECTION };
  const expensive: AiRuntimeSelection = { provider: "openai", model: "gpt-6-astra", reasoningEffort: "max", maxOutputTokens: 16_384 };
  const seen: AiRuntimeSelection[] = []; let headerSelectionCalls = 0;
  const gateway = { async generateJson<T>(req: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> {
    seen.push(req.selection);
    return { payload: curriculum as T, selection: req.selection, usage: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } };
  } };
  app.use("/api/ai", knowledgeGraphRouter({ gateway, previewGateway: gateway, previewQuota: new PreviewQuota(), authorize: async () => true, selection: () => { headerSelectionCalls++; return expensive; }, defaultSelection: () => fallback, reserveUser: async () => {}, clientKey: () => "test", error: res => res.status(503).end() }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/preview-course`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-learnhub-ai-provider": expensive.provider, "x-learnhub-ai-model": expensive.model, "x-learnhub-ai-reasoning": expensive.reasoningEffort, "x-learnhub-ai-max-output-tokens": String(expensive.maxOutputTokens) },
    body: JSON.stringify({ subject: "낚시" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [fallback]);
  assert.equal(headerSelectionCalls, 0);
});
test("nudge accepts coder 2 request and falls back without losing response contract or making wrap-up AI calls", async t => {
  const body = { currentConceptName: "통분", steps: [{ kind: "next_lesson", conceptName: "분수 덧셈", becauseOfConceptName: "통분" }] };
  assert.ok(normalizeNudgeRequest(body)); assert.equal(normalizeNudgeRequest({ ...body, steps: Array(4).fill(body.steps[0]) }), null);
  const app = express(); app.use(express.json()); let calls = 0;
  const gateway = { async generateJson<T>(_req: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> { calls++; throw new Error("AI unavailable"); } };
  app.use("/api/ai", knowledgeGraphRouter({ gateway, previewGateway: gateway, previewQuota: new PreviewQuota(), authorize: async () => true, selection: () => DEFAULT_AI_SELECTION, defaultSelection: () => DEFAULT_AI_SELECTION, reserveUser: async () => {}, clientKey: () => "test", error: res => res.status(503).end() }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const request = (b: unknown) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/next-nudge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  const res = await request(body); const payload = await res.json();
  assert.equal(res.status, 200); assert.equal(payload.fallback, true); assert.match(payload.question, /분수 덧셈/u); assert.equal(typeof payload.reason, "string");
  const end = await request({ currentConceptName: "통분", steps: [{ kind: "wrap_up" }] }); assert.match((await end.json()).question, /여기까지/u); assert.equal(calls, 1);
});
