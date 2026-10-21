import { randomUUID } from "node:crypto";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { type DocumentReference } from "firebase-admin/firestore";
import { firebaseAdminApp, firestore, projectId } from "./firebaseRuntime";
import { withCloudStoreErrors } from "./cloudErrors";
import { aiUsageLimitsEnabled } from "./aiUsageLimits";

export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
  storageBucket: string;
}

export interface FirebaseSnapshotRecord {
  snapshot: unknown;
  revision: number;
  updatedAt: string;
}

export interface FirebaseAiUsageRecord {
  requests: number;
  reservedOutputTokens: number;
  requestLimit: number;
  outputTokenLimit: number;
  usageDay: string;
}

export class FirebaseAiQuotaExceededError extends Error {
  constructor() {
    super("AI daily quota exceeded");
    this.name = "FirebaseAiQuotaExceededError";
  }
}

export const getFirebasePublicConfig = (): FirebasePublicConfig | null => {
  const config: FirebasePublicConfig = {
    apiKey: (process.env.LEARNHUB_FB_WEB_API_KEY || "").trim(),
    authDomain: (process.env.LEARNHUB_FB_AUTH_DOMAIN || "").trim(),
    projectId: projectId(),
    appId: (process.env.LEARNHUB_FB_APP_ID || "").trim(),
    messagingSenderId: (process.env.LEARNHUB_FB_MESSAGING_SENDER_ID || "").trim(),
    storageBucket: (process.env.LEARNHUB_FB_STORAGE_BUCKET || "").trim(),
  };
  if (!/^AIza[\w-]{30,}$/u.test(config.apiKey) || !config.projectId || !config.appId || !config.messagingSenderId) return null;
  try {
    const authDomain = new URL(`https://${config.authDomain}`);
    if (authDomain.protocol !== "https:" || authDomain.pathname !== "/") return null;
  } catch {
    return null;
  }
  return config;
};

export const isFirebaseConfigured = (): boolean => projectId().length > 0;

const userRef = (userId: string): DocumentReference => firestore().collection("learnhubUsers").doc(userId);

export const verifyFirebaseAccessToken = async (token: string): Promise<{ id: string } | null> => {
  if (!isFirebaseConfigured() || typeof token !== "string" || token.trim().length === 0) return null;
  try {
    const decoded = await getAdminAuth(firebaseAdminApp()).verifyIdToken(token, true);
    return decoded.uid ? { id: decoded.uid } : null;
  } catch {
    return null;
  }
};

export const createFirebaseContentReport = async (
  userId: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; status: "received" }> => {
  const reportRef = userRef(userId).collection("contentReports").doc();
  await reportRef.create({
    category: payload.category,
    description: payload.description,
    courseId: payload.courseId ?? null,
    lessonId: payload.lessonId ?? null,
    stepId: payload.stepId ?? null,
    createdAt: new Date().toISOString(),
    status: "received",
    revision: 0,
  });
  return { id: reportRef.id, status: "received" };
};

const SNAPSHOT_CHUNK_LIMIT_BYTES = 700_000;

const splitUtf8 = (text: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (currentBytes + characterBytes > SNAPSHOT_CHUNK_LIMIT_BYTES && current) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (current || parts.length === 0) parts.push(current);
  return parts;
};

const removeSnapshotVersion = async (userId: string, versionId: string): Promise<void> => {
  await firestore().recursiveDelete(userRef(userId).collection("snapshotVersions").doc(versionId));
};

export const getFirebaseLearningSnapshot = async (userId: string): Promise<FirebaseSnapshotRecord | null> => {
  return withCloudStoreErrors(async () => {
  const account = userRef(userId);
  const meta = await account.collection("private").doc("learningSnapshot").get();
  if (!meta.exists) return null;
  const revision = meta.get("revision");
  const updatedAt = meta.get("updatedAt");
  const versionId = meta.get("versionId");
  const chunkCount = meta.get("chunkCount");
  if (!Number.isInteger(revision) || revision < 1 || typeof updatedAt !== "string" || typeof versionId !== "string" ||
    !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 32) {
    throw new Error("Learning snapshot metadata is invalid");
  }
  const chunks = await account.collection("snapshotVersions").doc(versionId).collection("chunks").orderBy("index").get();
  if (chunks.size !== chunkCount) throw new Error("Learning snapshot is incomplete");
  let serialized = "";
  chunks.docs.forEach((chunk, index) => {
    if (chunk.get("index") !== index || typeof chunk.get("payload") !== "string") throw new Error("Learning snapshot chunk is invalid");
    serialized += chunk.get("payload") as string;
  });
  return { snapshot: JSON.parse(serialized) as unknown, revision: revision as number, updatedAt };
  });
};

