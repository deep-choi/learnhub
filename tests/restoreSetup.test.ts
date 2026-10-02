import assert from "node:assert/strict";
import test from "node:test";
import { SETUP_INTRO, SETUP_SKIP_OPTION, SETUP_STEPS } from "../src/domain/courseSetup";
import { restoreSetupFlow } from "../src/components/chat/restoreSetup";

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
