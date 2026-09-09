import express, { type Request, type Response } from "express";
import path from "path";
import { randomUUID } from "node:crypto";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import dotenv from "dotenv";
import { compareAnswers } from "./src/utils/answerComparison";
import { validateCurriculumPayload, validateLessonPayload } from "./src/domain/contentValidation";
import { AiGateway, AiGatewayError } from "./server/aiGateway";
import { isAllowedLoopbackRequest } from "./server/aiPolicy";
import { configureSupabaseAuth, isAuthConfigured, verifyAccessToken } from "./server/auth";
import { configureSupabaseCloudStore, createContentReport, getLearningSnapshot, putLearningSnapshot } from "./server/cloudStore";
import { getSupabasePublicConfig } from "./server/supabaseProvider";
import { getLearningSupport } from "./src/domain/learningSupport";
import { validateLearningBackup } from "./src/services/learningBackup";

dotenv.config();
dotenv.config({ path: ".env.supabase" });
configureSupabaseAuth();
configureSupabaseCloudStore();

export const app = express();
const configuredPort = Number(process.env.PORT);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65_535 ? configuredPort : 3000;
const LEARNING_TYPES = ["concept", "problem_solving", "memorization", "language", "practical"] as const;
const QUIZ_TYPES = ["multiple_choice", "short_answer"] as const;
const REPORT_CATEGORIES = ["wrong_answer", "inaccurate", "unclear", "rendering", "other"] as const;

app.disable("x-powered-by");
app.use((req, res, next) => {
  const isSnapshotPut = req.method === "PUT" && req.path === "/api/learning-snapshot";
  return express.json({ limit: isSnapshotPut ? "8mb" : "64kb" })(req, res, next);
});
app.use((req, res, next) => {
  const supplied = req.header("x-request-id") || "";
  const requestId = /^[A-Za-z0-9._:-]{1,80}$/.test(supplied) ? supplied : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

const aiGateway = new AiGateway({ apiKey: process.env.GEMINI_API_KEY });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));
const boundedString = (body: Record<string, unknown>, key: string, maxLength: number, required = true): string | null => {
  const value = body[key];
  if (value === undefined && !required) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
};
const optionalBoundedString = (body: Record<string, unknown>, key: string, maxLength: number) => body[key] === undefined || boundedString(body, key, maxLength, false) !== null;
const isAllowed = (value: unknown, allowed: readonly string[]) => typeof value === "string" && allowed.includes(value);
const invalidBody = (res: Response, message = "요청 형식이 올바르지 않습니다.") => res.status(400).json({ error: message, code: "INVALID_REQUEST" });
const clientKeyFor = (req: Request, res: Response) => res.locals.userId ? `user:${res.locals.userId}` : `ip:${req.socket.remoteAddress || "unknown"}`;
const isLoopbackRequest = (req: Request) => isAllowedLoopbackRequest({
  remoteAddress: req.socket.remoteAddress || "",
  host: req.headers.host || "",
  origin: req.header("origin") || undefined,
});
const bearerToken = (req: Request) => /^Bearer\s+([^\s]{1,4096})$/i.exec(req.header("authorization") || "")?.[1] || null;

app.get("/api/public-config", (_req, res) => {
  const config = getSupabasePublicConfig();
  if (!config) return res.status(503).json({ error: "공개 설정이 아직 준비되지 않았습니다.", code: "PUBLIC_CONFIG_NOT_CONFIGURED" });
  return res.json(config);
});

