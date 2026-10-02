import assert from "node:assert/strict";
import test from "node:test";
import { SETUP_INTRO, SETUP_REASK, SETUP_SKIP_OPTION, SETUP_STEPS } from "../src/domain/courseSetup";
import { parseSetupSummary, restorePreviewSetup, restoreSetupFlow } from "../src/components/chat/restoreSetup";

const subject = "집밥 요리";
const q = (id: "experience" | "goal" | "dailyMinutes") => SETUP_STEPS[id].question!(subject);
const ask = (text: string) => ({ role: "assistant" as const, text });
const say = (text: string) => ({ role: "user" as const, text });

test("reopened chat resumes at the unanswered goal question with earlier answers", () => {
  const restored = restoreSetupFlow([say("집밥 요리 배우고 싶어요"), ask(`${SETUP_INTRO}\n\n${q("experience")}`), say("처음이에요"), ask(q("goal"))], true);
  assert.ok(restored);
  assert.equal(restored.subject, subject);
  assert.equal(restored.step.id, "goal");
  assert.equal(restored.messageIndex, 3);
  assert.equal(restored.setup.experience, "none");
});

test("resumes at the last question after chips and free-text answers", () => {
  const restored = restoreSetupFlow(
    [ask(`${SETUP_INTRO}\n\n${q("experience")}`), say("전혀 몰라요"), ask(q("goal")), say("취미·교양"), ask(q("dailyMinutes"))],
    false,
  );
  assert.ok(restored);
  assert.equal(restored.step.id, "dailyMinutes");
  assert.equal(restored.setup.goal, "취미·교양");
  assert.deepEqual(restored.progress.answered, ["experience", "goal"]);
});

test("a finished or skipped setup does not resume", () => {
  const done = [ask(`${SETUP_INTRO}\n\n${q("experience")}`), say("처음이에요"), ask(q("goal")), say("취미·교양"), ask(q("dailyMinutes")), say("15분"), ask("지도를 만들어 봤어요.")];
  assert.equal(restoreSetupFlow(done, true), null);
  assert.equal(restoreSetupFlow([ask(q("experience")), say(SETUP_SKIP_OPTION.label), ask("지도를 만들어 봤어요.")], true), null);
  assert.equal(restoreSetupFlow([say("안녕"), ask("안녕하세요!")], true), null);
});

test("an answer the local rules cannot read is still an answer once the chat moved on", () => {
  const messages = [
    ask(`${SETUP_INTRO}

${q("experience")}`), say("조금 해봤어요"), ask(q("goal")), say("취미·교양"), ask(q("dailyMinutes")),
    say("20분 정도요"), ask("좋아요. ‘집밥 요리’의 개념 지도를 만들어 봤어요. (조금 해봄 · 취미 · 하루 20분) 마음에 들면 이 지도로 시작해요."),
  ];
  assert.equal(restoreSetupFlow(messages, false), null);
});

test("a re-asked question stays open and an unread answer before the re-ask is skipped", () => {
  const restored = restoreSetupFlow([ask(`${SETUP_INTRO}

${q("experience")}`), say("음 글쎄"), ask(SETUP_REASK)], false);
  assert.ok(restored);
  assert.equal(restored.step.id, "experience");
});

test("the preview card gets the setup shown in the intro sentence, including AI-read answers", () => {
  assert.deepEqual(parseSetupSummary("좋아요. (조금 해봄 · 취미 · 하루 20분) 시작해요."), { experience: "some", level: "beginner", goal: "취미·교양", dailyMinutes: 20 });
  assert.deepEqual(parseSetupSummary("(초급 · 원리 탐구 · 하루 15분)"), { level: "beginner", goal: "원리 탐구", dailyMinutes: 15 });
  assert.equal(parseSetupSummary("요약 없음"), null);
  const messages = [ask(`${SETUP_INTRO}

${q("experience")}`), say("처음이에요"), ask(q("goal")), say("시험 준비"), ask(q("dailyMinutes")), say("15분"), ask("지도를 만들어 봤어요.")];
  // 요약이 없으면 앞선 질문·답을 다시 읽어 만듭니다.
  assert.deepEqual(restorePreviewSetup(messages, 6), { experience: "none", level: "beginner", goal: "시험 준비", dailyMinutes: 15 });
});

test("the new intro sentence has no summary, so the setup is rebuilt from the answers while old sentences still parse", () => {
  const intro = "좋아요. ‘집밥 요리’ 학습 과정을 만들어 봤어요. 마음에 들면 이 과정으로 시작해요.";
  assert.equal(parseSetupSummary(intro), null);
  const messages = [ask(`${SETUP_INTRO}\n\n${q("experience")}`), say("꽤 해봤어요"), ask(q("goal")), say("일·과제"), ask(q("dailyMinutes")), say("30분"), ask(intro)];
  assert.deepEqual(restorePreviewSetup(messages, 6), { experience: "experienced", level: "intermediate", goal: "일·과제", dailyMinutes: 30 });
  assert.equal(restoreSetupFlow(messages, true), null);
});
