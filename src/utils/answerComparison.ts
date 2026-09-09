export type AnswerComparison = "correct" | "incorrect" | "unknown";

const normalizeAnswer = (value: string): string =>
  value
    .normalize("NFC")
    .replace(/[\uFF01-\uFF5E]/gu, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0)
    )
    .replace(/\u3000/gu, " ")
    .replace(/\u2212/g, "-")
    .replace(/\s+/gu, " ")
    .trim();

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/u;
const FRACTION_PATTERN = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/u;
const MAX_NUMERIC_DIGITS = 100;

interface Rational {
  numerator: bigint;
  denominator: bigint;
}

const parseSafeDecimal = (value: string): Rational | null => {
  const match = value.match(DECIMAL_PATTERN);
  if (!match) return null;

  const sign = match[1] === "-" ? "-" : "";
  const integerPart = match[2] || "0";
  const fractionPart = match[3] ?? match[4] ?? "";
  const digits = `${integerPart}${fractionPart}`;
  if (digits.length > MAX_NUMERIC_DIGITS) return null;

  return {
    numerator: BigInt(`${sign}${digits}`),
    denominator: 10n ** BigInt(fractionPart.length),
  };
};

const parseSafeFraction = (value: string): Rational | null => {
  const match = value.match(FRACTION_PATTERN);
  if (!match) return null;

  const numeratorText = match[1];
  const denominatorText = match[2];
  if (numeratorText.replace(/^[+-]/u, "").length > MAX_NUMERIC_DIGITS || denominatorText.replace(/^[+-]/u, "").length > MAX_NUMERIC_DIGITS) return null;

  try {
    const numerator = BigInt(numeratorText);
    const denominator = BigInt(denominatorText);
    if (denominator === 0n) return null;
    return denominator < 0n
      ? { numerator: -numerator, denominator: -denominator }
      : { numerator, denominator };
  } catch {
    return null;
  }
};

const parseFiniteNumericAnswer = (value: string): Rational | null =>
  parseSafeDecimal(value) ?? parseSafeFraction(value);

/**
 * Compare quiz answers without evaluating arbitrary expressions.
 * Non-numeric symbolic mismatches remain unknown so callers do not record an
 * uncertain answer as an incorrect learning signal.
 */
export const compareAnswers = (actual: string, expected: string): AnswerComparison => {
  const normalizedActual = normalizeAnswer(actual);
  const normalizedExpected = normalizeAnswer(expected);

  if (!normalizedActual || !normalizedExpected) return "unknown";
  if (normalizedActual === normalizedExpected) return "correct";

  const actualNumber = parseFiniteNumericAnswer(normalizedActual);
  const expectedNumber = parseFiniteNumericAnswer(normalizedExpected);
  if (actualNumber === null || expectedNumber === null) return "unknown";

  return actualNumber.numerator * expectedNumber.denominator ===
    expectedNumber.numerator * actualNumber.denominator
    ? "correct"
    : "incorrect";
};
