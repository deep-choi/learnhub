/**
 * 레슨 = 튜터가 단계(content.steps)별로 하나씩 이끄는 대화. 이 파일은 화면 상태를 쓰지 않는 순수 조각들입니다.
 * (단계 메시지 문장, 빠른 답 칩, 단계 위치 계산)
 */
import type { ExplanationDepth } from "../graph/graphTypes";

export type FlowActionId =
  | "next" | "easier" | "example" | "continue"
  | "check" | "skip" | "retry" | "finish"
  | "did" | "skip-reflection"
  | "restart" | "ask"
  | "step" | "assessment" | "back" | "other" | "stop" | "more";

export interface FlowAction {
  id: FlowActionId;
  label: string;
  /** id가 "step"일 때: 추천 다음 학습(NextStep의 저장 가능한 부분) */
  step?: { kind: string; conceptId?: string; courseId?: string; lessonId?: string; becauseOfConceptId?: string; score: number };
}

export const ACTION_LABEL = {
  next: "이해했어요, 다음으로",
  easier: "더 쉽게 설명해 주세요",
  example: "예시로 보여주세요",
  continue: "이어서 갈게요",
  check: "확인 문제 풀기",
  skip: "괜찮아요, 넘어갈게요",
  retry: "다시 풀어볼게요",
  finish: "이대로 마칠게요",
  did: "해봤어요",
  practicalSkip: "나중에 해볼게요",
  skipReflection: "건너뛸게요",
  restart: "처음부터 다시 볼래요",
  ask: "바로 질문할게요",
  other: "다른 걸 배울래요",
  stop: "오늘은 여기까지",
  more: "조금 더 해볼래요",
} as const;

/** "더 쉽게 / 예시로" 칩이 AI에게 보내는 질문. 정식 개념 설명은 자유 질문으로 물을 수 있습니다. */
export const DEPTH_QUESTION: Record<"easier" | "example", { depth: ExplanationDepth; question: string }> = {
  easier: { depth: "easy", question: "이 단계를 아주 쉬운 말로 다시 설명해 주세요." },
  example: { depth: "example", question: "이 단계를 정확한 예시 하나로 보여 주세요." },
};

export const stepProgressLabel = (index: number, total: number): string => `(${index + 1}/${total})`;

interface StepLike {
  title: string;
  content: string;
}

/** 첫 메시지는 곧바로 수업 내용으로 시작한다. 목표와 연결은 생성한 본문에 녹인다. */
export function buildStepText(options: { index: number; step: StepLike }): string {
  const { index, step } = options;
  return index === 0 ? step.content : `## ${step.title}\n\n${step.content}`;
}

/** 마지막 단계를 마친 뒤 확인 문제(또는 실기형의 "해봤어요")를 권하는 문장 */
export const closingPrompt = (practical: boolean): string =>
  practical
    ? "여기까지 잘 따라오셨어요. 직접 해보셨다면 알려 주세요. 해본 느낌을 한 줄 남기면 지도에도 기록돼요."
    : "잘 따라오셨어요. 이해했는지 짧게 확인해 볼까요?";

/** 단계 메시지에 붙는 빠른 답. 마지막 단계에는 "다음으로" 대신 확인 문제(실기형은 해봤어요)를 권합니다. */
export function stepActions(index: number, total: number, practical: boolean): FlowAction[] {
  const depth: FlowAction[] = [{ id: "easier", label: ACTION_LABEL.easier }, { id: "example", label: ACTION_LABEL.example }];
  if (index < total - 1) return [{ id: "next", label: ACTION_LABEL.next }, ...depth];
  return practical
    ? [{ id: "did", label: ACTION_LABEL.did }, { id: "skip", label: ACTION_LABEL.practicalSkip }, ...depth]
    : [{ id: "check", label: ACTION_LABEL.check }, { id: "skip", label: ACTION_LABEL.skip }, ...depth];
}

/** 확인 단계로 돌아왔을 때(이어서 갈게요 등) 다시 보여 주는 칩 */
export const checkActions = (practical: boolean): FlowAction[] =>
  practical
    ? [{ id: "did", label: ACTION_LABEL.did }, { id: "skip", label: ACTION_LABEL.practicalSkip }]
    : [{ id: "check", label: ACTION_LABEL.check }, { id: "skip", label: ACTION_LABEL.skip }];

/** 이미 마친 레슨을 다시 열었을 때의 칩 */
export const reopenActions = (): FlowAction[] => [
  { id: "restart", label: ACTION_LABEL.restart },
  { id: "ask", label: ACTION_LABEL.ask },
  { id: "other", label: ACTION_LABEL.other },
];

/** 단계 수가 줄었거나 저장된 값이 어긋나도 항상 올바른 범위 안의 단계를 돌려줍니다. */
export const clampStepIndex = (index: number, total: number): number =>
  total <= 0 ? 0 : Math.min(Math.max(Number.isFinite(index) ? Math.floor(index) : 0, 0), total - 1);
