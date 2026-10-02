import React from "react";
import { Course, UserSkill } from "../../types/learning";
import { KnowledgeGraphView } from "../graph/KnowledgeGraphView";
import { NotionPageView } from "./Sidebar";

interface KnowledgeMapViewProps {
  courses: Course[];
  skills: UserSkill[];
  dueReviewCount: number;
  onSelectView: (view: NotionPageView) => void;
  onOpenCreateCourse: (subject?: string) => void;
}

/** 개념 지도 화면. 실제 과목·학습 기록에서 만든 그래프를 보여줍니다. */
export const KnowledgeMapView: React.FC<KnowledgeMapViewProps> = (props) => <KnowledgeGraphView {...props} />;
