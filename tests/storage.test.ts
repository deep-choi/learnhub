import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { StorageService } from "../src/services/storage";
import { Course, LessonContent, LessonMeta, ReviewQuestion, UserProgress, UserSkill } from "../src/types/learning";

class MemoryStorage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

class FailingStorage extends MemoryStorage {
  setItem() {
    throw new Error("storage full");
  }
}

class ToggleCourseFailureStorage extends MemoryStorage {
  failCourses = false;

  setItem(key: string, value: string) {
    if (this.failCourses && key === "ai_learnhub_courses_v2") {
      throw new Error("course storage full");
    }
    super.setItem(key, value);
  }
}

const installStorage = (storage = new MemoryStorage()) => {
  globalThis.localStorage = storage as unknown as Storage;
  return storage;
};

const course: Course = {
  id: "course-test",
  title: "테스트 과목",
  subject: "일반 주제",
  learningType: "concept",
  learningTypeExplanation: "개념",
  summary: "테스트",
  level: "beginner",
  goal: "원리 탐구",
  dailyMinutes: 10,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  chapters: [
    {
      id: "chapter-test",
      title: "1장",
      description: "테스트",
      lessons: [],
    },
  ],
};

const lesson: LessonMeta = {
  id: "lesson-test",
  chapterId: "chapter-test",
  courseId: course.id,
  title: "첫 레슨",
  description: "테스트 레슨",
  estimatedMinutes: 12,
  conceptId: "concept-test",
  conceptName: "테스트 개념",
  isCompleted: false,
};

const content: LessonContent = {
  id: "content-lesson-test",
  lessonId: lesson.id,
  courseId: course.id,
  title: lesson.title,
  steps: [
    {
      id: "step-quiz",
      type: "quiz",
      title: "확인 문제",
      content: "풀어보세요.",
      quiz: {
        question: "1 + 1 = ?",
        quizType: "short_answer",
        answer: "2",
        explanation: "두 수를 더하면 2입니다.",
        hints: [],
      },
    },
    {
      id: "step-empty",
      type: "concept",
      title: "읽기",
      content: "내용",
    },
  ],
};

beforeEach(() => {
  installStorage();
  StorageService.logout();
});

test("resetData clears every LearnHub account cache and preserves unrelated apps", () => {
  const storage = installStorage();
  storage.setItem("ai_learnhub_user_v2", JSON.stringify({ id: "local", name: "학습자" }));
  storage.setItem("learnhub_note_lesson-test", "계정 메모");
  storage.setItem("other_app_key", "보존할 값");
  storage.setItem("ai_learnhub_lessons_cache_v2_lesson-test", "캐시");
  storage.setItem("ai_learnhub_quiz_attempts_v2", JSON.stringify(["attempt-1"]));

  StorageService.resetData();

  assert.equal(storage.getItem("ai_learnhub_user_v2"), null);
  assert.equal(storage.getItem("learnhub_note_lesson-test"), null);
  assert.equal(storage.getItem("other_app_key"), "보존할 값");
  assert.equal(storage.getItem("ai_learnhub_lessons_cache_v2_lesson-test"), null);
  assert.equal(storage.getItem("ai_learnhub_quiz_attempts_v2"), null);
  assert.deepEqual(StorageService.getCourses(), []);
  assert.deepEqual(StorageService.getProgress(), { streakDays: 0, totalMinutesLearned: 0, completedLessonsCount: 0, lastActiveDate: "" });
});

test("getReviews returns all records and getDueReviews uses now-or-earlier", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");
  const reviews: ReviewQuestion[] = [
    { id: "past", conceptId: "a", conceptName: "A", courseId: "course-a", lessonId: "lesson-a", courseTitle: "A", question: "A", quizType: "short_answer", answer: "1", explanation: "", dueAt: "2026-09-08T23:00:00.000Z" },
    { id: "now", conceptId: "b", conceptName: "B", courseId: "course-b", lessonId: "lesson-b", courseTitle: "B", question: "B", quizType: "short_answer", answer: "1", explanation: "", dueAt: now.toISOString() },
    { id: "future", conceptId: "c", conceptName: "C", courseId: "course-c", lessonId: "lesson-c", courseTitle: "C", question: "C", quizType: "short_answer", answer: "1", explanation: "", dueAt: "2026-09-10T00:00:00.000Z" },
    { id: "invalid", conceptId: "d", conceptName: "D", courseTitle: "D", question: "D", quizType: "short_answer", answer: "1", explanation: "", dueAt: "legacy-invalid" },
  ];

  assert.equal(StorageService.saveReviews(reviews), true);
  assert.deepEqual(StorageService.getReviews().map((review) => review.id), ["past", "now", "future", "invalid"]);
  assert.deepEqual(StorageService.getDueReviews(now).map((review) => review.id), ["past", "now"]);
});

test("scheduleLessonReviews persists valid quizzes once and treats existing IDs as satisfied", () => {
  StorageService.saveReviews([]);
  assert.equal(StorageService.scheduleLessonReviews(course, lesson, content), true);
  const scheduled = StorageService.getReviews();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].id, "review-course-test-lesson-test-step-quiz");
  assert.equal(scheduled[0].courseId, course.id);
  assert.equal(scheduled[0].lessonId, lesson.id);
  assert.equal(new Date(scheduled[0].dueAt).getHours(), 0);

  assert.equal(StorageService.scheduleLessonReviews(course, lesson, content), true);
  assert.equal(StorageService.getReviews().length, 1);
  assert.equal(StorageService.scheduleLessonReviews(course, lesson, { ...content, steps: [] }), false);
});

