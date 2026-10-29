import { authorizedFetch } from "./authClient";
import { StorageService } from "./storage";
import { isAssessmentSession, type AssessmentSession, type AssessmentQuestion, type AssessmentGrade } from "../domain/assessment";
import { notifyLearningDataChanged } from "./storage";
import type { Course } from "../types/learning";

export const assessmentStorageKey = (owner: string, courseId: string) => `learnhub_assessment_${encodeURIComponent(owner)}_${encodeURIComponent(courseId)}`;
/** 학습 기록의 개념 연습은 과목 종합 평가와 따로 저장해 서로의 풀이를 덮어쓰지 않습니다. */
export const practiceStorageKey = (owner: string, courseId: string) => assessmentStorageKey(owner, `practice:${courseId}`);
const storageKeyFor = (owner: string, courseId: string, practice: boolean) =>
  practice ? practiceStorageKey(owner, courseId) : assessmentStorageKey(owner, courseId);

export function loadAssessment(owner: string, courseId: string, practice = false): AssessmentSession | null {
  const raw = localStorage.getItem(storageKeyFor(owner, courseId, practice));
  if (!raw) return null;
  const s: unknown = JSON.parse(raw);
  if (!isAssessmentSession(s, courseId) || Boolean(s.lessonIds) !== practice) throw new Error("저장된 문제와 답안을 읽지 못했습니다. 새 문제를 만들어 주세요.");
  return s;
}

export function saveAssessment(owner: string, session: AssessmentSession): boolean {
  try { localStorage.setItem(storageKeyFor(owner, session.courseId, Boolean(session.lessonIds)), JSON.stringify(session)); notifyLearningDataChanged(); return true; }
  catch { return false; }
}

export async function assessmentRequest(path: string, body: unknown, signal: AbortSignal) {
  const response = await authorizedFetch(`/api/ai/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
  if (!response.ok) throw new Error(payload.error || "잠시 연결이 끊겼어요. 다시 시도해 주세요.");
  return payload;
}

/** Record only definitive answers; partial/uncertain grades cannot become binary failures. */
export function recordAssessmentGrade(course: Course, sessionId: string, question: AssessmentQuestion, answer: string, grade: AssessmentGrade) {
  if (grade.status === "unknown") return;
  if (grade.status !== "partial") StorageService.recordQuizAnswer(course.id, course.title, question.conceptId, question.conceptName,
    grade.status === "correct", `assessment:${sessionId}:${question.id}`);
  if (grade.status === "incorrect" || grade.status === "partial") StorageService.addMistake({
    id: `assessment:${sessionId}:${question.id}`, courseId: course.id, course: course.title, lessonId: question.lessonId,
    conceptId: question.conceptId, concept: question.conceptName, question: question.question, wrongAnswer: answer,
    correctAnswer: question.answer, explanation: `${grade.feedback}\n${question.explanation}`, misconceptionTag: "개념 미숙",
    date: new Date().toISOString().slice(0, 10), isResolved: false,
  });
}
