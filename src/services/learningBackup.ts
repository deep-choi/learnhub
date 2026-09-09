import {
  Course,
  LessonContent,
  MistakeItem,
  ReviewQuestion,
  UserProgress,
  UserSkill,
} from "../types/learning";
import {
  LEARNHUB_SCOPED_STORAGE_PREFIXES,
  LEARNHUB_STORAGE_KEYS,
} from "./storage";

export const LEARNHUB_BACKUP_SCHEMA = "learnhub.learning-backup" as const;
export const LEARNHUB_BACKUP_VERSION = 1 as const;

const MAX_BACKUP_BYTES = 8_000_000;
const MAX_COLLECTION_ITEMS = 1_000;
const MAX_STRING_LENGTH = 100_000;
const MAX_NOTE_LENGTH = 200_000;
const MAX_SCRATCHPAD_LENGTH = 4_000_000;
const MAX_TUTOR_MESSAGES = 50;

/** Explicitly denied even if a future feature uses an ai_learnhub_* prefix. */
export const LEARNHUB_BACKUP_DENYLIST: ReadonlySet<string> = new Set([
  LEARNHUB_STORAGE_KEYS.USER,
  "ai_learnhub_auth_v1",
  "ai_learnhub_session_v1",
  "ai_learnhub_token_v1",
]);

export const isDeniedLearningStorageKey = (key: string): boolean =>
  LEARNHUB_BACKUP_DENYLIST.has(key) ||
  /^ai_learnhub_(?:user|auth|session|token)(?:_|$)/iu.test(key);

export interface TutorBackupMessage {
  sender: "user" | "tutor";
  text: string;
  chips?: string[];
}

export interface LearningBackupData {
  courses?: Course[];
  skills?: UserSkill[];
  progress?: UserProgress;
  reviews?: ReviewQuestion[];
  mistakes?: MistakeItem[];
  lessonCache?: Record<string, LessonContent>;
  notes?: Record<string, string>;
  scratchpad?: Record<string, string>;
  tutor?: Record<string, TutorBackupMessage[]>;
  /** Quiz-attempt IDs are local deduplication state and contain no identity data. */
  quizAttempts?: string[];
}

export interface LearningBackupDocument {
  schema: typeof LEARNHUB_BACKUP_SCHEMA;
  version: typeof LEARNHUB_BACKUP_VERSION;
  exportedAt: string;
  data: LearningBackupData;
}

export type BackupConflictStrategy = "preserve" | "overwrite" | "merge";

export interface BackupValidationSuccess {
  ok: true;
  value: LearningBackupDocument;
  errors: [];
}

export interface BackupValidationFailure {
  ok: false;
  value: null;
  errors: string[];
}

export type BackupValidationResult = BackupValidationSuccess | BackupValidationFailure;

export interface BackupPreview {
  valid: boolean;
  totalEntries: number;
  newEntries: number;
  conflictingEntries: number;
  counts: Record<string, number>;
  conflicts: string[];
  errors: string[];
}

export interface BackupImportResult {
  ok: boolean;
  importedEntries: number;
  skippedEntries: number;
  mergedEntries: number;
  conflicts: string[];
  rolledBack: boolean;
  rollbackStatus: "not-needed" | "succeeded" | "failed";
  recoveryRequired: boolean;
  replacedMalformedEntries: number;
  warnings: string[];
  safetyBackup?: LearningBackupDocument;
  error?: string;
}

