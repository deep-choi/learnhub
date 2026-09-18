import { Course, UserSkill, UserProgress, ReviewQuestion, LessonContent, LessonMeta, MistakeItem, UserAccount } from "../types/learning";
import { PRESET_ROADMAP_CONTENTS } from "../data/roadmapData";

export const LEARNHUB_DATA_CHANGED_EVENT = "learnhub:data-changed";

const EMPTY_PROGRESS: UserProgress = {
  streakDays: 0,
  totalMinutesLearned: 0,
  completedLessonsCount: 0,
  lastActiveDate: "",
};

let currentUser: UserAccount | null = null;

export const notifyLearningDataChanged = (): void => {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(LEARNHUB_DATA_CHANGED_EVENT));
  }
};

/**
 * The stable LearnHub localStorage namespace.
 *
 * Keep this list explicit. It is also consumed by the portable backup layer;
 * user/profile data is intentionally not part of that layer's allowlist.
 */
export const LEARNHUB_STORAGE_KEYS = {
  COURSES: "ai_learnhub_courses_v2",
  SKILLS: "ai_learnhub_skills_v2",
  REVIEWS: "ai_learnhub_reviews_v2",
  PROGRESS: "ai_learnhub_progress_v2",
  LESSONS_CACHE: "ai_learnhub_lessons_cache_v2",
  QUIZ_ATTEMPTS: "ai_learnhub_quiz_attempts_v2",
  MISTAKES: "ai_learnhub_mistakes_v2",
  AI_PREFERENCES: "learnhub_ai_preferences_v1",
  USER: "ai_learnhub_user_v2",
} as const;

export const LEARNHUB_SCOPED_STORAGE_PREFIXES = {
  NOTES: "learnhub_note_",
  SCRATCHPAD: "learnhub_scratchpad_",
  TUTOR: "learnhub_tutor_history_",
  PRACTICE: "learnhub_practice_",
  ASSESSMENT: "learnhub_assessment_",
} as const;

const KEYS = LEARNHUB_STORAGE_KEYS;
const LESSON_CONTENT_CACHE_VERSION = "v3";

const lessonCacheKey = (lessonId: string) =>
  `${KEYS.LESSONS_CACHE}_${LESSON_CONTENT_CACHE_VERSION}_${lessonId}`;

