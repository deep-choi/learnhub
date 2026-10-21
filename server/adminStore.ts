import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { firestore, firebaseAdminAuth, projectId } from "./firebaseRuntime";
import { defaultOperationsSettings, enforceOperationsPolicy, OperationsError, reserveGlobalAiUsage, validateOperationsSettings, validDocumentId } from "./operationsPolicy";
import type { AdminAudit, AdminOverview, AdminReport, AdminUser, OperationsSettings } from "../src/types/admin";
import type { AiGatewayLoggerEvent, AiGatewayRequest } from "./aiGateway";
import type { AiRuntimeSelection } from "../src/domain/aiModels";

const policyRef = () => firestore().collection("learnhubConfig").doc("aiQuotaPolicy");
const controlsRef = (uid: string) => firestore().collection("learnhubUserOperations").doc(uid);
const dayRef = () => firestore().collection("learnhubOperationsDays").doc(new Date().toISOString().slice(0, 10));
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const stringOrNull = (value: unknown) => typeof value === "string" ? value : null;
export const settingsFromData = (data?: Record<string, unknown>): OperationsSettings => {
  const defaults = defaultOperationsSettings();
  const merged = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, data?.[key] ?? value]));
  return validateOperationsSettings(merged);
};
export const getOperationsSettings = async () => settingsFromData((await policyRef().get()).data());

export const verifyAdminToken = async (token: string): Promise<{ id: string } | null> => {
  if (!projectId()) throw new OperationsError(503, "ADMIN_NOT_CONFIGURED", "관리자 인증 설정이 필요합니다.");
  let decoded;
  try { decoded = await firebaseAdminAuth().verifyIdToken(token, true); }
  catch { throw new OperationsError(401, "AUTH_INVALID", "다시 로그인해 주세요."); }
  const allowedUids = (process.env.LEARNHUB_ADMIN_UIDS || "").split(",").map(value => value.trim()).filter(Boolean);
  return decoded.admin === true || allowedUids.includes(decoded.uid) ? { id: decoded.uid } : null;
};

export const saveOperationsSettings = async (actor: string, value: unknown) => {
  const requested = validateOperationsSettings(value);
  return firestore().runTransaction(async transaction => {
    const ref = policyRef();
    const current = settingsFromData((await transaction.get(ref)).data());
    if (requested.revision !== current.revision) throw new OperationsError(409, "SETTINGS_CONFLICT", "다른 창에서 설정이 변경되었습니다. 새로고침 후 다시 저장해 주세요.");
    const next = { ...requested, revision: current.revision + 1 };
    const createdAt = new Date().toISOString();
    transaction.set(ref, { ...next, updatedAt: createdAt }, { merge: true });
    transaction.create(firestore().collection("learnhubAdminAudit").doc(), {
      actor, action: "settings.update", target: "aiQuotaPolicy", before: current, after: next, createdAt,
    });
    return next;
  });
};

/** Runs at the gateway for every provider call, including anonymous trial and media endpoints. */
export const authorizeAiOperation = async (request: AiGatewayRequest<unknown>, selection: AiRuntimeSelection, tokens: number) => {
  // Local development without Firebase keeps the existing demo mode; production fails closed.
  if (!projectId() && process.env.NODE_ENV !== "production") return;
  if (!projectId()) throw new OperationsError(503, "OPERATIONS_UNAVAILABLE", "AI 운영 설정을 확인하지 못했습니다.");
  const uid = request.clientKey.startsWith("user:") ? request.clientKey.slice(5) : null;
  await firestore().runTransaction(async transaction => {
    const ref = dayRef();
    const [policyDoc, usageDoc, controls] = await Promise.all([
      transaction.get(policyRef()), transaction.get(ref), uid ? transaction.get(controlsRef(uid)) : Promise.resolve(null),
    ]);
    const settings = settingsFromData(policyDoc.data());
    enforceOperationsPolicy(settings, selection.model, controls?.get("aiBlocked") === true);
    const next = reserveGlobalAiUsage(settings, { admittedRequests: usageDoc.get("admittedRequests"), reservedOutputTokens: usageDoc.get("reservedOutputTokens") }, tokens);
    transaction.set(ref, { ...next, updatedAt: new Date().toISOString() }, { merge: true });
  });
};

