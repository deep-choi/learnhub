import type { LucideIcon } from "lucide-react";
import type React from "react";
import type { ConceptNode, KnowledgeGraph } from "../graph/graphTypes";

/** 패널이 화면에서 받는 공통 정보. 새 패널이 필요한 값은 여기에 더하면 됩니다. */
export interface PaneContext {
  graph: KnowledgeGraph;
  /** 지금 배우는 개념 */
  currentConceptId: string;
  nextIds: string[];
  pulseId: string | null;
  courseId?: string;
  lessonId?: string;
  /** 메모 패널이 지금 보여 줄 개념 */
  noteTarget: { conceptId: string; conceptName: string };
  /** 그래프 노드 상세에서 "메모 열기"를 눌렀을 때 */
  onOpenNotes: (node: ConceptNode) => void;
  onOpenMap?: () => void;
}

export interface PaneDefinition {
  id: string;
  title: string;
  icon: LucideIcon;
  /** `+` 메뉴에 보이는 한 줄 설명 */
  description: string;
  render: (context: PaneContext) => React.ReactNode;
}
