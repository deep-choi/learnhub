import type { SaveTutorPersonaResult, TutorPersona, TutorPersonaInput, TutorPersonaRequest } from "../types/tutorPersona";
import {
  DEFAULT_TUTOR_PERSONA,
  isPersonaPreset,
  isResponseLength,
  isTutorAvatar,
  isTutorPersona,
  normalizePersonaName,
  normalizePersonaPersonality,
  normalizePersonaRole,
  normalizePersonaTone,
  toPersonaRequest,
} from "../domain/tutorPersona";
import { LEARNHUB_DATA_CHANGED_EVENT, LEARNHUB_STORAGE_KEYS, notifyLearningDataChanged } from "./storage";

/** 저장된 튜터 설정. 없거나 손상됐으면 기본 설정(다정한 선생님, LearnHub 튜터, 보통)이다. */
export function getTutorPersona(): TutorPersona {
  if (typeof localStorage === "undefined") return { ...DEFAULT_TUTOR_PERSONA };
  try {
    const raw = localStorage.getItem(LEARNHUB_STORAGE_KEYS.TUTOR_PERSONA);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (isTutorPersona(parsed)) return parsed;
    }
  } catch { /* 손상된 값은 기본값으로 보고, 다음 저장에서 덮어씁니다. */ }
  return { ...DEFAULT_TUTOR_PERSONA };
}

/**
 * 튜터 설정을 저장한다. 이름·역할은 20자, 말투는 40자, 성격과 행동 방식은 300자 이하이며 부적절한 내용은 거절한다.
 * 이미지는 WebP/PNG data URL 80,000자 이하만 받는다. 실패하면 이유를 돌려주고 기존 설정은 그대로다.
 */
export function saveTutorPersona(input: TutorPersonaInput): SaveTutorPersonaResult {
  const name = normalizePersonaName(input.name);
  if (name === null) return { ok: false, reason: "invalid_name" };
  const role = normalizePersonaRole(input.role);
  if (role === null) return { ok: false, reason: "invalid_role" };
  const tone = normalizePersonaTone(input.tone);
  if (tone === null) return { ok: false, reason: "invalid_tone" };
  const customPersonality = normalizePersonaPersonality(input.customPersonality);
  if (customPersonality === null) return { ok: false, reason: "invalid_personality" };
  if (!isPersonaPreset(input.preset) || !isResponseLength(input.responseLength)) return { ok: false, reason: "invalid_preset" };
  if (input.avatar !== undefined && !isTutorAvatar(input.avatar)) return { ok: false, reason: "invalid_image" };
  const persona: TutorPersona = {
    name,
    ...(input.avatar ? { avatar: input.avatar } : {}),
    ...(role ? { role } : {}),
    ...(tone ? { tone } : {}),
    preset: input.preset,
    ...(customPersonality ? { customPersonality } : {}),
    responseLength: input.responseLength,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LEARNHUB_STORAGE_KEYS.TUTOR_PERSONA, JSON.stringify(persona));
  } catch (error) {
    console.error("Failed to save tutor persona:", error);
    return { ok: false, reason: "storage" };
  }
  notifyLearningDataChanged();
  return { ok: true, persona };
}

/**
 * "기본값으로 되돌리기". 키를 지우지 않고 지금 시각의 기본 설정을 저장한다.
 * 그래야 다른 기기의 예전 설정이 동기화 때 되살아나지 않는다.
 */
export function resetTutorPersona(): TutorPersona | null {
  const { name, preset, responseLength } = DEFAULT_TUTOR_PERSONA;
  const result = saveTutorPersona({ name, preset, responseLength });
  return result.ok ? result.persona : null;
}

/** 대화 요청 본문의 `persona`에 실을 값(이미지 제외). */
export function getTutorPersonaRequest(): TutorPersonaRequest {
  return toPersonaRequest(getTutorPersona());
}

let snapshot: { raw: string | null; persona: TutorPersona } | null = null;

const readRaw = (): string | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(LEARNHUB_STORAGE_KEYS.TUTOR_PERSONA);
  } catch {
    return null;
  }
};

/**
 * 화면용 스냅샷. 저장된 문자열이 그대로면 같은 객체를 돌려줘서
 * 대화 메시지마다 프로필을 그려도 다시 파싱하지 않는다(`useSyncExternalStore`용).
 */
export function getTutorPersonaSnapshot(): TutorPersona {
  const raw = readRaw();
  if (snapshot && snapshot.raw === raw) return snapshot.persona;
  snapshot = { raw, persona: getTutorPersona() };
  return snapshot.persona;
}

/** 튜터 설정이 바뀌면(이 탭 저장·동기화 복원·다른 탭) 알려 준다. */
export function subscribeTutorPersona(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LEARNHUB_STORAGE_KEYS.TUTOR_PERSONA) listener();
  };
  window.addEventListener(LEARNHUB_DATA_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LEARNHUB_DATA_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