interface PortableEntry {
  key: string;
  value: string;
  category: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isString = (value: unknown, max = MAX_STRING_LENGTH): value is string =>
  typeof value === "string" && value.length <= max;

const isBoundedArray = (value: unknown, max = MAX_COLLECTION_ITEMS): value is unknown[] =>
  Array.isArray(value) && value.length <= max;

const isFiniteNumber = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

const isDateLike = (value: unknown, allowEmpty = false): value is string => {
  if (!isString(value, 120) || (allowEmpty && value === "")) return allowEmpty && value === "";
  return Number.isFinite(new Date(value).getTime());
};

const isLearningType = (value: unknown): value is Course["learningType"] =>
  value === "concept" ||
  value === "problem_solving" ||
  value === "memorization" ||
  value === "language" ||
  value === "practical";

const isLevel = (value: unknown): value is Course["level"] =>
  value === "beginner" || value === "intermediate" || value === "advanced";

const isNonEmptyString = (value: unknown, max = MAX_STRING_LENGTH): value is string =>
  isString(value, max) && value.trim().length > 0;

const isLessonMeta = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id, 200) &&
    isNonEmptyString(value.chapterId, 200) &&
    isNonEmptyString(value.courseId, 200) &&
    isNonEmptyString(value.title, 500) &&
    isString(value.description, 5_000) &&
    isFiniteNumber(value.estimatedMinutes, 0, 24 * 60) &&
    isNonEmptyString(value.conceptId, 200) &&
    isNonEmptyString(value.conceptName, 500) &&
    typeof value.isCompleted === "boolean" &&
    (value.isGenerated === undefined || typeof value.isGenerated === "boolean")
  );
};

const isCourse = (value: unknown): value is Course => {
  if (!isRecord(value) || !isBoundedArray(value.chapters, 100)) return false;
  return (
    isNonEmptyString(value.id, 200) &&
    isNonEmptyString(value.title, 500) &&
    isNonEmptyString(value.subject, 500) &&
    isLearningType(value.learningType) &&
    isString(value.learningTypeExplanation, 5_000) &&
    isString(value.summary, 10_000) &&
    isLevel(value.level) &&
    isString(value.goal, 2_000) &&
    isFiniteNumber(value.dailyMinutes, 0, 24 * 60) &&
    isDateLike(value.createdAt) &&
    isDateLike(value.updatedAt) &&
    value.chapters.every((chapter) => {
      if (!isRecord(chapter) || !isBoundedArray(chapter.lessons, 100)) return false;
      return (
        isNonEmptyString(chapter.id, 200) &&
        isNonEmptyString(chapter.title, 500) &&
        isString(chapter.description, 5_000) &&
        chapter.lessons.every(isLessonMeta)
      );
    })
  );
};

const isSkill = (value: unknown): value is UserSkill =>
  isRecord(value) &&
  isNonEmptyString(value.conceptId, 200) &&
  isNonEmptyString(value.conceptName, 500) &&
  isNonEmptyString(value.courseId, 200) &&
  isNonEmptyString(value.courseTitle, 500) &&
  isFiniteNumber(value.understanding, 0, 100) &&
  isFiniteNumber(value.correctCount, 0, MAX_COLLECTION_ITEMS * 100) &&
  isFiniteNumber(value.wrongCount, 0, MAX_COLLECTION_ITEMS * 100) &&
  isFiniteNumber(value.reviewCount, 0, MAX_COLLECTION_ITEMS * 100) &&
  isDateLike(value.lastStudiedAt, true);

const isReview = (value: unknown): value is ReviewQuestion =>
  isRecord(value) &&
  isNonEmptyString(value.id, 300) &&
  isNonEmptyString(value.conceptId, 200) &&
  isNonEmptyString(value.conceptName, 500) &&
  (value.courseId === undefined || isNonEmptyString(value.courseId, 200)) &&
  (value.lessonId === undefined || isNonEmptyString(value.lessonId, 200)) &&
  isNonEmptyString(value.courseTitle, 500) &&
  isNonEmptyString(value.question, 10_000) &&
  (value.quizType === "multiple_choice" || value.quizType === "short_answer") &&
  (value.options === undefined ||
    (isBoundedArray(value.options, 20) && value.options.every((option) => isString(option, 1_000)))) &&
  isNonEmptyString(value.answer, 5_000) &&
  isString(value.explanation, 10_000) &&
  isDateLike(value.dueAt);

