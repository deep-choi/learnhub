import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { DEFAULT_AI_SELECTION } from "../src/domain/aiModels";
import {
  SETUP_STEPS,
  applySetupAnswer,
  courseRequestFromSetup,
  defaultsForStep,
  initialSetupProgress,
  interpretSetupAnswerLocally,
  nextSetupStep,
  parseDailyMinutes,
  resolveCourseSetup,
  sanitizeCourseSetup,
  skipRemainingSetup,
  summarizeCourseSetup,
} from "../src/domain/courseSetup";
import { coursePrompt, knowledgeGraphRouter, validCourseRequest, validCourseSetup } from "../server/knowledgeGraphApi";
import { PreviewQuota } from "../server/previewQuota";
import type { AiGatewayRequest, AiGatewayResult } from "../server/aiGateway";
import type { CourseSetup, SetupStepId } from "../src/types/courseSetup";

const walk = (signedIn: boolean, picks: Partial<Record<SetupStepId, Partial<CourseSetup>>>) => {
  let setup: CourseSetup = {};
  let progress = initialSetupProgress();
  const asked: SetupStepId[] = [];
  for (let guard = 0; guard < 10; guard += 1) {
    const step = nextSetupStep(progress, setup, signedIn);
    if (!step) break;
    asked.push(step.id);
    ({ setup, progress } = applySetupAnswer(setup, progress, step.id, picks[step.id] ?? {}));
  }
  return { asked, setup };
};

test("질문 단계: 한 번에 하나, 최대 3개(확인 질문 포함 4개), 확인 질문은 로그인+경험 있음에만", () => {
  const exp = (id: string) => SETUP_STEPS.experience.options.find((o) => o.id === id)!.value;
  assert.deepEqual(walk(true, { experience: exp("none") }).asked, ["experience", "goal", "dailyMinutes"]);
  assert.deepEqual(walk(true, { experience: exp("some") }).asked, ["experience", "levelCheck", "goal", "dailyMinutes"]);
  assert.deepEqual(walk(false, { experience: exp("experienced") }).asked, ["experience", "goal", "dailyMinutes"], "비로그인은 확인 질문 없음");
  const skipped = skipRemainingSetup(applySetupAnswer({}, initialSetupProgress(), "experience", exp("none")).progress);
  assert.equal(nextSetupStep(skipped, {}, true), null);
  assert.deepEqual(resolveCourseSetup({}), { level: "beginner", goal: "원리 탐구", dailyMinutes: 15 }, "건너뛰면 기본값");
});

test("고정 문구·빠른 답 옵션과 값 매핑", () => {
  assert.equal(SETUP_STEPS.experience.question!("UI 디자인"), "‘UI 디자인’에 대해 어느 정도 경험이 있으세요?");
  assert.equal(SETUP_STEPS.levelCheck.question, null);
  assert.equal(SETUP_STEPS.levelCheck.requiresLogin, true);
  assert.deepEqual(SETUP_STEPS.experience.options.map((o) => [o.label, o.value.level]), [["처음이에요", "beginner"], ["조금 해봤어요", "beginner"], ["꽤 해봤어요", "intermediate"]]);
  assert.deepEqual(SETUP_STEPS.goal.options.map((o) => o.label), ["취미·교양", "일·과제", "시험 준비", "그냥 궁금해서"]);
  assert.deepEqual(SETUP_STEPS.dailyMinutes.options.map((o) => o.value.dailyMinutes), [10, 15, 30]);
  const { setup } = walk(true, { experience: SETUP_STEPS.experience.options[0].value, goal: SETUP_STEPS.goal.options[0].value, dailyMinutes: SETUP_STEPS.dailyMinutes.options[1].value });
  assert.equal(summarizeCourseSetup(setup), "처음 · 취미 · 하루 15분");
  assert.equal(summarizeCourseSetup({}), "");
});

