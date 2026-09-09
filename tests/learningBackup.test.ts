import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  LEARNHUB_BACKUP_SCHEMA,
  LEARNHUB_BACKUP_VERSION,
  createLearningBackup,
  importLearningBackup,
  isPortableLearningStorageKey,
  previewLearningBackup,
  validateLearningBackup,
} from "../src/services/learningBackup";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

class FailsOnSecondKeyStorage extends MemoryStorage {
  failKey = "ai_learnhub_skills_v2";
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error("simulated storage failure");
    super.setItem(key, value);
  }
}

class FailsDuringRollbackStorage extends MemoryStorage {
  private failRollback = false;
  setItem(key: string, value: string) {
    if (key === "ai_learnhub_skills_v2") {
      this.failRollback = true;
      throw new Error("simulated import failure");
    }
    if (this.failRollback && key === "ai_learnhub_courses_v2") {
      throw new Error("simulated rollback failure");
    }
    super.setItem(key, value);
  }
}

const validCourse = {
  id: "course-backup",
  title: "백업 과목",
  subject: "테스트",
  learningType: "concept" as const,
  learningTypeExplanation: "개념",
  summary: "백업 검증용",
  level: "beginner" as const,
  goal: "검증",
  dailyMinutes: 10,
  chapters: [],
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

const validSkill = {
  conceptId: "concept-backup",
  conceptName: "백업 개념",
  courseId: "course-backup",
  courseTitle: "백업 과목",
  understanding: 50,
  correctCount: 1,
  wrongCount: 0,
  reviewCount: 0,
  lastStudiedAt: "",
};

const installStorage = (storage: MemoryStorage) => {
  globalThis.localStorage = storage as unknown as Storage;
  return storage;
};

beforeEach(() => installStorage(new MemoryStorage()));

test("export uses an explicit study allowlist and excludes profile, auth, and unrelated keys", () => {
  const storage = installStorage(new MemoryStorage());
  storage.setItem("ai_learnhub_courses_v2", JSON.stringify([validCourse]));
  storage.setItem("ai_learnhub_user_v2", JSON.stringify({ id: "profile", name: "학습자" }));
  storage.setItem("ai_learnhub_session_v1", "session-token");
  storage.setItem("other_app_key", "keep");

  const backup = createLearningBackup(storage);
  assert.equal(backup.schema, LEARNHUB_BACKUP_SCHEMA);
  assert.equal(backup.version, LEARNHUB_BACKUP_VERSION);
  assert.deepEqual(backup.data.courses, [validCourse]);
  assert.equal(JSON.stringify(backup).includes("profile"), false);
  assert.equal(JSON.stringify(backup).includes("session-token"), false);
  assert.equal(isPortableLearningStorageKey("ai_learnhub_user_v2"), false);
  assert.equal(isPortableLearningStorageKey("ai_learnhub_session_v1"), false);
  assert.equal(isPortableLearningStorageKey("other_app_key"), false);
});

test("prototype-pollution keys are rejected before any write", () => {
  const storage = installStorage(new MemoryStorage());
  storage.setItem("other_app_key", "keep");
  const backup = {
    schema: LEARNHUB_BACKUP_SCHEMA,
    version: LEARNHUB_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { notes: { "learnhub_note___proto__": "bad" } },
  };

  const validation = validateLearningBackup(backup);
  assert.equal(validation.ok, false);
  const result = importLearningBackup(backup, { strategy: "overwrite", storage });
  assert.equal(result.ok, false);
  assert.equal(storage.getItem("other_app_key"), "keep");
  assert.equal(storage.getItem("learnhub_note___proto__"), null);
});

test("preview reports new entries and conflicts without changing storage", () => {
  const storage = installStorage(new MemoryStorage());
  storage.setItem("ai_learnhub_courses_v2", JSON.stringify([{ ...validCourse, title: "현재 과목" }]));
  const backup = { ...createLearningBackup(storage), data: { courses: [validCourse], skills: [validSkill] } };
  const preview = previewLearningBackup(backup, storage);

  assert.equal(preview.valid, true);
  assert.equal(preview.totalEntries, 2);
  assert.equal(preview.newEntries, 1);
  assert.equal(preview.conflictingEntries, 1);
  assert.deepEqual(preview.conflicts, ["ai_learnhub_courses_v2"]);
  assert.match(storage.getItem("ai_learnhub_courses_v2") || "", /현재 과목/);
});

test("preserve is explicit and keeps current conflicting data while importing new data", () => {
  const storage = installStorage(new MemoryStorage());
  storage.setItem("ai_learnhub_courses_v2", JSON.stringify([{ ...validCourse, title: "현재 과목" }]));
  const backup = { ...createLearningBackup(storage), data: { courses: [validCourse], skills: [validSkill] } };
  const result = importLearningBackup(backup, { strategy: "preserve", storage });

  assert.equal(result.ok, true);
  assert.equal(result.importedEntries, 1);
  assert.equal(result.skippedEntries, 1);
  assert.ok(result.safetyBackup);
  assert.match(storage.getItem("ai_learnhub_courses_v2") || "", /현재 과목/);
  assert.deepEqual(JSON.parse(storage.getItem("ai_learnhub_skills_v2") || "null"), [validSkill]);
});

test("merge keeps current records and adds imported records by identity", () => {
  const storage = installStorage(new MemoryStorage());
  storage.setItem("ai_learnhub_skills_v2", JSON.stringify([{ ...validSkill, understanding: 90 }]));
  const importedSkill = { ...validSkill, conceptId: "concept-new", conceptName: "새 개념" };
  const backup = { ...createLearningBackup(storage), data: { skills: [validSkill, importedSkill] } };
  const result = importLearningBackup(backup, { strategy: "merge", storage });
  const skills = JSON.parse(storage.getItem("ai_learnhub_skills_v2") || "[]");

  assert.equal(result.ok, true);
  assert.equal(result.mergedEntries, 1);
  assert.equal(skills.length, 2);
  assert.equal(skills.find((skill: typeof validSkill) => skill.conceptId === validSkill.conceptId).understanding, 90);
});

test("merge preserves valid current progress and note values", () => {
  const storage = installStorage(new MemoryStorage());
  const currentProgress = { streakDays: 4, totalMinutesLearned: 80, completedLessonsCount: 7, lastActiveDate: "2026-09-09" };
  storage.setItem("ai_learnhub_progress_v2", JSON.stringify(currentProgress));
  storage.setItem("learnhub_note_course-backup_lesson-1", "현재 메모를 유지");
  const backup = {
    ...createLearningBackup(storage),
    data: {
      progress: { streakDays: 1, totalMinutesLearned: 2, completedLessonsCount: 1, lastActiveDate: "2026-09-01" },
      notes: { "learnhub_note_course-backup_lesson-1": "가져온 메모" },
    },
  };

  const result = importLearningBackup(backup, { strategy: "merge", storage });

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(storage.getItem("ai_learnhub_progress_v2") || "null"), currentProgress);
  assert.equal(storage.getItem("learnhub_note_course-backup_lesson-1"), "현재 메모를 유지");
});