const isMistake = (value: unknown): value is MistakeItem =>
  isRecord(value) &&
  isNonEmptyString(value.id, 300) &&
  (value.conceptId === undefined || isNonEmptyString(value.conceptId, 200)) &&
  isNonEmptyString(value.concept, 500) &&
  (value.courseId === undefined || isNonEmptyString(value.courseId, 200)) &&
  isNonEmptyString(value.course, 500) &&
  (value.lessonId === undefined || isNonEmptyString(value.lessonId, 200)) &&
  isNonEmptyString(value.question, 10_000) &&
  isString(value.wrongAnswer, 5_000) &&
  isNonEmptyString(value.correctAnswer, 5_000) &&
  (value.misconceptionTag === "개념 미숙" ||
    value.misconceptionTag === "계산 착오" ||
    value.misconceptionTag === "조건 누락") &&
  isString(value.explanation, 10_000) &&
  (value.hint === undefined || isString(value.hint, 5_000)) &&
  isDateLike(value.date) &&
  (value.isResolved === undefined || typeof value.isResolved === "boolean");

const isLessonContent = (value: unknown): value is LessonContent => {
  if (!isRecord(value) || !isBoundedArray(value.steps, 100)) return false;
  return (
    isNonEmptyString(value.id, 300) &&
    isNonEmptyString(value.lessonId, 200) &&
    isNonEmptyString(value.courseId, 200) &&
    isNonEmptyString(value.title, 500) &&
    value.steps.every((step) => {
      if (!isRecord(step)) return false;
      if (
        !isNonEmptyString(step.id, 300) ||
        !(
          step.type === "concept" ||
          step.type === "example" ||
          step.type === "practice" ||
          step.type === "quiz" ||
          step.type === "summary"
        ) ||
        !isNonEmptyString(step.title, 500) ||
        !isString(step.content, 20_000)
      ) {
        return false;
      }
      if (step.codeSnippet !== undefined && !isString(step.codeSnippet, 20_000)) return false;
      if (step.audioScript !== undefined && !isString(step.audioScript, 20_000)) return false;
      if (step.quiz === undefined) return true;
      const quiz = step.quiz;
      return (
        isRecord(quiz) &&
        isNonEmptyString(quiz.question, 10_000) &&
        (quiz.quizType === "multiple_choice" || quiz.quizType === "short_answer") &&
        (quiz.options === undefined ||
          (isBoundedArray(quiz.options, 20) && quiz.options.every((option) => isString(option, 1_000)))) &&
        isNonEmptyString(quiz.answer, 5_000) &&
        isString(quiz.explanation, 10_000) &&
        (quiz.conceptId === undefined || isNonEmptyString(quiz.conceptId, 200)) &&
        isBoundedArray(quiz.hints, 20) &&
        quiz.hints.every((hint) => isString(hint, 2_000))
      );
    })
  );
};

const isTutorMessage = (value: unknown): value is TutorBackupMessage =>
  isRecord(value) &&
  (value.sender === "user" || value.sender === "tutor") &&
  isNonEmptyString(value.text, 20_000) &&
  (value.chips === undefined ||
    (isBoundedArray(value.chips, 20) && value.chips.every((chip) => isString(chip, 1_000))));

const includesSensitiveWord = (key: string) =>
  /(?:auth|session|token|secret|credential|password)/iu.test(key);

const hasPrototypePollutionKey = (value: unknown, seen = new WeakSet<object>()): boolean => {
  if (typeof value !== "object" || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasPrototypePollutionKey(item, seen));
  return Object.keys(value).some((key) =>
    /^(?:__proto__|constructor|prototype)$/u.test(key) || hasPrototypePollutionKey((value as Record<string, unknown>)[key], seen),
  );
};

const isSafeScopedKey = (key: unknown, prefix: string) =>
  typeof key === "string" &&
  key.startsWith(prefix) &&
  key.length > prefix.length &&
  key.length <= 500 &&
  !includesSensitiveWord(key) &&
  !/(?:^|[_./-])(?:__proto__|constructor|prototype)(?:$|[_./-])/iu.test(key);

