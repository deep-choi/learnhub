export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type SetupExperience = "none" | "some" | "experienced";

/** 대화로 모은 과목 설정. 모든 항목은 선택이며, 비어 있으면 기본값을 쓴다. */
export interface CourseSetup {
  level?: CourseLevel;
  /** 학습 목적. 빠른 답의 이름이거나 사용자가 쓴 짧은 문장(80자 이내) */
  goal?: string;
  dailyMinutes?: number;
  /** 경험 질문에 대한 답. 수준 추정의 근거이며 화면에 "처음 · 취미 · 하루 15분"처럼 보여 준다. */
  experience?: SetupExperience;
  /** 확인 질문에 대한 사용자의 답(채점하지 않고 수준 추정에만 쓴다). 200자 이내 */
  levelEvidence?: string;
}

export type SetupStepId = "experience" | "levelCheck" | "goal" | "dailyMinutes";

export interface SetupOption {
  id: string;
  /** 칩에 보이는 문구 */
  label: string;
  /** 설정 요약("처음 · 취미 · 하루 15분")에 쓰는 짧은 이름 */
  short?: string;
  /** 이 칩을 눌렀을 때 설정에 합쳐지는 값 */
  value: Partial<CourseSetup>;
}

export interface SetupStep {
  id: SetupStepId;
  /** 이 단계가 채우는 항목 */
  field: "experience" | "goal" | "dailyMinutes" | "levelEvidence";
  /** 고정 질문 문구. levelCheck는 AI가 주제에 맞춰 만들므로 null이다. */
  question: ((subject: string) => string) | null;
  options: SetupOption[];
  /** 칩 대신 직접 써서 답할 수 있는지 */
  allowFreeText: boolean;
  /** 로그인 사용자에게만 묻는지(AI 호출이 필요한 단계) */
  requiresLogin: boolean;
}

/** 지금까지 어떤 질문을 했고 건너뛰었는지. 대화 상태에 들고 있으면 된다. */
export interface SetupProgress {
  answered: SetupStepId[];
  skipped: boolean;
}

export interface ResolvedCourseSetup {
  level: CourseLevel;
  goal: string;
  dailyMinutes: number;
  experience?: SetupExperience;
  levelEvidence?: string;
}

export interface SetupAnswerResult {
  setup: Partial<CourseSetup>;
  /** 규칙이나 AI가 답을 실제로 해석했는지. false면 기본값/원문을 쓴 것이다. */
  matched: boolean;
  source: "chip" | "local" | "ai" | "fallback";
}