export class StorageService {
  static getCourses(): Course[] {
    try {
      const data = localStorage.getItem(KEYS.COURSES);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static saveCourses(courses: Course[]): boolean {
    try {
      localStorage.setItem(KEYS.COURSES, JSON.stringify(courses));
      notifyLearningDataChanged();
      return true;
    } catch (e) {
      console.error("Failed to save courses:", e);
      return false;
    }
  }

  static addCourse(course: Course) {
    const courses = this.getCourses();
    const updated = [{ ...course, status: course.status || "active" }, ...courses];
    this.saveCourses(updated);
  }

  static updateCourseStatus(courseId: string, status: NonNullable<Course["status"]>): boolean {
    const courses = this.getCourses();
    const course = courses.find((item) => item.id === courseId);
    if (!course) return false;
    course.status = status;
    course.updatedAt = new Date().toISOString();
    return this.saveCourses(courses);
  }

  static getCourseById(id: string): Course | undefined {
    return this.getCourses().find((c) => c.id === id);
  }

  static markLessonCompleted(courseId: string, lessonId: string): boolean {
    const courses = this.getCourses();
    const courseIndex = courses.findIndex((c) => c.id === courseId);
    if (courseIndex === -1) return false;

    let updatedLesson: LessonMeta | null = null;
    let wasAlreadyCompleted = false;
    courses[courseIndex].chapters.forEach((chap) => {
      chap.lessons.forEach((les) => {
        if (les.id === lessonId) {
          wasAlreadyCompleted = les.isCompleted;
          les.isCompleted = true;
          updatedLesson = les;
        }
      });
    });

    if (!updatedLesson) return false;
    if (wasAlreadyCompleted) return true;

    if (this.saveCourses(courses)) {
      // Reading/completing a lesson is not evidence of quiz correctness.
      this.incrementProgress(updatedLesson.estimatedMinutes || 10);
      return true;
    }
    return false;
  }

  static getSkills(): UserSkill[] {
    try {
      const data = localStorage.getItem(KEYS.SKILLS);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static saveSkills(skills: UserSkill[]): boolean {
    try {
      localStorage.setItem(KEYS.SKILLS, JSON.stringify(skills));
      notifyLearningDataChanged();
      return true;
    } catch (e) {
      console.error("Failed to save skills:", e);
      return false;
    }
  }

  static updateSkillOnLessonComplete(courseId: string, courseTitle: string, conceptId: string, conceptName: string) {
    void courseId;
    void courseTitle;
    void conceptId;
    void conceptName;
    // Kept for source compatibility. Reading or pressing "complete" is not a
    // correctness signal, so skill values change only from quiz answers.
  }

  static recordQuizAnswer(
    courseId: string,
    courseTitle: string,
    conceptId: string,
    conceptName: string,
    isCorrect: boolean,
    attemptId?: string,
  ): boolean {
    if (!courseId.trim() || !conceptId.trim()) return false;

    const previousAttempts = attemptId ? this.getQuizAttemptIds() : null;
    if (attemptId && previousAttempts?.has(attemptId)) return false;

    const skills = this.getSkills();
    const previousSkills = JSON.parse(JSON.stringify(skills)) as UserSkill[];
    const index = skills.findIndex(
      (s) => s.conceptId === conceptId && s.courseId === courseId,
    );

    if (index >= 0) {
      if (isCorrect) {
        skills[index].understanding = Math.min(100, skills[index].understanding + 10);
        skills[index].correctCount += 1;
      } else {
        skills[index].understanding = Math.max(10, skills[index].understanding - 12);
        skills[index].wrongCount += 1;
      }
      skills[index].lastStudiedAt = new Date().toISOString();
    } else {
      skills.push({
        conceptId,
        conceptName,
        courseId,
        courseTitle,
        understanding: isCorrect ? 80 : 40,
        correctCount: isCorrect ? 1 : 0,
        wrongCount: isCorrect ? 0 : 1,
        reviewCount: 0,
        lastStudiedAt: new Date().toISOString(),
      });
    }

    if (!this.saveSkills(skills)) {
      this.saveSkills(previousSkills);
      return false;
    }

    if (attemptId && previousAttempts) {
      const attempts = new Set(previousAttempts);
      attempts.add(attemptId);
      if (!this.saveQuizAttemptIds(attempts)) {
        this.saveSkills(previousSkills);
        this.saveQuizAttemptIds(previousAttempts);
        return false;
      }
    }

    return true;
  }

  static getReviews(): ReviewQuestion[] {
    try {
      const data = localStorage.getItem(KEYS.REVIEWS);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static saveReviews(reviews: ReviewQuestion[]): boolean {
    try {
      localStorage.setItem(KEYS.REVIEWS, JSON.stringify(reviews));
      notifyLearningDataChanged();
      return true;
    } catch (e) {
      console.error("Failed to save reviews:", e);
      return false;
    }
  }

  static getDueReviews(now: Date = new Date()): ReviewQuestion[] {
    return this.getReviews().filter((review) => {
      const dueAt = new Date(review.dueAt);
      // Invalid legacy dueAt values remain stored but are never silently
      // treated as due. Callers can surface them separately if needed.
      return Number.isFinite(dueAt.getTime()) && dueAt.getTime() <= now.getTime();
    });
  }

  static scheduleLessonReviews(
    course: Course,
    lesson: LessonMeta,
    content: LessonContent,
  ): boolean {
    const validSteps = content.steps.filter((step) => {
      const quiz = step.quiz;
      return Boolean(
        quiz &&
          (quiz.quizType === "multiple_choice" || quiz.quizType === "short_answer") &&
          typeof quiz.question === "string" &&
          typeof quiz.answer === "string" &&
          quiz.question.trim() &&
          quiz.answer.trim(),
      );
    });

    if (validSteps.length === 0) return false;

    const reviews = this.getReviews();
    const existingIds = new Set(reviews.map((review) => review.id));
    const nextDay = new Date();
    nextDay.setHours(0, 0, 0, 0);
    nextDay.setDate(nextDay.getDate() + 1);
    const dueAt = nextDay.toISOString();
    const newReviews: ReviewQuestion[] = [];

    validSteps.forEach((step) => {
      const quiz = step.quiz!;
      const id = `review-${course.id}-${lesson.id}-${step.id}`;
      if (existingIds.has(id)) return;
      existingIds.add(id);

      newReviews.push({
        id,
        courseId: course.id,
        lessonId: lesson.id,
        conceptId: quiz.conceptId || lesson.conceptId,
        conceptName: lesson.conceptName,
        courseTitle: course.title,
        question: quiz.question,
        quizType: quiz.quizType,
        options: quiz.options,
        answer: quiz.answer,
        explanation: quiz.explanation || "정답을 다시 확인해 보세요.",
        dueAt,
      });
    });

    if (newReviews.length === 0) return true;
    return this.saveReviews([...reviews, ...newReviews]);
  }

  static removeReviewItem(id: string) {
    const reviews = this.getReviews().filter((r) => r.id !== id);
    this.saveReviews(reviews);
  }

  static getProgress(): UserProgress {
    try {
      const data = localStorage.getItem(KEYS.PROGRESS);
      if (!data) return { ...EMPTY_PROGRESS };
      return JSON.parse(data);
    } catch {
      return { ...EMPTY_PROGRESS };
    }
  }

  static saveProgress(p: UserProgress) {
    try {
      localStorage.setItem(KEYS.PROGRESS, JSON.stringify(p));
      notifyLearningDataChanged();
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }

  static incrementProgress(minutes: number) {
    const prog = this.getProgress();
    const todayStr = new Date().toISOString().split("T")[0];

    if (prog.lastActiveDate !== todayStr) {
      prog.streakDays += 1;
      prog.lastActiveDate = todayStr;
    }

    prog.totalMinutesLearned += minutes;
    prog.completedLessonsCount += 1;
    this.saveProgress(prog);
  }

  static getCachedLessonContent(lessonId: string): LessonContent | null {
    try {
      const data = localStorage.getItem(lessonCacheKey(lessonId));
      if (data) return JSON.parse(data);
      if (PRESET_ROADMAP_CONTENTS[lessonId]) return PRESET_ROADMAP_CONTENTS[lessonId];
      return null;
    } catch {
      if (PRESET_ROADMAP_CONTENTS[lessonId]) return PRESET_ROADMAP_CONTENTS[lessonId];
      return null;
    }
  }

  static cacheLessonContent(lessonId: string, content: LessonContent) {
    try {
      localStorage.setItem(lessonCacheKey(lessonId), JSON.stringify(content));
      notifyLearningDataChanged();
    } catch (e) {
      console.error("Failed to cache lesson:", e);
    }
  }

  static getMistakes(): MistakeItem[] {
    try {
      const data = localStorage.getItem(KEYS.MISTAKES);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static saveMistakes(mistakes: MistakeItem[]) {
    try {
      localStorage.setItem(KEYS.MISTAKES, JSON.stringify(mistakes));
      notifyLearningDataChanged();
    } catch (e) {
      console.error("Failed to save mistakes:", e);
    }
  }

  static addMistake(mistake: MistakeItem) {
    const mistakes = this.getMistakes();
    const existingIdx = mistakes.findIndex(
      (m) => m.question === mistake.question && m.concept === mistake.concept
    );
    let updated: MistakeItem[];
    if (existingIdx >= 0) {
      updated = [...mistakes];
      updated[existingIdx] = { ...mistake, id: mistakes[existingIdx].id };
    } else {
      updated = [mistake, ...mistakes];
    }
    this.saveMistakes(updated);
  }

  static toggleMistakeResolved(id: string): boolean {
    const mistakes = this.getMistakes();
    const idx = mistakes.findIndex((m) => m.id === id);
    if (idx >= 0) {
      const nowResolved = !mistakes[idx].isResolved;
      mistakes[idx].isResolved = nowResolved;
      this.saveMistakes(mistakes);

      return nowResolved;
    }
    return false;
  }

  static removeMistake(id: string) {
    const mistakes = this.getMistakes().filter((m) => m.id !== id);
    this.saveMistakes(mistakes);
  }

  static getUser(): UserAccount {
    return currentUser || {
      id: "guest-user",
      name: "로그인 필요",
      isGuest: true,
      isLocalOnly: true,
      provider: "guest",
      createdAt: new Date().toISOString(),
    };
  }

  static setUser(user: UserAccount): boolean {
    currentUser = user;
    return true;
  }

  static logout(): UserAccount {
    currentUser = null;
    this.clearLearningData();
    return this.getUser();
  }

  static clearLearningData(): void {
    const exactKeys = new Set<string>([
      ...Object.values(KEYS),
      "learnhub_cloud_data_owner_v1",
      "learnhub_pending_sync_owner_v1",
      "learnhub_content_report_drafts_v1",
      "learnhub_learning_analytics_v1",
    ]);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && (
        exactKeys.has(key) ||
        key.startsWith(`${KEYS.LESSONS_CACHE}_`) ||
        key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.NOTES) ||
        key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.SCRATCHPAD) ||
        key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.TUTOR) ||
        key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.PRACTICE) ||
        key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.ASSESSMENT)
      )) {
        localStorage.removeItem(key);
      }
    }
  }

  static resetData(): void {
    this.clearLearningData();
    notifyLearningDataChanged();
  }

  private static getQuizAttemptIds(): Set<string> {
    try {
      const data = localStorage.getItem(KEYS.QUIZ_ATTEMPTS);
      if (!data) return new Set();
      const parsed = JSON.parse(data);
      return new Set(
        Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === "string")
          : [],
      );
    } catch {
      return new Set();
    }
  }

  private static saveQuizAttemptIds(attempts: Set<string>): boolean {
    try {
      localStorage.setItem(KEYS.QUIZ_ATTEMPTS, JSON.stringify([...attempts]));
      notifyLearningDataChanged();
      return true;
    } catch (e) {
      console.error("Failed to save quiz attempts:", e);
      return false;
    }
  }
}
