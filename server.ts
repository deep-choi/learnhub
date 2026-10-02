import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "path";
import { randomUUID } from "node:crypto";
import { Type } from "@google/genai";
import dotenv from "dotenv";
import { compareAnswers } from "./src/utils/answerComparison";
import { validateCurriculumPayload, validateLessonPayload } from "./src/domain/contentValidation";
import { AiGateway, AiGatewayError } from "./server/aiGateway";
import { AiAdmissionController, isAllowedLoopbackRequest } from "./server/aiPolicy";
import { configureFirebaseAuth, isAuthConfigured, verifyAccessToken } from "./server/auth";
import { configureFirebaseCloudStore, createContentReport, getLearningSnapshot, putLearningSnapshot } from "./server/cloudStore";
import { deleteFirebaseAccountData, FirebaseAiQuotaExceededError, getFirebaseAiUsage, getFirebasePublicConfig, reserveFirebaseAiUsage } from "./server/firebaseProvider";
import type { LearningType } from "./src/types/learning";
import { validateLearningBackup } from "./src/services/learningBackup";
import { assessmentRouter } from "./server/assessment";
import { coursePrompt, lessonPrompt, graphCurriculumSchema, knowledgeGraphRouter, learningIntentSchema, validCourseRequest, validTutorRequest, validateTutorResponse, tutorPrompt } from "./server/knowledgeGraphApi";
import { PreviewQuota, reserveFirestorePreview } from "./server/previewQuota";
import { installUnhandledRejectionLogger } from "./server/runtimeSafety";
import { learningSafetyPrompt } from "./server/learningSafety";
import { personaOutputTokens, personaPrompt, sanitizePersona } from "./server/tutorPersona";
import { configuredSelectionOrDefault, defaultAiSelectionFor, publicAiAvailability } from "./server/aiAvailability";
import {
  isAiRuntimeSelection,
  type AiRuntimeSelection,
} from "./src/domain/aiModels";

dotenv.config();
installUnhandledRejectionLogger();
dotenv.config({ path: "functions/.env.learnhub-1de94" });
configureFirebaseAuth();
configureFirebaseCloudStore();

export const app = express();
const configuredPort = Number(process.env.PORT);
const defaultPort = process.env.NODE_ENV === "production" ? 3000 : 3002;
const PORT = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65_535 ? configuredPort : defaultPort;
const LEARNING_TYPES = ["concept", "problem_solving", "memorization", "language", "practical"] as const;
const QUIZ_TYPES = ["multiple_choice", "short_answer"] as const;
const REPORT_CATEGORIES = ["wrong_answer", "inaccurate", "unclear", "rendering", "other"] as const;
const SITE_TITLE = "LearnHub · 지식과 사유의 작업 공간";
const SITE_DESCRIPTION = "배우고 싶은 주제를 개인 커리큘럼, AI 튜터 수업, 퀴즈와 자동 복습으로 이어가는 맞춤형 학습 서비스입니다.";

const publicAppOrigin = (): string | null => {
  const raw = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
};

const isSeoIndexable = (): boolean => process.env.SEO_INDEXABLE === "true" && publicAppOrigin() !== null;

const runtimeSeoMarkup = (): string => {
  const origin = publicAppOrigin();
  if (!origin) return "";
  const canonical = `${origin}/`;
  return [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:url" content="${canonical}" />`,
  ].join("\n    ");
};

const renderIndexHtml = (template: string): string => template
  .replace(
    '<meta name="robots" content="noindex, nofollow" data-runtime-seo="robots" />',
    `<meta name="robots" content="${isSeoIndexable() ? "index, follow" : "noindex, nofollow"}" data-runtime-seo="robots" />`,
  )
  .replace("<!-- learnhub-runtime-seo -->", runtimeSeoMarkup());

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
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!isSeoIndexable()) res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.info(JSON.stringify({
      event: "http_request",
      requestId: res.locals.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.max(0, Date.now() - startedAt),
    }));
  });
  next();
});

