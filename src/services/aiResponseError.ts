/** Keep the API's user-facing reason separate from unexpected network/runtime errors. */
export class AiResponseError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

export async function readAiResponseError(response: Response): Promise<AiResponseError> {
  const payload: unknown = await response.json().catch(() => null);
  const data = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {};
  const fallback = response.status === 429
    ? "AI 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
    : "지금은 답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  const message = typeof data.error === "string" && data.error.trim() && data.error.length <= 300
    ? data.error.trim() : fallback;
  return new AiResponseError(message, typeof data.code === "string" ? data.code : undefined);
}

export function aiResponseErrorMessage(error: unknown, fallback = "지금은 답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."): string {
  return error instanceof AiResponseError
    ? error.message
    : fallback;
}