const requireAiAccess = async (req: Request, res: Response): Promise<boolean> => {
  // Allow non-production loopback requests (guest / trial demo mode)
  if (process.env.NODE_ENV !== "production" && isLoopbackRequest(req)) {
    const token = bearerToken(req);
    if (token) {
      const user = await verifyAccessToken(token).catch(() => null);
      if (user) res.locals.userId = user.id;
    }
    return true;
  }

  let configured = false;
  try { configured = isAuthConfigured(); } catch { configured = false; }
  if (!configured) {
    res.status(503).json({ error: "인증 설정이 필요합니다.", code: "AUTH_NOT_CONFIGURED" });
    return false;
  }
  const token = bearerToken(req);
  if (!token) { res.status(401).json({ error: "인증이 필요합니다.", code: "AUTH_REQUIRED" }); return false; }
  const user = await verifyAccessToken(token).catch(() => null);
  if (!user) { res.status(401).json({ error: "인증을 확인할 수 없습니다.", code: "AUTH_INVALID" }); return false; }
  res.locals.userId = user.id;
  return true;
};

const requireConfiguredUser = async (req: Request, res: Response): Promise<{ id: string; token: string } | null> => {
  let configured = false;
  try { configured = isAuthConfigured(); } catch { configured = false; }
  if (!configured) {
    res.status(503).json({ error: "인증 설정이 필요합니다.", code: "AUTH_NOT_CONFIGURED" });
    return null;
  }
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "인증이 필요합니다.", code: "AUTH_REQUIRED" });
    return null;
  }
  const user = await verifyAccessToken(token).catch(() => null);
  if (!user) {
    res.status(401).json({ error: "인증을 확인할 수 없습니다.", code: "AUTH_INVALID" });
    return null;
  }
  res.locals.userId = user.id;
  return { id: user.id, token };
};

const sendAiError = (res: Response, error: unknown) => {
  if (error instanceof AiGatewayError) {
    const messages: Record<string, string> = {
      AI_NOT_CONFIGURED: "AI 기능이 아직 설정되지 않았습니다.",
      AI_ADMISSION_REJECTED: "AI 요청이 많아 잠시 후 다시 시도해 주세요.",
      AI_INVALID_OUTPUT: "AI 응답을 확인할 수 없어 다시 시도해 주세요.",
      AI_INVALID_REQUEST: "AI 요청 형식을 확인해 주세요.",
      AI_UNAVAILABLE: "AI 기능을 잠시 사용할 수 없습니다.",
    };
    return res.status(error.httpStatus).json({ error: messages[error.code] || messages.AI_UNAVAILABLE, code: error.code });
  }
  return res.status(503).json({ error: "AI 기능을 잠시 사용할 수 없습니다.", code: "AI_UNAVAILABLE" });
};

type JsonConfig = Parameters<AiGateway["generateJson"]>[0]["config"];
const runAi = async <T>(req: Request, res: Response, endpoint: string, prompt: string, config: JsonConfig, maxOutputTokens: number, validate: (payload: unknown) => string[]) => {
  try {
    const result = await aiGateway.generateJson<T>({ endpoint, requestId: res.locals.requestId, clientKey: clientKeyFor(req, res), prompt, config, maxOutputTokens, validate });
    return res.json(result.payload);
  } catch (error) { return sendAiError(res, error); }
};

