/** Choose particles outside closing quotes. Unclear pronunciations use "개념". */
export function withKoreanParticle(name: string, pair: "을/를" | "과/와"): string {
  const label = name.trim();
  const word = label.normalize("NFC").replace(/[\s\p{P}]+$/gu, "");
  const last = word.at(-1) || "";
  const code = last.charCodeAt(0);
  let hasBatchim: boolean;
  if (code >= 0xac00 && code <= 0xd7a3) hasBatchim = (code - 0xac00) % 28 !== 0;
  else if (/^[0-9]$/u.test(last)) hasBatchim = "013678".includes(last);
  else return `${label} 개념${pair.split("/")[0]}`;
  return `${label}${pair.split("/")[hasBatchim ? 0 : 1]}`;
}
