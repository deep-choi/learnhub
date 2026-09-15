import type { Course } from "../../src/types/learning";
import type { AssessmentQuestion, AssessmentSession } from "../../src/domain/assessment";

export const assessmentCourse: Course = {
  id: "assessment-check-course", title: "일차방정식의 균형", subject: "수학", learningType: "problem_solving", learningTypeExplanation: "같은 연산으로 균형을 유지해요.",
  summary: "등식의 성질로 일차방정식을 풀어요.", level: "beginner", goal: "concept", dailyMinutes: 10,
  createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z", chapters: [{
    id: "balance", title: "등식과 방정식", description: "양변의 균형을 유지하기", lessons: [
      { id: "balance-1", chapterId: "balance", courseId: "assessment-check-course", title: "등식의 성질", description: "등식의 양변에 같은 수를 더하거나 빼면 등식은 유지됩니다.", estimatedMinutes: 10, conceptId: "balance-rule", conceptName: "등식의 성질", isCompleted: true },
      { id: "balance-2", chapterId: "balance", courseId: "assessment-check-course", title: "일차방정식 풀기", description: "x + 3 = 7의 양변에서 3을 빼면 x = 4입니다. 구한 해를 원래 식에 대입해 검산합니다.", estimatedMinutes: 10, conceptId: "solve-equation", conceptName: "일차방정식 풀이", isCompleted: true },
    ],
  }],
};
export const fixtureQuestion = (i: number, type: AssessmentQuestion["type"]): AssessmentQuestion => ({
  id: `q${i + 1}`, lessonId: "balance-2", conceptId: "solve-equation", conceptName: "일차방정식 풀이", type,
  question: type === "essay" ? `x + ${i + 1} = ${i + 5}에서 x를 구하는 과정을 설명해 보세요.` : `x + ${i + 1} = ${i + 5}에서 x의 값은 무엇일까요?`,
  ...(type === "multiple_choice" ? { options: ["2", "3", "4", "5"] } : {}),
  answer: type === "essay" ? `양변에서 ${i + 1}을 빼면 x = 4가 됩니다. 원래 식에 대입하여 검산합니다.` : "4",
  explanation: "등식의 양변에 같은 연산을 적용하면 균형이 유지됩니다.", criteria: type === "essay" ? ["양변에 같은 수를 뺀다", "x = 4를 구하고 검산한다"] : [],
});
export const fixtureSession = (): AssessmentSession => ({
  version: 1, id: "test-session", courseId: assessmentCourse.id, config: { count: 5, type: "mixed" },
  questions: Array.from({ length: 5 }, (_, i) => fixtureQuestion(i, i % 2 ? "essay" : "multiple_choice")),
  answers: { q1: "4", q2: "양변에서 2를 뺍니다." }, grades: {}, index: 1, stage: "solving", createdAt: "2026-09-10T00:00:00.000Z",
});
