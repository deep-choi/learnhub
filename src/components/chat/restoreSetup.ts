import {
  SETUP_INTRO,
  SETUP_LEVEL_CHECK_NOTE,
  SETUP_SKIP_OPTION,
  SETUP_STEPS,
  applySetupAnswer,
  initialSetupProgress,
  interpretSetupAnswerLocally,
  nextSetupStep,
  pickSetupFields,
} from "../../domain/courseSetup";
import type { CourseSetup, SetupProgress, SetupStep } from "../../types/courseSetup";

export interface RestoredSetup {
  subject: string;
  setup: CourseSetup;
  progress: SetupProgress;
  /** 아직 답하지 않은 질문 단계 */
  step: SetupStep;
  question: string;
  /** 그 질문이 들어 있는 메시지 위치 */
  messageIndex: number;
}

type Line = { role: "user" | "assistant"; text: string };

/** 저장된 질문 문구가 어느 단계의 질문인지 알아봅니다. */
const stepOfQuestion = (text: string, subject: string): SetupStep | null => {
  for (const id of ["experience", "goal", "dailyMinutes"] as const) {
    const question = SETUP_STEPS[id].question?.(subject);
    if (question && text.includes(question)) return SETUP_STEPS[id];
  }
  return text.includes(SETUP_LEVEL_CHECK_NOTE) ? SETUP_STEPS.levelCheck : null;
};

/**
 * 다시 연 대화에서 답하지 않은 설정 질문이 있으면 그 단계를 되살립니다.
 * ChatSession에는 설정 진행 상태 필드가 없어서, 저장된 질문·답 문장을 앞에서부터 다시 읽어 복원합니다.
 * 질문이 끝났거나(미리보기를 만든 뒤) 읽을 수 없으면 null입니다.
 */
export function restoreSetupFlow(messages: Line[], signedIn: boolean): RestoredSetup | null {
  let start = -1;
  let subject = "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const quoted = /‘([^’]+)’/u.exec(message.text)?.[1];
    const question = quoted ? SETUP_STEPS.experience.question?.(quoted) : null;
    if (quoted && question && message.text.includes(question)) {
      start = i;
      subject = quoted;
      break;
    }
  }
  if (start < 0) return null;

  let setup: CourseSetup = {};
  let progress = initialSetupProgress();
  let pending: { step: SetupStep; question: string; index: number } | null = null;

  for (let i = start; i < messages.length; i += 1) {
    const message = messages[i];
    if (message.role === "assistant") {
      const step = stepOfQuestion(message.text, subject);
      if (step) {
        const question = step.question ? step.question(subject) : message.text.replace(SETUP_INTRO, "").replace(SETUP_LEVEL_CHECK_NOTE, "").trim();
        pending = { step, question, index: i };
      }
      continue;
    }
    if (!pending) continue;
    if (message.text === SETUP_SKIP_OPTION.label || /바로\s*만들/u.test(message.text)) return null;
    const option = pending.step.options.find((candidate) => candidate.label === message.text);
    let value: Partial<CourseSetup>;
    if (option) {
      value = option.value;
    } else if (pending.step.id === "levelCheck") {
      value = pickSetupFields("levelCheck", { levelEvidence: message.text });
    } else {
      const local = interpretSetupAnswerLocally(pending.step.id, message.text);
      // 못 알아들어 다시 물었던 답은 건너뜁니다.
      if (!local.matched && pending.step.id !== "goal") continue;
      value = local.setup;
    }
    ({ setup, progress } = applySetupAnswer(setup, progress, pending.step.id, value));
    pending = null;
  }

  if (!pending) return null;
  // 지금 상태에서 실제로 다음에 물을 질문과 같을 때만 이어갑니다.
  if (nextSetupStep(progress, setup, signedIn)?.id !== pending.step.id) return null;
  return { subject, setup, progress, step: pending.step, question: pending.question, messageIndex: pending.index };
}
