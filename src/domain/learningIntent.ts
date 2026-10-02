import type { LearningIntent } from "../types/chat";

/**
 * AI 호출 없이 짧은 입력이 "새 주제를 배우고 싶다"는 뜻인지 판별한다.
 * 비로그인 첫 메시지(미리보기 한도가 IP당 3회)에서 비용 없이 쓰려고 규칙으로 만들었다.
 * 질문("낚시가 뭐야?")이나 막연한 말("뭔가 배우고 싶어")은 null이며, 이때는 일반 대화로 이어진다.
 */
const MAX_INPUT_LENGTH = 200;
const MAX_SUBJECT_LENGTH = 80;
const MAX_RESOLVED_SUBJECT_LENGTH = 160;

const ENDINGS = /(?:을|를)?\s*(?:좀\s*)?(?:처음부터\s*|제대로\s*|체계적으로\s*|차근차근\s*|천천히\s*|기초부터\s*)?(?:배우고\s*싶|배워\s*보고\s*싶|배워보고\s*싶|배워\s*볼래|배워볼래|배워\s*보려|배우려|배우려고|배울래|공부하고\s*싶|공부해\s*보고\s*싶|공부해보고\s*싶|공부해\s*볼래|공부해볼래|공부하려|공부할래|익히고\s*싶|익혀\s*보고\s*싶|알아보고\s*싶|알고\s*싶|궁금(?:해|하)|가르쳐\s*줘|가르쳐\s*주세요|가르쳐줘|알려\s*줘\s*처음부터)/u;
const NEGATED = /(?:배우고|공부하고|배우려고|공부하려고)\s*싶(?:지|진)\s*(?:않|안)|(?:배우기|공부하기)\s*(?:싫|귀찮)/u;
const VAGUE = new Set(["뭔가", "무언가", "무엇", "뭐", "뭐든", "아무거나", "이거", "그거", "저거", "이것", "그것", "저것", "새로운", "새로운것", "새로운거", "다", "것", "거", "좀", "나", "내가", "저", "제가", "요즘", "이제", "다시", "한번", "한번쯤"]);

const stripLead = (value: string): string =>
  value
    .replace(/^(?:나는|난|저는|전|내가|제가|나도|저도|요즘|이제|이번에|갑자기|혹시|그럼|그러면|근데|그런데|음+|어+)\s+/u, "")
    .replace(/^(?:나는|난|저는|전|내가|제가)\s+/u, "");

const stripTail = (value: string): string =>
  value
    .replace(/\s*(?:에\s*대해서?|에\s*대하여|에\s*관해서?|와\s*관련해서?)\s*$/u, "")
    .replace(/[\s,.!?~…]+$/u, "")
    .trim();

/** 서버가 요청 문장 전체를 주제로 돌려줘도 학습할 주제만 남긴다. */
function normalizeSubject(rawSubject: string): string {
  let subject = stripLead(rawSubject.normalize("NFC").replace(/\s+/gu, " ").trim());
  const withoutRequest = subject.replace(/\s*(?:(?:에\s*대해서?|에\s*대하여|에\s*관해서?|와\s*관련해서?)\s*)?(?:알아보고\s*싶|알고\s*싶|궁금(?:해|하)|배우고\s*싶|배워\s*(?:보고\s*)?싶|공부하고\s*싶|공부해\s*(?:보고\s*)?싶|익히고\s*싶)[\s\S]*$/u, "");
  subject = withoutRequest === subject
    ? subject
    : withoutRequest.replace(/\s*(?:좀|잘)\s*$/u, "").replace(/\s*(?:을|를|은|는|이|가)\s*$/u, "");
  return stripTail(subject);
}

const ENGLISH = /^(?:i\s+(?:want|would like|wanna)\s+to\s+(?:learn|study)|teach\s+me|help\s+me\s+learn|i(?:'|’)?d\s+like\s+to\s+learn)\s+(?:about\s+|how\s+to\s+)?(.+?)[\s.!]*$/iu;

export function detectLearningIntent(input: string): LearningIntent | null {
  const text = input.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!text || text.length > MAX_INPUT_LENGTH || NEGATED.test(text)) return null;

  const english = ENGLISH.exec(text);
  if (english) return toIntent(english[1]);

  const match = ENDINGS.exec(text);
  if (!match || match.index === undefined) return null;
  // 끝맺음 뒤에 이어지는 말이 길면 (예: "…배우고 싶은데 어떻게 시작해요?") 주제는 앞부분이다.
  return toIntent(stripLead(text.slice(0, match.index)));
}

function toIntent(rawSubject: string): LearningIntent | null {
  const subject = normalizeSubject(rawSubject);
  if (!subject || subject.length > MAX_SUBJECT_LENGTH) return null;
  const words = subject.split(" ").filter(Boolean);
  if (words.every((word) => VAGUE.has(word.replace(/[을를은는이가도]$/u, "")) || VAGUE.has(word))) return null;
  if (/[?？]/u.test(subject)) return null;
  return { subject };
}

/** 서버 응답의 learningIntent를 우선하고, 없으면 규칙으로 보완한다. */
export function resolveLearningIntent(question: string, fromServer?: unknown): LearningIntent | null {
  if (fromServer && typeof fromServer === "object" && !Array.isArray(fromServer)) {
    const subject = (fromServer as Record<string, unknown>).subject;
    if (typeof subject === "string" && subject.trim() && subject.length <= MAX_RESOLVED_SUBJECT_LENGTH) {
      const normalized = normalizeSubject(subject);
      if (normalized && normalized.length <= MAX_RESOLVED_SUBJECT_LENGTH && !/[?？]/u.test(normalized)) return { subject: normalized };
    }
  }
  return detectLearningIntent(question);
}