/** Metadata only: no prompts, answers, access tokens or provider error objects. */
export const recordAiOperation = async (event: AiGatewayLoggerEvent) => {
  if (!projectId()) return;
  const now = new Date();
  const batch = firestore().batch();
  batch.set(dayRef(), {
    completedRequests: FieldValue.increment(1),
    failedRequests: FieldValue.increment(event.status === "success" ? 0 : 1),
    actualTokens: FieldValue.increment(finite(event.usage?.totalTokenCount)),
    totalDurationMs: FieldValue.increment(event.durationMs),
  }, { merge: true });
  if (event.status !== "success") batch.create(firestore().collection("learnhubAiFailures").doc(), {
    endpoint: event.endpoint, model: event.model, status: event.status, durationMs: event.durationMs,
    requestId: event.requestId, createdAt: now.toISOString(), expiresAt: Timestamp.fromMillis(now.getTime() + 30 * 86400_000),
  });
  await batch.commit();
};

export const getAdminOverview = async (): Promise<AdminOverview & { usersTruncated: boolean }> => {
  const [users, day, failures] = await Promise.all([
    firebaseAdminAuth().listUsers(1000), dayRef().get(),
    firestore().collection("learnhubAiFailures").orderBy("createdAt", "desc").limit(10).get(),
  ]);
  const completedRequests = finite(day.get("completedRequests"));
  return {
    day: new Date().toISOString().slice(0, 10), totalUsers: users.users.length, usersTruncated: Boolean(users.pageToken),
    admittedRequests: finite(day.get("admittedRequests")), reservedOutputTokens: finite(day.get("reservedOutputTokens")),
    completedRequests, failedRequests: finite(day.get("failedRequests")), actualTokens: finite(day.get("actualTokens")),
    meanDurationMs: completedRequests ? Math.round(finite(day.get("totalDurationMs")) / completedRequests) : null,
    recentFailures: failures.docs.map(doc => ({ id: doc.id, endpoint: String(doc.get("endpoint") || ""), model: String(doc.get("model") || ""),
      status: String(doc.get("status") || ""), durationMs: finite(doc.get("durationMs")), createdAt: String(doc.get("createdAt") || "") })),
  };
};

export const listAdminUsers = async (search: string, cursor?: string): Promise<{ items: AdminUser[]; nextCursor: string | null }> => {
  let users;
  let nextCursor: string | null = null;
  if (search) {
    try { users = [search.includes("@") ? await firebaseAdminAuth().getUserByEmail(search) : await firebaseAdminAuth().getUser(search)]; }
    catch (error) { if ((error as { code?: string }).code === "auth/user-not-found") users = []; else throw error; }
  } else {
    const result = await firebaseAdminAuth().listUsers(25, cursor);
    users = result.users; nextCursor = result.pageToken || null;
  }
  const day = new Date().toISOString().slice(0, 10);
  const items = await Promise.all(users.map(async user => {
    const account = firestore().collection("learnhubUsers").doc(user.uid);
    const [control, usage, snapshot] = await Promise.all([controlsRef(user.uid).get(), account.collection("aiUsage").doc(day).get(), account.collection("private").doc("learningSnapshot").get()]);
    return { uid: user.uid, email: user.email || null, displayName: user.displayName || null, createdAt: user.metadata.creationTime,
      lastSignInAt: user.metadata.lastSignInTime || null, aiBlocked: control.get("aiBlocked") === true,
      requestsToday: finite(usage.get("requests")), reservedTokensToday: finite(usage.get("reservedOutputTokens")),
      snapshotUpdatedAt: stringOrNull(snapshot.get("updatedAt")), snapshotRevision: snapshot.exists ? finite(snapshot.get("revision")) : null };
  }));
  return { items, nextCursor };
};

