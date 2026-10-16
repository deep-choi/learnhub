/** 로그인 전에 체험 모델로 나누는 대화. 횟수는 서버가 기기 id 기준으로 셉니다. */
const DEVICE_KEY = "learnhub_guest_trial_device_v1";
let memoryDeviceId = "";

export const GUEST_TRIAL_EXHAUSTED_CODE = "GUEST_TRIAL_EXHAUSTED";
export const GUEST_TRIAL_UNAVAILABLE_CODE = "GUEST_TRIAL_UNAVAILABLE";

export const getGuestTrialDeviceId = (): string => {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    memoryDeviceId = memoryDeviceId || crypto.randomUUID();
    return memoryDeviceId;
  }
};

/** 로그인 토큰 없이 체험 대화 API를 부릅니다. 모델·추론 선택 헤더는 보내지 않습니다. */
export const guestTutorFetch = (body: unknown): Promise<Response> =>
  fetch("/api/ai/guest-tutor-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-learnhub-guest-id": getGuestTrialDeviceId() },
    body: JSON.stringify(body),
  });

export const readTrialRemaining = (payload: unknown): number | null => {
  const trial = payload && typeof payload === "object" ? (payload as { trial?: unknown }).trial : null;
  const remaining = trial && typeof trial === "object" ? (trial as { remaining?: unknown }).remaining : null;
  return typeof remaining === "number" && Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : null;
};
