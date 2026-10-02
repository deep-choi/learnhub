import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, CircleHelp, GitFork, Link2Off, List, Network, Orbit, Sparkles, Undo2, X } from "lucide-react";
import type { Course, UserSkill } from "../../types/learning";
import type { NotionPageView } from "../notion/Sidebar";
import { GraphCanvas, type GraphLayoutMode } from "./GraphCanvas";
import { disputeEdge, markPracticalDone } from "./graphBridge";
import { domainHue, STATE_LABEL } from "./graphStyle";
import type { ConceptNode } from "./graphTypes";
import { useKnowledgeGraph } from "./useKnowledgeGraph";

interface KnowledgeGraphViewProps {
  courses: Course[];
  skills: UserSkill[];
  dueReviewCount: number;
  onSelectView: (view: NotionPageView) => void;
  onOpenCreateCourse: (subject?: string) => void;
}

const LAYOUT_STORAGE_KEY = "learnhub_graph_layout_v1";

const readLayoutMode = (): GraphLayoutMode => {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === "radial" ? "radial" : "tree";
  } catch {
    return "tree";
  }
};

const LAYOUT_OPTIONS: Array<{ mode: GraphLayoutMode; label: string; Icon: typeof GitFork }> = [
  { mode: "tree", label: "트리", Icon: GitFork },
  { mode: "radial", label: "원형", Icon: Orbit },
];

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({ courses, skills, dueReviewCount, onSelectView, onOpenCreateCourse }) => {
  const graph = useKnowledgeGraph();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenDomains, setHiddenDomains] = useState<Set<string>>(new Set());
  const [reflection, setReflection] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>(readLayoutMode);

  const changeLayoutMode = (mode: GraphLayoutMode) => {
    setLayoutMode(mode);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    } catch {
      // 기억하지 못해도 이번 화면에서는 바뀐 보기를 씁니다.
    }
  };

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

  const layoutToggle = (
      <div role="radiogroup" aria-label="지도 보기" className="inline-flex h-10 items-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)]/85 p-1 backdrop-blur">
        {LAYOUT_OPTIONS.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={layoutMode === mode}
            onClick={() => changeLayoutMode(mode)}
            className={`inline-flex h-8 min-h-0! items-center gap-1.5 rounded-full px-3 text-sm! font-medium transition cursor-pointer ${
              layoutMode === mode ? "bg-[var(--lh-ink)] text-[var(--lh-surface)]" : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)]"
            }`}
          >
            <Icon aria-hidden className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden text-[var(--lh-ink)]">
      <GraphCanvas
        graph={graph}
        variant="full"
        layout={layoutMode}
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
          className="pointer-events-auto inline-flex h-10 min-h-0! items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)]/85 px-4 text-sm! font-medium text-[var(--lh-ink)] backdrop-blur transition hover:bg-[var(--lh-surface)] cursor-pointer"
        >
          <List aria-hidden className="h-4 w-4" /> {listOpen ? "목록 접기" : "목록"}
        </button>
        <div className="pointer-events-auto sm:hidden">{layoutToggle}</div>
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
                  className={`inline-flex h-10 min-h-0! items-center gap-2 rounded-full border bg-[var(--lh-surface)]/85 px-4 text-sm! font-medium backdrop-blur transition cursor-pointer ${hidden ? "border-[var(--lh-line)] text-[var(--lh-ink-tertiary)]" : "border-[var(--lh-line-strong)] text-[var(--lh-ink)]"}`}
                >
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${domainHue(domain)} 62% 52%)`, opacity: hidden ? 0.35 : 1 }} />
                  {domain}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 오른쪽 위: 보기 전환(데스크톱) */}
      <div className="absolute right-3 top-3 z-10 hidden sm:block">{layoutToggle}</div>

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

      {/* 오른쪽 위: 노드를 눌렀을 때만 뜨는 상세 패널 */}
      {selected && (
        <aside
          aria-live="polite"
          aria-label={`${selected.name} 자세히`}
          className="absolute right-3 top-16 z-20 max-h-[calc(100%-5rem)] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] shadow-[var(--lh-shadow-md)] sm:top-16 sm:max-h-[calc(100%-5rem)] sm:w-[340px]"
        >
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-[var(--lh-ink-tertiary)]">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: `hsl(${domainHue(selected.domain)} 62% 52%)` }} />
                  <span className="truncate">{selected.domain} · {STATE_LABEL[selected.state]}</span>
                </p>
                <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">{selected.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => select(null)}
                aria-label="닫기"
                className="-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            {selected.curiosityQuestion && (
              <p className="mt-3 text-sm leading-relaxed text-[var(--lh-ink-secondary)]">궁금했던 점: {selected.curiosityQuestion}</p>
            )}

            <div className="mt-4">
              {lessonFor(selected) ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => openLesson(selected)} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--lh-primary)] px-3 text-sm! font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">
                    <BookOpen aria-hidden className="h-4 w-4" /> {selected.state === "unseen" ? "배우러 가기" : "다시 보기"}
                  </button>
                  <button type="button" onClick={() => openLesson(selected, true)} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 text-sm! font-medium text-[var(--lh-ink)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">
                    <CircleHelp aria-hidden className="h-4 w-4" /> 문제 풀기
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => onOpenCreateCourse(selected.name)} className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--lh-primary)] px-3 text-sm! font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">
                  <Sparkles aria-hidden className="h-4 w-4" /> 이걸로 과목 만들기
                </button>
              )}
            </div>

            {selectedIsPractical && (
              <div className="mt-4 space-y-2">
                <label className="block text-sm font-medium" htmlFor="graph-reflection">직접 해봤나요?</label>
                <textarea
                  id="graph-reflection"
                  value={reflection}
                  onChange={(event) => setReflection(event.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="해보니 어땠는지 한두 줄로 적어 보세요 (선택)"
                  className="w-full resize-none rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3 text-sm! leading-relaxed outline-none focus:border-[var(--lh-primary)]"
                />
                <button
                  type="button"
                  onClick={() => markPracticalDone(selected.id, reflection)}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--lh-line)] px-3 text-sm! font-medium text-[var(--lh-ink)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
                >
                  {selected.practicalDoneAt ? "회고 다시 저장" : "해봤어요"}
                </button>
              </div>
            )}
          </div>

          {neighbors.length > 0 && (
            <div className="border-t border-[var(--lh-line)] px-3 pb-3 pt-4">
              <p className="px-2 text-xs font-medium text-[var(--lh-ink-tertiary)]">이어진 개념 {neighbors.length}</p>
              <ul className="mt-1.5">
                {neighbors.map(({ other, edges, relation, disputed }) => (
                  <li key={other.id} className="group flex items-center gap-1 rounded-lg transition hover:bg-[var(--lh-surface-subtle)]">
                    <button type="button" onClick={() => select(other.id)} className="min-w-0 flex-1 px-2 py-2 text-left cursor-pointer">
                      <span className={`block truncate text-sm font-medium ${disputed ? "text-[var(--lh-ink-tertiary)] line-through" : "text-[var(--lh-ink)]"}`}>{other.name}</span>
                      <span className="block truncate text-xs text-[var(--lh-ink-tertiary)]">{disputed ? "이상하다고 표시했어요" : relation}</span>
                    </button>
                    {/* 자주 쓰지 않는 신고 버튼은 마우스를 올렸을 때만 보여 줍니다(터치 기기에서는 항상 보임). */}
                    <button
                      type="button"
                      aria-pressed={disputed}
                      aria-label={disputed ? `${other.name} 연결 되돌리기` : `${other.name} 연결이 이상해요`}
                      title={disputed ? "되돌리기" : "이 연결이 이상해요"}
                      onClick={() => edges.forEach((edge) => disputeEdge(edge.id, !disputed))}
                      className={`mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-strong)] hover:text-[var(--lh-ink)] cursor-pointer focus-visible:opacity-100 ${
                        disputed ? "" : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                      }`}
                    >
                      {disputed ? <Undo2 aria-hidden className="h-4 w-4" /> : <Link2Off aria-hidden className="h-4 w-4" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      )}
    </div>
  );
};
