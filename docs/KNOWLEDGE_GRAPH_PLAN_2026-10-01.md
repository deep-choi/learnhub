# 개념 그래프 · 대화 속 다음 학습 유도 구현 계획 (2026-10-01)

작성: UX/PM 탭. 구현은 coder 1(데이터·서버), coder 2(UI)가 나눠서 진행한다.

## 1. 제품 방향 (결정된 것)

- LearnHub는 **무엇이든 배우고 싶은 것을 과목으로 만들어 주고, 그 안에서 길을 잃지 않게 안내하는** 서비스다. 교과(수학·영어)만이 아니라 UI 디자인, 코딩, 낚시 같은 주제도 똑같이 다룬다.
- 핵심 사용자는 혼자 배우는 사람(독학자)이다. 대상 연령은 전 연령이다. 문구를 성인 전용이나 교과 전용으로 쓰지 않는다.
- 학습의 기본 형태는 **AI 대화**다. AI 대화 메뉴는 독립 메뉴로 유지한다.
- "쇼츠처럼 계속 이어지는 흥미"는 비유다. **피드 화면을 만들지 않는다.** 대신 대화 안에서 다음 학습을 유도한다.
  - 질문으로 유도: "분수 덧셈을 이해했으니, 이번엔 분수 곱셈을 해볼까요?"
  - 시각적으로 유도: 미니 그래프에서 이어지는 다음 노드가 강조된다. "지금 배운 '통분'은 '분수 비교'와 이어져요."
  - 추천으로 유도: "다음엔 '물때 보는 법'을 추천해요. 방금 배운 '포인트 고르기'와 바로 연결되거든요."
- 문제·퀴즈는 **강제하지 않고 원할 때 언제든** 푼다. 레슨 완료 조건으로 걸지 않는다.
- 개념 지도는 **옵시디언 그래프 뷰를 많이 참고**한다.

## 2. 이번 범위 (11개 항목)

| # | 항목 | 담당 |
|---|---|---|
| 1 | 같은 개념은 하나의 노드로 합치기 (과목 간 연결) | coder 1 |
| 2 | 비로그인 상태에서 주제 입력 → "이 주제의 지도" 미리보기 | coder 1 (API), coder 2 (화면) |
| 3 | 돌아왔을 때 이어주기 ("지난번엔 여기까지 했어요") | coder 1 (데이터), coder 2 (화면) |
| 4 | 곁가지 호기심을 "궁금해요" 노드로 저장, 나중에 추천 | coder 1 (데이터·AI 응답), coder 2 (화면) |
| 5 | 배운 순간 미니 그래프에 노드가 생기거나 밝아지는 애니메이션 | coder 2 |
| 6 | 설명 깊이(쉬운 말 → 정식 개념 → 정확한 예시) 전환과 노드에 기억 | coder 1 (데이터·프롬프트), coder 2 (버튼) |
| 7 | 사용자가 "이미 알아요", "이 연결 이상해요"로 그래프 수정 | coder 1 (데이터), coder 2 (화면) |
| 8 | 실기형 주제는 문제 대신 "해봤어요" 체크와 짧은 회고 | coder 1 (데이터), coder 2 (화면) |
| 9 | 모바일에서는 작은 그래프 + "다음에 갈 곳" 목록 | coder 2 |
| 10 | 추천은 그래프 규칙으로 계산하고 AI는 문장만 다듬기 (비용 통제) | coder 1 |
| 11 | 어린 사용자를 위한 안전 프롬프트, "오늘은 여기까지" 마무리 | coder 1 (프롬프트), coder 2 (화면) |

이번 범위 밖: 14세 미만 가입(법정대리인 동의 절차, 법적 검토 필요), 보호자 화면, 작업물·사진 업로드 피드백, 쇼츠형 피드.

## 3. 공통 계약 — 두 코더가 함께 쓰는 타입과 함수

**coder 1이 가장 먼저 만든다.** 이름과 형태를 바꿔야 하면 바꾼 이유를 최종 보고에 적는다.

### `src/types/knowledgeGraph.ts`

