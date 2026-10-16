import type {
  CourseLevel,
  CourseSetup,
  ResolvedCourseSetup,
  SetupExperience,
  SetupOption,
  SetupProgress,
  SetupStep,
  SetupStepId,
} from "../types/courseSetup";

export const DEFAULT_COURSE_SETUP = { level: "beginner" as CourseLevel, goal: "원리 탐구", dailyMinutes: 15 };
export const SETUP_LIMITS = { goalLength: 80, evidenceLength: 2400, maxLevelChecks: 4, minMinutes: 5, maxMinutes: 240 } as const;

export const SETUP_INTRO = "어떤 내용을 배울 수 있는지 살펴보고, 짧은 질문으로 지금 이해하고 있는 부분과 시작점을 함께 찾아볼게요.";
export const SETUP_REASK = "잘 이해하지 못했어요. 아래에서 골라 주시거나 조금 다르게 써 주세요.";
export const SETUP_LEVEL_CHECK_NOTE = "알고 있는 만큼 편하게 답해 주세요. 이 답으로 설명의 깊이와 배울 시작점을 정할게요.";

/** "바로 만들어 주세요" 칩. 누르면 남은 질문을 건너뛰고 빈 항목은 기본값을 쓴다. */
export const SETUP_SKIP_OPTION = { id: "skip", label: "바로 배울게요" } as const;

export const EXPERIENCE_OPTIONS: SetupOption[] = [
  { id: "none", label: "처음이에요", short: "처음", value: { experience: "none", level: "beginner" } },
  { id: "some", label: "조금 해봤어요", short: "조금 해봄", value: { experience: "some", level: "beginner" } },
  { id: "experienced", label: "꽤 해봤어요", short: "꽤 해봄", value: { experience: "experienced", level: "intermediate" } },
];
export const GOAL_OPTIONS: SetupOption[] = [
  { id: "hobby", label: "취미·교양", short: "취미", value: { goal: "취미·교양" } },
  { id: "work", label: "일·과제", short: "일·과제", value: { goal: "일·과제" } },
  { id: "exam", label: "시험 준비", short: "시험", value: { goal: "시험 준비" } },
  { id: "curious", label: "그냥 궁금해서", short: "궁금해서", value: { goal: "궁금해서 알아보기" } },
];
export const MINUTES_OPTIONS: SetupOption[] = [10, 15, 30].map((minutes) => ({ id: `m${minutes}`, label: `${minutes}분`, short: `하루 ${minutes}분`, value: { dailyMinutes: minutes } }));
/** 확인 질문(AI가 만든 문장)에 붙는 칩. 답하기 어려우면 경험 질문에서 정한 수준을 그대로 쓴다. */
export const LEVEL_CHECK_OPTIONS: SetupOption[] = [{ id: "unsure", label: "잘 모르겠어요", value: {} }];

/** 질문 단계 정의. 순서는 `nextSetupStep`이 정한다. */
export const SETUP_STEPS: Record<SetupStepId, SetupStep> = {
  experience: { id: "experience", field: "experience", question: (subject) => `${subject}에 대해 어느 정도 경험이 있으세요?`, options: EXPERIENCE_OPTIONS, allowFreeText: true, requiresLogin: false },
  levelCheck: { id: "levelCheck", field: "levelEvidence", question: null, options: LEVEL_CHECK_OPTIONS, allowFreeText: true, requiresLogin: true },
  goal: { id: "goal", field: "goal", question: () => "어디에 쓰고 싶으세요?", options: GOAL_OPTIONS, allowFreeText: true, requiresLogin: false },
  dailyMinutes: { id: "dailyMinutes", field: "dailyMinutes", question: () => "하루에 얼마나 공부할 수 있으세요?", options: MINUTES_OPTIONS, allowFreeText: true, requiresLogin: false },
};

export const initialSetupProgress = (): SetupProgress => ({ answered: [], skipped: false });