test("scheduleLessonReviews reports persistence failure", () => {
  installStorage(new FailingStorage());
  assert.equal(StorageService.scheduleLessonReviews(course, lesson, content), false);
});

test("quiz answers are scoped by course and optional attempt IDs deduplicate", () => {
  const skills: UserSkill[] = [
    { conceptId: "shared", conceptName: "공통", courseId: "course-a", courseTitle: "A", understanding: 50, correctCount: 1, wrongCount: 1, reviewCount: 0, lastStudiedAt: "" },
    { conceptId: "shared", conceptName: "공통", courseId: "course-b", courseTitle: "B", understanding: 50, correctCount: 1, wrongCount: 1, reviewCount: 0, lastStudiedAt: "" },
  ];
  StorageService.saveSkills(skills);

  assert.equal(StorageService.recordQuizAnswer("course-a", "A", "shared", "공통", true, "attempt-a"), true);
  assert.equal(StorageService.recordQuizAnswer("course-a", "A", "shared", "공통", true, "attempt-a"), false);
  const saved = StorageService.getSkills();
  assert.equal(saved.find((skill) => skill.courseId === "course-a")?.correctCount, 2);
  assert.equal(saved.find((skill) => skill.courseId === "course-b")?.correctCount, 1);
});

test("quiz answers reject blank scope and do not create bogus metrics", () => {
  assert.equal(StorageService.recordQuizAnswer("", "알 수 없음", "shared", "공통", true, "blank-course"), false);
  assert.equal(StorageService.recordQuizAnswer("course-a", "A", "", "알 수 없음", true, "blank-concept"), false);
  assert.equal(StorageService.getSkills().some((skill) => skill.courseId === ""), false);
});

test("failed skill persistence leaves no attempt marker and allows retry", () => {
  const storage = installStorage(new FailingStorage());
  assert.equal(StorageService.recordQuizAnswer("course-a", "A", "concept-a", "A", true, "attempt-fails"), false);
  assert.equal(storage.getItem("ai_learnhub_quiz_attempts_v2"), null);
});

test("authenticated profile stays in memory and logout clears account caches", () => {
  const storage = installStorage();
  StorageService.setUser({ id: "user-1", name: "학습자", isGuest: false, createdAt: new Date().toISOString() });
  storage.setItem("ai_learnhub_courses_v2", JSON.stringify([course]));
  assert.equal(StorageService.getUser().id, "user-1");
  assert.equal(storage.getItem("ai_learnhub_user_v2"), null);
  StorageService.logout();
  assert.equal(StorageService.getUser().isGuest, true);
  assert.equal(storage.getItem("ai_learnhub_courses_v2"), null);
});

test("reading completion records estimated time once without changing skill correctness", () => {
  StorageService.saveCourses([{ ...course, chapters: [{ ...course.chapters[0], lessons: [lesson] }] }]);
  const originalSkill: UserSkill = {
    conceptId: lesson.conceptId,
    conceptName: lesson.conceptName,
    courseId: course.id,
    courseTitle: course.title,
    understanding: 41,
    correctCount: 2,
    wrongCount: 3,
    reviewCount: 1,
    lastStudiedAt: "",
  };
  StorageService.saveSkills([originalSkill]);
  const originalProgress: UserProgress = { streakDays: 1, totalMinutesLearned: 4, completedLessonsCount: 1, lastActiveDate: new Date().toISOString().split("T")[0] };
  StorageService.saveProgress(originalProgress);

  StorageService.markLessonCompleted(course.id, lesson.id);
  StorageService.markLessonCompleted(course.id, lesson.id);

  assert.deepEqual(StorageService.getSkills()[0], originalSkill);
  assert.equal(StorageService.getProgress().totalMinutesLearned, 16);
  assert.equal(StorageService.getProgress().completedLessonsCount, 2);
});

test("lesson completion reports course persistence failure without incrementing progress", () => {
  const storage = new ToggleCourseFailureStorage();
  installStorage(storage);
  StorageService.saveCourses([{ ...course, chapters: [{ ...course.chapters[0], lessons: [lesson] }] }]);
  const originalProgress: UserProgress = { streakDays: 1, totalMinutesLearned: 4, completedLessonsCount: 1, lastActiveDate: new Date().toISOString().split("T")[0] };
  StorageService.saveProgress(originalProgress);
  storage.failCourses = true;

  assert.equal(StorageService.markLessonCompleted(course.id, lesson.id), false);
  storage.failCourses = false;
  assert.equal(StorageService.getCourses()[0].chapters[0].lessons[0].isCompleted, false);
  assert.deepEqual(StorageService.getProgress(), originalProgress);
});

test("course status moves items out of the active list without deleting the course", () => {
  installStorage();
  StorageService.saveCourses([course]);

  assert.equal(StorageService.updateCourseStatus(course.id, "completed"), true);
  assert.equal(StorageService.getCourses()[0].status, "completed");
  assert.equal(StorageService.getCourseById(course.id)?.title, course.title);

  assert.equal(StorageService.updateCourseStatus(course.id, "active"), true);
  assert.equal(StorageService.getCourses()[0].status, "active");
  assert.equal(StorageService.updateCourseStatus("missing-course", "cancelled"), false);
});
