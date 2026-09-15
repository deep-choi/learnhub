export type LearningType =
  | "concept" // 개념형
  | "problem_solving" // 문제풀이형
  | "memorization" // 암기형
  | "language" // 언어형
  | "practical"; // 실습형

export interface LessonMeta {
  id: string;
  chapterId: string;
  courseId: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  conceptId: string;
  conceptName: string;
  isCompleted: boolean;
  isGenerated?: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  description: string;
  lessons: LessonMeta[];
}

export interface Course {
  id: string;
  title: string;
  subject: string;
  learningType: LearningType;
  learningTypeExplanation: string;
  summary: string;
  level: "beginner" | "intermediate" | "advanced";
  goal: string;
  dailyMinutes: number;
  chapters: Chapter[];
  createdAt: string;
  updatedAt: string;
  /** Keeps the course out of the active sidebar without deleting its learning data. */
  status?: "active" | "completed" | "cancelled";
}

export interface QuizData {
  question: string;
  quizType: "multiple_choice" | "short_answer";
  options?: string[];
  answer: string;
  explanation: string;
  conceptId?: string;
  hints: string[];
}

export interface LessonStep {
  id: string;
  type: "concept" | "example" | "practice" | "quiz" | "summary";
  title: string;
  content: string;
  codeSnippet?: string;
  audioScript?: string;
  quiz?: QuizData;
}

export interface LessonContent {
  id: string;
  lessonId: string;
  courseId: string;
  title: string;
  steps: LessonStep[];
}

export interface UserSkill {
  conceptId: string;
  conceptName: string;
  courseId: string;
  courseTitle: string;
  understanding: number; // 0 ~ 100%
  correctCount: number;
  wrongCount: number;
  reviewCount: number;
  lastStudiedAt: string;
}

export interface ReviewQuestion {
  id: string;
  conceptId: string;
  conceptName: string;
  courseId?: string;
  lessonId?: string;
  courseTitle: string;
  question: string;
  quizType: "multiple_choice" | "short_answer";
  options?: string[];
  answer: string;
  explanation: string;
  dueAt: string;
}

export interface UserProgress {
  streakDays: number;
  totalMinutesLearned: number;
  completedLessonsCount: number;
  lastActiveDate: string;
}

export interface MistakeItem {
  id: string;
  conceptId?: string;
  concept: string;
  courseId?: string;
  course: string;
  lessonId?: string;
  question: string;
  wrongAnswer: string;
  correctAnswer: string;
  misconceptionTag: "개념 미숙" | "계산 착오" | "조건 누락";
  explanation: string;
  hint?: string;
  date: string;
  isResolved?: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  email?: string;
  isGuest: boolean;
  isLocalOnly?: boolean;
  provider?: "guest" | "email" | "google" | "apple";
  createdAt: string;
}

export type GoalType = "exam" | "practical" | "hobby" | "concept";
export type PreferredStyle = "concept" | "problem_solving" | "dialogue";
