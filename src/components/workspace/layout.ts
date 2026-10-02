/**
 * 오른쪽 패널 작업 공간의 레이아웃(열린 탭, 선택한 탭, 폭, 접힘). 이 기기에만 기억합니다(localStorage, 기기별 편의).
 * 패널 종류 id는 레지스트리(registry.tsx)가 정하고, 여기서는 알려진 id만 받아 정리합니다.
 */
export interface WorkspaceLayout {
  tabs: string[];
  active: string | null;
  width: number;
  collapsed: boolean;
}

export const MIN_PANE_WIDTH = 300;
export const MAX_PANE_WIDTH = 720;
export const DEFAULT_PANE_WIDTH = 400;
export const LAYOUT_STORAGE_KEY = "learnhub_workspace_layout_v1";

export const clampPaneWidth = (width: number): number =>
  Number.isFinite(width) ? Math.min(MAX_PANE_WIDTH, Math.max(MIN_PANE_WIDTH, Math.round(width))) : DEFAULT_PANE_WIDTH;

/** 기본 상태: 첫 번째 패널(그래프 뷰) 탭 하나. */
export const defaultLayout = (firstKind: string): WorkspaceLayout => ({ tabs: [firstKind], active: firstKind, width: DEFAULT_PANE_WIDTH, collapsed: false });

/** 저장된 값에서 알 수 없는 패널·중복 탭을 버리고, 탭이 하나도 없으면 기본 상태로 돌립니다. */
export function sanitizeLayout(raw: unknown, knownKinds: readonly string[]): WorkspaceLayout {
  const fallback = defaultLayout(knownKinds[0]);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const input = raw as Record<string, unknown>;
  const tabs = Array.isArray(input.tabs)
    ? [...new Set(input.tabs.filter((tab): tab is string => typeof tab === "string" && knownKinds.includes(tab)))]
    : [];
  if (tabs.length === 0) return fallback;
  const active = typeof input.active === "string" && tabs.includes(input.active) ? input.active : tabs[0];
  return { tabs, active, width: clampPaneWidth(typeof input.width === "number" ? input.width : DEFAULT_PANE_WIDTH), collapsed: input.collapsed === true };
}

export function loadLayout(knownKinds: readonly string[]): WorkspaceLayout {
  try {
    return sanitizeLayout(JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || "null"), knownKinds);
  } catch {
    return defaultLayout(knownKinds[0]);
  }
}

export function saveLayout(layout: WorkspaceLayout): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 저장하지 못해도 이번 화면에서는 그대로 쓸 수 있습니다.
  }
}

/** 탭을 열고 선택합니다. 이미 열려 있으면 선택만 하고, 접혀 있으면 펼칩니다. */
export const openTab = (layout: WorkspaceLayout, kind: string): WorkspaceLayout => ({
  ...layout,
  tabs: layout.tabs.includes(kind) ? layout.tabs : [...layout.tabs, kind],
  active: kind,
  collapsed: false,
});

/** 탭을 닫습니다. 선택한 탭을 닫으면 이웃 탭으로 옮기고, 마지막 탭을 닫으면 작업 공간을 접습니다. */
export function closeTab(layout: WorkspaceLayout, kind: string): WorkspaceLayout {
  const index = layout.tabs.indexOf(kind);
  if (index < 0) return layout;
  const tabs = layout.tabs.filter((tab) => tab !== kind);
  if (tabs.length === 0) return { ...layout, tabs, active: null, collapsed: true };
  const active = layout.active === kind ? tabs[Math.min(index, tabs.length - 1)] : layout.active;
  return { ...layout, tabs, active };
}
