export class CloudStoreUnavailableError extends Error {
  readonly code = "cloud_store_unavailable";
  constructor(cause?: unknown) {
    super("학습 기록 저장소에 잠시 연결하지 못했습니다.", { cause });
    this.name = "CloudStoreUnavailableError";
  }
}
export async function withCloudStoreErrors<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof CloudStoreUnavailableError || (error instanceof Error && error.message === "Learning snapshot conflict")) throw error;
    throw new CloudStoreUnavailableError(error);
  }
}
