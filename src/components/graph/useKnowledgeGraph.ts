import { useEffect, useState } from "react";
import { LEARNHUB_DATA_CHANGED_EVENT } from "../../services/storage";
import { emptyKnowledgeGraph } from "../../domain/knowledgeGraph";
import { readGraph } from "./graphBridge";
import type { KnowledgeGraph } from "./graphTypes";

/**
 * 저장된 개념 지도를 읽고, 학습 기록이 바뀔 때마다 다시 읽습니다.
 * 처음 읽을 때 저장소가 지도를 만들며 변경 이벤트를 보내기 때문에, 렌더 중이 아니라 효과 안에서 읽습니다.
 */
export const useKnowledgeGraph = (): KnowledgeGraph => {
  const [graph, setGraph] = useState<KnowledgeGraph>(emptyKnowledgeGraph);

  useEffect(() => {
    const load = () => setGraph(readGraph());
    load();
    window.addEventListener(LEARNHUB_DATA_CHANGED_EVENT, load);
    return () => window.removeEventListener(LEARNHUB_DATA_CHANGED_EVENT, load);
  }, []);

  return graph;
};
