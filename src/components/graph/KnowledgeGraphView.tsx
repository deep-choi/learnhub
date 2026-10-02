import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, CircleHelp, Link2Off, List, Network, Sparkles, X } from "lucide-react";
import type { Course, UserSkill } from "../../types/learning";
import type { NotionPageView } from "../notion/Sidebar";
import { GraphCanvas } from "./GraphCanvas";
import { disputeEdge, markKnown, markPracticalDone } from "./graphBridge";
import { domainHue, STATE_LABEL } from "./graphStyle";
import type { ConceptNode, ConceptState } from "./graphTypes";
import { useKnowledgeGraph } from "./useKnowledgeGraph";

interface KnowledgeGraphViewProps {
  courses: Course[];
  skills: UserSkill[];
  dueReviewCount: number;
  onSelectView: (view: NotionPageView) => void;
  onOpenCreateCourse: (subject?: string) => void;
}

const LEGEND: Array<{ state: ConceptState; text: string }> = [
  { state: "unseen", text: "아직 안 배웠어요" },
  { state: "learned", text: "배웠어요" },
  { state: "verified", text: "확인했어요" },
  { state: "needs_review", text: "다시 보면 좋아요" },
  { state: "curious", text: "궁금해요" },
];

// 캔버스 팔레트(graphStyle)와 같은 색을 씁니다. 분야는 점 테두리 색으로 구분됩니다.
const legendClass: Record<ConceptState, string> = {
  unseen: "bg-[#a3a6b3] opacity-60 dark:bg-[#6f7482]",
  learned: "bg-[#4169e1] dark:bg-[#7b9bfc]",
  verified: "bg-[#2647b2] ring-2 ring-inset ring-white/90 dark:bg-[#a9c0ff]",
  needs_review: "bg-[#dc6e22] dark:bg-[#f38132]",
  curious: "border-2 border-dashed border-[#a3a6b3] bg-transparent dark:border-[#6f7482]",
};

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({ courses, skills, dueReviewCount, onSelectView, onOpenCreateCourse }) => {
  const graph = useKnowledgeGraph();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenDomains, setHiddenDomains] = useState<Set<string>>(new Set());
  const [reflection, setReflection] = useState("");
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const domains = useMemo(() => [...new Set(graph.nodes.map((node) => node.domain))], [graph.nodes]);

  const lessonFor = (node: ConceptNode, index = 0) => {
    const ref = node.courseRefs[index];
    if (!ref?.lessonId) return null;
    const course = courses.find((item) => item.id === ref.courseId);
    if (!course) return null;
    for (const chapter of course.chapters) {
      const lesson = chapter.lessons.find((item) => item.id === ref.lessonId);
      if (lesson) return { course, lesson, chapterTitle: chapter.title };
    }
    return null;
  };

  const openLesson = (node: ConceptNode, autoPractice = false) => {
    const target = lessonFor(node);
    if (!target) return;
    onSelectView({ type: "lesson", course: target.course, lesson: target.lesson, chapterTitle: target.chapterTitle, autoPractice });
  };

  const select = (id: string | null) => {
    setSelectedId(id);
    setReflection(id ? nodeById.get(id)?.reflection ?? "" : "");
  };

  const toggleDomain = (domain: string) =>
    setHiddenDomains((previous) => {
      const next = new Set(previous);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });

  // 같은 두 개념 사이에 선수·관련 연결이 함께 있어도 개념 기준으로 한 번만 보여 주고, 관계는 합칩니다.
  const neighbors = useMemo(() => {
    if (!selected) return [];
    const groups = new Map<string, { other: ConceptNode; edges: typeof graph.edges }>();
    for (const edge of graph.edges) {
      if (edge.from !== selected.id && edge.to !== selected.id) continue;
      const other = nodeById.get(edge.from === selected.id ? edge.to : edge.from);
      if (!other) continue;
      const group = groups.get(other.id);
      if (group) group.edges.push(edge);
      else groups.set(other.id, { other, edges: [edge] });
    }
    return [...groups.values()].map(({ other, edges }) => {
      const relations = [...new Set(edges.map((edge) =>
        edge.kind === "curiosity" ? "궁금해서 이어짐" : edge.kind === "prerequisite" ? (edge.to === selected.id ? "먼저 알면 좋아요" : "다음에 이어져요") : "관련 있어요"))];
      return { other, edges, relation: relations.join(" · "), disputed: edges.every((edge) => edge.disputed) };
    });
  }, [selected, graph.edges, nodeById]);
  const selectedIsPractical = selected
    ? selected.courseRefs.some((ref) => courses.find((course) => course.id === ref.courseId)?.learningType === "practical")
    : false;

  if (graph.nodes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[880px] px-5 py-16 text-[var(--lh-ink)] sm:px-8">
        <div className="space-y-4 rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] p-8 text-center sm:p-12">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] text-[var(--lh-primary)]"><Network aria-hidden className="h-6 w-6" /></span>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">아직 개념 지도가 비어 있어요</h1>
          <p className="mx-auto max-w-md text-sm leading-6 text-[var(--lh-ink-secondary)]">배우고 싶은 주제로 과목을 만들면, 배울 개념들이 점으로 나타나고 서로 이어져요. 배울수록 지도가 밝아져요.</p>
          <button type="button" onClick={() => onOpenCreateCourse()} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">
            <Sparkles aria-hidden className="h-4 w-4" /> 첫 과목 만들기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden text-[var(--lh-ink)]">
      <GraphCanvas
        graph={graph}
        variant="full"
        selectedId={selectedId}
        hiddenDomains={hiddenDomains}
        lastPositionId={graph.lastPosition?.conceptId}
        onSelect={(id) => select(id)}
        ariaLabel={`개념 지도. 개념 ${graph.nodes.length}개. 키보드로는 개념 목록을 이용해 주세요.`}
        className="absolute inset-0 h-full w-full"
      />

      {/* 왼쪽 위: 분야 보기와 목록 */}
      <div className="pointer-events-none absolute left-16 right-3 top-3 z-10 flex flex-wrap items-start gap-2 md:left-3 sm:right-[390px]">
        <button
          type="button"
          aria-expanded={listOpen}
          aria-controls="graph-node-list"
          onClick={() => setListOpen((open) => !open)}
          className="pointer-events-auto inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)]/85 px-3.5 text-xs font-medium text-[var(--lh-ink)] backdrop-blur transition hover:bg-[var(--lh-surface)] cursor-pointer"
        >
          <List aria-hidden className="h-4 w-4" /> {listOpen ? "목록 접기" : "목록"}
        </button>
        {domains.length > 1 && (
          <div className="pointer-events-auto flex flex-wrap gap-2" role="group" aria-label="분야 보기">
            {domains.map((domain) => {
              const hidden = hiddenDomains.has(domain);
              return (
                <button
                  key={domain}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => toggleDomain(domain)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full border bg-[var(--lh-surface)]/85 px-3 text-xs font-medium backdrop-blur transition cursor-pointer ${hidden ? "border-[var(--lh-line)] text-[var(--lh-ink-tertiary)]" : "border-[var(--lh-line-strong)] text-[var(--lh-ink)]"}`}
                >
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${domainHue(domain)} 62% 52%)`, opacity: hidden ? 0.35 : 1 }} />
                  {domain}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {listOpen && (
        <div id="graph-node-list" className="absolute bottom-16 left-3 top-16 z-10 w-[min(320px,calc(100%-1.5rem))] space-y-4 overflow-y-auto rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)]/95 p-3 shadow-lg backdrop-blur">
          {domains.map((domain) => (
            <div key={domain} className="space-y-1.5">
              <h2 className="px-1 text-xs font-medium text-[var(--lh-ink-secondary)]">{domain}</h2>
              <ul className="space-y-1">
                {graph.nodes.filter((node) => node.domain === domain).map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => select(node.id)}
                      aria-current={node.id === selectedId ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition cursor-pointer ${node.id === selectedId ? "border-[var(--lh-primary)] bg-[var(--lh-primary-subtle)]" : "border-transparent hover:bg-[var(--lh-surface-subtle)]"}`}
                    >
                      <span className="truncate font-medium">{node.name}</span>
                      <span className="shrink-0 text-[11px] text-[var(--lh-ink-tertiary)]">{STATE_LABEL[node.state]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* 왼쪽 아래: 범례 */}
      <div aria-label="범례" className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)]/70 px-3 py-2 backdrop-blur">
        {LEGEND.map((item) => (
          <span key={item.state} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--lh-ink-secondary)]">
            <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${legendClass[item.state]}`} />
            {item.text}
          </span>
        ))}
      </div>

      {/* 오른쪽 위: 노드를 눌렀을 때만 뜨는 상세 패널 */}
      {selected && (
        <aside aria-live="polite" aria-label={`${selected.name} 자세히`} className="absolute right-3 top-16 z-20 max-h-[calc(100%-5rem)] w-[calc(100%-1.5rem)] overflow-y-auto rounded-[24px] border border-[var(--lh-line)] bg-[var(--lh-surface)] shadow-lg sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-[360px]">
          <button type="button" onClick={() => select(null)} aria-label="닫기" className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"><X aria-hidden className="h-4 w-4" /></button>
          <div className="space-y-4 p-5 pr-12">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--lh-surface-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--lh-ink-secondary)]">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: `hsl(${domainHue(selected.domain)} 62% 52%)` }} />
                    {selected.domain}
                  </span>
                  <span className="text-[11px] font-medium text-[var(--lh-ink-tertiary)]">{STATE_LABEL[selected.state]}</span>
                </div>
                <h2 className="text-xl font-medium leading-snug tracking-tight">{selected.name}</h2>
                {selected.userMarkedKnown && <p className="text-xs text-[var(--lh-ink-secondary)]">이미 알고 있다고 표시했어요.</p>}
                {selected.curiosityQuestion && (
                  <p className="rounded-xl bg-[var(--lh-surface-subtle)] px-3 py-2 text-xs leading-5 text-[var(--lh-ink-secondary)]">
                    궁금했던 점: {selected.curiosityQuestion}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {lessonFor(selected) ? (
                  <>
                    <button type="button" onClick={() => openLesson(selected)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-4 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer sm:text-sm">
                      <BookOpen aria-hidden className="h-4 w-4" /> {selected.state === "unseen" ? "배우러 가기" : "다시 보기"}
                    </button>
                    <button type="button" onClick={() => openLesson(selected, true)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-4 text-xs font-medium text-[var(--lh-ink)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer sm:text-sm">
                      <CircleHelp aria-hidden className="h-4 w-4" /> 문제 풀기
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => onOpenCreateCourse(selected.name)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-4 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer sm:text-sm">
                    <Sparkles aria-hidden className="h-4 w-4" /> 이걸로 과목 만들기
                  </button>
                )}
                {selected.state !== "curious" && (
                  <button
                    type="button"
                    aria-pressed={Boolean(selected.userMarkedKnown)}
                    onClick={() => markKnown(selected.id, !selected.userMarkedKnown)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-medium transition cursor-pointer sm:text-sm ${selected.userMarkedKnown ? "border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]" : "border-[var(--lh-line-strong)] bg-[var(--lh-surface)] text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)]"}`}
                  >
                    <CheckCircle2 aria-hidden className="h-4 w-4" /> 이미 알아요
                  </button>
                )}
              </div>

              {selectedIsPractical && (
                <div className="space-y-2 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3">
                  <p className="text-xs font-medium">직접 해봤나요?</p>
                  <label className="sr-only" htmlFor="graph-reflection">해본 뒤 느낀 점</label>
                  <textarea
                    id="graph-reflection"
                    value={reflection}
                    onChange={(event) => setReflection(event.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="해보니 어땠는지 한두 줄로 적어 보세요 (선택)"
                    className="w-full resize-none rounded-xl border border-[var(--lh-line)] bg-[var(--lh-canvas)] p-2.5 text-xs leading-5 outline-none focus:border-[var(--lh-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => markPracticalDone(selected.id, reflection)}
                    className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-4 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer"
                  >
                    {selected.practicalDoneAt ? "회고 다시 저장" : "해봤어요"}
                  </button>
                </div>
              )}

              {neighbors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--lh-ink-secondary)]">이어진 개념</p>
                  <ul className="space-y-1.5">
                    {neighbors.map(({ other, edges, relation, disputed }) => (
                      <li key={other.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--lh-line)] px-3 py-2">
                        <button type="button" onClick={() => select(other.id)} className="min-w-0 text-left cursor-pointer">
                          <span className={`block truncate text-sm font-medium ${disputed ? "text-[var(--lh-ink-tertiary)] line-through" : "text-[var(--lh-ink)]"}`}>{other.name}</span>
                          <span className="block text-[11px] text-[var(--lh-ink-tertiary)]">{disputed ? "이상하다고 표시했어요" : relation}</span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={disputed}
                          onClick={() => edges.forEach((edge) => disputeEdge(edge.id, !disputed))}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
                        >
                          <Link2Off aria-hidden className="h-3.5 w-3.5" /> {disputed ? "되돌리기" : "이 연결 이상해요"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        </aside>
      )}
    </div>
  );
};
