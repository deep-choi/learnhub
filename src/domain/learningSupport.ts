import { LearningType } from "../types/learning";

export interface LearningSupportDefinition {
  learningType: LearningType;
  label: string;
  supported: string[];
  notSupported: string[];
  successCriteria: string[];
  adultTaskSuggestions: string[];
}

export const learningSupportDefinitions: Record<LearningType, LearningSupportDefinition> = {
  concept: {
    learningType: "concept",
    label: "개념 이해형",
    supported: ["핵심 원리를 쉬운 설명과 예시로 연결", "짧은 자기 말 설명으로 이해 확인"],
    notSupported: ["자료의 사실 여부를 자동 검증하지 않음", "코드 실행이나 음성 평가를 하지 않음"],
    successCriteria: ["핵심 개념을 자기 말로 한 문장 설명", "새 예시와 반례를 하나씩 구분"],
    adultTaskSuggestions: ["업무·일상에서 비슷한 사례 한 가지 찾기", "오늘 배운 내용을 동료에게 30초로 설명하기"],
  },
  problem_solving: {
    learningType: "problem_solving",
    label: "문제 해결형",
    supported: ["조건 파악→전략 선택→풀이→검산 순서 연습", "풀이 과정의 빈틈을 질문과 힌트로 점검"],
    notSupported: ["정답만으로 풀이의 실제 이해를 보증하지 않음", "코드 실행이나 음성 평가를 하지 않음", "외부 도구 결과를 검증하지 않음"],
    successCriteria: ["문제의 조건과 구할 것을 먼저 말하기", "답과 함께 선택한 전략을 설명하고 확인"],
    adultTaskSuggestions: ["실제 업무 문제를 조건·목표로 나눠 적기", "답을 내기 전 예상 범위와 단위를 확인하기"],
  },
  memorization: {
    learningType: "memorization",
    label: "기억·회상형",
    supported: ["핵심 용어를 회상하고 간격을 두고 다시 확인", "헷갈리는 항목을 비교표로 정리"],
    notSupported: ["반복만으로 장기 기억을 보장하지 않음", "음성 발음이나 말하기를 평가하지 않음", "코드 실행을 하지 않음"],
    successCriteria: ["자료를 가린 채 핵심 항목을 떠올리기", "각 항목을 자기 예시와 연결"],
    adultTaskSuggestions: ["출퇴근·휴식 전후 2분 회상 카드 만들기", "비슷한 용어의 차이를 한 줄로 기록하기"],
  },
  language: {
    learningType: "language",
    label: "언어 사용형",
    supported: ["표현의 뜻과 상황을 연결", "짧은 문장을 직접 만들고 텍스트로 점검", "음성 엔진 전까지는 소리 내어 직접 연습하고 스스로 확인"],
    notSupported: ["음성 발음·억양 평가를 하지 않음", "번역·표현의 사실성이나 자연스러움을 보증하지 않음", "코드 실행을 하지 않음"],
    successCriteria: ["배운 표현으로 상황에 맞는 문장 하나 만들기", "비슷한 표현과 쓰임 차이를 설명"],
    adultTaskSuggestions: ["여행·업무·취미 중 실제 상황 문장 만들기", "오늘 만난 표현을 내일 다시 써보기"],
  },
  practical: {
    learningType: "practical",
    label: "실용 적용형",
    supported: ["작은 목표를 단계와 체크리스트로 나눔", "예시를 바탕으로 직접 적용할 지점을 정리", "실행 엔진 전까지는 사용자가 직접 실행하고 결과를 체크"],
    notSupported: ["코드 실행·파일 생성·외부 도구 조작을 하지 않음", "음성 평가를 하지 않음", "실제 결과나 안전성을 자동 검증하지 않음"],
    successCriteria: ["다음 행동을 순서대로 말하거나 적기", "완료 여부를 확인할 자기 점검 항목 만들기"],
    adultTaskSuggestions: ["오늘 바로 10분 안에 할 수 있는 한 단계 실행", "실제 도구를 쓰기 전 입력·출력·주의점 확인"],
  },
};

export const getLearningSupport = (learningType: LearningType): LearningSupportDefinition =>
  learningSupportDefinitions[learningType] || learningSupportDefinitions.concept;
