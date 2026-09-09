import { Course, UserSkill, UserProgress, ReviewQuestion, LessonContent, LessonMeta, MistakeItem, UserAccount } from "../types/learning";
import { INITIAL_COURSES, INITIAL_SKILLS, INITIAL_REVIEWS, INITIAL_PROGRESS } from "../data/initialData";
import { PRESET_ROADMAP_CONTENTS } from "../data/roadmapData";

const INITIAL_MISTAKES: MistakeItem[] = [
  {
    id: "mistake-1",
    conceptId: "concept-diff-01",
    concept: "순간변화율과 접선의 기울기",
    courseId: "course-high-math-01",
    course: "[고등] 미적분학: 변화의 수학",
    question: "함수 f(x) = x²의 x = 3에서의 순간변화율은?",
    wrongAnswer: "9",
    correctAnswer: "6",
    misconceptionTag: "개념 미숙",
    explanation: "f(3)의 함숫값(9)과 f'(3)의 미분계수(6)를 혼동하여 대입했습니다.",
    date: "2026-09-08",
    isResolved: false,
  },
  {
    id: "mistake-2",
    conceptId: "concept-mid-01",
    concept: "일차방정식과 논리적 이항",
    courseId: "course-mid-math-01",
    course: "[중등] 일차방정식: 미지수의 균형",
    question: "방정식 2x + 7 = 15 에서 x의 값은?",
    wrongAnswer: "11",
    correctAnswer: "4",
    misconceptionTag: "계산 착오",
    explanation: "+7을 우변으로 이항할 때 부호를 바꾸지 않고 15 + 7로 계산한 오류입니다.",
    date: "2026-09-07",
    isResolved: false,
  },
];

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
  USER: "ai_learnhub_user_v2",
} as const;

export const LEARNHUB_SCOPED_STORAGE_PREFIXES = {
  NOTES: "learnhub_note_",
  SCRATCHPAD: "learnhub_scratchpad_",
  TUTOR: "learnhub_tutor_history_",
} as const;

const KEYS = LEARNHUB_STORAGE_KEYS;

export class StorageService {
  static getCourses(): Course[] {
    try {
      const data = localStorage.getItem(KEYS.COURSES);
      if (!data) {
        this.saveCourses(INITIAL_COURSES);
        return INITIAL_COURSES;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_COURSES;
    }
  }

  static saveCourses(courses: Course[]): boolean {
    try {
      localStorage.setItem(KEYS.COURSES, JSON.stringify(courses));
      return true;
    } catch (e) {
      console.error("Failed to save courses:", e);
      return false;
    }
  }

  static addCourse(course: Course) {
    const courses = this.getCourses();
    const updated = [course, ...courses];
    this.saveCourses(updated);
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
      if (!data) {
        localStorage.setItem(KEYS.SKILLS, JSON.stringify(INITIAL_SKILLS));
        return INITIAL_SKILLS;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_SKILLS;
    }
  }

  static saveSkills(skills: UserSkill[]): boolean {
    try {
      localStorage.setItem(KEYS.SKILLS, JSON.stringify(skills));
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
      if (!data) {
        localStorage.setItem(KEYS.REVIEWS, JSON.stringify(INITIAL_REVIEWS));
        return INITIAL_REVIEWS;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_REVIEWS;
    }
  }

  static saveReviews(reviews: ReviewQuestion[]): boolean {
    try {
      localStorage.setItem(KEYS.REVIEWS, JSON.stringify(reviews));
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
      if (!data) {
        localStorage.setItem(KEYS.PROGRESS, JSON.stringify(INITIAL_PROGRESS));
        return INITIAL_PROGRESS;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_PROGRESS;
    }
  }

  static saveProgress(p: UserProgress) {
    try {
      localStorage.setItem(KEYS.PROGRESS, JSON.stringify(p));
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
      const data = localStorage.getItem(`${KEYS.LESSONS_CACHE}_${lessonId}`);
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
      localStorage.setItem(`${KEYS.LESSONS_CACHE}_${lessonId}`, JSON.stringify(content));
    } catch (e) {
      console.error("Failed to cache lesson:", e);
    }
  }

  static getMistakes(): MistakeItem[] {
    try {
      const data = localStorage.getItem(KEYS.MISTAKES);
      if (!data) {
        this.saveMistakes(INITIAL_MISTAKES);
        return INITIAL_MISTAKES;
      }
      return JSON.parse(data);
    } catch {
      return INITIAL_MISTAKES;
    }
  }

  static saveMistakes(mistakes: MistakeItem[]) {
    try {
      localStorage.setItem(KEYS.MISTAKES, JSON.stringify(mistakes));
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
    try {
      const data = localStorage.getItem(KEYS.USER);
      if (data) return JSON.parse(data);
    } catch {}
    const defaultGuest: UserAccount = {
      id: "guest-user",
      name: "체험 학습자",
      isGuest: true,
      isLocalOnly: true,
      provider: "guest",
      createdAt: new Date().toISOString(),
    };
    return defaultGuest;
  }

  static setUser(user: UserAccount): boolean {
    try {
      localStorage.setItem(KEYS.USER, JSON.stringify(user));
      return true;
    } catch (e) {
      console.error("Failed to save user:", e);
      return false;
    }
  }

  static createLocalProfile(name: string): UserAccount {
    const user: UserAccount = {
      id: `local-user-${Date.now()}`,
      name: name.trim() || "이 기기 학습자",
      isGuest: false,
      isLocalOnly: true,
      createdAt: new Date().toISOString(),
    };
    if (!this.setUser(user)) {
      throw new Error("로컬 프로필을 저장하지 못했습니다.");
    }
    return user;
  }

  // Kept for callers written against the old local-only API. It never authenticates
  // or stores newly supplied PII; use createLocalProfile for new UI code.
  static loginUser(name: string, email: string, provider: "email" | "google" | "apple" = "email"): UserAccount {
    void email;
    void provider;
    return this.createLocalProfile(name);
  }

  static logout(): UserAccount {
    localStorage.removeItem(KEYS.USER);
    return this.getUser();
  }

  static resetData() {
    const studyKeys = [
      KEYS.COURSES,
      KEYS.SKILLS,
      KEYS.REVIEWS,
      KEYS.PROGRESS,
      KEYS.MISTAKES,
      KEYS.QUIZ_ATTEMPTS,
    ];
    studyKeys.forEach((key) => localStorage.removeItem(key));

    // Lesson content is disposable study data, but lesson notes and the current
    // local profile intentionally remain untouched.
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${KEYS.LESSONS_CACHE}_`)) {
        localStorage.removeItem(key);
      }
    }

    this.saveCourses(INITIAL_COURSES);
    this.saveSkills(INITIAL_SKILLS);
    this.saveReviews(INITIAL_REVIEWS);
    this.saveProgress(INITIAL_PROGRESS);
    this.saveMistakes(INITIAL_MISTAKES);
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
      return true;
    } catch (e) {
      console.error("Failed to save quiz attempts:", e);
      return false;
    }
  }
}
