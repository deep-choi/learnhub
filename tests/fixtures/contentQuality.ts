export const validCurricula = [
  { courseTitle: "파이썬으로 반복 업무 줄이기", learningType: "practical", learningTypeExplanation: "작은 적용 과제로 익힙니다.", summary: "성인 학습자를 위한 파이썬 기초", chapters: [{ title: "첫 자동화", description: "입력과 결과를 나눠 봅니다.", lessons: [{ title: "변수와 출력", description: "값을 담고 확인합니다.", estimatedMinutes: 15, conceptId: "python-vars", conceptName: "변수" }] }] },
  { courseTitle: "여행 일본어", learningType: "language", learningTypeExplanation: "여행 상황의 문장을 텍스트로 연습합니다.", summary: "짧은 표현부터 사용합니다.", chapters: [{ title: "공항", description: "필요한 표현을 익힙니다.", lessons: [{ title: "길 묻기", description: "방향을 질문합니다.", estimatedMinutes: 10, conceptId: "ja-directions", conceptName: "길 묻기" }] }] },
  { courseTitle: "사진 구도", learningType: "practical", learningTypeExplanation: "촬영 전 체크리스트로 적용합니다.", summary: "일상 사진의 구도를 점검합니다.", chapters: [{ title: "기본 구도", description: "시선을 정리합니다.", lessons: [{ title: "삼분할", description: "피사체 위치를 점검합니다.", estimatedMinutes: 12, conceptId: "photo-thirds", conceptName: "삼분할" }] }] },
  { courseTitle: "그림의 색과 대비", learningType: "concept", learningTypeExplanation: "원리와 사례를 연결합니다.", summary: "작품을 관찰하며 이해합니다.", chapters: [{ title: "색의 관계", description: "색 사이의 차이를 봅니다.", lessons: [{ title: "명도 대비", description: "밝기의 차이를 구분합니다.", estimatedMinutes: 15, conceptId: "art-value", conceptName: "명도 대비" }] }] },
  { courseTitle: "분수 계산", learningType: "problem_solving", learningTypeExplanation: "조건과 전략을 나눠 풉니다.", summary: "분수 문제를 단계적으로 해결합니다.", chapters: [{ title: "통분", description: "공통 분모를 찾습니다.", lessons: [{ title: "분수 더하기", description: "통분 후 계산합니다.", estimatedMinutes: 15, conceptId: "fraction-add", conceptName: "분수 덧셈" }] }] },
] as const;

export const validLessons = [
  { title: "변수와 출력", steps: [{ type: "concept", title: "값을 담기", content: "변수는 값을 담는 이름입니다.", codeSnippet: "name = 'Ada'" }, { type: "quiz", title: "확인", content: "다음 결과를 생각해 봅니다.", quiz: { question: "name의 값은?", quizType: "multiple_choice", options: ["Ada", "Grace"], answer: "Ada", explanation: "대입한 값입니다.", hints: ["대입문을 다시 보세요."] } }] },
  { title: "여행 일본어", steps: [{ type: "concept", title: "길 묻기", content: "駅はどこですか。는 역이 어디인지 묻습니다.", audioScript: "えきはどこですか。" }] },
  { title: "사진 구도", steps: [{ type: "practice", title: "삼분할 확인", content: "화면을 세로와 가로로 나누어 봅니다." }] },
  { title: "색과 대비", steps: [{ type: "example", title: "명도 비교", content: "밝기 차이가 시선을 만듭니다." }] },
  { title: "분수 덧셈", steps: [{ type: "practice", title: "통분", content: "공통 분모를 찾아 계산합니다.", quiz: { question: "1/2 + 1/2 = ?", quizType: "short_answer", answer: "1", explanation: "같은 분모이므로 분자를 더합니다.", hints: ["분자는 더하고 분모는 그대로입니다."] } }] },
] as const;

export const invalidPayloads = {
  curriculumWithoutLessons: { courseTitle: "빈 과정", learningType: "concept", learningTypeExplanation: "설명", summary: "요약", chapters: [{ title: "챕터", description: "설명", lessons: [] }] },
  lessonWithoutSteps: { title: "빈 레슨", steps: [] },
  multipleChoiceAnswerMismatch: { title: "퀴즈", steps: [{ title: "확인", content: "내용", quiz: { question: "?", quizType: "multiple_choice", options: ["A", "B"], answer: "C", explanation: "설명", hints: [] } }] },
  duplicateOptions: { title: "퀴즈", steps: [{ title: "확인", content: "내용", quiz: { question: "?", quizType: "multiple_choice", options: ["A", "A"], answer: "A", explanation: "설명", hints: [] } }] },
} as const;
