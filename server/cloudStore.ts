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
) => Promise<ContentReportReceipt>;

export interface CloudStoreAdapter {
  createContentReport: ContentReportPersistence;
}

let persistence: ContentReportPersistence | null = null;

/** Configure actual durable persistence after provider/schema decisions are made. */
export const configureCloudStore = (adapter: CloudStoreAdapter | ContentReportPersistence | null): void => {
  persistence = typeof adapter === "function" ? adapter : adapter?.createContentReport || null;
};

/**
 * No receipt is fabricated here. The adapter must resolve only after its real
 * write succeeds; otherwise this function throws or returns no receipt.
 */
export const createContentReport = async (
  userId: string,
  payload: ContentReportPayload,
): Promise<ContentReportReceipt> => {
  if (!persistence) throw new Error("Cloud store configuration required");
  if (typeof userId !== "string" || userId.trim().length === 0) throw new Error("A verified user id is required");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("A content report payload is required");

  const receipt = await persistence(userId, payload);
  if (!receipt || typeof receipt.id !== "string" || receipt.id.trim().length === 0 || receipt.status !== "received") {
    throw new Error("Cloud store did not confirm a successful write");
  }
  return { id: receipt.id, status: "received" };
};

export const clearCloudStore = (): void => {
  persistence = null;
};