/**
 * 로그인 사용자는 실제 이해를 먼저 확인한다. 비로그인 미리보기에는 경험 선택만 받는다.
 */
export function nextSetupStep(progress: SetupProgress, _setup: CourseSetup, signedIn: boolean): SetupStep | null {
  if (progress.skipped) return null;
  const done = new Set(progress.answered);
  if (signedIn) {
    if (!done.has("levelCheck") && (progress.levelCheckCount ?? 0) < SETUP_LIMITS.maxLevelChecks) return SETUP_STEPS.levelCheck;
    return null;
  }
  if (!done.has("experience")) return SETUP_STEPS.experience;
  return null;
}

export function applySetupAnswer(setup: CourseSetup, progress: SetupProgress, stepId: SetupStepId, value: Partial<CourseSetup>): { setup: CourseSetup; progress: SetupProgress } {
  return {
    setup: sanitizeCourseSetup({ ...setup, ...value }),
    progress: { ...progress, answered: progress.answered.includes(stepId) ? progress.answered : [...progress.answered, stepId], ...(stepId === "levelCheck" ? { levelCheckCount: (progress.levelCheckCount ?? 0) + 1 } : {}) },
  };
}
export const skipRemainingSetup = (progress: SetupProgress): SetupProgress => ({ ...progress, skipped: true });

/** Retain the question as well as the answer so a later curriculum can interpret the evidence. */
export function appendLevelEvidence(previous: string | undefined, question: string, answer: string, feedback?: string): string {
  return [previous, `확인 질문: ${question.slice(0, 300)}`, `학습자 답변: ${answer.slice(0, 400)}`, feedback ? `답변에 대한 판단: ${feedback.slice(0, 400)}` : undefined]
    .filter(Boolean).join("\n").slice(-SETUP_LIMITS.evidenceLength);
}

/** 빈 항목에 기본값(초급 · 원리 탐구 · 15분)을 채운다. */
export function resolveCourseSetup(setup: CourseSetup = {}): ResolvedCourseSetup {
  const clean = sanitizeCourseSetup(setup);
  return {
    level: clean.level ?? DEFAULT_COURSE_SETUP.level,
    goal: clean.goal ?? DEFAULT_COURSE_SETUP.goal,
    dailyMinutes: clean.dailyMinutes ?? DEFAULT_COURSE_SETUP.dailyMinutes,
    ...(clean.experience ? { experience: clean.experience } : {}),
    ...(clean.levelEvidence ? { levelEvidence: clean.levelEvidence } : {}),
  };
}

/** 알 수 없는 값·범위를 벗어난 값은 버린다. 저장하거나 서버로 보내기 전에 쓴다. */
export function sanitizeCourseSetup(setup: unknown): CourseSetup {
  if (!setup || typeof setup !== "object" || Array.isArray(setup)) return {};
  const input = setup as Record<string, unknown>;
  const result: CourseSetup = {};
  if (input.level === "beginner" || input.level === "intermediate" || input.level === "advanced") result.level = input.level;
  if (input.experience === "none" || input.experience === "some" || input.experience === "experienced") result.experience = input.experience;
  if (typeof input.goal === "string" && input.goal.trim()) result.goal = input.goal.replace(/\s+/gu, " ").trim().slice(0, SETUP_LIMITS.goalLength);
  if (typeof input.dailyMinutes === "number" && Number.isInteger(input.dailyMinutes) && input.dailyMinutes >= SETUP_LIMITS.minMinutes && input.dailyMinutes <= SETUP_LIMITS.maxMinutes) result.dailyMinutes = input.dailyMinutes;
  if (typeof input.levelEvidence === "string" && input.levelEvidence.trim()) result.levelEvidence = input.levelEvidence.replace(/\s+/gu, " ").trim().slice(0, SETUP_LIMITS.evidenceLength);
  return result;
}