export const isPortableLearningStorageKey = (key: string): boolean =>
  !isDeniedLearningStorageKey(key) &&
  !/(?:^|[_./-])(?:__proto__|constructor|prototype)(?:$|[_./-])/iu.test(key) &&
  (key === LEARNHUB_STORAGE_KEYS.COURSES ||
  key === LEARNHUB_STORAGE_KEYS.SKILLS ||
  key === LEARNHUB_STORAGE_KEYS.PROGRESS ||
  key === LEARNHUB_STORAGE_KEYS.REVIEWS ||
  key === LEARNHUB_STORAGE_KEYS.MISTAKES ||
  key === LEARNHUB_STORAGE_KEYS.QUIZ_ATTEMPTS ||
  isSafeScopedKey(key, `${LEARNHUB_STORAGE_KEYS.LESSONS_CACHE}_`) ||
  isSafeScopedKey(key, LEARNHUB_SCOPED_STORAGE_PREFIXES.NOTES) ||
  isSafeScopedKey(key, LEARNHUB_SCOPED_STORAGE_PREFIXES.SCRATCHPAD) ||
  isSafeScopedKey(key, LEARNHUB_SCOPED_STORAGE_PREFIXES.TUTOR));

const getStorage = (storage?: Storage): Storage => {
  if (storage) return storage;
  if (typeof globalThis.localStorage === "undefined") {
    throw new Error("브라우저 저장소를 사용할 수 없습니다.");
  }
  return globalThis.localStorage;
};

const categoryForKey = (key: string): string => {
  if (key === LEARNHUB_STORAGE_KEYS.COURSES) return "courses";
  if (key === LEARNHUB_STORAGE_KEYS.SKILLS) return "skills";
  if (key === LEARNHUB_STORAGE_KEYS.PROGRESS) return "progress";
  if (key === LEARNHUB_STORAGE_KEYS.REVIEWS) return "reviews";
  if (key === LEARNHUB_STORAGE_KEYS.MISTAKES) return "mistakes";
  if (key === LEARNHUB_STORAGE_KEYS.QUIZ_ATTEMPTS) return "quizAttempts";
  if (key.startsWith(`${LEARNHUB_STORAGE_KEYS.LESSONS_CACHE}_`)) return "lessonCache";
  if (key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.NOTES)) return "notes";
  if (key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.SCRATCHPAD)) return "scratchpad";
  return "tutor";
};

const allPortableKeys = (storage: Storage): string[] => {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isPortableLearningStorageKey(key)) keys.push(key);
  }
  return keys;
};