const curriculumSchema = {
  type: Type.OBJECT,
  properties: {
    courseTitle: { type: Type.STRING }, learningType: { type: Type.STRING }, learningTypeExplanation: { type: Type.STRING }, summary: { type: Type.STRING },
    chapters: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      title: { type: Type.STRING }, description: { type: Type.STRING }, lessons: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
        title: { type: Type.STRING }, description: { type: Type.STRING }, estimatedMinutes: { type: Type.INTEGER }, conceptId: { type: Type.STRING }, conceptName: { type: Type.STRING },
      }, required: ["title", "description", "estimatedMinutes", "conceptId", "conceptName"] } },
    }, required: ["title", "description", "lessons"] } },
  },
  required: ["courseTitle", "learningType", "learningTypeExplanation", "summary", "chapters"],
};
const lessonSchema = {
  type: Type.OBJECT, properties: {
    title: { type: Type.STRING }, steps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      type: { type: Type.STRING }, title: { type: Type.STRING }, content: { type: Type.STRING }, codeSnippet: { type: Type.STRING }, audioScript: { type: Type.STRING },
      quiz: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, quizType: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, answer: { type: Type.STRING }, explanation: { type: Type.STRING }, conceptId: { type: Type.STRING }, hints: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["question", "quizType", "answer", "explanation", "hints"] },
    }, required: ["type", "title", "content"] } },
  }, required: ["title", "steps"],
};
const evaluationSchema = { type: Type.OBJECT, properties: { isCorrect: { type: Type.BOOLEAN }, feedback: { type: Type.STRING }, hint: { type: Type.STRING }, misconceptionTag: { type: Type.STRING }, explanation: { type: Type.STRING }, status: { type: Type.STRING } }, required: ["isCorrect", "feedback"] };
const tutorSchema = { type: Type.OBJECT, properties: { reply: { type: Type.STRING }, suggestionChips: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["reply", "suggestionChips"] };
const reviewSchema = { type: Type.OBJECT, properties: { reviewSessionTitle: { type: Type.STRING }, estimatedMinutes: { type: Type.INTEGER }, questions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { conceptId: { type: Type.STRING }, conceptName: { type: Type.STRING }, courseTitle: { type: Type.STRING }, question: { type: Type.STRING }, quizType: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, answer: { type: Type.STRING }, explanation: { type: Type.STRING } }, required: ["conceptName", "courseTitle", "question", "quizType", "answer", "explanation"] } } }, required: ["reviewSessionTitle", "estimatedMinutes", "questions"] };

const validateReviewPayload = (payload: unknown): string[] => {
  if (!isRecord(payload) || boundedString(payload, "reviewSessionTitle", 200) === null || typeof payload.estimatedMinutes !== "number" || !Number.isFinite(payload.estimatedMinutes) || payload.estimatedMinutes <= 0 || !Array.isArray(payload.questions) || payload.questions.length < 1 || payload.questions.length > 5) return ["복습 응답이 올바르지 않습니다."];
  return payload.questions.flatMap((question) => {
    if (!isRecord(question)) return ["복습 문항 형식이 올바르지 않습니다."];
    const errors = ["conceptName", "courseTitle", "question", "answer", "explanation"].filter((key) => boundedString(question, key, 400) === null);
    if (!isAllowed(question.quizType, QUIZ_TYPES)) errors.push("quizType");
    if (question.quizType === "multiple_choice") {
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some((option) => typeof option !== "string" || !option.trim())) errors.push("options");
      else {
        const options = question.options.map((option) => (option as string).trim());
        const answer = typeof question.answer === "string" ? question.answer.trim() : "";
        if (new Set(options).size !== options.length || !answer || !options.includes(answer)) errors.push("options");
      }
    }
    return errors;
  });
};

app.post("/api/ai/analyze-subject", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["subject", "level", "goal", "dailyMinutes", "learningStyle"]) || boundedString(body, "subject", 160) === null || !optionalBoundedString(body, "level", 40) || !optionalBoundedString(body, "goal", 500) || !optionalBoundedString(body, "learningStyle", 80) || (body.dailyMinutes !== undefined && (typeof body.dailyMinutes !== "number" || !Number.isFinite(body.dailyMinutes) || body.dailyMinutes < 1 || body.dailyMinutes > 240)) || (body.level !== undefined && !isAllowed(body.level, ["beginner", "intermediate", "advanced"]))) return invalidBody(res, "과목과 학습 설정을 확인해 주세요.");
  const prompt = `여러 분야를 배우는 성인을 위한 AI 학습 설계자입니다. 주제: "${body.subject}" 수준: "${body.level || "beginner"}" 목표: "${body.goal || "기초 습득"}" 일일 시간: "${body.dailyMinutes || 15}분". learningType은 concept, problem_solving, memorization, language, practical 중 하나를 선택하고 3~4개 챕터와 각 2~3개 레슨, 레슨별 conceptId·conceptName을 생성하세요. 지정된 JSON만 반환하세요.`;
  return runAi(req, res, "analyze-subject", prompt, { responseMimeType: "application/json", responseSchema: curriculumSchema }, 2600, validateCurriculumPayload);
});

