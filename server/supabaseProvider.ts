import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabasePublicConfig {
  supabaseUrl: string;
  publishableKey: string;
}

export interface SupabaseSnapshotRecord {
  snapshot: unknown;
  revision: number;
  updatedAt: string;
}

export interface SupabaseAiUsageRecord {
  requests: number;
  reservedOutputTokens: number;
  requestLimit: number;
  outputTokenLimit: number;
  usageDay: string;
}

export class SupabaseAiQuotaExceededError extends Error {
  constructor() {
    super("AI daily quota exceeded");
    this.name = "SupabaseAiQuotaExceededError";
  }
}

const validUrl = (value: string | undefined): value is string => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const isPublishableKey = (value: string | undefined): value is string =>
  typeof value === "string" && value.startsWith("sb_publishable_") && value.length <= 500;

export const getSupabasePublicConfig = (): SupabasePublicConfig | null => {
  // Secrets set from Windows shells can carry a trailing CRLF; never forward it to the browser.
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!validUrl(supabaseUrl) || !isPublishableKey(publishableKey)) return null;
  return { supabaseUrl, publishableKey };
};

export const isSupabaseConfigured = (): boolean => getSupabasePublicConfig() !== null;

const createRequestClient = (accessToken: string): SupabaseClient => {
  const config = getSupabasePublicConfig();
  if (!config || typeof accessToken !== "string" || accessToken.trim().length === 0) throw new Error("Supabase configuration required");
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
};

export const verifySupabaseAccessToken = async (token: string): Promise<{ id: string } | null> => {
  if (!isSupabaseConfigured() || typeof token !== "string" || token.trim().length === 0) return null;
  try {
    const client = createRequestClient(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id) return null;
    return { id: data.user.id };
  } catch {
    return null;
  }
};

export const createSupabaseContentReport = async (
  userId: string,
  payload: Record<string, unknown>,
  accessToken?: string,
): Promise<{ id: string; status: "received" }> => {
  if (!accessToken) throw new Error("A bearer token is required");
  const client = createRequestClient(accessToken);
  const { data, error } = await client.from("content_reports").insert({
    owner_id: userId,
    category: payload.category,
    description: payload.description,
    course_id: payload.courseId ?? null,
    lesson_id: payload.lessonId ?? null,
    step_id: payload.stepId ?? null,
  }).select("id").single();
  if (error || !data?.id) throw new Error("Content report persistence failed");
  return { id: data.id, status: "received" };
};

export const getSupabaseLearningSnapshot = async (userId: string, accessToken: string): Promise<SupabaseSnapshotRecord | null> => {
  const client = createRequestClient(accessToken);
  const { data, error } = await client.from("learning_snapshots").select("snapshot,revision,updated_at").eq("owner_id", userId).maybeSingle();
  if (error) throw new Error("Learning snapshot read failed");
  if (!data) return null;
  return { snapshot: data.snapshot, revision: data.revision, updatedAt: data.updated_at };
};

export const putSupabaseLearningSnapshot = async (
  userId: string,
  snapshot: unknown,
  expectedRevision: number | null,
  accessToken: string,
): Promise<SupabaseSnapshotRecord> => {
  const client = createRequestClient(accessToken);
  const { data, error } = await client.rpc("put_learning_snapshot", {
    p_snapshot: snapshot,
    p_expected_revision: expectedRevision,
  });
  if (error) throw new Error("Learning snapshot write failed");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.revision !== "number" || typeof row.updated_at !== "string") throw new Error("Learning snapshot conflict");
  return { snapshot, revision: row.revision, updatedAt: row.updated_at };
};

const aiUsageRecord = (value: unknown): SupabaseAiUsageRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !Number.isInteger(row.requests) || (row.requests as number) < 0 ||
    !Number.isInteger(row.reserved_output_tokens) || (row.reserved_output_tokens as number) < 0 ||
    !Number.isInteger(row.request_limit) || (row.request_limit as number) <= 0 ||
    !Number.isInteger(row.output_token_limit) || (row.output_token_limit as number) <= 0 ||
    typeof row.usage_day !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(row.usage_day)
  ) return null;
  return {
    requests: row.requests as number,
    reservedOutputTokens: row.reserved_output_tokens as number,
    requestLimit: row.request_limit as number,
    outputTokenLimit: row.output_token_limit as number,
    usageDay: row.usage_day,
  };
};

const firstRow = (data: unknown): unknown => Array.isArray(data) ? data[0] : data;

/** Atomically reserves one authenticated learner's daily AI allowance in Supabase. */
export const reserveSupabaseAiUsage = async (accessToken: string, requestedTokens: number): Promise<SupabaseAiUsageRecord> => {
  if (!Number.isInteger(requestedTokens) || requestedTokens <= 0) throw new Error("Requested AI tokens must be a positive integer");
  const client = createRequestClient(accessToken);
  const { data, error } = await client.rpc("reserve_ai_daily_usage", { p_requested_tokens: requestedTokens });
  if (error) {
    console.error(JSON.stringify({ event: "supabase_ai_quota_error", operation: "reserve", code: error.code || "unknown", message: error.message.slice(0, 200) }));
    throw new Error("AI usage reservation failed");
  }
  const usage = aiUsageRecord(firstRow(data));
  if (!usage) {
    console.error(JSON.stringify({ event: "supabase_ai_quota_error", operation: "reserve", code: "INVALID_RESPONSE" }));
    throw new SupabaseAiQuotaExceededError();
  }
  return usage;
};

export const getSupabaseAiUsage = async (accessToken: string): Promise<SupabaseAiUsageRecord> => {
  const client = createRequestClient(accessToken);
  const { data, error } = await client.rpc("get_ai_daily_usage");
  if (error) throw new Error("AI usage read failed");
  const usage = aiUsageRecord(firstRow(data));
  if (!usage) throw new Error("AI usage response was invalid");
  return usage;
};
