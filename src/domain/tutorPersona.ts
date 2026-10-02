import type {
  TutorAvatar,
  TutorPersona,
  TutorPersonaPreset,
  TutorPersonaRequest,
  TutorResponseLength,
} from "../types/tutorPersona";

export const PERSONA_LIMITS = { nameLength: 20, personalityLength: 300, imageDataUrlLength: 80_000 } as const;

export const DEFAULT_TUTOR_NAME = "LearnHub 튜터";
/** 저장된 적 없는 기본 설정의 시각. 어느 기기에서 저장한 설정이든 이보다 늦다. */
export const DEFAULT_PERSONA_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export const DEFAULT_TUTOR_PERSONA: TutorPersona = {
  name: DEFAULT_TUTOR_NAME,
  preset: "kind_teacher",
  responseLength: "medium",
  updatedAt: DEFAULT_PERSONA_TIMESTAMP,
};

export interface PersonaPresetInfo {
  id: TutorPersonaPreset;
  label: string;
  description: string;
  /** 편집 창 미리보기에 쓰는 고정 예시 문장. AI를 부르지 않는다. */
  example: string;
}

export const PERSONA_PRESETS: readonly PersonaPresetInfo[] = [
  { id: "kind_teacher", label: "다정한 선생님", description: "따뜻하게 격려하며 차근차근 알려 줘요", example: "좋은 질문이에요! 천천히 같이 살펴볼까요? 먼저 쉬운 말로 설명해 드릴게요." },
  { id: "calm_coach", label: "차분한 코치", description: "침착하게 핵심부터 짚어 줘요", example: "핵심부터 정리할게요. 이 개념은 두 가지만 기억하면 충분합니다." },
  { id: "cheerful_friend", label: "유쾌한 친구", description: "편안하고 가볍게 이야기하듯 설명해요", example: "오, 이거 궁금했구나! 같이 파헤쳐 보자요. 생각보다 어렵지 않아요." },
  { id: "strict_trainer", label: "엄격한 트레이너", description: "군더더기 없이 분명하게 이끌어 줘요", example: "집중하세요. 정의를 한 줄로 말해 보고, 바로 예시로 확인합니다." },
];

export const RESPONSE_LENGTH_LABELS: Record<TutorResponseLength, string> = { short: "짧게", medium: "보통", long: "자세히" };

export const TUTOR_AVATAR_PRESET_IDS = ["owl", "fox", "cat", "leaf", "star", "bulb"] as const;

export const isPersonaPreset = (value: unknown): value is TutorPersonaPreset =>
  PERSONA_PRESETS.some((preset) => preset.id === value);
export const isResponseLength = (value: unknown): value is TutorResponseLength =>
  value === "short" || value === "medium" || value === "long";

const IMAGE_DATA_URL = /^data:image\/(webp|png);base64,([A-Za-z0-9+/]+={0,2})$/u;
/** 파일 머리의 base64 시그니처: WebP는 "RIFF", PNG는 \x89PNG. 종류만 속인 문자열을 거른다. */
const IMAGE_SIGNATURE: Record<string, string> = { webp: "UklGR", png: "iVBORw0KGgo" };

export function isTutorImageDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > PERSONA_LIMITS.imageDataUrlLength) return false;
  const match = IMAGE_DATA_URL.exec(value);
  return match !== null && match[2].startsWith(IMAGE_SIGNATURE[match[1]]);
}

export function isTutorAvatar(value: unknown): value is TutorAvatar {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const avatar = value as Record<string, unknown>;
  if (avatar.kind === "preset") return Object.keys(avatar).every((key) => key === "kind" || key === "id") && (TUTOR_AVATAR_PRESET_IDS as readonly unknown[]).includes(avatar.id);
  if (avatar.kind === "image") return Object.keys(avatar).every((key) => key === "kind" || key === "dataUrl") && isTutorImageDataUrl(avatar.dataUrl);
  return false;
}

/**
 * 이름·성격 설명에 넣을 수 없는 내용: 제어 문자, 링크·이메일·전화번호, 지시를 덮어쓰려는 표현, 심한 욕설·노골적인 표현.
 * 완전한 필터가 아니라 1차 거름망이다. 서버는 어떤 값이 와도 말투 참고 자료로만 쓰고 학습·안전 원칙을 항상 앞세운다.
 */