app.post("/api/ai/generate-lesson", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  const fields = ["courseTitle", "chapterTitle", "lessonTitle", "learningType", "level", "conceptId", "conceptName"];
  if (!isRecord(body) || !hasOnlyKeys(body, fields) || fields.some((key) => boundedString(body, key, key === "courseTitle" || key === "lessonTitle" ? 200 : 120) === null) || !isAllowed(body.learningType, LEARNING_TYPES)) return invalidBody(res, "레슨 생성 설정을 확인해 주세요.");
  const learningType = body.learningType as Parameters<typeof getLearningSupport>[0];
  const support = getLearningSupport(learningType);
  const guidance = `지원 방식: ${support.supported.slice(0, 2).join("; ")}. 성공 기준: ${support.successCriteria.slice(0, 2).join("; ")}.`;
  const typeGuidance = learningType === "practical"
    ? "실용형은 사진·디자인·도구 작업도 포함할 수 있으며 코드에 한정하지 마세요. 실행·파일 생성·외부 도구 검증은 하지 않는다고 명시하세요."
    : learningType === "language"
      ? "언어형의 audioScript는 선택 사항이며 텍스트 학습을 우선하세요."
      : "";
  const prompt = `성인 학습자를 위한 수업을 생성하세요. 과목: "${body.courseTitle}" 챕터: "${body.chapterTitle}" 수업: "${body.lessonTitle}" 유형: "${body.learningType}" 수준: "${body.level}" 개념: "${body.conceptName}" (${body.conceptId}). ${guidance} ${typeGuidance} 4~6개 단계로 개념, 예제, 확인 문제 또는 연습, 요약을 포함하고 지정된 JSON만 반환하세요. type이 quiz인 단계는 quiz 객체에 질문·유형·정답·해설·hints를 반드시 포함하세요.`;
  return runAi(req, res, "generate-lesson", prompt, { responseMimeType: "application/json", responseSchema: lessonSchema }, 2600, (payload) => {
    const errors = validateLessonPayload(payload, learningType);
    if (!isRecord(payload) || !Array.isArray(payload.steps)) return errors;
    payload.steps.forEach((step, index) => {
      if (isRecord(step) && step.type === "quiz" && !isRecord(step.quiz)) errors.push(`단계 ${index + 1} 퀴즈 내용이 필요합니다.`);
    });
    return errors;
  });
});

app.post("/api/ai/evaluate-quiz", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["conceptName", "question", "userAnswer", "expectedAnswer", "quizType"]) || ["conceptName", "question", "userAnswer", "expectedAnswer"].some((key) => boundedString(body, key, 400) === null) || !isAllowed(body.quizType, QUIZ_TYPES)) return invalidBody(res, "퀴즈 답안을 확인해 주세요.");
  const normalizeChoice = (value: string) => value.normalize("NFC").replace(/[\uFF01-\uFF5E]/gu, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0)).replace(/\u3000/gu, " ").replace(/\u2212/g, "-").replace(/\s+/gu, " ").trim();
  const comparison = body.quizType === "multiple_choice" ? (normalizeChoice(body.userAnswer as string) === normalizeChoice(body.expectedAnswer as string) ? "correct" : "incorrect") : compareAnswers(body.userAnswer as string, body.expectedAnswer as string);
  if (comparison !== "unknown") return res.json({ status: "scored", isCorrect: comparison === "correct", feedback: comparison === "correct" ? "정답입니다. 핵심 원리를 올바르게 적용했습니다." : "제출한 답을 다시 확인해 보세요. 힌트를 활용해 한 번 더 시도할 수 있습니다." });
  const prompt = `엄밀하고 친절한 학습 채점관입니다. 개념: "${body.conceptName}" 질문: "${body.question}" 정답 기준: "${body.expectedAnswer}" 제출 답안: "${body.userAnswer}" 유형: "${body.quizType}". 확실하지 않으면 status를 unknown으로 반환하고 오답으로 단정하지 마세요. JSON만 반환하세요.`;
  try {
    const result = await aiGateway.generateJson<Record<string, unknown>>({ endpoint: "evaluate-quiz", requestId: res.locals.requestId, clientKey: clientKeyFor(req, res), prompt, config: { responseMimeType: "application/json", responseSchema: evaluationSchema }, maxOutputTokens: 700, validate: (payload) => isRecord(payload) && typeof payload.isCorrect === "boolean" && typeof payload.feedback === "string" ? [] : ["invalid"] });
    const data = result.payload;
    if (data.status === "unknown") return res.json({ status: "unknown", isCorrect: null, feedback: "답안을 확실히 판정하기 어려워 오답으로 기록하지 않았습니다. 다른 표현으로 다시 제출해 보세요.", hint: typeof data.hint === "string" ? data.hint : undefined });
    return res.json({ ...data, status: "scored" });
  } catch (error) { return sendAiError(res, error); }
});

