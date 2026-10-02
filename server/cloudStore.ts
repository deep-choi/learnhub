import {
  createFirebaseContentReport,
  getFirebaseLearningSnapshot,
  isFirebaseConfigured,
  putFirebaseLearningSnapshot,
} from "./firebaseProvider";
import { CloudStoreUnavailableError, withCloudStoreErrors } from "./cloudErrors";

export interface ContentReportPayload {
  [key: string]: unknown;
}

export interface ContentReportReceipt {
  id: string;
  status: "received";
}

export type ContentReportPersistence = (
  userId: string,
  payload: ContentReportPayload,
  accessToken?: string,
) => Promise<ContentReportReceipt>;

export interface LearningSnapshotRecord {
  snapshot: unknown;
  revision: number;
  updatedAt: string;
}

export type LearningSnapshotReader = (userId: string, accessToken: string) => Promise<LearningSnapshotRecord | null>;
export type LearningSnapshotWriter = (userId: string, snapshot: unknown, expectedRevision: number | null, accessToken: string) => Promise<LearningSnapshotRecord>;

export interface CloudStoreAdapter {
  createContentReport: ContentReportPersistence;
  getLearningSnapshot?: LearningSnapshotReader;
  putLearningSnapshot?: LearningSnapshotWriter;
}

let persistence: ContentReportPersistence | null = null;
let snapshotReader: LearningSnapshotReader | null = null;
let snapshotWriter: LearningSnapshotWriter | null = null;

export const configureFirebaseCloudStore = (): void => {
  if (!isFirebaseConfigured()) return;
  persistence = createFirebaseContentReport;
  snapshotReader = (userId) => getFirebaseLearningSnapshot(userId);
  snapshotWriter = (userId, snapshot, expectedRevision) => putFirebaseLearningSnapshot(userId, snapshot, expectedRevision);
};

configureFirebaseCloudStore();

/** Configure actual durable persistence after provider/schema decisions are made. */
export const configureCloudStore = (adapter: CloudStoreAdapter | ContentReportPersistence | null): void => {
  persistence = typeof adapter === "function" ? adapter : adapter?.createContentReport || null;
  snapshotReader = typeof adapter === "function" ? null : adapter?.getLearningSnapshot || null;
  snapshotWriter = typeof adapter === "function" ? null : adapter?.putLearningSnapshot || null;
};

/**
 * No receipt is fabricated here. The adapter must resolve only after its real
 * write succeeds; otherwise this function throws or returns no receipt.
 */
export const createContentReport = async (
  userId: string,
  payload: ContentReportPayload,
  accessToken?: string,
): Promise<ContentReportReceipt> => {
  if (!persistence) throw new Error("Cloud store configuration required");
  if (typeof userId !== "string" || userId.trim().length === 0) throw new Error("A verified user id is required");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("A content report payload is required");

  const receipt = await persistence(userId, payload, accessToken);
  if (!receipt || typeof receipt.id !== "string" || receipt.id.trim().length === 0 || receipt.status !== "received") {
    throw new Error("Cloud store did not confirm a successful write");
  }
  return { id: receipt.id, status: "received" };
};

export const getLearningSnapshot = async (userId: string, accessToken: string): Promise<LearningSnapshotRecord | null> => {
  if (!snapshotReader) throw new CloudStoreUnavailableError();
  return withCloudStoreErrors(() => snapshotReader!(userId, accessToken));
};

export const putLearningSnapshot = async (
  userId: string,
  snapshot: unknown,
  expectedRevision: number | null,
  accessToken: string,
): Promise<LearningSnapshotRecord> => {
  if (!snapshotWriter) throw new CloudStoreUnavailableError();
  return withCloudStoreErrors(() => snapshotWriter!(userId, snapshot, expectedRevision, accessToken));
};

export const clearCloudStore = (): void => {
  persistence = null;
  snapshotReader = null;
  snapshotWriter = null;
};
