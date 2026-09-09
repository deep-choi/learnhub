import { getAccessToken } from "./authClient";

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

const readDrafts = (): ContentReportDraft[] => {
  try {
    const existing: unknown = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "[]");
    return Array.isArray(existing) ? existing.filter((draft): draft is ContentReportDraft => Boolean(draft && typeof draft === "object")) : [];
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

  // Auth is deliberately injected: this service does not assume Firebase, Supabase, or another vendor.
  let token: string | null = null;
  try {
    const getToken = options.getAccessToken || getAccessToken;
    token = await getToken();
  } catch {
    token = null;
  }
  if (!token?.trim()) return draftReport({ ...payload, description });

  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl("/api/content-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
  }
  return draftReport({ ...payload, description });
}
