/** 한국어 조사를 앞말의 받침에 맞춰 고르는 작은 도우미입니다. */

export type JosaPair = "을/를" | "이/가" | "은/는" | "와/과" | "으로/로" | "이에요/예요" | "이랑/랑";

const DIGIT_BATCHIM = new Set(["0", "1", "3", "6", "7", "8"]); // 영, 일, 삼, 육, 칠, 팔
const LETTER_BATCHIM = new Set(["l", "m", "n", "r"]); // 엘, 엠, 엔, 알

/** 끝에 붙은 따옴표·괄호·기호를 건너뛰고 마지막 글자를 찾습니다. */
const lastSignificantChar = (word: string): string => {
  const chars = [...word.trim()];
  while (chars.length > 0 && /[\s‘’“”"'`()[\]{}<>.,!?~·\-*_]/u.test(chars[chars.length - 1])) chars.pop();
  return chars[chars.length - 1] ?? "";
};

/** 받침 정보: "yes"(받침 있음) / "rieul"(ㄹ 받침) / "no" */
const finalConsonant = (word: string): "yes" | "rieul" | "no" => {
  const ch = lastSignificantChar(word);
  if (!ch) return "no";
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    if (jong === 0) return "no";
    return jong === 8 ? "rieul" : "yes";
  }
  if (/[0-9]/.test(ch)) return DIGIT_BATCHIM.has(ch) ? (ch === "1" || ch === "7" || ch === "8" ? "rieul" : "yes") : "no";
  if (/[a-z]/i.test(ch)) return LETTER_BATCHIM.has(ch.toLowerCase()) ? (ch.toLowerCase() === "l" || ch.toLowerCase() === "r" ? "rieul" : "yes") : "no";
  return "no";
};

export const hasBatchim = (word: string): boolean => finalConsonant(word) !== "no";

/** [받침 있을 때, 받침 없을 때] */
const FORMS: Record<JosaPair, [string, string]> = {
  "을/를": ["을", "를"],
  "이/가": ["이", "가"],
  "은/는": ["은", "는"],
  "와/과": ["과", "와"],
  "으로/로": ["으로", "로"],
  "이에요/예요": ["이에요", "예요"],
  "이랑/랑": ["이랑", "랑"],
};

/** 앞말에 맞는 조사만 돌려줍니다. 예: josa("낚시 안전 수칙", "을/를") → "을" */
export const josa = (word: string, pair: JosaPair): string => {
  const [withBatchim, without] = FORMS[pair];
  const state = finalConsonant(word);
  // ㄹ 받침 뒤의 "(으)로"는 받침이 없는 것처럼 "로"를 씁니다.
  if (pair === "으로/로") return state === "yes" ? withBatchim : without;
  return state === "no" ? without : withBatchim;
};

/** 앞말 + 조사. 예: withJosa("낚시", "을/를") → "낚시를" */
export const withJosa = (word: string, pair: JosaPair): string => `${word}${josa(word, pair)}`;

/** ‘이름’ + 조사. 예: quoted("수칙", "을/를") → "‘수칙’을" */
export const quoted = (word: string, pair?: JosaPair): string => `‘${word}’${pair ? josa(word, pair) : ""}`;