const readJson = (storage: Storage, key: string): unknown | null => {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const setDataField = (data: LearningBackupData, key: string, value: unknown) => {
  if (key === LEARNHUB_STORAGE_KEYS.COURSES && isBoundedArray(value) && value.every(isCourse)) data.courses = value;
  if (key === LEARNHUB_STORAGE_KEYS.SKILLS && isBoundedArray(value) && value.every(isSkill)) data.skills = value;
  if (key === LEARNHUB_STORAGE_KEYS.PROGRESS && isRecord(value) && isFiniteNumber(value.streakDays, 0, MAX_COLLECTION_ITEMS) && isFiniteNumber(value.totalMinutesLearned, 0, 10_000_000) && isFiniteNumber(value.completedLessonsCount, 0, 10_000_000) && isDateLike(value.lastActiveDate, true)) data.progress = value as unknown as UserProgress;
  if (key === LEARNHUB_STORAGE_KEYS.REVIEWS && isBoundedArray(value) && value.every(isReview)) data.reviews = value;
  if (key === LEARNHUB_STORAGE_KEYS.MISTAKES && isBoundedArray(value) && value.every(isMistake)) data.mistakes = value;
  if (key === LEARNHUB_STORAGE_KEYS.QUIZ_ATTEMPTS && isBoundedArray(value) && value.every((item) => isNonEmptyString(item, 500))) data.quizAttempts = value;
};

/** Read only the allowlisted LearnHub study namespace into a portable document. */
export const createLearningBackup = (storage?: Storage): LearningBackupDocument => {
  const source = getStorage(storage);
  const data: LearningBackupData = {};

  for (const key of [
    LEARNHUB_STORAGE_KEYS.COURSES,
    LEARNHUB_STORAGE_KEYS.SKILLS,
    LEARNHUB_STORAGE_KEYS.PROGRESS,
    LEARNHUB_STORAGE_KEYS.REVIEWS,
    LEARNHUB_STORAGE_KEYS.MISTAKES,
    LEARNHUB_STORAGE_KEYS.QUIZ_ATTEMPTS,
  ]) {
    const value = readJson(source, key);
    if (value !== null) setDataField(data, key, value);
  }

  const lessonCache: Record<string, LessonContent> = {};
  const notes: Record<string, string> = {};
  const scratchpad: Record<string, string> = {};
  const tutor: Record<string, TutorBackupMessage[]> = {};

  for (const key of allPortableKeys(source)) {
    const raw = source.getItem(key);
    if (raw === null) continue;
    if (key.startsWith(`${LEARNHUB_STORAGE_KEYS.LESSONS_CACHE}_`)) {
      const value = readJson(source, key);
      if (value !== null && isLessonContent(value)) lessonCache[key] = value;
    } else if (key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.NOTES)) {
      if (isString(raw, MAX_NOTE_LENGTH)) notes[key] = raw;
    } else if (key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.SCRATCHPAD)) {
      if (raw.length <= MAX_SCRATCHPAD_LENGTH && raw.startsWith("data:image/")) scratchpad[key] = raw;
    } else if (key.startsWith(LEARNHUB_SCOPED_STORAGE_PREFIXES.TUTOR)) {
      const value = readJson(source, key);
      if (isBoundedArray(value, MAX_TUTOR_MESSAGES) && value.every(isTutorMessage)) tutor[key] = value;
    }
  }

  if (Object.keys(lessonCache).length > 0) data.lessonCache = lessonCache;
  if (Object.keys(notes).length > 0) data.notes = notes;
  if (Object.keys(scratchpad).length > 0) data.scratchpad = scratchpad;
  if (Object.keys(tutor).length > 0) data.tutor = tutor;

  return {
    schema: LEARNHUB_BACKUP_SCHEMA,
    version: LEARNHUB_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
};

