export type TutorPersonaPreset = "kind_teacher" | "calm_coach" | "cheerful_friend" | "strict_trainer";
export type TutorResponseLength = "short" | "medium" | "long";

/** 기본 이미지(LearnHub 로고)는 `avatar`를 비워 두는 것으로 나타낸다. */
export type TutorAvatar =
  | { kind: "preset"; id: string }
  /** 256px WebP(또는 PNG)를 `data:image/webp;base64,...`로 담는다. 80,000자 이하. */
  | { kind: "image"; dataUrl: string };

/** 계정에 저장·동기화되는 튜터 설정. 말투와 성격만 바꾸며 학습 원칙·안전 지침보다 우선하지 않는다. */
export interface TutorPersona {
  name: string;
  avatar?: TutorAvatar;
  preset: TutorPersonaPreset;
  customPersonality?: string;
  responseLength: TutorResponseLength;
  updatedAt: string;
}

/** `saveTutorPersona` 입력. `updatedAt`은 저장소가 채운다. */
export type TutorPersonaInput = Omit<TutorPersona, "updatedAt">;

/** 대화 요청에 실어 보내는 값. 이미지는 서버로 보내지 않는다. */
export interface TutorPersonaRequest {
  name: string;
  preset: TutorPersonaPreset;
  customPersonality?: string;
  responseLength: TutorResponseLength;
}

export type SaveTutorPersonaFailure = "invalid_name" | "invalid_personality" | "invalid_preset" | "invalid_image" | "storage";
export type SaveTutorPersonaResult = { ok: true; persona: TutorPersona } | { ok: false; reason: SaveTutorPersonaFailure };
