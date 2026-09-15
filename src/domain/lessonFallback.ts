import type { Course, LessonContent, LessonMeta } from "../types/learning";

/**
 * A structured, honest lesson that keeps study moving when the AI provider is
 * unavailable. It intentionally uses only the curriculum facts already
 * stored on the course, so it cannot invent subject matter or an answer key.
 */
export const createFallbackLessonContent = (
  course: Course,
  lesson: LessonMeta,
  chapterTitle: string,
): LessonContent => {
  const description = lesson.description || `${lesson.conceptName}의 핵심 뜻과 쓰임`;
  const workedExample = {
    math_fraction_common_denom: "예시: 1/2 + 1/3을 계산해 보겠습니다. 분모 2와 3의 공통 분모를 6으로 맞추면 1/2 = 3/6, 1/3 = 2/6이 되고, 따라서 3/6 + 2/6 = 5/6입니다. 분모를 먼저 맞추는 이유는 두 조각의 크기를 같게 만들어야 개수를 더할 수 있기 때문입니다.",
    math_ratio_percent: "예시: 15,000원인 물건을 20% 할인하면 할인액은 15,000 × 0.2 = 3,000원입니다. 원래 가격에서 할인액을 빼면 실제 결제 금액은 12,000원입니다. 비율을 먼저 소수나 분수로 바꾸면 계산 과정을 확인하기 쉽습니다.",
    mid_linear_equation: "예시: x + 3 = 7에서는 양변에서 3을 빼서 x = 4를 얻습니다. 원래 식에 4를 넣으면 4 + 3 = 7이므로 답을 검산할 수 있습니다. 한쪽에 한 연산을 했다면 다른 쪽에도 똑같이 해야 등식이 유지됩니다.",
    mid_complex_linear_eq: "예시: (x + 2) / 3 = 4라면 양변에 3을 곱해 x + 2 = 12로 바꾸고, 양변에서 2를 빼 x = 10을 얻습니다. 10을 원래 식에 넣어 (10 + 2) / 3 = 4인지 확인합니다.",
    math_avg_rate_of_change: "예시: 자전거가 2초에 10m 지점에서 5초에 25m 지점으로 이동했다면 평균변화율은 (25 - 10) / (5 - 2) = 5m/s입니다. 두 시점 사이 전체 변화를 시간 차이로 나눈 값입니다.",
    high_instantaneous_rate: "예시: f(x) = x²에서 x = 2 근처의 평균변화율은 ((2+h)² - 4) / h = 4+h입니다. h를 0에 가깝게 보내면 값이 4에 가까워지므로, x = 2에서의 순간변화율은 4라는 생각으로 이어집니다.",
    math_derivative_definition: "예시: f(x) = x²의 도함수 정의에 따라 [f(x+h) - f(x)] / h를 계산하면 [2xh + h²] / h = 2x+h가 됩니다. h를 0으로 보내면 f'(x) = 2x를 얻습니다. 정의에서 출발해 규칙을 확인한 사례입니다.",
  }[lesson.conceptId] || `아직 “${lesson.conceptName}” 개념에 연결된 검증 가능한 예시가 저장되어 있지 않습니다. 과목 설명에서 실제 대상과 조건을 하나 골라, 조건을 적고 개념을 적용한 뒤 결과를 확인하는 순서로 예시를 직접 만들어 보세요.`;
  const typeSpecificPractice = {
    concept: `“${lesson.conceptName}” 개념을 일상에서 볼 수 있는 상황을 하나 고르고, 왜 이 개념이 맞는지 근거를 두 문장으로 설명해 보세요.\n\n스스로 확인할 기준: 개념의 이름만 반복하지 않고 조건과 결과를 함께 적었는지 확인하세요.`,
    problem_solving: `“${lesson.conceptName}” 개념을 사용할 수 있는 문제를 직접 하나 만들어 보세요. 먼저 주어진 조건과 구할 것을 적고, 어떤 전략으로 풀지 한 문장으로 정한 뒤 풀이와 검산을 남겨 보세요.\n\n스스로 확인할 기준: 답만 쓰지 않고 조건·전략·검산이 모두 있는지 확인하세요.`,
    memorization: `“${lesson.conceptName}” 개념을 보지 않고 떠올려 보세요. 핵심 항목을 세 가지 이하로 적고, 각각을 연결할 수 있는 자기만의 예시를 하나씩 붙여 보세요.\n\n스스로 확인할 기준: 자료를 다시 보지 않아도 핵심 항목과 차이를 설명할 수 있는지 확인하세요.`,
    language: `“${lesson.conceptName}” 개념을 사용할 실제 상황을 하나 정하고, 그 상황에 맞는 문장을 직접 만들어 보세요. 문장을 만든 뒤 누구에게, 언제 쓰는 표현인지 덧붙여 보세요.\n\n스스로 확인할 기준: 뜻뿐 아니라 사용 상황까지 맞는지 확인하세요.`,
    practical: `“${lesson.conceptName}” 개념을 실제로 적용한다면 가장 작은 첫 행동이 무엇인지 적어 보세요. 필요한 입력, 예상 결과, 끝난 뒤 확인할 기준을 각각 한 가지씩 정해 보세요.\n\n스스로 확인할 기준: 다른 사람이 읽어도 바로 따라 할 수 있는 순서인지 확인하세요.`,
  }[course.learningType];

  return {
    id: `fallback-${lesson.id}`,
    courseId: course.id,
    lessonId: lesson.id,
    title: lesson.title,
    steps: [
      {
        id: "fallback-concept",
        type: "concept",
        title: "핵심 개념 이해하기",
        content: `${chapterTitle}에서 다루는 핵심 개념은 “${lesson.conceptName}”입니다. 과목에 저장된 설명은 “${description}”입니다.\n\n먼저 “${lesson.conceptName}”라는 개념이 무엇을 설명하는지 한 문장으로 바꿔 적어 보세요. 설명이 막히면 레슨 목표와 과목의 설명을 다시 읽고, 개념의 대상·조건·결과를 나누어 보세요.`,
      },
      {
        id: "fallback-example",
        type: "example",
        title: "예시를 단계로 풀어보기",
        content: `${workedExample}\n\n이 예시를 볼 때는 결과만 외우지 말고 과정을 세 부분으로 나누어 보세요. 먼저 주어진 상황과 조건을 적고, 다음으로 개념을 적용한 선택이나 계산을 적은 뒤, 마지막에 결과가 조건에 맞는지 확인합니다.`,
      },
      {
        id: "fallback-practice",
        type: "practice",
        title: "직접 해보기",
        content: `${typeSpecificPractice}\n\n답을 바로 확인하기보다 먼저 2~3분 동안 자신의 말과 순서로 적어 보세요.`,
      },
      {
        id: "fallback-boundary",
        type: "example",
        title: "헷갈리는 경우 구분하기",
        content: `“${lesson.conceptName}”을 잘못 적용하기 쉬운 경우는 조건을 확인하지 않고 이름만 보고 사용하는 때입니다. 방금 만든 예시에서 조건 하나를 바꾸었을 때도 같은 결론이 나오는지 살펴보고, 달라진다면 무엇이 달라졌는지 한 문장으로 적어 보세요.\n\n이 비교가 되면 “${lesson.conceptName}”의 적용 범위와 한계를 함께 이해할 수 있습니다.`,
      },
      {
        id: "fallback-summary",
        type: "summary",
        title: "핵심을 자기 말로 정리해 보세요",
        content: `개념 “${lesson.conceptName}”에 대한 설명은 “${description}”입니다. 오늘 배운 내용을 보지 않고, “언제 이 개념을 쓰며 무엇을 확인해야 하는가?”에 답하는 문장을 하나 만들어 보세요.`,
      },
    ],
  };
};