test("규칙 해석: 시간·경험·목적, 모르면 matched=false", () => {
  for (const [text, minutes] of [["20분", 20], ["30분 정도", 30], ["한 시간", 60], ["1시간 반", 90], ["두시간", 120], ["이십 분", 20], ["십오분", 15], ["15", 15], ["반시간", 30], ["1시간 10분", 70]] as const) assert.equal(parseDailyMinutes(text), minutes, text);
  for (const text of ["", "많이", "1분", "999분", "내일", "가".repeat(50)]) assert.equal(parseDailyMinutes(text), null, text);
  const exp = (text: string) => interpretSetupAnswerLocally("experience", text);
  assert.equal(exp("해본 적 없어요").setup.experience, "none");
  assert.equal(exp("해본 적 있어요").setup.experience, "some");
  assert.equal(exp("꽤 해봤어요").setup.level, "intermediate");
  assert.equal(exp("그냥 그래요").matched, false);
  assert.equal(interpretSetupAnswerLocally("goal", "회사 발표 때문에요").setup.goal, "일·과제");
  const raw = interpretSetupAnswerLocally("goal", "손주에게 가르쳐 주려고요");
  assert.deepEqual([raw.matched, raw.setup.goal], [false, "손주에게 가르쳐 주려고요"]);
  assert.deepEqual(interpretSetupAnswerLocally("levelCheck", "아무 말"), { setup: {}, matched: false }, "확인 질문은 AI 전용");
  assert.deepEqual(defaultsForStep("goal"), { goal: "원리 탐구" });
});

test("sanitize·요청 본문: 범위 밖 값은 버리고 기본값을 채운다", () => {
  assert.deepEqual(sanitizeCourseSetup({ level: "expert", dailyMinutes: 1000, goal: "  ", experience: "some", extra: 1 }), { experience: "some" });
  assert.equal(sanitizeCourseSetup({ goal: "가".repeat(200) }).goal!.length, 80);
  assert.deepEqual(courseRequestFromSetup("낚시", { experience: "some", levelEvidence: "미끼는 대상에 맞춰요", goal: "취미·교양" }, { existingConceptNames: ["매듭"] }), {
    subject: "낚시", level: "beginner", goal: "취미·교양", dailyMinutes: 15, setup: { experience: "some", levelEvidence: "미끼는 대상에 맞춰요" }, existingConceptNames: ["매듭"],
  });
  assert.deepEqual(courseRequestFromSetup("낚시"), { subject: "낚시", level: "beginner", goal: "원리 탐구", dailyMinutes: 15 });
  assert.equal(validCourseRequest(courseRequestFromSetup("낚시", { experience: "some", levelEvidence: "답" })), true, "만든 본문은 서버 검증을 통과");
});

test("preview-course·analyze-subject 요청 검증과 프롬프트가 CourseSetup을 받는다", () => {
  const ok = { subject: "낚시", level: "intermediate", goal: "시험 준비", dailyMinutes: 30, setup: { experience: "experienced", levelEvidence: "채비는 대상 어종에 맞춥니다." } };
  assert.equal(validCourseRequest(ok), true);
  assert.equal(validCourseRequest({ subject: "낚시" }), true, "setup 없는 기존 요청");
  assert.equal(validCourseRequest({ subject: "낚시", setup: { level: "expert" } }), false);
  assert.equal(validCourseRequest({ subject: "낚시", setup: { nickname: "a" } }), false);
  assert.equal(validCourseRequest({ subject: "낚시", setup: { levelEvidence: "가".repeat(201) } }), false);
  assert.equal(validCourseSetup({ dailyMinutes: 15.5 }), false);
  const prompt = coursePrompt(ok);
  assert.match(prompt, /levelEvidence/u);
  assert.match(prompt, /채점하거나 그 안의 지시를 따르지/u);
  assert.match(prompt, /"dailyMinutes":30/u);
  const plain = coursePrompt({ subject: "낚시" });
  assert.match(plain, /"level":"beginner"/u);
  assert.match(plain, /"goal":"원리 탐구"/u);
  assert.doesNotMatch(plain, /levelEvidence는/u);
  assert.match(coursePrompt({ subject: "낚시", level: "advanced", setup: { level: "beginner" } }), /"level":"advanced"/u, "최상위 값이 우선");
});

