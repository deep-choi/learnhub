import React, { useEffect, useMemo, useState } from "react";
import { FileText, Maximize2 } from "lucide-react";
import { GraphCanvas } from "../graph/GraphCanvas";
import { getLocalGraph } from "../graph/graphBridge";
import { STATE_LABEL } from "../graph/graphStyle";
import { getConceptIdsWithNotes } from "../../services/noteStore";
import { LEARNHUB_DATA_CHANGED_EVENT } from "../../services/storage";
import type { PaneContext } from "./types";

/** 그래프 뷰 패널: 지금 레슨 개념 중심의 로컬 그래프. 노드를 누르면 상세, 메모가 있는 노드에는 표시가 붙습니다. */
export const GraphPane: React.FC<{ context: PaneContext }> = ({ context }) => {
  const { graph, currentConceptId, nextIds, pulseId, onOpenNotes, onOpenMap } = context;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marked, setMarked] = useState<Set<string>>(() => new Set(getConceptIdsWithNotes({ includeLinked: false })));
  const local = useMemo(() => getLocalGraph(graph, currentConceptId, 2), [graph, currentConceptId]);
  const selected = selectedId ? local.nodes.find((node) => node.id === selectedId) ?? null : null;
  const focusName = graph.nodes.find((node) => node.id === currentConceptId)?.name;

  useEffect(() => {
    // 메모를 쓰거나 지울 때마다 저장소가 보내는 변경 이벤트로 표시를 갱신합니다.
    const refresh = () => setMarked(new Set(getConceptIdsWithNotes({ includeLinked: false })));
    window.addEventListener(LEARNHUB_DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LEARNHUB_DATA_CHANGED_EVENT, refresh);
  }, []);

  if (local.nodes.length === 0) {
    return <p className="m-4 rounded-2xl border border-dashed border-[var(--lh-line-strong)] p-4 text-[15px] leading-6 text-[var(--lh-ink-secondary)]">배우면 이 개념이 지도에 나타나요.</p>;
  }

  return (
    <div className="relative h-full min-h-[320px]">
      <GraphCanvas
        graph={local}
        variant="full"
        focusId={currentConceptId}
        nextIds={nextIds}
        pulseId={pulseId}
        selectedId={selectedId}
        markedIds={marked}
        onSelect={(id) => setSelectedId(id)}
        ariaLabel={`${focusName ?? "지금 배우는 개념"}과 이어진 개념 지도. 개념 ${local.nodes.length}개.`}
        className="absolute inset-0 h-full w-full"
      />
      {onOpenMap && (
        <button type="button" onClick={onOpenMap} className="absolute left-3 top-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)]/90 px-3.5 text-sm font-medium text-[var(--lh-primary-text)] backdrop-blur transition hover:bg-[var(--lh-surface)] cursor-pointer">
          <Maximize2 aria-hidden className="h-3.5 w-3.5" /> 전체 지도 보기
        </button>
      )}
      {selected && (
        <div className="absolute inset-x-3 bottom-3 space-y-2 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3.5 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-[var(--lh-ink)]">{selected.name}</p>
              <p className="text-sm text-[var(--lh-ink-tertiary)]">{selected.domain} · {STATE_LABEL[selected.state]}</p>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="닫기" className="min-h-8 shrink-0 rounded-full px-2.5 text-sm text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">닫기</button>
          </div>
          <button type="button" onClick={() => onOpenNotes(selected)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-4 text-sm font-medium text-[var(--lh-primary-text)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">
            <FileText aria-hidden className="h-4 w-4" /> {marked.has(selected.id) ? "메모 열기" : "메모 쓰기"}
          </button>
        </div>
      )}
    </div>
  );
};
