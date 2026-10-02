import React, { useMemo, useState } from "react";
import { ChevronDown, Network } from "lucide-react";
import { GraphCanvas } from "./GraphCanvas";
import { getLocalGraph } from "./graphBridge";
import type { KnowledgeGraph, NextStep } from "./graphTypes";
import { stepActionLabel, stepReason, stepTitle } from "./nextStepText";

interface MiniGraphPanelProps {
  graph: KnowledgeGraph;
  currentConceptId?: string;
  steps: NextStep[];
  /** 방금 배운 순간에 켜지는 노드 */
  pulseId?: string | null;
  /** 레슨을 마쳤거나 문제를 맞힌 뒤인지. 아니면 "방금 배운"이라고 말하지 않습니다. */
  understood?: boolean;
  onOpenStep: (step: NextStep) => void;
  onOpenMap?: () => void;
  /** 부모가 접기·펼치기를 맡을 때: 항상 펼친 형태로 그립니다. */
  embedded?: boolean;
  /** "다음에 갈 곳" 목록을 함께 보일지. 다른 곳에서 다음 학습 카드를 보여 주면 끕니다. */
  showSteps?: boolean;
}

/** 레슨 대화 옆의 작은 로컬 그래프. 데스크탑은 항상, 모바일은 접었다 펼칩니다. */
export const MiniGraphPanel: React.FC<MiniGraphPanelProps> = ({ graph, currentConceptId, steps, pulseId, understood = false, onOpenStep, onOpenMap, embedded = false, showSteps = true }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const local = useMemo(() => (currentConceptId ? getLocalGraph(graph, currentConceptId, 1) : { ...graph, nodes: [], edges: [] }), [graph, currentConceptId]);
  const cards = steps.filter((step) => step.kind !== "wrap_up");
  const nextIds = cards.map((step) => step.conceptId).filter((id): id is string => Boolean(id));
  const hasGraph = local.nodes.length > 0;
  const currentName = graph.nodes.find((node) => node.id === currentConceptId)?.name;

  const canvas = hasGraph && (
    <GraphCanvas
      graph={local}
      variant="mini"
      focusId={currentConceptId}
      nextIds={nextIds}
      pulseId={pulseId}
      ariaLabel={`${currentName ?? "지금 배우는 개념"}과 이어진 개념 지도. 이어진 개념은 아래 목록으로도 볼 수 있어요.`}
      className="h-56 rounded-2xl border border-[var(--lh-line)] sm:h-64"
    />
  );

  const stepList = showSteps && cards.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-[var(--lh-ink-secondary)]">다음에 갈 곳</h2>
          <ul className="mt-2 space-y-1.5">
            {cards.map((step, index) => (
              <li key={`${step.kind}-${step.conceptId}-${index}`}>
                <button
                  type="button"
                  onClick={() => onOpenStep(step)}
                  className="w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 py-2.5 text-left transition hover:border-[var(--lh-primary-border)] cursor-pointer"
                >
                  <span className="block text-sm font-medium text-[var(--lh-ink)]">{stepTitle(graph, step)}</span>
                  <span className="block text-[11px] leading-4 text-[var(--lh-ink-tertiary)]">{stepReason(graph, step, understood)} · {stepActionLabel(step)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      );

  return (
    <div className="space-y-3">
      {/* 데스크탑 */}
      <div className={`space-y-3 ${embedded ? "block" : "hidden lg:block"}`}>
        <p className="flex items-center gap-2 text-xs font-medium text-[var(--lh-ink-secondary)]"><Network aria-hidden className="h-4 w-4" /> 지금 배우는 개념의 지도</p>
        {canvas || <p className="rounded-2xl border border-dashed border-[var(--lh-line-strong)] p-4 text-xs leading-5 text-[var(--lh-ink-secondary)]">배우면 이 개념이 지도에 나타나요.</p>}
        {onOpenMap && <button type="button" onClick={onOpenMap} className="text-xs font-medium text-[var(--lh-primary-text)] underline-offset-2 hover:underline cursor-pointer">전체 지도 보기</button>}
        {stepList}
      </div>

      {/* 모바일: 접히는 작은 그래프 */}
      {hasGraph && !embedded && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-sm font-medium text-[var(--lh-ink)] cursor-pointer"
          >
            <span className="flex items-center gap-2"><Network aria-hidden className="h-4 w-4 text-[var(--lh-primary)]" /> 작은 지도 보기</span>
            <ChevronDown aria-hidden className={`h-4 w-4 transition ${mobileOpen ? "rotate-180" : ""}`} />
          </button>
          {mobileOpen && <div className="mt-2 space-y-3">{canvas}{stepList}</div>}
        </div>
      )}

    </div>
  );
};