```ts
export type ConceptState =
  | "unseen"        // 지도에만 있고 아직 안 배움
  | "learned"       // 대화로 배움
  | "verified"      // 문제로 이해를 확인함 (또는 실기형에서 "해봤어요")
  | "needs_review"  // 틀린 문제가 있음, 다시 보면 좋음
  | "curious";      // 곁가지로 궁금해서 저장해 둔 개념

export type ExplanationDepth = "easy" | "formal" | "example";

export interface ConceptNode {
  id: string;                 // 정규화된 전역 개념 키 (과목과 무관)
  name: string;
  aliases: string[];
  domain: string;             // 색상 그룹. 예: "수학", "낚시", "UI 디자인"
  courseRefs: { courseId: string; lessonId?: string }[];
  state: ConceptState;
  depthReached?: ExplanationDepth;
  userMarkedKnown?: boolean;  // "이미 알아요"
  practicalDoneAt?: string;   // 실기형 "해봤어요"
  reflection?: string;        // 실기형 짧은 회고
  curiosityQuestion?: string; // "궁금해요"로 저장된 원래 질문
  lastStudiedAt?: string;
  createdAt: string;
}

export type ConceptEdgeKind = "prerequisite" | "related" | "curiosity";

export interface ConceptEdge {
  id: string;
  from: string;  // prerequisite일 때: 먼저 알아야 하는 개념
  to: string;
  kind: ConceptEdgeKind;
  source: "ai" | "user";
  disputed?: boolean; // 사용자가 "이 연결 이상해요"
}

export interface LearningPosition {
  courseId: string;
  lessonId: string;
  conceptId: string;
  at: string;
}

export interface KnowledgeGraph {
  version: 1;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  lastPosition?: LearningPosition;
}

export type NextStepKind = "review" | "next_lesson" | "connected" | "curiosity" | "deepen" | "wrap_up";

export interface NextStep {
  kind: NextStepKind;
  conceptId?: string;
  courseId?: string;
  lessonId?: string;
  becauseOfConceptId?: string; // "방금 배운 X와 연결돼서"
  score: number;
}

export interface ResumeContext {
  position: LearningPosition;
  daysAway: number;
  dueReviewCount: number;
  conceptName: string;
  courseTitle: string;
}
```

### `src/services/knowledgeGraphStore.ts` (coder 1) — UI는 이 함수만 호출한다

```ts
getKnowledgeGraph(): KnowledgeGraph
mergeCourseIntoGraph(course: Course, links?: CurriculumConceptLinks): KnowledgeGraph
markConceptLearned(conceptId: string, ref: { courseId: string; lessonId?: string }): void
markQuizResult(conceptId: string, isCorrect: boolean): void
markPracticalDone(conceptId: string, reflection?: string): void
setDepthReached(conceptId: string, depth: ExplanationDepth): void
markKnown(conceptId: string, known: boolean): void
disputeEdge(edgeId: string, disputed: boolean): void
addCuriosity(fromConceptId: string | null, conceptName: string, question: string): ConceptNode
setLastPosition(position: LearningPosition): void
getResumeContext(now?: Date): ResumeContext | null
```

### `src/domain/knowledgeGraph.ts` (coder 1) — 순수 함수, 테스트 대상

```ts
normalizeConceptKey(name: string): string
findMatchingConcept(graph: KnowledgeGraph, name: string): ConceptNode | undefined
getLocalGraph(graph: KnowledgeGraph, conceptId: string, hops?: number): KnowledgeGraph
recommendNextSteps(graph: KnowledgeGraph, ctx: {
  currentConceptId?: string;
  courses: Course[];
  dueReviewConceptIds: string[];
  sessionMinutes?: number;
  lessonsThisSession?: number;
}, limit?: number): NextStep[]
```

추천 규칙 (머신러닝 없이 규칙으로):
1. 복습할 때가 된 개념 (`needs_review` 또는 due review)
2. 지금 과목의 다음 레슨
3. 방금 배운 개념과 연결된 `unseen` 이웃. 선수 개념을 이미 배운 것을 우선한다.
4. 저장해 둔 `curious` 노드
5. 쉬운 말까지만 본 개념의 깊이 올리기 (`deepen`)
6. 세션이 길어지면(예: 30분 이상 또는 레슨 3개 이상) `wrap_up`을 맨 앞에 둔다.

## 4. coder 1 — 데이터·도메인·서버

**소유 파일:**
- 새 파일: `src/types/knowledgeGraph.ts`, `src/domain/knowledgeGraph.ts`, `src/services/knowledgeGraphStore.ts`, `tests/knowledgeGraph*.test.ts`
- 수정: `src/services/storage.ts`, `src/services/learningBackup.ts`, `src/services/cloudSync.ts`, `src/domain/contentValidation.ts`, `server.ts`, `server/*.ts`

