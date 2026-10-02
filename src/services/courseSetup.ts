import { authorizedFetch } from "./authClient";
import { getTutorPersonaRequest } from "./tutorPersonaStore";
import { defaultsForStep, interpretSetupAnswerLocally, pickSetupFields } from "../domain/courseSetup";
import type { CourseSetup, SetupAnswerResult, SetupStepId } from "../types/courseSetup";

const QUESTION_TIMEOUT_MS = 8_000;

/**
 * 자유 답을 설정 값으로 바꾼다. 규칙으로 풀리면 AI를 부르지 않는다.
 * 비로그인은 AI를 부르지 않고, AI가 실패해도 예외 없이 기본값(목적은 사용자가 쓴 문장)으로 돌아간다.
 * 확인 질문(levelCheck) 답은 로그인 사용자만 AI로 해석한다.
 */
export async function resolveSetupAnswer(
  stepId: SetupStepId,
  answer: string,
  context: { subject: string; signedIn: boolean; question?: string; experience?: CourseSetup["experience"] },
): Promise<SetupAnswerResult> {
  const text = answer.trim();
  if (stepId !== "levelCheck") {
    const local = interpretSetupAnswerLocally(stepId, text);
    if (local.matched) return { setup: local.setup, matched: true, source: "local" };
  }
  const fallback: SetupAnswerResult = {
    setup: stepId === "goal" ? interpretSetupAnswerLocally("goal", text).setup : stepId === "levelCheck" ? pickSetupFields("levelCheck", { levelEvidence: text }) : defaultsForStep(stepId),
    matched: false,
    source: "fallback",
  };
  if (!context.signedIn || !text) return fallback;
  try {
    const response = await authorizedFetch("/api/ai/interpret-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId, subject: context.subject.slice(0, 160), answer: text.slice(0, 400), ...(context.question ? { question: context.question.slice(0, 300) } : {}), ...(context.experience ? { experience: context.experience } : {}), persona: getTutorPersonaRequest() }),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { setup?: unknown; fallback?: unknown };
    const setup = pickSetupFields(stepId, data.setup);
    if (data.fallback === true || Object.keys(setup).length === 0) return fallback;
    return { setup, matched: true, source: "ai" };
  } catch {
    return fallback;
  }
}

/** 수준 확인 질문 한 개. 로그인 사용자만 부르며, 실패하거나 오래 걸리면 null이라 화면이 이 단계를 건너뛴다. */
export async function fetchLevelCheckQuestion(subject: string, experience: "some" | "experienced"): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUESTION_TIMEOUT_MS);
  try {
    const response = await authorizedFetch("/api/ai/setup-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subject.slice(0, 160), experience, persona: getTutorPersonaRequest() }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { question?: unknown };
    return typeof data.question === "string" && data.question.trim() && data.question.length <= 150 ? data.question.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
