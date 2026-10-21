import React from "react";
import { FileText, Network } from "lucide-react";
import { GraphPane } from "./GraphPane";
import { NotesPane } from "./NotesPane";
import type { PaneDefinition } from "./types";

/**
 * 패널 레지스트리. 새 패널(목차, 오답 노트 등)은 여기에 한 항목(id, 제목, 아이콘, 설명, 렌더 함수)만 더하면
 * `+` 메뉴, 탭, 레이아웃 기억에 자동으로 들어갑니다. 첫 항목이 기본으로 열리는 탭입니다.
 */
export const PANE_REGISTRY: PaneDefinition[] = [
  { id: "graph", title: "그래프 뷰", icon: Network, description: "지금까지 배운 개념 전체 지도", render: (context) => <GraphPane context={context} /> },
  { id: "notes", title: "메모", icon: FileText, description: "배운 것을 마크다운으로 적는 메모장", render: (context) => <NotesPane context={context} /> },
];

export const PANE_KINDS: string[] = PANE_REGISTRY.map((pane) => pane.id);
export const getPane = (id: string): PaneDefinition | undefined => PANE_REGISTRY.find((pane) => pane.id === id);