test("merge deduplicates repeated imported identities", () => {
  const storage = installStorage(new MemoryStorage());
  const currentCourse = { ...validCourse, id: "course-current", title: "현재 과목" };
  storage.setItem("ai_learnhub_courses_v2", JSON.stringify([currentCourse]));
  const duplicate = { ...validCourse, title: "중복 과목" };
  const newCourse = { ...validCourse, id: "course-new", title: "새 과목" };
  const backup = { ...createLearningBackup(storage), data: { courses: [validCourse, duplicate, newCourse] } };

  const result = importLearningBackup(backup, { strategy: "merge", storage });
  const courses = JSON.parse(storage.getItem("ai_learnhub_courses_v2") || "[]");

  assert.equal(result.ok, true);
  assert.equal(courses.length, 3);
  assert.equal(courses.filter((course: typeof validCourse) => course.id === validCourse.id).length, 1);
  assert.equal(courses.find((course: typeof validCourse) => course.id === validCourse.id).title, "백업 과목");
});

test("validation and writes are atomic when storage fails partway through", () => {
  const storage = installStorage(new FailsOnSecondKeyStorage());
  storage.setItem("ai_learnhub_courses_v2", JSON.stringify([{ ...validCourse, title: "현재 과목" }]));
  const backup = { ...createLearningBackup(storage), data: { courses: [validCourse], skills: [validSkill] } };
  const result = importLearningBackup(backup, { strategy: "overwrite", storage });

  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, true);
  assert.equal(result.rollbackStatus, "succeeded");
  assert.equal(result.recoveryRequired, false);
  assert.match(storage.getItem("ai_learnhub_courses_v2") || "", /현재 과목/);
  assert.equal(storage.getItem("ai_learnhub_skills_v2"), null);
});

test("rollback failure is reported as uncertain and exposes the recovery backup", () => {
  const storage = installStorage(new FailsDuringRollbackStorage());
  storage.setItem("ai_learnhub_courses_v2", JSON.stringify([{ ...validCourse, title: "복구해야 할 현재 과목" }]));
  const backup = { ...createLearningBackup(storage), data: { courses: [validCourse], skills: [validSkill] } };
  const result = importLearningBackup(backup, { strategy: "overwrite", storage });

  assert.equal(result.ok, false);
  assert.equal(result.rolledBack, false);
  assert.equal(result.rollbackStatus, "failed");
  assert.equal(result.recoveryRequired, true);
  assert.match(result.error || "", /복구를 확인하지 못했습니다/);
  assert.ok(result.safetyBackup);
  assert.match(storage.getItem("ai_learnhub_courses_v2") || "", /백업 과목/);
});

test("invalid shapes and oversized content do not write", () => {
  const storage = installStorage(new MemoryStorage());
  const invalid = {
    schema: LEARNHUB_BACKUP_SCHEMA,
    version: LEARNHUB_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { progress: { streakDays: -1, totalMinutesLearned: 0, completedLessonsCount: 0, lastActiveDate: "" } },
  };
  assert.equal(importLearningBackup(invalid, { strategy: "overwrite", storage }).ok, false);
  assert.equal(storage.length, 0);

  const oversized = {
    schema: LEARNHUB_BACKUP_SCHEMA,
    version: LEARNHUB_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { notes: { "learnhub_note_course_lesson": "x".repeat(200_001) } },
  };
  assert.equal(importLearningBackup(oversized, { strategy: "overwrite", storage }).ok, false);
  assert.equal(storage.length, 0);
});
