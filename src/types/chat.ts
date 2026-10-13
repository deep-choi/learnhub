import type { CourseSetup, SetupProgress, SetupStepId } from "./courseSetup";

/** Actual diagnostic state, independent of the AI's phrasing. */
export interface ChatSetupState {
  subject: string;
  setup: CourseSetup;
  progress: SetupProgress;
  stepId?: SetupStepId;
  question?: string;
}

/** 레슨에 묶이지 않은 자유 대화(최근 목록)의 저장 타입. */
export interface ChatSessionMessage {
  studyResultId?: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  /** assistant 답변이 나온 질문. 궁금해요 저장·과목 만들기에 씁니다. */
  question?: string;
  /** AI가 짚어 준 개념 이름 */
  conceptName?: string;
  /** 이 답변에서 감지된 학습 의도. 새로고침 뒤 과목 미리보기 카드를 다시 띄울 때 씁니다. */
  learningIntent?: LearningIntent;
  /** 이 메시지에 붙은 과목 미리보기 카드의 결과. 대화를 다시 열 때 AI를 다시 부르지 않고 이 값으로 그립니다. */
  coursePreview?: ChatCoursePreview;
  setupState?: ChatSetupState;
}

/**
 * preview-course/analyze-subject 응답 전체와, 그 응답을 만들 때 쓴 최종 설정
 * (확인 질문 답 `levelEvidence`와 그로 정해진 `level` 포함).
 * `data`는 JSON으로 약 40,000자 이하이고, 세션당 가장 최근 3건만 남습니다.
 */
export interface ChatCoursePreview {
  subject: string;
  setup?: CourseSetup;
  data: Record<string, unknown>;
}

/** `createdAt`은 저장소가 채웁니다. */
export type NewChatMessage = Omit<ChatSessionMessage, "createdAt"> & { createdAt?: string };

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatSessionMessage[];
}

/** 사용자가 새 주제를 체계적으로 배우고 싶어 할 때만 만들어지는 의도. */
export interface LearningIntent {
  subject: string;
}

/**
 * 자유 대화 요청에 함께 보내는 학습자 요약. 이름 목록만 담고 개수·길이에 상한이 있다.
 * 서버(`validLearnerContext`)와 같은 상한을 쓴다.
 */
export interface LearnerContext {
  currentCourse?: string;
  currentConcept?: string;
  recentConcepts: string[];
  reviewConcepts: string[];
  activeCourses: string[];
}

/** 사이드바 "과목" 폴더 하나. */
export interface SidebarLesson {
  id: string;
  title: string;
  isCompleted: boolean;
  /** 마지막으로 학습한 레슨(현재 위치) */
  isCurrent: boolean;
  /** 이 레슨에 저장된 대화 기록이 있는지 */
  hasConversation: boolean;
}

export interface SidebarCourse {
  id: string;
  title: string;
  /** 현재 위치가 이 과목 안에 있는지 */
  isCurrent: boolean;
  completedCount: number;
  totalCount: number;
  lessons: SidebarLesson[];
}