const INJECTION = /(?:ignore|disregard|forget|override|bypass)\s*(?:all\s*|any\s*|the\s*|your\s*)?(?:previous|prior|above|earlier|system|safety)|system\s*prompt|developer\s*message|jailbreak|(?:이전|위|앞선|기존|모든)\s*(?:의\s*)?(?:지시|명령|규칙|지침|프롬프트)|(?:지시|명령|규칙|지침|안전\s*수칙|안전\s*원칙)(?:을|를)?\s*(?:무시|어기|따르지|지우|덮어|우회)|시스템\s*(?:프롬프트|메시지|지시)|탈옥|프롬프트\s*(?:를|을)?\s*(?:알려|공개|출력)/iu;
const CONTACT = /https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\d{2,4}[-\s.]?\d{3,4}[-\s.]?\d{4}/iu;
const BAD_WORDS = ["씨발", "시발", "씹", "병신", "지랄", "좆", "존나", "개새끼", "새끼야", "꺼져", "미친놈", "미친년", "섹스", "야동", "포르노", "성관계", "자살", "자해", "죽여", "죽이", "fuck", "shit", "bitch", "porn", "nigger", "slut", "suicide"];

export function isAllowedPersonaText(value: string): boolean {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/u.test(value)) return false;
  const text = value.normalize("NFKC");
  if (INJECTION.test(text) || CONTACT.test(text)) return false;
  const compact = text.toLowerCase().replace(/[\s\-_.,!?~*·ㆍ'"“”‘’()[\]{}<>/\\|:;]+/gu, "");
  return !BAD_WORDS.some((word) => compact.includes(word));
}

const clean = (value: string): string => value.normalize("NFC").replace(/[\r\n\t]+/gu, " ").replace(/\s+/gu, " ").trim();

/** 이름: 공백 정리 후 1~20자이고 허용된 내용일 때만 값을, 아니면 null. */
export function normalizePersonaName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = clean(value);
  return name.length >= 1 && [...name].length <= PERSONA_LIMITS.nameLength && isAllowedPersonaText(name) ? name : null;
}

/** 성격 설명: 비어 있으면 undefined(없음), 300자 초과·부적절하면 null. */
export function normalizePersonaPersonality(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const text = value.normalize("NFC").replace(/\r\n?/gu, "\n").replace(/[ \t]+/gu, " ").trim();
  if (text === "") return undefined;
  return [...text].length <= PERSONA_LIMITS.personalityLength && isAllowedPersonaText(text) ? text : null;
}

/** 저장된 설정의 형식 검증(백업·동기화). 허용 내용 검사까지 통과해야 한다. */
export function isTutorPersona(value: unknown): value is TutorPersona {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const persona = value as Record<string, unknown>;
  if (!Object.keys(persona).every((key) => ["name", "avatar", "preset", "customPersonality", "responseLength", "updatedAt"].includes(key))) return false;
  return normalizePersonaName(persona.name) === persona.name &&
    (persona.avatar === undefined || isTutorAvatar(persona.avatar)) &&
    isPersonaPreset(persona.preset) &&
    (persona.customPersonality === undefined || (typeof persona.customPersonality === "string" && persona.customPersonality !== "" && normalizePersonaPersonality(persona.customPersonality) === persona.customPersonality)) &&
    isResponseLength(persona.responseLength) &&
    typeof persona.updatedAt === "string" && Number.isFinite(Date.parse(persona.updatedAt));
}

/** 서버로 보낼 값(이미지 제외). */
export function toPersonaRequest(persona: Pick<TutorPersona, "name" | "preset" | "customPersonality" | "responseLength">): TutorPersonaRequest {
  return { name: persona.name, preset: persona.preset, ...(persona.customPersonality ? { customPersonality: persona.customPersonality } : {}), responseLength: persona.responseLength };
}

/** 두 기기의 설정 중 더 늦게 저장한 쪽을 쓴다. */
export const newerPersona = (a: TutorPersona, b: TutorPersona): TutorPersona => (Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a);