export const updateAdminUser = async (actor: string, uid: string, blocked: boolean) => {
  if (!validDocumentId(uid)) throw new OperationsError(400, "INVALID_USER", "계정을 확인해 주세요.");
  const user = await firebaseAdminAuth().getUser(uid);
  const allowlist = (process.env.LEARNHUB_ADMIN_UIDS || "").split(",").map(value => value.trim());
  if (blocked && (actor === uid || user.customClaims?.admin === true || allowlist.includes(uid))) throw new OperationsError(400, "ADMIN_PROTECTED", "관리자 계정은 제한할 수 없습니다.");
  await firestore().runTransaction(async transaction => {
    const ref = controlsRef(uid); const current = await transaction.get(ref);
    const before = { aiBlocked: current.get("aiBlocked") === true };
    transaction.set(ref, { aiBlocked: blocked, updatedAt: new Date().toISOString() }, { merge: true });
    transaction.create(firestore().collection("learnhubAdminAudit").doc(), { actor, action: "user.ai-access", target: uid,
      before, after: { aiBlocked: blocked }, createdAt: new Date().toISOString() });
  });
};

export const listAdminReports = async (cursor?: string): Promise<{ items: AdminReport[]; nextCursor: string | null }> => {
  let query = firestore().collectionGroup("contentReports").orderBy("createdAt", "desc").limit(25);
  if (cursor) {
    const parts = cursor.split("/");
    if (parts.length !== 4 || parts[0] !== "learnhubUsers" || parts[2] !== "contentReports" || !validDocumentId(parts[1]) || !validDocumentId(parts[3])) throw new OperationsError(400, "INVALID_CURSOR", "목록 위치가 올바르지 않습니다.");
    const doc = await firestore().doc(cursor).get();
    if (!doc.exists) throw new OperationsError(409, "CURSOR_EXPIRED", "신고 목록을 새로고침해 주세요.");
    query = query.startAfter(doc);
  }
  const result = await query.get();
  return { items: result.docs.map(doc => ({ id: doc.id, userId: doc.ref.parent.parent!.id, category: String(doc.get("category") || "other"),
    description: String(doc.get("description") || ""), courseId: stringOrNull(doc.get("courseId")), lessonId: stringOrNull(doc.get("lessonId")),
    createdAt: String(doc.get("createdAt") || ""), status: ["reviewing", "resolved"].includes(doc.get("status")) ? doc.get("status") : "received",
    note: String(doc.get("note") || ""), revision: finite(doc.get("revision")) })), nextCursor: result.size === 25 ? result.docs.at(-1)!.ref.path : null };
};

export const updateAdminReport = async (actor: string, uid: string, reportId: string, status: AdminReport["status"], note: string, revision: number) => {
  if (!validDocumentId(uid) || !validDocumentId(reportId)) throw new OperationsError(400, "INVALID_REPORT", "신고를 확인해 주세요.");
  await firestore().runTransaction(async transaction => {
    const ref = firestore().collection("learnhubUsers").doc(uid).collection("contentReports").doc(reportId);
    const doc = await transaction.get(ref);
    if (!doc.exists) throw new OperationsError(404, "REPORT_NOT_FOUND", "신고를 찾지 못했습니다.");
    const currentRevision = finite(doc.get("revision"));
    if (revision !== currentRevision) throw new OperationsError(409, "REPORT_CONFLICT", "신고가 변경되었습니다. 새로고침 후 다시 저장해 주세요.");
    const next = { status, note, revision: currentRevision + 1 };
    transaction.update(ref, { ...next, updatedAt: new Date().toISOString() });
    transaction.create(firestore().collection("learnhubAdminAudit").doc(), { actor, action: "report.update", target: ref.path,
      before: { status: doc.get("status") || "received", note: doc.get("note") || "" }, after: next, createdAt: new Date().toISOString() });
  });
};

export const listAdminAudit = async (): Promise<AdminAudit[]> => {
  const result = await firestore().collection("learnhubAdminAudit").orderBy("createdAt", "desc").limit(50).get();
  return result.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminAudit));
};

export const adminStore = { getSettings: getOperationsSettings, saveSettings: saveOperationsSettings, overview: getAdminOverview,
  users: listAdminUsers, updateUser: updateAdminUser, reports: listAdminReports, updateReport: updateAdminReport, audit: listAdminAudit };