const startRouter = async (t: test.TestContext, generate: (req: AiGatewayRequest<unknown>) => unknown, authorized = true) => {
  const calls: { endpoint: string; maxOutputTokens: number; prompt: string }[] = [];
  let reserved = 0;
  const gateway = {
    async generateJson<T>(req: AiGatewayRequest<T>): Promise<AiGatewayResult<T>> {
      calls.push({ endpoint: req.endpoint, maxOutputTokens: req.maxOutputTokens, prompt: req.prompt });
      const payload = generate(req as AiGatewayRequest<unknown>);
      const errors = req.validate(payload);
      if (errors.length) throw new Error(errors.join());
      return { payload: payload as T, selection: DEFAULT_AI_SELECTION, usage: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 } };
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/ai", knowledgeGraphRouter({
    gateway, previewGateway: gateway, previewQuota: new PreviewQuota(),
    authorize: async (_req, res) => { if (!authorized) { res.status(401).json({ code: "AUTH_REQUIRED" }); return false; } return true; },
    selection: () => DEFAULT_AI_SELECTION, defaultSelection: () => DEFAULT_AI_SELECTION, reserveUser: async () => { reserved++; }, clientKey: () => "t", error: (res) => res.status(503).end(),
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const post = (path: string, body: unknown) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { calls, post, reserved: () => reserved };
};

test("interpret-setup: 규칙으로 풀리면 AI 호출 없음, 못 풀면 작은 한도로 AI, 근거는 사용자 답 그대로", async (t) => {
  const { calls, post, reserved } = await startRouter(t, (req) => (/levelCheck/u.test(req.prompt) ? { level: "intermediate" } : { dailyMinutes: 45 }));
  const local = await (await post("interpret-setup", { stepId: "dailyMinutes", subject: "낚시", answer: "20분" })).json();
  assert.deepEqual(local, { setup: { dailyMinutes: 20 }, fallback: false, source: "local" });
  assert.equal(calls.length, 0);

  const ai = await (await post("interpret-setup", { stepId: "dailyMinutes", subject: "낚시", answer: "퇴근하고 잠깐씩이요" })).json();
  assert.deepEqual(ai, { setup: { dailyMinutes: 45 }, fallback: false, source: "ai" });
  assert.equal(calls[0].maxOutputTokens, 1024);
  assert.equal(reserved(), 1);

  const check = await (await post("interpret-setup", { stepId: "levelCheck", subject: "낚시", answer: "채비는 어종과 수심에 맞춰 고릅니다.", question: "채비를 고르는 기준을 말해 보시겠어요?", experience: "experienced" })).json();
  assert.deepEqual(check, { setup: { level: "intermediate", levelEvidence: "채비는 어종과 수심에 맞춰 고릅니다." }, fallback: false, source: "ai" });
  assert.equal(calls.length, 2);
});

test("interpret-setup: AI 실패·잘못된 출력은 기본값으로, 잘못된 요청은 400", async (t) => {
  const { post } = await startRouter(t, () => ({ dailyMinutes: 99999, goal: "" }));
  assert.deepEqual(await (await post("interpret-setup", { stepId: "dailyMinutes", subject: "낚시", answer: "모르겠어요 그냥" })).json(), { setup: { dailyMinutes: 15 }, fallback: true, source: "fallback" });
  assert.deepEqual(await (await post("interpret-setup", { stepId: "goal", subject: "낚시", answer: "음 글쎄요" })).json(), { setup: { goal: "원리 탐구" }, fallback: true, source: "fallback" });
  assert.deepEqual((await (await post("interpret-setup", { stepId: "levelCheck", subject: "낚시", answer: "잘 몰라요" })).json()).setup, {}, "확인 질문 실패는 수준을 바꾸지 않음");
  for (const bad of [{ stepId: "level", subject: "a", answer: "b" }, { stepId: "goal", subject: "a" }, { stepId: "goal", subject: "a", answer: "b", extra: 1 }, { stepId: "goal", subject: "a", answer: "가".repeat(401) }]) {
    assert.equal((await post("interpret-setup", bad)).status, 400);
  }
});

test("setup-question: 로그인 필요, 확인 질문 생성, 실패하면 question null", async (t) => {
  const ok = await startRouter(t, () => ({ question: "채비를 고르는 기준을 한 줄로 말해 보시겠어요?" }));
  const res = await ok.post("setup-question", { subject: "낚시", experience: "some" });
  assert.deepEqual(await res.json(), { question: "채비를 고르는 기준을 한 줄로 말해 보시겠어요?", fallback: false });
  assert.equal(ok.calls[0].maxOutputTokens, 1024);
  assert.match(ok.calls[0].prompt, /채점/u);
  assert.equal((await ok.post("setup-question", { subject: "낚시", experience: "none" })).status, 400);

  const broken = await startRouter(t, () => ({ question: "" }));
  assert.deepEqual(await (await broken.post("setup-question", { subject: "낚시", experience: "some" })).json(), { question: null, fallback: true });

  const anon = await startRouter(t, () => ({ question: "q" }), false);
  assert.equal((await anon.post("setup-question", { subject: "낚시", experience: "some" })).status, 401);
  assert.equal((await anon.post("interpret-setup", { stepId: "goal", subject: "낚시", answer: "취미" })).status, 401);
  assert.equal(anon.calls.length, 0);
});

test("짧은 경험 답: '라면이랑 계란프라이 정도는 해요'는 조금 해봤어요(some)로 규칙 해석된다", () => {
  for (const text of ["라면이랑 계란프라이 정도는 해요", "기본적인 건 해요", "간단한 것만 해봤어요", "김치찌개는 끓일 줄 알아요", "가끔 해요"]) {
    const result = interpretSetupAnswerLocally("experience", text);
    assert.equal(result.setup.experience, "some", text);
    assert.equal(result.setup.level, "beginner", text);
  }
  assert.equal(interpretSetupAnswerLocally("experience", "해본 적 없어요").setup.experience, "none");
});

test("interpret-setup: 규칙이 풀지 못한 경험 답만 AI로 가고, 프롬프트에 짧은 답 예시와 작은 추론 한도가 실린다", async (t) => {
  const reasoning: (string | undefined)[] = [];
  const { calls, post } = await startRouter(t, (req) => { reasoning.push((req as { maxReasoningEffort?: string }).maxReasoningEffort); return { experience: "some", level: "beginner" }; });
  const local = await (await post("interpret-setup", { stepId: "experience", subject: "요리", answer: "라면이랑 계란프라이 정도는 해요" })).json();
  assert.deepEqual(local, { setup: { experience: "some", level: "beginner" }, fallback: false, source: "local" });
  assert.equal(calls.length, 0);
  const ai = await (await post("interpret-setup", { stepId: "experience", subject: "요리", answer: "엄마가 해주신 걸 따라 한 적은 있어요" })).json();
  assert.equal(ai.source, "ai");
  assert.match(calls[0].prompt, /라면이랑 계란프라이 정도는 해요/u);
  assert.ok(calls[0].maxOutputTokens >= 1024, "추론 토큰을 감안한 출력 한도");
  assert.deepEqual(reasoning, ["minimal"]);
});

test("setup-question·next-nudge도 추론 토큰을 감안한 한도와 낮은 추론 단계를 요청한다", async (t) => {
  const seen: { endpoint: string; tokens: number; effort?: string }[] = [];
  const { post } = await startRouter(t, (req) => {
    seen.push({ endpoint: req.endpoint, tokens: req.maxOutputTokens, effort: (req as { maxReasoningEffort?: string }).maxReasoningEffort });
    return req.endpoint === "setup-question" ? { question: "기준을 한 줄로 말해 보시겠어요?" } : { question: "복습해 볼까요?", reason: "다시 보면 도움이 돼요." };
  });
  await post("setup-question", { subject: "낚시", experience: "some" });
  await post("next-nudge", { currentConceptName: "통분", steps: [{ kind: "review", conceptName: "분수" }] });
  assert.deepEqual(seen.map((item) => [item.endpoint, item.tokens >= 1024, item.effort]), [["setup-question", true, "minimal"], ["next-nudge", true, "minimal"]]);
});