**작업 순서:**
1. 공통 계약 타입과 함수 시그니처를 먼저 만든다. 내부는 비어 있어도 되지만 컴파일은 되어야 한다. coder 2가 바로 import할 수 있게 하기 위해서다.
2. 그래프 저장소를 만든다.
   - `LEARNHUB_STORAGE_KEYS`에 그래프 키를 추가한다.
   - `learningBackup` 허용 목록과 병합 전략, 클라우드 동기화에 포함한다. 기존 snapshot과 하위 호환되어야 한다.
   - 그래프가 없는 기존 사용자는 courses/skills/reviews로 처음 한 번 그래프를 만든다.
3. 학습 이벤트가 생길 때 그래프가 자동으로 갱신되게 한다. UI가 따로 호출하지 않아도 된다.
   - `StorageService.addCourse` → `mergeCourseIntoGraph`
   - `markLessonCompleted` → `markConceptLearned`
   - `recordQuizAnswer` → `markQuizResult`
4. 같은 개념을 합친다 (#1).
   - 정규화 키, 별칭, 과목을 넘나드는 매칭을 구현한다.
   - 과목 생성 요청에 기존 개념 이름 목록(최대 60개 정도)을 함께 보내, AI가 기존 개념에 연결하게 한다.
5. 과목 생성 프롬프트와 스키마를 바꾼다 (`server.ts` analyze-subject).
   - 레슨마다 `prerequisites`(개념 이름 배열), `relatedConcepts`, 과목 `domain`을 추가한다.
   - 프롬프트의 "성인을 위한" 고정 문구를 없앤다. 전 연령, 모든 주제(교과 외 포함) 기준으로 쓰고, 실기형 주제는 `practical`로 분류되게 한다.
   - `validateCurriculumPayload`를 함께 갱신한다.
6. 다음 학습 추천과 문장 다듬기 (#10).
   - `recommendNextSteps`를 순수 함수로 구현한다.
   - 새 엔드포인트 `POST /api/ai/next-nudge`: 계산된 NextStep 1~3개와 현재 개념을 받아, 짧은 한국어 유도 문장(질문형 1개 + 추천 이유)만 만든다. 출력 토큰 한도는 작게 둔다.
   - AI가 실패하면 클라이언트가 템플릿 문장으로 대체할 수 있게 응답 형식을 정한다.
7. 비로그인 지도 미리보기 (#2).
   - 로그인 없이 호출 가능한 `POST /api/ai/preview-course`를 만든다. 응답은 과목 구성 + 개념 연결이고, 저장하지 않는다.
   - IP 기준 제한(예: 하루 3회)과 전역 일일 상한을 둔다. 기존 로그인 사용자 quota와는 분리한다.
   - 로그인 후에는 같은 미리보기 결과로 과목을 만들 수 있게(재생성 없이) 응답을 설계한다.
8. 튜터 대화 확장 (`/api/ai/tutor-chat`).
   - 선택 입력 `depth`(easy|formal|example) (#6)
   - 선택 출력 `tangent: { conceptName, question }` — 지금 개념에서 벗어난 곁가지 질문일 때 (#4)
   - 선택 출력 `learnedConcept` — 이해가 확인된 순간이 있으면 (#5 애니메이션 트리거용)
9. 안전 (#11): 모든 학습 프롬프트에 연령에 맞는 안전 지침을 넣는다. 과목에 대상 정보가 있으면 초등 대상일 때 더 엄격하게 한다.
10. 테스트: 정규화·병합, 추천 규칙, 로컬 그래프, 백업·동기화 하위 호환, 스키마 검증, preview 레이트 리밋.

## 5. coder 2 — UI·화면

**소유 파일:**
- 새 파일: `src/components/graph/*`
- 수정: `src/components/notion/KnowledgeMapView.tsx`, `src/components/LearningConversationView.tsx`, `src/components/AiChatView.tsx`, `src/components/HomeView.tsx`, `src/components/home/*`, `src/components/CreateCourseModal.tsx`, `src/components/notion/Sidebar.tsx`, `src/App.tsx`, `src/index.css`

`server.ts`와 `src/services/*`는 수정하지 않는다. 필요한 변경은 최종 보고에 적는다.

**옵시디언 그래프 뷰 참고 포인트:**
- 어두운 캔버스 위의 작은 원형 노드와 가는 회색 연결선 (라이트 테마도 지원)
- force-directed 배치. `d3-force` 사용을 권장하며 의존성 추가를 허용한다. 렌더링은 캔버스나 SVG 중 성능 좋은 쪽을 고른다.
- 마우스를 올리면 그 노드와 이웃만 밝아지고 나머지는 흐려진다.
- 연결이 많은 노드일수록 크게 그린다. `domain`별로 색상 그룹을 나눈다.
- 확대/축소, 드래그, 노드 고정
- 노트 옆 "로컬 그래프"에 해당하는 대화 옆 미니 그래프

**노드 상태 시각화:** unseen은 흐리게, learned는 기본, verified는 진하게, needs_review는 다른 색, curious는 점선 테두리.

**작업:**
1. `src/components/graph/KnowledgeGraphView.tsx`: 전체 지도 화면.
   - 하드코딩된 데모 데이터만 있는 `KnowledgeMapView.tsx`를 실제 그래프 데이터로 교체한다.
   - 사이드바에서 들어갈 수 있게 한다. AI 대화 메뉴는 유지한다.
2. 노드 팝오버: 다시 보기 / 문제 풀기 / 이미 알아요 / 이 연결 이상해요 / (실기형) 해봤어요 (#7, #8)
3. 레슨 대화 화면 (`LearningConversationView.tsx`):
   - 데스크탑은 오른쪽에 미니 로컬 그래프, 모바일은 접히는 작은 그래프와 "다음에 갈 곳" 목록 (#9)
   - 96행의 개발자용 안내 문구("여러 카드로 쪼개지 않고…")를 학습자용 도입 문장으로 바꾼다.
   - 레슨 마지막에 다음 학습 유도 블록을 둔다. 질문형 문장 + 강조된 다음 노드 + 추천 카드 1~3개. `recommendNextSteps` → `/api/ai/next-nudge`를 쓰고, 실패하면 템플릿 문장을 쓴다.
   - 문제는 선택이다. "문제 풀기" 버튼은 유지하고, 대화에 "문제 내줘" 같은 요청이 오면 대화 흐름 안에 문제를 띄운다. AI의 "간단히 확인해볼까요?" 제안은 넘길 수 있어야 한다.
   - 설명 깊이 버튼 3개(쉬운 말 / 정식 개념 / 정확한 예시) → `depth`를 보내고 `setDepthReached` 호출 (#6)
   - 실기형(`learningType === "practical"`)이면 "해봤어요" 체크와 회고 입력 (#8)
   - 배운 순간 미니 그래프의 노드가 생기거나 밝아지는 짧은 애니메이션 (#5)
   - `tangent` 응답이 오면 "나중에 볼래요"로 `addCuriosity` (#4)
   - 레슨을 열 때 `setLastPosition`
   - 추천 맨 앞이 `wrap_up`이면 "오늘은 여기까지 잘했어요" 마무리 화면 (#11)
4. 돌아왔을 때 (#3): 홈과 레슨 진입 시 `getResumeContext()`로 "지난번엔 X까지 했어요. 1분만 복습하고 이어갈까요?"를 보여주고, 지도에 마지막 위치를 표시한다.
5. 비로그인 미리보기 (#2):
   - 비로그인 사용자가 주제를 입력하면 로그인 모달 대신 `/api/ai/preview-course` 결과를 옵시디언 스타일 그래프와 과목 구성으로 보여준다.
   - "이 지도로 시작하기"를 누르면 로그인하고, 로그인 후 같은 결과로 과목을 만든다.
   - `App.tsx`의 `handleOpenCreateCourse` 흐름을 바꾼다.
6. AI 대화 메뉴 (`AiChatView.tsx`): 대화에서 나온 개념을 "궁금해요" 노드로 저장하거나 "이걸로 과목 만들기"로 이어지게 한다.
7. 홈 예시 주제와 샘플을 교과 편중에서 넓힌다. 예: UI 디자인, 코딩, 낚시, 요리, 교과.
8. 접근성: 그래프 화면에도 키보드로 노드 목록을 탐색할 수 있는 대체 목록을 둔다.

## 6. 공통 규칙

- 작업 트리에는 커밋되지 않은 Firebase 전환 변경이 많다. **되돌리거나 무관한 파일을 재포맷하지 않는다.** 사용자가 요청하기 전에는 커밋하거나 푸시하지 않는다.
- 자기 소유가 아닌 파일은 수정하지 않는다. 필요한 변경은 최종 보고에 적는다.
- UI 문구는 한국어 존댓말이다. 전 연령, 모든 주제 기준으로 쓴다. 개발자용 문구나 영어 오류 원문을 노출하지 않는다.
- 끝나기 전에 `npm run lint`, `npm test`를 실행하고 결과를 보고한다.
- 로컬 서버는 Firestore Admin 자격 증명(ADC)이 없으면 로그인 사용자의 첫 동기화에서 프로세스가 종료된다. 화면 확인이 막히면 막힌 지점을 보고한다. 자격 증명을 임의로 만들지 않는다.
- 최종 보고 형식: 바꾼 파일, 구현한 항목 번호, 계약에서 달라진 점, 테스트 결과, 남은 일.