export const validateLearningBackup = (input: unknown): BackupValidationResult => {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, value: null, errors: ["백업 파일의 최상위 구조가 올바르지 않습니다."] };

  let serialized = "";
  try {
    serialized = JSON.stringify(input);
  } catch {
    errors.push("백업 파일을 JSON으로 읽을 수 없습니다.");
  }
  if (serialized && serialized.length > MAX_BACKUP_BYTES) errors.push("백업 파일이 너무 큽니다.");
  if (hasPrototypePollutionKey(input)) errors.push("허용되지 않은 객체 키가 있습니다.");
  if (input.schema !== LEARNHUB_BACKUP_SCHEMA) errors.push("LearnHub 백업 파일이 아닙니다.");
  if (input.version !== LEARNHUB_BACKUP_VERSION) errors.push("지원하지 않는 백업 버전입니다.");
  if (!isDateLike(input.exportedAt)) errors.push("내보낸 시각이 올바르지 않습니다.");
  if (!isRecord(input.data)) errors.push("백업 데이터 구조가 올바르지 않습니다.");
  if (errors.length > 0 || !isRecord(input.data)) return { ok: false, value: null, errors };

  const data = input.data;
  const knownFields = new Set([
    "courses", "skills", "progress", "reviews", "mistakes", "lessonCache", "notes", "scratchpad", "tutor", "quizAttempts",
  ]);
  Object.keys(data).forEach((key) => {
    if (!knownFields.has(key)) errors.push(`알 수 없는 백업 데이터 필드: ${key}`);
  });

  if (data.courses !== undefined && (!isBoundedArray(data.courses) || !data.courses.every(isCourse))) errors.push("과목 데이터가 올바르지 않습니다.");
  if (data.skills !== undefined && (!isBoundedArray(data.skills) || !data.skills.every(isSkill))) errors.push("실력 데이터가 올바르지 않습니다.");
  if (data.progress !== undefined && (!isRecord(data.progress) || !isFiniteNumber(data.progress.streakDays, 0, MAX_COLLECTION_ITEMS) || !isFiniteNumber(data.progress.totalMinutesLearned, 0, 10_000_000) || !isFiniteNumber(data.progress.completedLessonsCount, 0, 10_000_000) || !isDateLike(data.progress.lastActiveDate, true))) errors.push("진도 데이터가 올바르지 않습니다.");
  if (data.reviews !== undefined && (!isBoundedArray(data.reviews) || !data.reviews.every(isReview))) errors.push("복습 데이터가 올바르지 않습니다.");
  if (data.mistakes !== undefined && (!isBoundedArray(data.mistakes) || !data.mistakes.every(isMistake))) errors.push("오답 데이터가 올바르지 않습니다.");
  if (data.quizAttempts !== undefined && (!isBoundedArray(data.quizAttempts) || !data.quizAttempts.every((item) => isNonEmptyString(item, 500)))) errors.push("퀴즈 시도 데이터가 올바르지 않습니다.");

  const validateScopedMap = (value: unknown, prefix: string, validator: (item: unknown) => boolean, field: string) => {
    if (value === undefined) return;
    if (!isRecord(value) || Object.keys(value).length > MAX_COLLECTION_ITEMS) {
      errors.push(`${field} 데이터 구조가 올바르지 않습니다.`);
      return;
    }
    Object.entries(value).forEach(([key, item]) => {
      if (!isSafeScopedKey(key, prefix) || !validator(item)) errors.push(`${field}에 허용되지 않은 항목이 있습니다.`);
    });
  };

  validateScopedMap(data.lessonCache, `${LEARNHUB_STORAGE_KEYS.LESSONS_CACHE}_`, isLessonContent, "레슨 캐시");
  validateScopedMap(data.notes, LEARNHUB_SCOPED_STORAGE_PREFIXES.NOTES, (item) => isString(item, MAX_NOTE_LENGTH), "메모");
  validateScopedMap(data.scratchpad, LEARNHUB_SCOPED_STORAGE_PREFIXES.SCRATCHPAD, (item) => isString(item, MAX_SCRATCHPAD_LENGTH) && item.startsWith("data:image/"), "연습장");
  validateScopedMap(data.tutor, LEARNHUB_SCOPED_STORAGE_PREFIXES.TUTOR, (item) => isBoundedArray(item, MAX_TUTOR_MESSAGES) && item.every(isTutorMessage), "튜터 기록");

  if (errors.length > 0) return { ok: false, value: null, errors };
  return { ok: true, value: input as unknown as LearningBackupDocument, errors: [] };
};

const entriesFromBackup = (backup: LearningBackupDocument): PortableEntry[] => {
  const entries: PortableEntry[] = [];
  const addJson = (key: string, value: unknown) => entries.push({ key, value: JSON.stringify(value), category: categoryForKey(key) });
  const data = backup.data;
  if (data.courses !== undefined) addJson(LEARNHUB_STORAGE_KEYS.COURSES, data.courses);
  if (data.skills !== undefined) addJson(LEARNHUB_STORAGE_KEYS.SKILLS, data.skills);
  if (data.progress !== undefined) addJson(LEARNHUB_STORAGE_KEYS.PROGRESS, data.progress);
  if (data.reviews !== undefined) addJson(LEARNHUB_STORAGE_KEYS.REVIEWS, data.reviews);
  if (data.mistakes !== undefined) addJson(LEARNHUB_STORAGE_KEYS.MISTAKES, data.mistakes);
  if (data.quizAttempts !== undefined) addJson(LEARNHUB_STORAGE_KEYS.QUIZ_ATTEMPTS, data.quizAttempts);
  for (const [key, value] of Object.entries(data.lessonCache || {})) addJson(key, value);
  for (const [key, value] of Object.entries(data.notes || {})) entries.push({ key, value, category: "notes" });
  for (const [key, value] of Object.entries(data.scratchpad || {})) entries.push({ key, value, category: "scratchpad" });
  for (const [key, value] of Object.entries(data.tutor || {})) addJson(key, value);
  return entries;
};

