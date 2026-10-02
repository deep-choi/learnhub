import React, { useEffect, useRef, useState } from "react";
import { PanelRightClose, PanelRightOpen, Plus, X } from "lucide-react";
import { MAX_PANE_WIDTH, MIN_PANE_WIDTH, clampPaneWidth, closeTab, loadLayout, openTab, saveLayout, type WorkspaceLayout } from "./layout";
import { PANE_KINDS, PANE_REGISTRY, getPane } from "./registry";
import type { PaneContext } from "./types";

interface PaneWorkspaceProps {
  context: PaneContext;
  /** 바깥에서 특정 패널을 열어 달라고 요청합니다. nonce가 바뀔 때마다 열립니다. */
  request?: { kind: string; nonce: number } | null;
}

const RAIL_WIDTH = 48;

const useIsDesktop = (): boolean => {
  const query = "(min-width: 1024px)";
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return matches;
};

/** 옵시디언처럼 탭으로 패널을 여닫는 오른쪽 작업 공간. 데스크톱은 폭 조절·접기, 모바일은 하단 시트로 엽니다. */
export const PaneWorkspace: React.FC<PaneWorkspaceProps> = ({ context, request }) => {
  const isDesktop = useIsDesktop();
  const [layout, setLayout] = useState<WorkspaceLayout>(() => loadLayout(PANE_KINDS));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => saveLayout(layout), [layout]);

  useEffect(() => {
    if (!request || !getPane(request.kind)) return;
    setLayout((current) => openTab(current, request.kind));
    setSheetOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
      } else if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!sheetOpen || isDesktop) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen, isDesktop]);

  const activePane = layout.active ? getPane(layout.active) : undefined;
  const addable = PANE_REGISTRY.filter((pane) => !layout.tabs.includes(pane.id));

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: event.clientX, startWidth: layout.width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const width = clampPaneWidth(drag.startWidth + (drag.startX - event.clientX));
    setLayout((current) => (current.width === width ? current : { ...current, width }));
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const tabBar = (
    <div className="flex items-center gap-1 border-b border-[var(--lh-line)] px-2 py-1.5">
      <div role="tablist" aria-label="열린 패널" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {layout.tabs.map((id) => {
          const pane = getPane(id);
          if (!pane) return null;
          const Icon = pane.icon;
          const selected = layout.active === id;
          return (
            <div key={id} className={`flex shrink-0 items-center rounded-lg ${selected ? "bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]" : "text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)]"}`}>
              <button type="button" role="tab" id={`pane-tab-${id}`} aria-selected={selected} aria-controls={`pane-panel-${id}`} onClick={() => setLayout((current) => ({ ...current, active: id }))} className="inline-flex min-h-9 items-center gap-1.5 rounded-l-lg pl-3 pr-1.5 text-sm font-medium cursor-pointer">
                <Icon aria-hidden className="h-4 w-4" /> {pane.title}
              </button>
              <button type="button" onClick={() => setLayout((current) => closeTab(current, id))} aria-label={`${pane.title} 탭 닫기`} className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface)] hover:text-[var(--lh-ink)] cursor-pointer">
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div ref={menuRef} className="relative shrink-0">
        <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="패널 추가" title="패널 추가" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
          <Plus aria-hidden className="h-4.5 w-4.5" />
        </button>
        {menuOpen && (
          <div role="menu" aria-label="추가할 패널" className="absolute right-0 top-10 z-30 min-w-60 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-1.5 shadow-lg">
            {addable.length === 0 && <p className="px-3 py-2.5 text-sm text-[var(--lh-ink-tertiary)]">추가할 수 있는 패널이 모두 열려 있어요.</p>}
            {addable.map((pane) => {
              const Icon = pane.icon;
              return (
                <button key={pane.id} type="button" role="menuitem" onClick={() => { setLayout((current) => openTab(current, pane.id)); setMenuOpen(false); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">
                  <Icon aria-hidden className="h-4.5 w-4.5 shrink-0 text-[var(--lh-ink-secondary)]" />
                  <span>
                    <span className="block text-[15px] font-medium text-[var(--lh-ink)]">{pane.title}</span>
                    <span className="block text-sm text-[var(--lh-ink-tertiary)]">{pane.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const body = (
    <div role="tabpanel" id={activePane ? `pane-panel-${activePane.id}` : undefined} aria-labelledby={activePane ? `pane-tab-${activePane.id}` : undefined} className="relative min-h-0 flex-1 overflow-hidden">
      {activePane ? activePane.render(context) : <p className="m-4 text-[15px] text-[var(--lh-ink-tertiary)]">열린 패널이 없어요. 위의 + 로 패널을 추가해 보세요.</p>}
    </div>
  );

  if (!isDesktop) {
    return (
      <>
        {!sheetOpen && (
          <button type="button" onClick={() => setSheetOpen(true)} className="fixed bottom-28 right-4 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-sm font-medium text-[var(--lh-ink)] shadow-lg cursor-pointer">
            {activePane ? <activePane.icon aria-hidden className="h-4 w-4 text-[var(--lh-primary)]" /> : <PanelRightOpen aria-hidden className="h-4 w-4" />} 지도·메모
          </button>
        )}
        {sheetOpen && (
          <>
            <div aria-hidden onClick={() => setSheetOpen(false)} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
            <section role="dialog" aria-modal="true" aria-label="작업 패널" className="fixed inset-x-0 bottom-0 z-50 flex h-[78dvh] flex-col overflow-hidden rounded-t-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] shadow-2xl">
              <div className="flex justify-end px-2 pt-1.5">
                <button type="button" onClick={() => setSheetOpen(false)} className="min-h-9 rounded-full px-4 text-sm font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">닫기</button>
              </div>
              {tabBar}
              {body}
            </section>
          </>
        )}
      </>
    );
  }

  if (layout.collapsed) {
    return (
      <aside aria-label="작업 패널" className="sticky top-0 hidden h-[100dvh] shrink-0 self-start border-l border-[var(--lh-line)] bg-[var(--lh-surface)] lg:flex" style={{ width: RAIL_WIDTH }}>
        <button type="button" onClick={() => setLayout((current) => (current.tabs.length === 0 ? openTab(current, PANE_KINDS[0]) : { ...current, collapsed: false }))} aria-label="패널 펼치기" title="패널 펼치기" className="mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
          <PanelRightOpen aria-hidden className="h-4.5 w-4.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="작업 패널" className="sticky top-0 hidden h-[100dvh] shrink-0 self-start border-l border-[var(--lh-line)] bg-[var(--lh-surface)] lg:flex" style={{ width: layout.width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 폭 조절"
        aria-valuemin={MIN_PANE_WIDTH}
        aria-valuemax={MAX_PANE_WIDTH}
        aria-valuenow={layout.width}
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setLayout((current) => ({ ...current, width: clampPaneWidth(current.width + 24) }));
          if (event.key === "ArrowRight") setLayout((current) => ({ ...current, width: clampPaneWidth(current.width - 24) }));
        }}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none transition hover:bg-[var(--lh-primary)]/30 focus-visible:bg-[var(--lh-primary)]/40"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start">
          <div className="min-w-0 flex-1">{tabBar}</div>
          <button type="button" onClick={() => setLayout((current) => ({ ...current, collapsed: true }))} aria-label="패널 접기" title="패널 접기" className="m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
            <PanelRightClose aria-hidden className="h-4.5 w-4.5" />
          </button>
        </div>
        {body}
      </div>
    </aside>
  );
};