/** 요약 한 줄: "처음 · 취미 · 하루 15분". 답한 항목만 보여 준다. */
export function summarizeCourseSetup(setup: CourseSetup): string {
  const clean = sanitizeCourseSetup(setup);
  const parts: string[] = [];
  const experience = EXPERIENCE_OPTIONS.find((option) => option.value.experience === clean.experience);
  if (clean.level) parts.push({ beginner: "초급", intermediate: "중급", advanced: "고급" }[clean.level]);
  if (experience?.short) parts.push(`경험: ${experience.short}`);
  if (clean.goal) parts.push(GOAL_OPTIONS.find((option) => option.value.goal === clean.goal)?.short ?? clean.goal);
  if (clean.dailyMinutes) parts.push(`하루 ${clean.dailyMinutes}분`);
  return parts.join(" · ");
}

const NUMERALS: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9, 한: 1, 두: 2, 세: 3, 네: 4 };
const koreanTens = (value: string): number | null => {
  const match = /^(?:([일이삼사오육칠팔구])?십)([일이삼사오육칠팔구])?$/u.exec(value);
  if (!match) return null;
  return (match[1] ? NUMERALS[match[1]] : 1) * 10 + (match[2] ? NUMERALS[match[2]] : 0);
};

/** "20분", "30분 정도", "한 시간", "1시간 반", "이십 분", "15"를 분으로 바꾼다. 해석할 수 없거나 범위 밖이면 null. */
export function parseDailyMinutes(answer: string): number | null {
  const text = answer.normalize("NFKC").replace(/\s+/gu, "");
  if (!text || text.length > 40) return null;
  let minutes: number | null = null;
  const hours = /^(?:약|대략)?(\d+(?:\.\d+)?|[한두세네])시간(반)?/u.exec(text);
  if (hours) {
    const base = /\d/u.test(hours[1]) ? Number(hours[1]) : NUMERALS[hours[1]];
    minutes = Math.round(base * 60 + (hours[2] ? 30 : 0));
    const extra = /시간(?:반)?(\d+)분/u.exec(text);
    if (extra) minutes += Number(extra[1]);
  } else if (/^(?:약|대략)?반시간/u.test(text)) minutes = 30;
  else {
    const digits = /^(?:약|대략)?(\d+)(?:분|min|m)?(?:정도|쯤|가량|이면|요|입니다|할래요)?$/iu.exec(text);
    if (digits) minutes = Number(digits[1]);
    else {
      const korean = /^(?:약|대략)?([일이삼사오육]?십[일이삼사오육칠팔구]?)분/u.exec(text);
      if (korean) minutes = koreanTens(korean[1]);
    }
  }
  return minutes !== null && Number.isFinite(minutes) && minutes >= SETUP_LIMITS.minMinutes && minutes <= SETUP_LIMITS.maxMinutes ? Math.round(minutes) : null;
}

const NEGATIVE_EXPERIENCE = /(?:처음|초보|입문|전혀|하나도|아예|모르|해본\s*적\s*(?:이\s*)?(?:없|x)|안\s*해봤|못\s*해봤|경험\s*(?:이\s*)?없)/u;
const MUCH_EXPERIENCE = /(?:꽤|많이|오래|능숙|전문|자주|숙련|경력|[2-9]\s*년|십\s*년|여러\s*번)/u;
const SOME_EXPERIENCE = /(?:조금|약간|살짝|가끔|몇\s*번|좀\s*해|해본\s*적\s*(?:이\s*)?있|맛만|기초는|정도는|정도만|기본(?:은|만|적인)|간단한\s*것|쉬운\s*것|줄\s*(?:은\s*)?알)/u;
const GOAL_RULES: [RegExp, string][] = [
  [/(?:시험|자격증|수능|토익|면접|합격|입시)/u, "시험 준비"],
  [/(?:일|업무|회사|직장|과제|프로젝트|숙제|발표|보고서|취업|이직)/u, "일·과제"],
  [/(?:취미|교양|재미|즐기|여가)/u, "취미·교양"],
  [/(?:궁금|호기심|그냥|심심)/u, "궁금해서 알아보기"],
];
const experienceValue = (experience: SetupExperience): Partial<CourseSetup> => EXPERIENCE_OPTIONS.find((option) => option.value.experience === experience)!.value;

