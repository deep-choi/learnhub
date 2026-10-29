/**
 * 화면이 그래프 데이터를 읽고 쓰는 창구입니다. coder 1의 store/domain 함수를 그대로 전달하되,
 * 저장 실패나 알 수 없는 개념 같은 예외가 화면을 깨뜨리지 않도록 막습니다.
 */
import type { Course } from "../../types/learning";
import {
  addCuriosity as storeAddCuriosity,
  disputeEdge as storeDisputeEdge,
  getExistingConceptNames,
  getKnowledgeGraph,
  getResumeContext as storeGetResumeContext,
  markKnown as storeMarkKnown,
  markPracticalDone as storeMarkPracticalDone,
  mergeCourseIntoGraph,
  setDepthReached as storeSetDepthReached,
  setLastPosition as storeSetLastPosition,
} from "../../services/knowledgeGraphStore";
import { emptyKnowledgeGraph } from "../../domain/knowledgeGraph";
import type { ConceptNode, CurriculumConceptLinks, ExplanationDepth, KnowledgeGraph, LearningPosition, ResumeContext } from "./graphTypes";

export { findMatchingConcept, getBranchConcepts, getLocalGraph, normalizeConceptKey, recommendNextSteps } from "../../domain/knowledgeGraph";

const attempt = <T>(label: string, action: () => T, fallback: T): T => {
  try {
    return action();
  } catch (error) {
    console.error(`[learnhub] 개념 지도: ${label}`, error);
    return fallback;
  }
};

/** 과목 생성 요청에 실어 보내, AI가 이미 있는 개념에 연결하게 합니다. */
export const existingConceptNames = (): string[] => attempt("개념 이름 목록", getExistingConceptNames, []);
export const readGraph = (): KnowledgeGraph => attempt("불러오기", getKnowledgeGraph, emptyKnowledgeGraph());
export const getResumeContext = (): ResumeContext | null => attempt("이어주기", () => storeGetResumeContext(), null);
export const setLastPosition = (position: LearningPosition): void => attempt("위치 저장", () => storeSetLastPosition(position), undefined);
export const markKnown = (conceptId: string, known: boolean): void => attempt("이미 알아요", () => storeMarkKnown(conceptId, known), undefined);
export const disputeEdge = (edgeId: string, disputed: boolean): void => attempt("연결 표시", () => storeDisputeEdge(edgeId, disputed), undefined);
export const setDepthReached = (conceptId: string, depth: ExplanationDepth): void => attempt("설명 깊이", () => storeSetDepthReached(conceptId, depth), undefined);
export const markPracticalDone = (conceptId: string, reflection?: string): void => attempt("해봤어요", () => storeMarkPracticalDone(conceptId, reflection), undefined);
export const addCuriosity = (fromConceptId: string | null, conceptName: string, question: string): ConceptNode | null =>
  attempt("궁금해요 저장", () => storeAddCuriosity(fromConceptId, conceptName, question), null);
/** 과목을 저장한 뒤, AI가 알려 준 선수·관련 개념 연결을 그래프에 합칩니다. */
export const mergeCourseLinks = (course: Course, links?: CurriculumConceptLinks): void =>
  attempt("과목 연결", () => void mergeCourseIntoGraph(course, links), undefined);
