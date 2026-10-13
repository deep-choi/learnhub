import type { StudyResult } from "../domain/study";
import { getStudyLibrary, updateStudyLibrary } from "./studyStore";
import { LEARNHUB_STORAGE_KEYS as keys, StorageService, notifyLearningDataChanged } from "./storage";

/** Save the answer and its learning records together; reopening cannot count it twice. */
export function answerStudyQuiz(id: string, index: number, answer: number): StudyResult {
  const result = getStudyLibrary().results.find(r => r.id === id);
  const q = result?.questions?.[index];
  if (!result || !q || !Number.isInteger(answer) || answer < 0 || answer > 3) throw new Error("문제를 찾을 수 없습니다.");
  if (result.quizProgress?.answers[index] !== undefined) return result;
  const progress = result.quizProgress || { round: 0, answers: {}, updatedAt: result.createdAt };
  const next = { ...result, quizProgress: { ...progress, answers: { ...progress.answers, [index]: answer }, updatedAt: new Date().toISOString() } };
  const touched = [keys.STUDY_LIBRARY, keys.MISTAKES, keys.SKILLS, keys.KNOWLEDGE_GRAPH, keys.QUIZ_ATTEMPTS];
  const before = touched.map(k => [k, localStorage.getItem(k)] as const);
  try {
    updateStudyLibrary(l => ({ ...l, results: l.results.map(r => r.id === id ? next : r) }));
    const context = result.learningContext;
    const course = StorageService.getCourses().find(c => c.id === context?.courseId);
    const correct = answer === q.answer;
    const concept = context?.conceptName || result.title;
    const attemptId = `study:${id}:${progress.round}:${index}`;
    if (context && course && !StorageService.recordQuizAnswer(course.id, course.title, context.conceptId, context.conceptName, correct, attemptId)) throw new Error("학습 기록을 저장하지 못했습니다.");
    if (!correct) {
      if (!StorageService.addMistake({
        id: `study:${id}:${index}`, studyResultId: id, question: q.question, wrongAnswer: q.options[answer], correctAnswer: q.options[q.answer],
        concept, course: course?.title || "자료 학습", ...(context ? { courseId: context.courseId, lessonId: context.lessonId, conceptId: context.conceptId } : {}),
        explanation: q.explanation, misconceptionTag: "개념 미숙", date: new Date().toISOString().slice(0, 10), isResolved: false,
      })) throw new Error("오답을 저장하지 못했습니다.");
    } else {
      const mistakes = StorageService.getMistakes();
      const match = mistakes.find(m => m.question === q.question && m.concept === concept && m.courseId === context?.courseId);
      if (match && !match.isResolved && !StorageService.saveMistakes(mistakes.map(m => m.id === match.id ? { ...m, isResolved: true } : m))) throw new Error("복습 결과를 저장하지 못했습니다.");
    }
    return next;
  } catch (error) {
    for (const [key, value] of before) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
    notifyLearningDataChanged();
    throw error;
  }
}

export function restartStudyQuiz(id: string): StudyResult {
  const result = getStudyLibrary().results.find(r => r.id === id);
  if (!result?.questions?.length) throw new Error("문제를 찾을 수 없습니다.");
  const next = { ...result, quizProgress: { round: (result.quizProgress?.round || 0) + 1, answers: {}, updatedAt: new Date().toISOString() } };
  updateStudyLibrary(l => ({ ...l, results: l.results.map(r => r.id === id ? next : r) }));
  return next;
}
