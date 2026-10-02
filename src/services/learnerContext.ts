import type { LearnerContext } from "../types/chat";
import { buildLearnerContext } from "../domain/learnerContext";
import { getKnowledgeGraph } from "./knowledgeGraphStore";
import { StorageService } from "./storage";

/** 자유 대화(tutor-chat `learnerContext`)에 실을 학습자 요약. 지도를 읽을 수 없거나 기록이 없으면 null. */
export function getLearnerContext(): LearnerContext | null {
  try {
    return buildLearnerContext(getKnowledgeGraph(), StorageService.getCourses());
  } catch {
    // 손상된 지도 때문에 대화가 막히면 안 되므로 요약 없이 보냅니다.
    return null;
  }
}