const currentPortableEntries = (storage: Storage): Map<string, string> => {
  const current = new Map<string, string>();
  for (const key of allPortableKeys(storage)) {
    const value = storage.getItem(key);
    if (value !== null) current.set(key, value);
  }
  return current;
};

const rollbackPortableStorage = (storage: Storage, before: Map<string, string>): boolean => {
  try {
    const after = currentPortableEntries(storage);
    for (const key of after.keys()) {
      if (!before.has(key)) {
        storage.removeItem(key);
        if (storage.getItem(key) !== null) return false;
      }
    }
    for (const [key, value] of before.entries()) {
      storage.setItem(key, value);
      if (storage.getItem(key) !== value) return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const previewLearningBackup = (input: unknown, storage?: Storage): BackupPreview => {
  const validation = validateLearningBackup(input);
  if (!validation.ok) return { valid: false, totalEntries: 0, newEntries: 0, conflictingEntries: 0, counts: {}, conflicts: [], errors: validation.errors };
  const entries = entriesFromBackup(validation.value);
  const current = currentPortableEntries(getStorage(storage));
  const conflicts = entries.filter((entry) => current.has(entry.key)).map((entry) => entry.key);
  const counts: Record<string, number> = {};
  entries.forEach((entry) => { counts[entry.category] = (counts[entry.category] || 0) + 1; });
  return { valid: true, totalEntries: entries.length, newEntries: entries.length - conflicts.length, conflictingEntries: conflicts.length, counts, conflicts, errors: [] };
};

const mergeByIdentity = (
  currentRaw: string,
  importedRaw: string,
  category: string,
): { value: string; replacedMalformed: boolean } => {
  // Notes and scratchpads are intentionally raw strings. A valid current
  // value must win even though it is not JSON.
  if (category === "notes" || category === "scratchpad") return { value: currentRaw, replacedMalformed: false };
  try {
    const current = JSON.parse(currentRaw);
    const imported = JSON.parse(importedRaw);
    if (Array.isArray(current) && Array.isArray(imported)) {
      const identity = (item: unknown): string | null => {
        if (!isRecord(item)) return null;
        if (isString(item.id, 300) && item.id.trim()) return `id:${item.id}`;
        if (isString(item.courseId, 300) && isString(item.conceptId, 300)) return `course-concept:${item.courseId}:${item.conceptId}`;
        return null;
      };
      if (current.every((item) => identity(item) !== null) && imported.every((item) => identity(item) !== null)) {
        const ids = new Set(current.map((item) => identity(item)));
        const additions = imported.filter((item) => {
          const itemId = identity(item);
          if (itemId === null || ids.has(itemId)) return false;
          ids.add(itemId);
          return true;
        });
        return { value: JSON.stringify([...current, ...additions]), replacedMalformed: false };
      }
      if (current.every((item) => isString(item, 500)) && imported.every((item) => isString(item, 500))) {
        return { value: JSON.stringify([...new Set([...current, ...imported])]), replacedMalformed: false };
      }
    }
    // Progress, lesson cache, and tutor records have no safe field-level
    // merge rule here, so valid current JSON remains authoritative.
    return { value: currentRaw, replacedMalformed: false };
  } catch {
    // A malformed existing JSON value cannot safely win. The imported value
    // was fully validated before writes and may replace it; report this to the
    // caller instead of silently calling it a normal merge.
    return { value: importedRaw, replacedMalformed: true };
  }
};

/** Validate everything first, then import with an explicit conflict policy. */
export const importLearningBackup = (
  input: unknown,
  options: { strategy: BackupConflictStrategy; storage?: Storage },
): BackupImportResult => {
  if (options.strategy !== "preserve" && options.strategy !== "overwrite" && options.strategy !== "merge") {
    return { ok: false, importedEntries: 0, skippedEntries: 0, mergedEntries: 0, conflicts: [], rolledBack: false, rollbackStatus: "not-needed", recoveryRequired: false, replacedMalformedEntries: 0, warnings: [], error: "가져오기 충돌 처리 방식이 올바르지 않습니다." };
  }
  const validation = validateLearningBackup(input);
  if (!validation.ok) {
    return { ok: false, importedEntries: 0, skippedEntries: 0, mergedEntries: 0, conflicts: [], rolledBack: false, rollbackStatus: "not-needed", recoveryRequired: false, replacedMalformedEntries: 0, warnings: [], error: validation.errors.join(" ") };
  }

  const storage = getStorage(options.storage);
  const incoming = entriesFromBackup(validation.value);
  const before = currentPortableEntries(storage);
  const conflicts = incoming.filter((entry) => before.has(entry.key)).map((entry) => entry.key);
  const planned: PortableEntry[] = [];
  let skippedEntries = 0;
  let mergedEntries = 0;
  let replacedMalformedEntries = 0;

  for (const entry of incoming) {
    const current = before.get(entry.key);
    if (current === undefined) {
      planned.push(entry);
    } else if (options.strategy === "preserve") {
      skippedEntries += 1;
    } else if (options.strategy === "overwrite") {
      planned.push(entry);
    } else {
      const merged = mergeByIdentity(current, entry.value, entry.category);
      planned.push({ ...entry, value: merged.value });
      mergedEntries += 1;
      if (merged.replacedMalformed) replacedMalformedEntries += 1;
    }
  }

  let safetyBackup: LearningBackupDocument | undefined;
  try {
    safetyBackup = createLearningBackup(storage);
  } catch {
    return { ok: false, importedEntries: 0, skippedEntries, mergedEntries, conflicts, rolledBack: false, rollbackStatus: "not-needed", recoveryRequired: false, replacedMalformedEntries, warnings: [], error: "현재 학습 데이터를 백업하지 못해 가져오기를 중단했습니다." };
  }

  try {
    for (const entry of planned) storage.setItem(entry.key, entry.value);
    const warnings = replacedMalformedEntries > 0
      ? [`현재 저장값 ${replacedMalformedEntries}개가 손상되어 검증된 백업 내용을 사용했습니다.`]
      : [];
    return { ok: true, importedEntries: planned.length, skippedEntries, mergedEntries, conflicts, rolledBack: false, rollbackStatus: "not-needed", recoveryRequired: false, replacedMalformedEntries, warnings, safetyBackup };
  } catch {
    // Restore the complete allowlisted namespace, not just the last key. This
    // keeps a partial import from becoming a destructive replacement.
    const rollbackSucceeded = rollbackPortableStorage(storage, before);
    return {
      ok: false,
      importedEntries: 0,
      skippedEntries,
      mergedEntries,
      conflicts,
      rolledBack: rollbackSucceeded,
      rollbackStatus: rollbackSucceeded ? "succeeded" : "failed",
      recoveryRequired: !rollbackSucceeded,
      replacedMalformedEntries,
      warnings: replacedMalformedEntries > 0
        ? [`현재 저장값 ${replacedMalformedEntries}개가 손상되어 검증된 백업 내용을 사용했습니다.`]
        : [],
      safetyBackup,
      error: rollbackSucceeded
        ? "가져오기에 실패했지만 기존 학습 데이터 복구를 확인했습니다."
        : "가져오기에 실패했고 기존 학습 데이터 복구를 확인하지 못했습니다. 아래 안전 백업을 저장해 복구가 필요합니다.",
    };
  }
};

export const backupToJson = (backup: LearningBackupDocument): string => {
  const validation = validateLearningBackup(backup);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  return JSON.stringify(validation.value, null, 2);
};

export const downloadLearningBackup = (backup: LearningBackupDocument = createLearningBackup()): void => {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    throw new Error("브라우저 다운로드를 사용할 수 없습니다.");
  }
  const blob = new Blob([backupToJson(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `learnhub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const readLearningBackupFile = async (file: File): Promise<LearningBackupDocument> => {
  const validation = validateLearningBackup(JSON.parse(await file.text()) as unknown);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  return validation.value;
};

// Compatibility aliases for callers that prefer export/import terminology.
export const exportLearningBackup = createLearningBackup;
export const validateBackup = validateLearningBackup;