app.post("/api/ai/tutor-chat", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  const fields = ["courseTitle", "lessonTitle", "currentStepContent", "userQuestion", "conceptName", "history"];
  if (!isRecord(body) || !hasOnlyKeys(body, fields) || ["courseTitle", "lessonTitle", "currentStepContent", "userQuestion", "conceptName"].some((key) => boundedString(body, key, key === "currentStepContent" ? 8_000 : 400) === null) || (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 12 || body.history.some((item) => !isRecord(item) || !isAllowed(item.role, ["user", "assistant"]) || boundedString(item, "text", 900) === null)))) return invalidBody(res, "튜터 질문과 레슨 맥락을 확인해 주세요.");
  const history = Array.isArray(body.history) ? body.history.map((item) => `${item.role === "user" ? "학습자" : "튜터"}: ${item.text}`).join("\n").slice(0, 6_000) : "이전 대화 없음";
  const prompt = `친절한 AI 튜터입니다. 과목: "${body.courseTitle}" 수업: "${body.lessonTitle}" 개념: "${body.conceptName}" 현재 내용: "${body.currentStepContent}" 이전 대화:\n${history}\n질문: "${body.userQuestion}". 단계별 힌트와 쉬운 비유를 사용하고 후속 추천 질문 2~3개를 JSON으로 반환하세요.`;
  return runAi(req, res, "tutor-chat", prompt, { responseMimeType: "application/json", responseSchema: tutorSchema }, 900, (payload) => isRecord(payload) && typeof payload.reply === "string" && Array.isArray(payload.suggestionChips) && payload.suggestionChips.length <= 3 && payload.suggestionChips.every((item) => typeof item === "string") ? [] : ["invalid"]);
});

app.post("/api/ai/generate-review", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["weakConcepts"]) || !Array.isArray(body.weakConcepts) || body.weakConcepts.length < 1 || body.weakConcepts.length > 20 || body.weakConcepts.some((item) => !isRecord(item) || boundedString(item, "conceptName", 200) === null || boundedString(item, "courseTitle", 200) === null || typeof item.understanding !== "number" || !Number.isFinite(item.understanding) || item.understanding < 0 || item.understanding > 100)) return invalidBody(res, "복습 대상 개념을 확인해 주세요.");
  const prompt = `성인 학습자를 위한 복습 기획자입니다. 취약 개념:\n${JSON.stringify(body.weakConcepts)}\n3~5개의 짧은 복습 퀴즈를 생성하고 JSON만 반환하세요.`;
  return runAi(req, res, "generate-review", prompt, { responseMimeType: "application/json", responseSchema: reviewSchema }, 1800, validateReviewPayload);
});

app.get("/api/learning-snapshot", async (req, res) => {
  const auth = await requireConfiguredUser(req, res);
  if (!auth) return;
  try {
    const snapshot = await getLearningSnapshot(auth.id, auth.token);
    if (!snapshot) return res.status(404).json({ error: "학습 스냅샷이 없습니다.", code: "SNAPSHOT_NOT_FOUND" });
    return res.json(snapshot);
  } catch {
    return res.status(503).json({ error: "학습 스냅샷을 읽지 못했습니다.", code: "SNAPSHOT_UNAVAILABLE" });
  }
});