app.get("/robots.txt", (_req, res) => {
  const origin = publicAppOrigin();
  res.type("text/plain");
  if (!isSeoIndexable() || !origin) return res.send("User-agent: *\nDisallow: /\n");
  return res.send(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get("/healthz", (_req, res) => res.status(200).type("text/plain").send("ok"));

app.get("/sitemap.xml", (_req, res) => {
  const origin = publicAppOrigin();
  if (!isSeoIndexable() || !origin) return res.status(404).type("text/plain").send("Sitemap is disabled for this deployment.");
  const updated = new Date().toISOString().slice(0, 10);
  return res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><lastmod>${updated}</lastmod></url></urlset>`);
});

const positiveEnvInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
};
const aiPolicy = new AiAdmissionController({
  maxConcurrent: positiveEnvInteger("AI_MAX_CONCURRENT", 4),
  maxRequestsPerClientPerMinute: positiveEnvInteger("AI_REQUESTS_PER_USER_PER_MINUTE", 12),
  dailyRequestBudget: positiveEnvInteger("AI_GLOBAL_REQUESTS_PER_DAY", 10_000),
  dailyOutputTokenBudget: positiveEnvInteger("AI_GLOBAL_RESERVED_OUTPUT_TOKENS_PER_DAY", 1_000_000),
  perClientDailyRequestBudget: positiveEnvInteger("AI_REQUESTS_PER_USER_PER_DAY", 100),
  perClientDailyOutputTokenBudget: positiveEnvInteger("AI_RESERVED_OUTPUT_TOKENS_PER_USER_PER_DAY", 100_000),
});
const aiGateway = new AiGateway({
  geminiApiKey: process.env.GEMINI_API_KEY,
  openAiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  policy: aiPolicy,
});
// Accept forwarding headers only when the operator configures trusted proxy hops.
const previewProxyHops = Number(process.env.PREVIEW_TRUSTED_PROXY_HOPS || 0);
if (!Number.isInteger(previewProxyHops) || previewProxyHops < 0 || previewProxyHops > 5) throw new Error("PREVIEW_TRUSTED_PROXY_HOPS 설정을 확인해 주세요.");
app.set("trust proxy", previewProxyHops);
const previewGateway = new AiGateway({ geminiApiKey: process.env.GEMINI_API_KEY, openAiApiKey: process.env.OPENAI_API_KEY, anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  policy: new AiAdmissionController({ maxConcurrent: 2, dailyRequestBudget: 100, perClientDailyRequestBudget: 3, dailyOutputTokenBudget: 260000, perClientDailyOutputTokenBudget: 7800 }) });
const previewQuota = new PreviewQuota({
  perIp: positiveEnvInteger("PREVIEW_REQUESTS_PER_IP_PER_DAY", 3), globalLimit: positiveEnvInteger("PREVIEW_GLOBAL_REQUESTS_PER_DAY", 100),
  ...(process.env.NODE_ENV === "production" ? { durableReserve: reserveFirestorePreview } : {}),
});
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

const defaultAiSelection = (): AiRuntimeSelection => defaultAiSelectionFor((provider) => aiGateway.isConfigured(provider));

const aiSelectionFor = (req: Request): AiRuntimeSelection => {
  const provider = req.header("x-learnhub-ai-provider");
  const model = req.header("x-learnhub-ai-model");
  const reasoningEffort = req.header("x-learnhub-ai-reasoning");
  const maxOutputTokens = req.header("x-learnhub-ai-max-output-tokens");
  if (!provider && !model && !reasoningEffort && !maxOutputTokens) return defaultAiSelection();
  const candidate = {
    provider,
    model,
    reasoningEffort,
    maxOutputTokens: Number(maxOutputTokens),
  };
  if (!isAiRuntimeSelection(candidate)) throw new AiGatewayError("AI_INVALID_REQUEST", 400);
  // 키가 없는 제공자("준비 중")를 고른 채로 보내면 기본 모델로 답한다.
  return configuredSelectionOrDefault(candidate, (configured) => aiGateway.isConfigured(configured));
};

/** 서버에 키가 설정된 제공자와 그 모델. 비밀 값은 없고 설정 여부만 담는다. */
const aiAvailability = () => publicAiAvailability((provider) => aiGateway.isConfigured(provider));

app.get("/api/public-config", (_req, res) => {
  const firebaseConfig = getFirebasePublicConfig();
  if (!firebaseConfig) return res.status(503).json({ error: "Firebase 공개 설정이 아직 준비되지 않았습니다.", code: "PUBLIC_CONFIG_NOT_CONFIGURED" });
  return res.json({ firebaseConfig, ai: aiAvailability() });
});

const requireAiAccess = async (req: Request, res: Response): Promise<boolean> => {
  // Allow non-production loopback requests (guest / trial demo mode)
  if (process.env.NODE_ENV !== "production" && isLoopbackRequest(req)) {
    const token = bearerToken(req);
    if (token) {
      const user = await verifyAccessToken(token).catch(() => null);
      if (user) { res.locals.userId = user.id; res.locals.accessToken = token; }
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
  res.locals.accessToken = token;
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

app.get("/api/ai/config", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const clientKey = clientKeyFor(req, res);
  const quota = aiGateway.getQuotaSnapshot(clientKey);
  let durableUsage: Awaited<ReturnType<typeof getFirebaseAiUsage>> | null = null;
  if (typeof res.locals.accessToken === "string") {
    try {
      durableUsage = await getFirebaseAiUsage(String(res.locals.userId));
    } catch {
      return res.status(503).json({ error: "AI 사용량을 확인할 수 없습니다.", code: "AI_QUOTA_UNAVAILABLE" });
    }
  }
  const ai = aiAvailability();
  return res.json({
    providers: ai.providers,
    models: ai.models,
    outputTokenOptions: ai.outputTokenOptions,
    limits: {
      requestsPerMinute: quota.limits.requestsPerMinute,
      requestsPerDay: durableUsage?.requestLimit ?? quota.limits.requestsPerDay,
      reservedOutputTokensPerDay: durableUsage?.outputTokenLimit ?? quota.limits.reservedOutputTokensPerDay,
      globalRequestsPerDay: quota.limits.globalRequestsPerDay,
      globalReservedOutputTokensPerDay: quota.limits.globalReservedOutputTokensPerDay,
    },
    usage: {
      day: durableUsage?.usageDay ?? (quota.dayKey || new Date().toISOString().slice(0, 10)),
      requestsToday: durableUsage?.requests ?? quota.client.requestsToday,
      reservedOutputTokensToday: durableUsage?.reservedOutputTokens ?? quota.client.reservedOutputTokensToday,
      remainingRequestsToday: durableUsage ? Math.max(0, durableUsage.requestLimit - durableUsage.requests) : quota.client.remainingRequestsToday,
      remainingReservedOutputTokensToday: durableUsage ? Math.max(0, durableUsage.outputTokenLimit - durableUsage.reservedOutputTokens) : quota.client.remainingReservedOutputTokensToday,
    },
  });
});

const sendAiError = (res: Response, error: unknown) => {
  if (error instanceof AiGatewayError) {
    const messages: Record<string, string> = {
      AI_NOT_CONFIGURED: "AI 기능이 아직 설정되지 않았습니다.",
      AI_ADMISSION_REJECTED: "AI 요청이 많아 잠시 후 다시 시도해 주세요.",
      AI_INVALID_OUTPUT: "AI 응답을 확인할 수 없어 다시 시도해 주세요.",
      AI_INVALID_REQUEST: "AI 요청 형식을 확인해 주세요.",
      AI_UNAVAILABLE: "AI 기능을 잠시 사용할 수 없습니다.",
    };
    if (error.detail === "refusal") return res.status(error.httpStatus).json({ error: "AI가 이 요청에는 답하지 않았어요. 질문을 조금 바꿔서 다시 시도해 주세요.", code: error.code });
    return res.status(error.httpStatus).json({ error: messages[error.code] || messages.AI_UNAVAILABLE, code: error.code });
  }
  return res.status(503).json({ error: "AI 기능을 잠시 사용할 수 없습니다.", code: "AI_UNAVAILABLE" });
};

type JsonConfig = Parameters<AiGateway["generateJson"]>[0]["config"];
const runAi = async <T>(req: Request, res: Response, endpoint: string, prompt: string, config: JsonConfig, maxOutputTokens: number, validate: (payload: unknown) => string[]) => {
  try {
    const selection = aiSelectionFor(req);
    const reservedOutputTokens = Math.min(maxOutputTokens, selection.maxOutputTokens);
    if (typeof res.locals.userId === "string") await reserveFirebaseAiUsage(res.locals.userId, reservedOutputTokens);
    const safePrompt = `${learningSafetyPrompt(typeof req.body?.targetAudience === "string" ? req.body.targetAudience : undefined)}\n${prompt}`;
    const result = await aiGateway.generateJson<T>({ endpoint, requestId: res.locals.requestId, clientKey: clientKeyFor(req, res), prompt: safePrompt, config, maxOutputTokens, selection, validate });
    res.setHeader("x-learnhub-ai-provider", result.selection.provider);
    res.setHeader("x-learnhub-ai-model", result.selection.model);
    return res.json(result.payload);
  } catch (error) {
    if (error instanceof FirebaseAiQuotaExceededError) return res.status(429).json({ error: "오늘의 AI 사용 한도에 도달했습니다. 내일 다시 이용해 주세요.", code: "AI_DAILY_QUOTA_EXCEEDED" });
    console.error(JSON.stringify({
      event: "ai_error",
      requestId: res.locals.requestId,
      endpoint,
      code: error instanceof AiGatewayError ? error.code : error instanceof Error ? error.message.slice(0, 120) : "unknown",
    }));
    return sendAiError(res, error);
  }
};

const lessonSchema = {
  type: Type.OBJECT, properties: {
    title: { type: Type.STRING }, steps: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      type: { type: Type.STRING }, title: { type: Type.STRING }, content: { type: Type.STRING }, codeSnippet: { type: Type.STRING },
    }, required: ["type", "title", "content"] } },
  }, required: ["title", "steps"],
};
const evaluationSchema = { type: Type.OBJECT, properties: { isCorrect: { type: Type.BOOLEAN }, feedback: { type: Type.STRING }, hint: { type: Type.STRING }, misconceptionTag: { type: Type.STRING }, explanation: { type: Type.STRING }, status: { type: Type.STRING } }, required: ["isCorrect", "feedback"] };
const tutorSchema = { type: Type.OBJECT, properties: {
  reply: { type: Type.STRING }, suggestionChips: { type: Type.ARRAY, items: { type: Type.STRING } },
  tangent: { type: Type.OBJECT, properties: { conceptName: { type: Type.STRING }, question: { type: Type.STRING } }, required: ["conceptName", "question"] },
  learnedConcept: { type: Type.STRING },
}, required: ["reply"] };
const freeTutorSchema = { ...tutorSchema, properties: { ...tutorSchema.properties, learningIntent: learningIntentSchema } };
const practiceSchema = { type: Type.OBJECT, properties: {
  question: { type: Type.STRING },
  quizType: { type: Type.STRING },
  options: { type: Type.ARRAY, items: { type: Type.STRING } },
  answer: { type: Type.STRING },
  explanation: { type: Type.STRING },
  hints: { type: Type.ARRAY, items: { type: Type.STRING } },
}, required: ["question", "quizType", "answer", "explanation", "hints"] };
const reviewSchema = { type: Type.OBJECT, properties: { reviewSessionTitle: { type: Type.STRING }, estimatedMinutes: { type: Type.INTEGER }, questions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { conceptId: { type: Type.STRING }, conceptName: { type: Type.STRING }, courseTitle: { type: Type.STRING }, question: { type: Type.STRING }, quizType: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, answer: { type: Type.STRING }, explanation: { type: Type.STRING } }, required: ["conceptName", "courseTitle", "question", "quizType", "answer", "explanation"] } } }, required: ["reviewSessionTitle", "estimatedMinutes", "questions"] };

const validatePracticePayload = (payload: unknown): string[] => {
  if (!isRecord(payload) || boundedString(payload, "question", 2_000) === null || boundedString(payload, "answer", 1_000) === null || boundedString(payload, "explanation", 4_000) === null || !isAllowed(payload.quizType, QUIZ_TYPES)) {
    return ["문제 응답 형식이 올바르지 않습니다."];
  }
  if (!Array.isArray(payload.hints) || payload.hints.length < 1 || payload.hints.length > 3 || payload.hints.some((hint) => typeof hint !== "string" || !hint.trim() || hint.length > 500)) {
    return ["문제 힌트 형식이 올바르지 않습니다."];
  }
  if (payload.quizType === "multiple_choice") {
    if (!Array.isArray(payload.options) || payload.options.length < 3 || payload.options.length > 5 || payload.options.some((option) => typeof option !== "string" || !option.trim() || option.length > 500)) {
      return ["객관식 선택지 형식이 올바르지 않습니다."];
    }
    const options = payload.options.map((option) => option.trim());
    const answer = (payload.answer as string).trim();
    if (new Set(options).size !== options.length || !options.includes(answer)) return ["객관식 정답이 선택지와 일치하지 않습니다."];
  }
  return [];
};

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

app.use("/api/ai", assessmentRouter({ gateway: aiGateway, authorize: requireAiAccess, clientKey: clientKeyFor, selection: aiSelectionFor, error: sendAiError }));
app.use("/api/ai", knowledgeGraphRouter({ gateway: aiGateway, previewGateway, previewQuota, authorize: requireAiAccess, clientKey: clientKeyFor, selection: aiSelectionFor, defaultSelection: defaultAiSelection, error: sendAiError,
  reserveUser: async (_req, res, tokens) => { if (typeof res.locals.userId === "string") await reserveFirebaseAiUsage(res.locals.userId, tokens); },
}));

app.post("/api/ai/analyze-subject", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  if (!validCourseRequest(body)) return invalidBody(res, "과목과 학습 설정을 확인해 주세요.");
  return runAi(req, res, "analyze-subject", coursePrompt(body), { responseMimeType: "application/json", responseSchema: graphCurriculumSchema }, 2600, payload => validateCurriculumPayload(payload, { requireConceptLinks: true }));
});

app.post("/api/ai/generate-lesson", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  const fields = ["courseTitle", "chapterTitle", "lessonTitle", "learningType", "level", "conceptId", "conceptName"];
  if (!isRecord(body) || !hasOnlyKeys(body, [...fields, "targetAudience"]) || !optionalBoundedString(body, "targetAudience", 80) || fields.some((key) => boundedString(body, key, key === "courseTitle" || key === "lessonTitle" ? 200 : 120) === null) || !isAllowed(body.learningType, LEARNING_TYPES)) return invalidBody(res, "레슨 생성 설정을 확인해 주세요.");
  const learningType = body.learningType as LearningType;
  const prompt = lessonPrompt(body);
  return runAi(req, res, "generate-lesson", prompt, { responseMimeType: "application/json", responseSchema: lessonSchema }, 4096, (payload) => {
    const errors = validateLessonPayload(payload, learningType, { requireLearningArc: true });
    return errors;
  });
});

app.post("/api/ai/evaluate-quiz", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["conceptName", "question", "userAnswer", "expectedAnswer", "quizType", "persona"]) || (body.persona !== undefined && !isRecord(body.persona)) || ["conceptName", "question", "userAnswer", "expectedAnswer"].some((key) => boundedString(body, key, 400) === null) || !isAllowed(body.quizType, QUIZ_TYPES)) return invalidBody(res, "퀴즈 답안을 확인해 주세요.");
  const normalizeChoice = (value: string) => value.normalize("NFC").replace(/[\uFF01-\uFF5E]/gu, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0)).replace(/\u3000/gu, " ").replace(/\u2212/g, "-").replace(/\s+/gu, " ").trim();
  const comparison = body.quizType === "multiple_choice" ? (normalizeChoice(body.userAnswer as string) === normalizeChoice(body.expectedAnswer as string) ? "correct" : "incorrect") : compareAnswers(body.userAnswer as string, body.expectedAnswer as string);
  if (comparison !== "unknown") return res.json({ status: "scored", isCorrect: comparison === "correct", feedback: comparison === "correct" ? "정답입니다. 핵심 원리를 올바르게 적용했습니다." : "제출한 답을 다시 확인해 보세요. 힌트를 활용해 한 번 더 시도할 수 있습니다." });
  const basePrompt = `엄밀하고 친절한 학습 채점관입니다. 개념: "${body.conceptName}" 질문: "${body.question}" 정답 기준: "${body.expectedAnswer}" 제출 답안: "${body.userAnswer}" 유형: "${body.quizType}". 확실하지 않으면 status를 unknown으로 반환하고 오답으로 단정하지 마세요. JSON만 반환하세요.`;
  const prompt = `${basePrompt}${personaPrompt(sanitizePersona(body.persona))}`;
  try {
    const result = await aiGateway.generateJson<Record<string, unknown>>({ endpoint: "evaluate-quiz", requestId: res.locals.requestId, clientKey: clientKeyFor(req, res), prompt, config: { responseMimeType: "application/json", responseSchema: evaluationSchema }, maxOutputTokens: 1500, maxReasoningEffort: "low", selection: aiSelectionFor(req), validate: (payload) => isRecord(payload) && typeof payload.isCorrect === "boolean" && typeof payload.feedback === "string" ? [] : ["invalid"] });
    const data = result.payload;
    if (data.status === "unknown") return res.json({ status: "unknown", isCorrect: null, feedback: "답안을 확실히 판정하기 어려워 오답으로 기록하지 않았습니다. 다른 표현으로 다시 제출해 보세요.", hint: typeof data.hint === "string" ? data.hint : undefined });
    return res.json({ ...data, status: "scored" });
  } catch (error) { return sendAiError(res, error); }
});

app.post("/api/ai/tutor-chat", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  if (!validTutorRequest(body)) return invalidBody(res, "튜터 질문과 레슨 맥락을 확인해 주세요.");
  return runAi(req, res, "tutor-chat", tutorPrompt(body), { responseMimeType: "application/json", responseSchema: body.mode === "free" ? freeTutorSchema : tutorSchema }, personaOutputTokens(sanitizePersona(body.persona)), payload => validateTutorResponse(payload, body.conceptName, { free: body.mode === "free" }));
});

app.post("/api/ai/generate-practice", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  const fields = ["courseTitle", "chapterTitle", "lessonTitle", "learningType", "level", "conceptId", "conceptName", "lessonContext"];
  if (!isRecord(body) || !hasOnlyKeys(body, fields) || ["courseTitle", "chapterTitle", "lessonTitle", "level", "conceptId", "conceptName"].some((key) => boundedString(body, key, 400) === null) || boundedString(body, "lessonContext", 8_000) === null || !isAllowed(body.learningType, LEARNING_TYPES)) return invalidBody(res, "문제 생성 설정을 확인해 주세요.");
  const prompt = `학습 주제와 수준에 맞춰 안내하는 개인 튜터입니다. 과목: "${body.courseTitle}" 챕터: "${body.chapterTitle}" 레슨: "${body.lessonTitle}" 학습 유형: "${body.learningType}" 수준: "${body.level}" 개념: "${body.conceptName}" (${body.conceptId}). 현재 학습 내용: "${body.lessonContext}". 문제 지문은 이 주제를 처음 배우는 학습자도 이해할 수 있는 짧고 쉬운 한국어로 작성하되, 대학·대학원 개념의 정확한 조건은 빠뜨리지 마세요. 방금 배운 내용을 확인하는 문제를 딱 1개 생성하세요. 학습자가 직접 생각해야 하므로 정답이나 풀이를 질문에 넣지 마세요. 객관식이면 서로 겹치지 않는 선택지 3~4개와 선택지 중 하나인 정답을 만들고, 단답형이면 짧은 답을 허용하세요. 힌트는 정답을 바로 말하지 않는 단계별 힌트 2개를 만드세요. 지정된 JSON만 반환하세요.`;
  return runAi(req, res, "generate-practice", prompt, { responseMimeType: "application/json", responseSchema: practiceSchema }, 1100, validatePracticePayload);
});

app.post("/api/ai/generate-review", async (req, res) => {
  if (!(await requireAiAccess(req, res))) return;
  const body = req.body;
  if (!isRecord(body) || !hasOnlyKeys(body, ["weakConcepts"]) || !Array.isArray(body.weakConcepts) || body.weakConcepts.length < 1 || body.weakConcepts.length > 20 || body.weakConcepts.some((item) => !isRecord(item) || boundedString(item, "conceptName", 200) === null || boundedString(item, "courseTitle", 200) === null || typeof item.understanding !== "number" || !Number.isFinite(item.understanding) || item.understanding < 0 || item.understanding > 100)) return invalidBody(res, "복습 대상 개념을 확인해 주세요.");
  const prompt = `전 연령 학습자를 위한 복습 기획자입니다. 취약 개념:\n${JSON.stringify(body.weakConcepts)}\n3~5개의 짧은 복습 퀴즈를 생성하고 JSON만 반환하세요.`;
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
    return res.status(503).json({ error: "학습 기록을 잠시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", code: "cloud_store_unavailable" });
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
    return res.status(503).json({ error: "학습 기록을 잠시 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: "cloud_store_unavailable" });
  }
});

app.delete("/api/account", async (req, res) => {
  const auth = await requireConfiguredUser(req, res);
  if (!auth) return;
  try {
    await deleteFirebaseAccountData(auth.id);
    return res.status(204).end();
  } catch {
    return res.status(503).json({ error: "계정과 클라우드 학습 기록을 삭제하지 못했습니다.", code: "ACCOUNT_DELETE_UNAVAILABLE" });
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
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const indexTemplate = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.type("html").send(renderIndexHtml(indexTemplate)));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://0.0.0.0:${PORT}`));
}

const isFirebaseFunctionsRuntime = Boolean(process.env.FUNCTION_TARGET || process.env.K_SERVICE);
if (process.env.NODE_ENV !== "test" && !isFirebaseFunctionsRuntime) void startServer();