/**
 * AI 없이 자유 답을 규칙으로 해석한다(비로그인과 비용 절감용). 경험·목적·시간 단계에서만 쓴다.
 * - experience / dailyMinutes: 못 알아들으면 `matched: false`, setup은 비어 있다.
 * - goal: 알려진 목적이면 그 이름, 아니면 사용자가 쓴 문장을 그대로(80자) 목적으로 쓰되 `matched: false`다.
 * - levelCheck는 규칙으로 해석하지 않는다(AI 전용).
 */
export function interpretSetupAnswerLocally(stepId: SetupStepId, answer: string): { setup: Partial<CourseSetup>; matched: boolean } {
  const text = answer.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!text || text.length > 400) return { setup: {}, matched: false };
  if (stepId === "experience") {
    // "해본 적 있어요"가 "해본 적 없어요"로 잘못 읽히지 않도록 부정 표현을 먼저 확인한다.
    if (NEGATIVE_EXPERIENCE.test(text)) return { setup: experienceValue("none"), matched: true };
    if (MUCH_EXPERIENCE.test(text)) return { setup: experienceValue("experienced"), matched: true };
    if (SOME_EXPERIENCE.test(text)) return { setup: experienceValue("some"), matched: true };
    return { setup: {}, matched: false };
  }
  if (stepId === "dailyMinutes") {
    const minutes = parseDailyMinutes(text);
    return minutes === null ? { setup: {}, matched: false } : { setup: { dailyMinutes: minutes }, matched: true };
  }
  if (stepId === "goal") {
    const known = GOAL_RULES.find(([pattern]) => pattern.test(text));
    if (known) return { setup: { goal: known[1] }, matched: true };
    return { setup: sanitizeCourseSetup({ goal: text }), matched: false };
  }
  return { setup: {}, matched: false };
}

/** 항목별로 AI가 돌려줄 수 있는 값만 남긴다(서버가 답을 받을 때 쓴다). */
export function pickSetupFields(stepId: SetupStepId, setup: unknown): Partial<CourseSetup> {
  const clean = sanitizeCourseSetup(setup);
  if (stepId === "experience") return { ...(clean.experience ? { experience: clean.experience } : {}), ...(clean.level ? { level: clean.level } : {}) };
  if (stepId === "goal") return clean.goal ? { goal: clean.goal } : {};
  if (stepId === "dailyMinutes") return clean.dailyMinutes ? { dailyMinutes: clean.dailyMinutes } : {};
  return { ...(clean.level ? { level: clean.level } : {}), ...(clean.levelEvidence ? { levelEvidence: clean.levelEvidence } : {}) };
}

/** 해석에 실패했을 때 그 단계에 쓰는 기본값. 경험·확인 질문은 이미 정한 수준을 바꾸지 않는다. */
export function defaultsForStep(stepId: SetupStepId): Partial<CourseSetup> {
  if (stepId === "goal") return { goal: DEFAULT_COURSE_SETUP.goal };
  if (stepId === "dailyMinutes") return { dailyMinutes: DEFAULT_COURSE_SETUP.dailyMinutes };
  if (stepId === "experience") return { level: DEFAULT_COURSE_SETUP.level };
  return {};
}

/** preview-course·analyze-subject 요청 본문. 비어 있는 항목은 기본값으로 채운다. */
export function courseRequestFromSetup(subject: string, setup: CourseSetup = {}, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const resolved = resolveCourseSetup(setup);
  return {
    subject,
    level: resolved.level,
    goal: resolved.goal,
    dailyMinutes: resolved.dailyMinutes,
    ...(resolved.experience || resolved.levelEvidence ? { setup: { ...(resolved.experience ? { experience: resolved.experience } : {}), ...(resolved.levelEvidence ? { levelEvidence: resolved.levelEvidence } : {}) } } : {}),
    ...extra,
  };
}