app.put("/api/learning-snapshot", async (req, res) => {
  const auth = await requireConfiguredUser(req, res);
  if (!auth) return;
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["snapshot", "expectedRevision"]) || body.snapshot === undefined ||
    !(body.expectedRevision === null || (typeof body.expectedRevision === "number" && Number.isInteger(body.expectedRevision) && body.expectedRevision >= 0))) {
    return invalidBody(res, "학습 스냅샷 요청 형식이 올바르지 않습니다.");
  }
  let serializedSnapshot = "";
  try { serializedSnapshot = JSON.stringify(body.snapshot); } catch { return invalidBody(res, "학습 스냅샷을 읽을 수 없습니다."); }
  if (Buffer.byteLength(serializedSnapshot, "utf8") > 8_000_000) return res.status(413).json({ error: "학습 스냅샷이 너무 큽니다.", code: "SNAPSHOT_TOO_LARGE" });
  const validation = validateLearningBackup(body.snapshot);
  if (!validation.ok) return res.status(400).json({ error: "학습 스냅샷 검증에 실패했습니다.", code: "INVALID_SNAPSHOT", details: validation.errors.slice(0, 10) });
  const expectedRevision: number | null = body.expectedRevision === null ? null : body.expectedRevision as number;
  try {
    const result = await putLearningSnapshot(auth.id, validation.value, expectedRevision, auth.token);
    return res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Learning snapshot conflict") return res.status(409).json({ error: "학습 스냅샷이 다른 기기에서 변경되었습니다.", code: "SNAPSHOT_CONFLICT" });
    return res.status(503).json({ error: "학습 스냅샷을 저장하지 못했습니다.", code: "SNAPSHOT_UNAVAILABLE" });
  }
});

app.post("/api/content-reports", async (req, res) => {
  let configured = false;
  try { configured = isAuthConfigured(); } catch { configured = false; }
  if (!configured) return res.status(503).json({ error: "콘텐츠 신고 저장이 아직 설정되지 않았습니다.", code: "REPORTING_NOT_CONFIGURED" });
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "콘텐츠 신고에는 로그인이 필요합니다.", code: "AUTH_REQUIRED" });
  const user = await verifyAccessToken(token).catch(() => null);
  if (!user) return res.status(401).json({ error: "인증을 확인할 수 없습니다.", code: "AUTH_INVALID" });
  res.locals.userId = user.id;
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["category", "description", "courseId", "lessonId", "stepId"]) || !isAllowed(body.category, REPORT_CATEGORIES) || boundedString(body, "description", 4_000) === null || !optionalBoundedString(body, "courseId", 160) || !optionalBoundedString(body, "lessonId", 160) || !optionalBoundedString(body, "stepId", 160)) return invalidBody(res, "콘텐츠 신고 내용을 확인해 주세요.");
  try {
    const result = await createContentReport(user.id, { category: body.category as (typeof REPORT_CATEGORIES)[number], description: body.description as string, ...(typeof body.courseId === "string" ? { courseId: body.courseId } : {}), ...(typeof body.lessonId === "string" ? { lessonId: body.lessonId } : {}), ...(typeof body.stepId === "string" ? { stepId: body.stepId } : {}) }, token);
    return res.status(201).json(result);
  } catch { return res.status(503).json({ error: "콘텐츠 신고를 저장하지 못했습니다.", code: "REPORTING_UNAVAILABLE" }); }
});

app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  if (isRecord(error) && error.type === "entity.too.large") return res.status(413).json({ error: "요청이 너무 큽니다.", code: "REQUEST_TOO_LARGE" });
  return res.status(500).json({ error: "서버 오류가 발생했습니다.", code: "INTERNAL_ERROR" });
});

export async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://0.0.0.0:${PORT}`));
}

if (process.env.NODE_ENV !== "test") void startServer();
