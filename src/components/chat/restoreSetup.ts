import {
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  SETUP_INTRO,
  SETUP_LEVEL_CHECK_NOTE,
  SETUP_REASK,
  SETUP_SKIP_OPTION,
  SETUP_STEPS,
  applySetupAnswer,
  initialSetupProgress,
  interpretSetupAnswerLocally,
  nextSetupStep,
  pickSetupFields,
} from "../../domain/courseSetup";
import type { CourseSetup, SetupProgress, SetupStep } from "../../types/courseSetup";
import type { ChatSetupState } from "../../types/chat";

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

type Line = { role: "user" | "assistant"; text: string; setupState?: ChatSetupState };

/** 저장된 질문 문구가 어느 단계의 질문인지 알아봅니다. */
const stepOfQuestion = (text: string, subject: string): SetupStep | null => {
  for (const id of ["experience", "goal", "dailyMinutes"] as const) {
    const question = SETUP_STEPS[id].question?.(subject);
    if (question && text.includes(question)) return SETUP_STEPS[id];
  }
  return text.includes(SETUP_LEVEL_CHECK_NOTE) || text.includes("정답을 맞히는 게 아니에요. 수준을 가늠하는 데만 써요.") ? SETUP_STEPS.levelCheck : null;
};

interface Replay {
  subject: string;
  setup: CourseSetup;
  progress: SetupProgress;
  /** 아직 답하지 않은 질문. 없으면 질문이 끝났거나 건너뛴 것입니다. */
  pending: { step: SetupStep; question: string; index: number } | null;
}

/** 마지막 경험 질문부터 질문·답을 앞에서부터 다시 읽어 설정과 진행 상황을 되살립니다. 설정 질문이 없으면 null입니다. */
function replaySetup(messages: Line[]): Replay | null {
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
  let pending: Replay["pending"] = null;

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
    if (message.text === SETUP_SKIP_OPTION.label || /바로\s*만들/u.test(message.text)) return { subject, setup, progress, pending: null };
    // 못 알아들어 다시 물었던 답은 건너뜁니다. 해석은 저장 당시 AI가 했을 수도 있어서, 다시 묻는 문장이 바로 뒤따랐는지로만 판단합니다.
    if (messages[i + 1]?.role === "assistant" && messages[i + 1].text === SETUP_REASK) continue;
    const option = pending.step.options.find((candidate) => candidate.label === message.text);
    let value: Partial<CourseSetup>;
    if (option) {
      value = option.value;
    } else if (pending.step.id === "levelCheck") {
      value = pickSetupFields("levelCheck", { levelEvidence: message.text });
    } else {
      // 규칙으로 읽히면 그 값을 쓰고, 아니면(AI가 읽었던 답) 비워 둡니다.
      value = interpretSetupAnswerLocally(pending.step.id, message.text).setup;
    }
    ({ setup, progress } = applySetupAnswer(setup, progress, pending.step.id, value));
    pending = null;
  }
  return { subject, setup, progress, pending };
}

/**
 * 다시 연 대화에서 답하지 않은 설정 질문이 있으면 그 단계를 되살립니다.
 * ChatSession에는 설정 진행 상태 필드가 없어서, 저장된 질문·답 문장을 다시 읽어 복원합니다.
 * 질문이 끝났거나(미리보기를 만든 뒤) 읽을 수 없으면 null입니다.
 */
export function restoreSetupFlow(messages: Line[], signedIn: boolean): RestoredSetup | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const state = messages[index].setupState;
    if (!state) continue;
    const expectedStep = nextSetupStep(state.progress, state.setup, signedIn)?.id;
    const legacyExperienceQuestion = signedIn && state.stepId === "experience" && !state.progress.answered.includes("experience");
    if (!state.stepId || !state.question || (expectedStep !== state.stepId && !legacyExperienceQuestion)) return null;
    return { subject: state.subject, setup: state.setup, progress: state.progress, step: SETUP_STEPS[state.stepId], question: state.question, messageIndex: index };
  }
  const replay = replaySetup(messages);
  if (!replay?.pending) return null;
  const { subject, setup, progress, pending } = replay;
  // 지금 상태에서 실제로 다음에 물을 질문과 같을 때만 이어갑니다.
  const expectedStep = nextSetupStep(progress, setup, signedIn)?.id;
  const legacyExperienceQuestion = signedIn && pending.step.id === "experience" && !progress.answered.includes("experience");
  if (expectedStep !== pending.step.id && !legacyExperienceQuestion) return null;
  return { subject, setup, progress, step: pending.step, question: pending.question, messageIndex: pending.index };
}

const LEVEL_OF_LABEL: Record<string, NonNullable<CourseSetup["level"]>> = { 초급: "beginner", 중급: "intermediate", 고급: "advanced" };

/** 미리보기 안내 문장 속 "(조금 해봄 · 취미 · 하루 20분)" 요약을 설정으로 되돌립니다. 읽을 수 없으면 null입니다. */
export function parseSetupSummary(text: string): CourseSetup | null {
  const summary = /\(([^()]+)\)/u.exec(text)?.[1];
  if (!summary) return null;
  const setup: CourseSetup = {};
  let matched = false;
  for (const raw of summary.split("·")) {
    const part = raw.trim();
    if (!part) continue;
    const minutes = /^하루\s*(\d+)\s*분$/u.exec(part);
    const experience = EXPERIENCE_OPTIONS.find((option) => option.short === part);
    const goal = GOAL_OPTIONS.find((option) => option.short === part);
    if (minutes) setup.dailyMinutes = Number(minutes[1]);
    else if (experience) Object.assign(setup, experience.value);
    else if (LEVEL_OF_LABEL[part]) setup.level = LEVEL_OF_LABEL[part];
    else setup.goal = goal ? goal.value.goal : part;
    matched = true;
  }
  return matched ? setup : null;
}

/**
 * 이미 만든 미리보기 카드에 쓸 설정을 되살립니다. 미리보기를 만들 때 대화에 남긴 요약 문장이 가장 정확하고(AI가 읽은 답 포함),
 * 없으면 앞선 질문·답을 다시 읽어 만듭니다.
 */
export function restorePreviewSetup(messages: Line[], index: number): CourseSetup | undefined {
  for (let i = Math.min(index, messages.length - 1); i >= 0; i--) {
    if (messages[i].setupState) return messages[i].setupState!.setup;
  }
  const parsed = parseSetupSummary(messages[index]?.text ?? "");
  if (parsed) return parsed;
  return replaySetup(messages.slice(0, index))?.setup;
}
