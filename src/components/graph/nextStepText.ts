import type { KnowledgeGraph, NextStep } from "./graphTypes";
import { josa, quoted } from "./korean";

export interface NudgeText {
  /** 질문형 유도 문장 */
  question: string;
  /** 추천 이유 */
  reason: string;
}

const nameOf = (graph: KnowledgeGraph, id?: string): string => graph.nodes.find((node) => node.id === id)?.name ?? "";

/** 추천 카드 한 줄 제목 */
export const stepTitle = (graph: KnowledgeGraph, step: NextStep): string => {
  const name = nameOf(graph, step.conceptId);
  switch (step.kind) {
    case "review":
      return `${quoted(name)} 다시 보기`;
    case "next_lesson":
      return `다음 레슨: ${name}`;
    case "connected":
      return `${quoted(name)} 배우기`;
    case "curiosity":
      return `궁금했던 ${quoted(name)}`;
    case "deepen":
      return `${quoted(name)} 더 정확하게`;
    case "wrap_up":
      return "오늘은 여기까지";
  }
};

/**
 * 추천 카드의 이유 한 줄.
 * understood가 false(아직 읽는 중)이면 "방금 배운"이라고 단정하지 않고 "지금 보는"으로 말합니다.
 */
export const stepReason = (graph: KnowledgeGraph, step: NextStep, understood = false): string => {
  const because = nameOf(graph, step.becauseOfConceptId);
  const lead = understood ? "방금 배운" : "지금 보는";
  switch (step.kind) {
    case "review":
      return "잠깐 다시 보면 오래 기억돼요.";
    case "next_lesson":
      return because ? `${lead} ${quoted(because)} 다음 순서예요.` : "이 과목의 다음 순서예요.";
    case "connected":
      return because ? `${lead} ${quoted(because, "와/과")} 바로 이어져요.` : "배운 개념과 이어져요.";
    case "curiosity":
      return "나중에 보려고 저장해 둔 궁금증이에요.";
    case "deepen":
      return "쉬운 말로 봤으니 이번엔 정식 개념으로 볼 수 있어요.";
    case "wrap_up":
      return "충분히 했어요. 쉬었다 와도 지도는 그대로예요.";
  }
};

export const stepActionLabel = (step: NextStep): string => {
  switch (step.kind) {
    case "review":
      return "다시 보기";
    case "next_lesson":
    case "connected":
      return "배우러 가기";
    case "curiosity":
      return "알아보기";
    case "deepen":
      return "더 깊게 보기";
    case "wrap_up":
      return "마무리하기";
  }
};

/**
 * AI가 문장을 다듬지 못했을 때, 그리고 아직 레슨을 마치지 않았을 때 쓰는 템플릿 문장.
 * "이해했으니"는 레슨을 마쳤거나 문제를 맞힌 뒤(understood)에만 씁니다.
 */
export const templateNudge = (
  graph: KnowledgeGraph,
  currentConceptId: string | undefined,
  steps: NextStep[],
  understood = false,
): NudgeText | null => {
  const top = steps.find((step) => step.kind !== "wrap_up");
  if (!top) return null;
  const current = nameOf(graph, currentConceptId);
  const target = nameOf(graph, top.conceptId);
  const reason = stepReason(graph, top, understood);
  switch (top.kind) {
    case "review":
      return { question: `${quoted(target)}${josa(target, "을/를")} 잠깐 다시 볼까요?`, reason };
    case "next_lesson":
    case "connected":
      if (!understood) return { question: `다 읽었다면 다음엔 ${quoted(target)}${josa(target, "을/를")} 해볼까요?`, reason };
      return {
        question: current
          ? `${quoted(current)}${josa(current, "을/를")} 이해했으니, 이번엔 ${quoted(target)}${josa(target, "을/를")} 해볼까요?`
          : `이번엔 ${quoted(target)}${josa(target, "을/를")} 해볼까요?`,
        reason,
      };
    case "curiosity":
      return { question: `저장해 둔 ${quoted(target)}, 지금 알아볼까요?`, reason };
    case "deepen":
      return { question: `${quoted(target)}${josa(target, "을/를")} 정식 개념으로도 볼까요?`, reason };
  }
};
