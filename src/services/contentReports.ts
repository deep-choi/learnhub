import { authorizedFetch, getAccessToken } from "./authClient";

export type ContentReportCategory = "wrong_answer" | "inaccurate" | "unclear" | "rendering" | "other";

export interface ContentReportPayload {
  category: ContentReportCategory;
  description: string;
  courseId?: string;
  lessonId?: string;
  stepId?: string;
}
export type ContentReportContext = Pick<ContentReportPayload, "courseId" | "lessonId" | "stepId">;

export interface ContentReportResult {
  status: "received" | "draft" | "save_failed";
  id?: string;
  savedLocally: boolean;
}

export type AccessTokenGetter = () => Promise<string | null>;
export interface ContentReportDraft extends ContentReportPayload {
  createdAt: string;
}
const DRAFT_STORAGE_KEY = "learnhub_content_report_drafts_v1";
const REPORT_TIMEOUT_MS = 8000;
const REPORT_CATEGORIES: ContentReportCategory[] = ["wrong_answer", "inaccurate", "unclear", "rendering", "other"];
const isSafeId = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 200;
const isValidDraft = (value: unknown): value is ContentReportDraft => {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ContentReportDraft>;
  return REPORT_CATEGORIES.includes(draft.category as ContentReportCategory)
    && typeof draft.description === "string" && draft.description.trim().length > 0 && draft.description.length <= 1000
    && typeof draft.createdAt === "string" && !Number.isNaN(Date.parse(draft.createdAt))
    && (draft.courseId === undefined || isSafeId(draft.courseId))
    && (draft.lessonId === undefined || isSafeId(draft.lessonId))
    && (draft.stepId === undefined || isSafeId(draft.stepId));
};

const readDrafts = (): ContentReportDraft[] => {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY) || "";
    if (raw.length > 200_000) return [];
    const existing: unknown = JSON.parse(raw || "[]");
    return Array.isArray(existing) ? existing.filter(isValidDraft).slice(-20) : [];
  } catch {
    return [];
  }
};

const draftReport = (payload: ContentReportPayload): ContentReportResult => {
  try {
    const drafts = readDrafts();
    drafts.push({ ...payload, createdAt: new Date().toISOString() });
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.slice(-20)));
    return { status: "draft", savedLocally: true };
  } catch {
    return { status: "save_failed", savedLocally: false };
  }
};

export const getContentReportDrafts = (context: ContentReportContext): ContentReportDraft[] =>
  readDrafts().filter((draft) =>
    draft.courseId === context.courseId && draft.lessonId === context.lessonId && draft.stepId === context.stepId
  );

export async function submitContentReport(
  payload: ContentReportPayload,
  options: { getAccessToken?: AccessTokenGetter; fetchImpl?: typeof fetch } = {},
): Promise<ContentReportResult> {
  const description = payload.description.trim();
  if (!description) return draftReport({ ...payload, description });

  // Auth is deliberately injected so reporting stays independent from login UI details.
  let token: string | null = null;
  try {
    const getToken = options.getAccessToken || getAccessToken;
    token = await getToken();
  } catch {
    token = null;
  }
  if (!token?.trim()) return draftReport({ ...payload, description });

  const fetchImpl = options.fetchImpl || authorizedFetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
  try {
    const response = await fetchImpl("/api/content-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        category: payload.category,
        description,
        ...(payload.courseId ? { courseId: payload.courseId } : {}),
        ...(payload.lessonId ? { lessonId: payload.lessonId } : {}),
        ...(payload.stepId ? { stepId: payload.stepId } : {}),
      }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.status === "received" && typeof result.id === "string" && result.id.length > 0) {
      return { status: "received", id: result.id, savedLocally: false };
    }
  } catch {
    // A failed request is a local draft, never a sent report.
  } finally {
    clearTimeout(timeoutId);
  }
  return draftReport({ ...payload, description });
}
