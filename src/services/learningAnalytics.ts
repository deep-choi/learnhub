const STORAGE_KEY = "learnhub_learning_analytics_v1";
const SESSION_KEY = "learnhub_learning_session_v1";
const MAX_EVENTS = 500;

export type LearningEventName =
  | "lesson_started"
  | "lesson_completed"
  | "course_created"
  | "review_visited";

export interface LearningEventProperties {
  courseId?: string;
  lessonId?: string;
  source?: string;
  firstLesson?: boolean;
  resume?: boolean;
  sample?: boolean;
  completionKind?: "read_only" | "quiz_checked" | "unknown";
}

interface LearningEventRecord {
  id: string;
  sessionId: string;
  name: LearningEventName;
  timestamp: string;
  properties: LearningEventProperties;
  dedupeKey: string;
}

export interface LearningAnalyticsSummary {
  lessonStarts: number;
  firstLessonStarts: number;
  firstLessonCompletions: number;
  resumeVisits: number;
  reviewVisits: number;
  courseCreations: number;
}

const isEventName = (value: unknown): value is LearningEventName =>
  value === "lesson_started" ||
  value === "lesson_completed" ||
  value === "course_created" ||
  value === "review_visited";

const safeStorage = (kind: "localStorage" | "sessionStorage"): Storage | null => {
  try {
    return typeof window !== "undefined" ? window[kind] : null;
  } catch {
    return null;
  }
};

const makeId = (prefix: string) => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to the non-identifying local fallback.
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getSessionId = () => {
  const storage = safeStorage("sessionStorage");
  try {
    const existing = storage?.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = makeId("session");
    storage?.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return makeId("session");
  }
};

const readEvents = (): LearningEventRecord[] => {
  const storage = safeStorage("localStorage");
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is LearningEventRecord => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<LearningEventRecord>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.sessionId === "string" &&
        isEventName(candidate.name) &&
        typeof candidate.timestamp === "string" &&
        typeof candidate.dedupeKey === "string" &&
        !!candidate.properties &&
        typeof candidate.properties === "object"
      );
    }).slice(-MAX_EVENTS).map((event) => ({
      ...event,
      properties: cleanProperties(event.properties),
    }));
  } catch {
    return [];
  }
};

const cleanProperties = (properties: LearningEventProperties): LearningEventProperties => {
  const cleaned: LearningEventProperties = {};
  for (const key of ["courseId", "lessonId", "source"] as const) {
    const value = properties?.[key];
    if (typeof value === "string" && value.length <= 120) cleaned[key] = value;
  }
  for (const key of ["firstLesson", "resume", "sample"] as const) {
    if (properties?.[key] === true || properties?.[key] === false) {
      cleaned[key] = properties[key];
    }
  }
  if (properties?.completionKind === "read_only" || properties?.completionKind === "quiz_checked" || properties?.completionKind === "unknown") {
    cleaned.completionKind = properties.completionKind;
  }
  return cleaned;
};

export const trackLearningEvent = (
  name: LearningEventName,
  properties: LearningEventProperties = {},
): boolean => {
  if (!isEventName(name)) return false;
  const cleaned = cleanProperties(properties);
  const sessionId = getSessionId();
  const dedupeKey = [
    name,
    sessionId,
    cleaned.courseId || "",
    cleaned.lessonId || "",
    cleaned.source || "",
  ].join("|");
  const events = readEvents();
  if (events.some((event) => event.dedupeKey === dedupeKey)) return false;

  const record: LearningEventRecord = {
    id: makeId("event"),
    sessionId,
    name,
    timestamp: new Date().toISOString(),
    properties: cleaned,
    dedupeKey,
  };
  try {
    const storage = safeStorage("localStorage");
    if (!storage) return false;
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([...events, record].slice(-MAX_EVENTS)),
    );
    return true;
  } catch {
    return false;
  }
};

export const getLearningAnalyticsSummary = (): LearningAnalyticsSummary => {
  const events = readEvents().filter((event) => event.properties.sample !== true);
  return {
    lessonStarts: events.filter((event) => event.name === "lesson_started").length,
    firstLessonStarts: events.filter(
      (event) => event.name === "lesson_started" && event.properties.firstLesson === true,
    ).length,
    firstLessonCompletions: events.filter(
      (event) => event.name === "lesson_completed" && event.properties.firstLesson === true,
    ).length,
    resumeVisits: events.filter(
      (event) => event.name === "lesson_started" && event.properties.resume === true,
    ).length,
    reviewVisits: events.filter((event) => event.name === "review_visited").length,
    courseCreations: events.filter((event) => event.name === "course_created").length,
  };
};

export const clearLearningAnalytics = (): boolean => {
  try {
    const storage = safeStorage("localStorage");
    if (!storage) return false;
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};