export const putFirebaseLearningSnapshot = async (
  userId: string,
  snapshot: unknown,
  expectedRevision: number | null,
): Promise<FirebaseSnapshotRecord> => {
  return withCloudStoreErrors(async () => {
  const serialized = JSON.stringify(snapshot);
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > 8_000_000) throw new Error("Learning snapshot is too large");
  const pieces = splitUtf8(serialized);
  const account = userRef(userId);
  const versionId = randomUUID();
  const chunks = account.collection("snapshotVersions").doc(versionId).collection("chunks");

  try {
    for (let offset = 0; offset < pieces.length; offset += 10) {
      const batch = firestore().batch();
      pieces.slice(offset, offset + 10).forEach((payload, relativeIndex) => {
        const index = offset + relativeIndex;
        batch.create(chunks.doc(String(index).padStart(3, "0")), { index, payload });
      });
      await batch.commit();
    }

    const metaRef = account.collection("private").doc("learningSnapshot");
    const committed = await firestore().runTransaction(async (transaction) => {
      const current = await transaction.get(metaRef);
      const currentRevision = current.exists ? current.get("revision") : null;
      if ((currentRevision !== null && !Number.isInteger(currentRevision)) || currentRevision !== expectedRevision) {
        throw new Error("Learning snapshot conflict");
      }
      const now = new Date().toISOString();
      const nextRevision = ((currentRevision as number | null) ?? 0) + 1;
      const oldVersionId = current.exists && typeof current.get("versionId") === "string" ? current.get("versionId") as string : null;
      transaction.set(metaRef, { revision: nextRevision, updatedAt: now, versionId, chunkCount: pieces.length });
      return { revision: nextRevision, updatedAt: now, oldVersionId };
    });

    if (committed.oldVersionId && committed.oldVersionId !== versionId) {
      await removeSnapshotVersion(userId, committed.oldVersionId).catch(() => {
        console.warn(JSON.stringify({ event: "firebase_snapshot_cleanup_deferred" }));
      });
    }
    return { snapshot, revision: committed.revision, updatedAt: committed.updatedAt };
  } catch (error) {
    await removeSnapshotVersion(userId, versionId).catch(() => undefined);
    throw error;
  }
  });
};

const positiveLimit = (key: string, fallback: number): number => {
  const value = Number(process.env[key]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const normalizedUsage = (value: FirebaseAiUsageRecord): FirebaseAiUsageRecord => ({
  requests: value.requests,
  reservedOutputTokens: value.reservedOutputTokens,
  requestLimit: value.requestLimit,
  outputTokenLimit: value.outputTokenLimit,
  usageDay: value.usageDay,
});

const quotaPolicyRef = () => firestore().collection("learnhubConfig").doc("aiQuotaPolicy");
const readLimit = (value: unknown, fallback: number): number =>
  Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
const readEnvironmentQuotaPolicy = () => ({
  limitsEnabled: aiUsageLimitsEnabled(),
  requestLimit: positiveLimit("AI_REQUESTS_PER_USER_PER_DAY", 100),
  outputTokenLimit: positiveLimit("AI_RESERVED_OUTPUT_TOKENS_PER_USER_PER_DAY", 100_000),
});
const policyFromSnapshot = (value: { get: (field: string) => unknown }, fallback: { limitsEnabled: boolean; requestLimit: number; outputTokenLimit: number }) => ({
  limitsEnabled: typeof value.get("limitsEnabled") === "boolean" ? value.get("limitsEnabled") as boolean : fallback.limitsEnabled,
  requestLimit: readLimit(value.get("requestLimit"), fallback.requestLimit),
  outputTokenLimit: readLimit(value.get("outputTokenLimit"), fallback.outputTokenLimit),
});

export const getFirebaseAiUsage = async (userId: string): Promise<FirebaseAiUsageRecord> => {
  const usageDay = new Date().toISOString().slice(0, 10);
  const ref = userRef(userId).collection("aiUsage").doc(usageDay);
  const envPolicy = readEnvironmentQuotaPolicy();
  const [snapshot, policySnapshot] = await Promise.all([
    ref.get(),
    quotaPolicyRef().get(),
  ]);
  const policy = policySnapshot.exists ? policyFromSnapshot(policySnapshot, envPolicy) : envPolicy;
  return normalizedUsage({
    requests: Number(snapshot.get("requests") || 0),
    reservedOutputTokens: Number(snapshot.get("reservedOutputTokens") || 0),
    requestLimit: policy.requestLimit,
    outputTokenLimit: policy.outputTokenLimit,
    usageDay,
  });
};

export const reserveFirebaseAiUsage = async (userId: string, requestedTokens: number): Promise<FirebaseAiUsageRecord> => {
  if (!Number.isInteger(requestedTokens) || requestedTokens <= 0) throw new Error("Requested AI tokens must be a positive integer");
  const usageDay = new Date().toISOString().slice(0, 10);
  const envPolicy = readEnvironmentQuotaPolicy();
  const ref = userRef(userId).collection("aiUsage").doc(usageDay);
  return firestore().runTransaction(async (transaction) => {
    const [snapshot, policySnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(quotaPolicyRef()),
    ]);
    const policy = policySnapshot.exists ? policyFromSnapshot(policySnapshot, envPolicy) : envPolicy;
    const requests = Number(snapshot.get("requests") || 0);
    const reservedOutputTokens = Number(snapshot.get("reservedOutputTokens") || 0);
    if (policy.limitsEnabled && (requests + 1 > policy.requestLimit || reservedOutputTokens + requestedTokens > policy.outputTokenLimit)) {
      throw new FirebaseAiQuotaExceededError();
    }
    const usage = {
      requests: requests + 1,
      reservedOutputTokens: reservedOutputTokens + requestedTokens,
      requestLimit: policy.requestLimit,
      outputTokenLimit: policy.outputTokenLimit,
      usageDay,
    };
    transaction.set(ref, usage);
    return normalizedUsage(usage);
  });
};

export const deleteFirebaseAccountData = async (userId: string): Promise<void> => {
  await firestore().recursiveDelete(userRef(userId));
  await firestore().collection("learnhubUserOperations").doc(userId).delete();
  await getAdminAuth(firebaseAdminApp()).deleteUser(userId);
};
