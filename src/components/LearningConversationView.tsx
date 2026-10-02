import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Lightbulb,
  Loader2,
  Network,
  RotateCcw,
} from "lucide-react";
import { Course, LessonContent, LessonMeta, LessonStep } from "../types/learning";
import { authorizedFetch } from "../services/authClient";
import { notifyLearningDataChanged, StorageService } from "../services/storage";
import { validateLessonPayload } from "../domain/contentValidation";
import { createFallbackLessonContent } from "../domain/lessonFallback";
import { courseIsComplete } from "../domain/assessment";
import { RichLessonRenderer } from "./notion/RichLessonRenderer";
import { LessonCompletionModal } from "./notion/LessonCompletionModal";
import { MiniGraphPanel } from "./graph/MiniGraphPanel";
import { NextStepBlock } from "./graph/NextStepBlock";
import { ResumeBanner } from "./graph/ResumeBanner";
import { useKnowledgeGraph } from "./graph/useKnowledgeGraph";
import { addCuriosity, findMatchingConcept, getResumeContext, markPracticalDone, normalizeConceptKey, recommendNextSteps, setDepthReached, setLastPosition } from "./graph/graphBridge";
import { templateNudge, type NudgeText } from "./graph/nextStepText";
import { josa } from "./graph/korean";
import type { ExplanationDepth, NextStep, ResumeContext } from "./graph/graphTypes";

interface LearningConversationViewProps {
  course: Course;
  lessonMeta: LessonMeta;
  chapterTitle: string;
  onFinishLesson: (metadata?: { kind: "read_only"; courseId: string; lessonId: string }) => void;
  onGoHome?: () => void;
  onStartNextLesson?: (nextCourse: Course, nextLesson: LessonMeta, chapterTitle: string) => void;
  onGoCourse?: () => void;
  onStartAssessment?: () => void;
  onBackToAssessment?: () => void;
  /** 지도에서 "문제 풀기"로 들어왔을 때 곧바로 문제를 띄웁니다. */
  autoStartPractice?: boolean;
  onOpenKnowledgeMap?: () => void;
}

interface ConversationMessage {
  sender: "user" | "tutor";
  text: string;
  chips?: string[];
  /** 지금 개념에서 벗어난 곁가지 질문. "나중에 볼래요"로 저장할 수 있습니다. */
  tangent?: { conceptName: string; question: string; saved?: boolean };
}

const DEPTH_OPTIONS: Array<{ depth: ExplanationDepth; label: string; question: string }> = [
  { depth: "easy", label: "쉬운 말로", question: "이 개념을 아주 쉬운 말로 다시 설명해 주세요." },
  { depth: "formal", label: "정식 개념으로", question: "이 개념을 정확한 용어를 써서 정식 개념으로 설명해 주세요." },
  { depth: "example", label: "정확한 예시로", question: "이 개념을 정확한 예시 하나로 보여 주세요." },
];

const SESSION_KEY = "learnhub_session_v1";
const SESSION_GAP_MS = 60 * 60 * 1000;

/** 같은 학습 세션에서 몇 분, 몇 레슨째인지 세어 "오늘은 여기까지"를 판단합니다. */
const touchSession = (lessonId: string): { minutes: number; lessons: number } => {
  const now = Date.now();
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    const fresh = !raw || typeof raw.start !== "number" || now - (raw.last ?? raw.start) > SESSION_GAP_MS;
    const state: { start: number; last: number; lessons: string[] } = fresh ? { start: now, last: now, lessons: [] } : raw;
    if (!state.lessons.includes(lessonId)) state.lessons.push(lessonId);
    state.last = now;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    return { minutes: Math.floor((now - state.start) / 60_000), lessons: state.lessons.length };
  } catch {
    return { minutes: 0, lessons: 1 };
  }
};

// "문제 내줘", "퀴즈 하나 줘", "문제 풀어볼래" 같은 요청만 잡고, "이 문제는 왜 이렇게 풀어요?" 같은 질문은 그대로 AI에게 보냅니다.
// AI가 "간단히 확인해볼까요?"처럼 문제를 권할 때, 대답 대신 넘길 수 있게 합니다.
const PRACTICE_OFFER = /확인해\s*볼까요|(문제|퀴즈)[^.?!]{0,10}(풀어|내|해)\s*볼까요/;
const PRACTICE_REQUEST = /(문제|퀴즈)[^.?!]{0,8}(내\s*줘|내\s*주|내\s*봐|낼래|줘|주세요|만들어)|(문제|퀴즈)[^.?!]{0,6}(풀어\s*볼|풀래|풀고\s*싶)/;

interface PracticeQuestion {
  question: string;
  quizType: "multiple_choice" | "short_answer";
  options?: string[];
  answer: string;
  explanation: string;
  hints: string[];
}

interface PracticeResult {
  isCorrect: boolean | null;
  feedback: string;
  hint?: string;
  explanation?: string;
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 6_000;

const getHistoryKey = (courseId: string, lessonId: string) =>
  `learnhub_tutor_history_v3_${encodeURIComponent(`${courseId}:${lessonId}`)}`;

const readConversation = (key: string): ConversationMessage[] => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ConversationMessage =>
      item && typeof item === "object" && (item.sender === "user" || item.sender === "tutor") && typeof item.text === "string" && item.text.trim().length > 0,
    ).slice(-50);
  } catch {
    return [];
  }
};

const saveConversation = (key: string, messages: ConversationMessage[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(messages.slice(-50)));
    notifyLearningDataChanged();
  } catch {
    // The current tab still owns the conversation if persistence fails.
  }
};

const boundedHistory = (messages: ConversationMessage[]) => {
  const result: Array<{ role: "user" | "assistant"; text: string }> = [];
  let total = 0;
  for (const message of messages.slice(-MAX_HISTORY_MESSAGES)) {
    const text = message.text.trim().slice(0, 900);
    if (!text || total + text.length > MAX_HISTORY_CHARS) continue;
    result.push({ role: message.sender === "user" ? "user" : "assistant", text });
    total += text.length;
  }
  return result;
};

const chapterMessage = (course: Course, lesson: LessonMeta, chapterTitle: string, content: LessonContent): ConversationMessage => ({
  sender: "tutor",
  text: `# ${lesson.title}\n\n좋아요. **${course.title}**의 **${chapterTitle}**에서 **${lesson.conceptName}**${josa(lesson.conceptName, "을/를")} 함께 배워볼게요. 처음엔 큰 그림을, 다음엔 예시를 보고, 마지막에 정리하는 순서예요. 읽다가 막히면 언제든 편하게 물어보세요.\n\n${content.steps.map((step, index) => `## ${index + 1}. ${step.title}\n\n${step.content}`).join("\n\n")}`,
});

const isUsableContent = (candidate: LessonContent | null, course: Course, lesson: LessonMeta) =>
  Boolean(candidate && candidate.courseId === course.id && candidate.lessonId === lesson.id && validateLessonPayload(candidate, course.learningType, { requireLearningArc: true }).length === 0);

export const LearningConversationView: React.FC<LearningConversationViewProps> = ({
  course,
  lessonMeta,
  chapterTitle,
  onFinishLesson,
  onGoHome,
  onStartNextLesson,
  onGoCourse,
  onStartAssessment,
  onBackToAssessment,
  autoStartPractice = false,
  onOpenKnowledgeMap,
}) => {
  const historyKey = useMemo(() => getHistoryKey(course.id, lessonMeta.id), [course.id, lessonMeta.id]);
  const [content, setContent] = useState<LessonContent | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCompleted, setIsCompleted] = useState(lessonMeta.isCompleted);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionSaveStatus, setCompletionSaveStatus] = useState<"saved" | "error" | "idle">("idle");
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceQuestion, setPracticeQuestion] = useState<PracticeQuestion | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [practiceHintIndex, setPracticeHintIndex] = useState(0);
  const [isPracticeLoading, setIsPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState("");
  const [sideOpen, setSideOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const latestCourse = StorageService.getCourseById(course.id) || course;
  const lessonEntries = latestCourse.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ course: latestCourse, lesson, chapterTitle: chapter.title })));
  const currentLessonIndex = lessonEntries.findIndex((entry) => entry.lesson.id === lessonMeta.id);
  const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < lessonEntries.length - 1 ? lessonEntries[currentLessonIndex + 1] : null;
  const allCompleted = courseIsComplete(latestCourse);

  // 개념 지도 · 다음 학습 유도
  const graph = useKnowledgeGraph();
  // 같은 개념이 다른 이름으로 합쳐져 있을 수 있어서, 지도에 있는 노드의 id를 우선 씁니다.
  const currentConceptId = findMatchingConcept(graph, lessonMeta.conceptName || lessonMeta.title)?.id ?? normalizeConceptKey(lessonMeta.conceptName || lessonMeta.title);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeContext | null>(null);
  const [aiNudge, setAiNudge] = useState<{ key: string; value: NudgeText } | null>(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);
  const [understoodNow, setUnderstoodNow] = useState(false);
  const understood = understoodNow || isCompleted;
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<number>>(new Set());
  const [practicalDone, setPracticalDone] = useState(false);
  const [reflection, setReflection] = useState("");
  const nudgeBlockRef = useRef<HTMLDivElement>(null);
  const nudgeRequestedRef = useRef("");
  const autoPracticeStartedRef = useRef(false);
  const session = useMemo(() => touchSession(lessonMeta.id), [lessonMeta.id, messages.length]);
  const dueReviewConcepts = useMemo(() => StorageService.getDueReviews().map((review) => review.conceptName), [graph]);
  const steps = useMemo(
    () =>
      recommendNextSteps(graph, {
        currentConceptId,
        courses: StorageService.getCourses(),
        dueReviewConceptIds: dueReviewConcepts,
        sessionMinutes: session.minutes,
        lessonsThisSession: session.lessons,
      }, 3),
    [graph, currentConceptId, dueReviewConcepts, session],
  );
  const stepsKey = steps.map((step) => `${step.kind}:${step.conceptId ?? ""}`).join("|");
  const fallbackNudge = useMemo(() => templateNudge(graph, currentConceptId, steps, understood), [graph, currentConceptId, stepsKey, understood]);
  // AI가 다듬은 문장은 "이해했으니"처럼 말할 수 있는 때(마쳤거나 맞힌 뒤)에만 씁니다.
  const nudge = understood && aiNudge && aiNudge.key === stepsKey ? aiNudge.value : fallbackNudge;
  const nameOfConcept = (id?: string) => graph.nodes.find((node) => node.id === id)?.name ?? "";
  const hasUserMessage = messages.some((message) => message.sender === "user");
  const isPractical = course.learningType === "practical";

  const triggerPulse = (conceptId: string) => {
    setUnderstoodNow(true);
    setPulseId(null);
    requestAnimationFrame(() => setPulseId(conceptId));
  };

  useEffect(() => {
    // 돌아왔을 때 이어주기: 위치를 덮어쓰기 전에 지난 위치를 읽어 둡니다.
    const context = getResumeContext();
    if (context && context.position.lessonId === lessonMeta.id && context.daysAway >= 1) setResume(context);
    setLastPosition({ courseId: course.id, lessonId: lessonMeta.id, conceptId: currentConceptId, at: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, lessonMeta.id]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadContent = async () => {
      setIsLoadingContent(true);
      const cached = StorageService.getCachedLessonContent(lessonMeta.id);
      if (isUsableContent(cached, course, lessonMeta)) {
        if (!cancelled) setContent(cached);
        setIsLoadingContent(false);
        return;
      }

      try {
        const response = await authorizedFetch("/api/ai/generate-lesson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseTitle: course.title,
            chapterTitle,
            lessonTitle: lessonMeta.title,
            learningType: course.learningType,
            level: course.level,
            conceptId: lessonMeta.conceptId,
            conceptName: lessonMeta.conceptName,
          }),
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
          throw new Error("auth_required");
        }
        if (!response.ok) throw new Error("lesson_unavailable");
        const data = await response.json();
        if (validateLessonPayload(data, course.learningType, { requireLearningArc: true }).length > 0) throw new Error("lesson_invalid");
        const loaded: LessonContent = {
          id: `content-${lessonMeta.id}`,
          lessonId: lessonMeta.id,
          courseId: course.id,
          title: data.title || lessonMeta.title,
          steps: (data.steps || []).map((step: Record<string, unknown>, index: number) => ({
            id: `step-${index}`,
            type: (step.type || "concept") as LessonStep["type"],
            title: typeof step.title === "string" ? step.title : `단계 ${index + 1}`,
            content: typeof step.content === "string" ? step.content : "",
            codeSnippet: typeof step.codeSnippet === "string" ? step.codeSnippet : undefined,
          })),
        };
        StorageService.cacheLessonContent(lessonMeta.id, loaded);
        if (!cancelled) setContent(loaded);
      } catch (error) {
        if (cancelled) return;
        setContent(createFallbackLessonContent(course, lessonMeta, chapterTitle));
      } finally {
        if (!cancelled) setIsLoadingContent(false);
      }
    };

    void loadContent();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [chapterTitle, course, lessonMeta]);

  useEffect(() => {
    if (!content) return;
    const storedMessages = readConversation(historyKey);
    const hasConversationOpening = storedMessages.some((message) =>
      message.sender === "tutor" && message.text.startsWith(`# ${lessonMeta.title}`),
    );
    const initialMessages = hasConversationOpening
      ? storedMessages
      : [chapterMessage(course, lessonMeta, chapterTitle, content), ...storedMessages.filter((message) => message.text.trim() !== "")];
    setMessages(initialMessages);
    saveConversation(historyKey, initialMessages);
  }, [chapterTitle, content, course, historyKey, lessonMeta]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending, practiceResult, practiceOpen, practiceQuestion]);

  const appendMessage = (message: ConversationMessage) => {
    setMessages((previous) => {
      const next = [...previous, message];
      saveConversation(historyKey, next);
      return next;
    });
  };

  const sendQuestion = async (question: string, depth?: ExplanationDepth) => {
    const trimmed = question.trim();
    if (!trimmed || isSending || !content) return;
    setInput("");
    appendMessage({ sender: "user", text: trimmed });
    if (depth) setDepthReached(currentConceptId, depth);
    if (PRACTICE_REQUEST.test(trimmed)) {
      // 문제 요청은 AI 대화 호출 없이 대화 흐름 안에 바로 문제를 띄웁니다.
      appendMessage({ sender: "tutor", text: "좋아요, 문제 하나 내볼게요. 아래에서 풀어 보세요. 어려우면 힌트를 봐도 되고, 넘기고 싶으면 언제든 닫아도 돼요." });
      void generatePractice();
      return;
    }
    setIsSending(true);
    try {
      const response = await authorizedFetch("/api/ai/tutor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseTitle: course.title,
          lessonTitle: lessonMeta.title,
          conceptName: lessonMeta.conceptName,
          currentStepContent: `${course.summary}\n\n현재 챕터: ${chapterTitle}\n현재 학습 본문:\n${content.steps.map((step, index) => `${index + 1}. ${step.title}\n${step.content}`).join("\n\n")}`.slice(0, 8_000),
          history: boundedHistory(messages),
          userQuestion: trimmed,
          ...(depth ? { depth } : {}),
        }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!response.ok) throw new Error("tutor_unavailable");
      const data = await response.json();
      const tangent = data.tangent && typeof data.tangent.conceptName === "string" && typeof data.tangent.question === "string"
        ? { conceptName: data.tangent.conceptName.trim().slice(0, 40), question: data.tangent.question.trim().slice(0, 200) }
        : undefined;
      appendMessage({
        sender: "tutor",
        text: data.reply || "질문을 다시 설명해 주세요.",
        chips: Array.isArray(data.suggestionChips) ? data.suggestionChips.slice(0, 3) : [],
        ...(tangent && tangent.conceptName ? { tangent } : {}),
      });
      const learned = typeof data.learnedConcept === "string" ? data.learnedConcept : data.learnedConcept?.conceptName;
      if (typeof learned === "string" && learned.trim()) triggerPulse(findMatchingConcept(graph, learned)?.id ?? currentConceptId);
    } catch (error) {
      appendMessage({ sender: "tutor", text: error instanceof Error && error.message === "auth_required" ? "AI 학습 대화를 계속하려면 로그인해 주세요." : "지금은 답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setIsSending(false);
    }
  };

  const generatePractice = async () => {
    if (!content || isPracticeLoading) return;
    setPracticeOpen(true);
    setPracticeError("");
    setPracticeResult(null);
    setPracticeAnswer("");
    setPracticeHintIndex(0);
    setIsPracticeLoading(true);
    try {
      const response = await authorizedFetch("/api/ai/generate-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseTitle: course.title,
          chapterTitle,
          lessonTitle: lessonMeta.title,
          learningType: course.learningType,
          level: course.level,
          conceptId: lessonMeta.conceptId,
          conceptName: lessonMeta.conceptName,
          lessonContext: content.steps.map((step) => `${step.title}\n${step.content}`).join("\n\n").slice(0, 8_000),
        }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!response.ok) throw new Error("practice_unavailable");
      const data = await response.json();
      if (typeof data.question !== "string" || typeof data.answer !== "string" || !Array.isArray(data.hints) || !["multiple_choice", "short_answer"].includes(data.quizType)) throw new Error("practice_invalid");
      setPracticeQuestion({
        question: data.question,
        quizType: data.quizType,
        options: Array.isArray(data.options) ? data.options : undefined,
        answer: data.answer,
        explanation: data.explanation || "핵심 원리를 다시 확인해 보세요.",
        hints: data.hints,
      });
    } catch (error) {
      setPracticeError(error instanceof Error && error.message === "auth_required" ? "로그인 후 문제를 생성할 수 있습니다." : "문제를 준비하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsPracticeLoading(false);
    }
  };

  const submitPractice = async () => {
    if (!practiceQuestion || !practiceAnswer.trim() || isPracticeLoading) return;
    setIsPracticeLoading(true);
    setPracticeResult(null);
    try {
      const response = await authorizedFetch("/api/ai/evaluate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptName: lessonMeta.conceptName,
          question: practiceQuestion.question,
          userAnswer: practiceAnswer.trim(),
          expectedAnswer: practiceQuestion.answer,
          quizType: practiceQuestion.quizType,
        }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!response.ok) throw new Error("evaluation_unavailable");
      const data = await response.json();
      const isCorrect = typeof data.isCorrect === "boolean" ? data.isCorrect : null;
      setPracticeResult({ isCorrect, feedback: data.feedback || "답안을 확인해 보세요.", hint: data.hint, explanation: data.explanation });
      if (isCorrect !== null) {
        StorageService.recordQuizAnswer(course.id, course.title, lessonMeta.conceptId, lessonMeta.conceptName, isCorrect);
        if (isCorrect) triggerPulse(currentConceptId);
      }
    } catch (error) {
      setPracticeResult({ isCorrect: null, feedback: error instanceof Error && error.message === "auth_required" ? "로그인 후 답안을 채점할 수 있습니다." : "채점을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setIsPracticeLoading(false);
    }
  };

  const markLessonComplete = () => {
    if (!isCompleted) {
      const saved = StorageService.markLessonCompleted(course.id, lessonMeta.id);
      if (!saved) {
        setCompletionSaveStatus("error");
        return;
      }
      setIsCompleted(true);
      setCompletionSaveStatus("saved");
      triggerPulse(currentConceptId);
      onFinishLesson({ kind: "read_only", courseId: course.id, lessonId: lessonMeta.id });
    }
    setCompletionOpen(true);
  };

  useEffect(() => {
    if (!autoStartPractice || !content || autoPracticeStartedRef.current) return;
    autoPracticeStartedRef.current = true;
    void generatePractice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartPractice, content]);

  // 추천 문장 다듬기는 사용자가 대화를 시작했거나 레슨을 마친 뒤, 블록이 화면에 보일 때 한 번만 요청합니다.
  useEffect(() => {
    const element = nudgeBlockRef.current;
    if (!element || !stepsKey || steps[0]?.kind === "wrap_up" || !understood) return;
    if (nudgeRequestedRef.current === stepsKey || typeof IntersectionObserver === "undefined") return;
    const controller = new AbortController();
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      nudgeRequestedRef.current = stepsKey;
      setNudgeLoading(true);
      authorizedFetch("/api/ai/next-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentConceptName: lessonMeta.conceptName,
          steps: steps.map((step) => ({
            kind: step.kind,
            conceptName: nameOfConcept(step.conceptId),
            becauseOfConceptName: nameOfConcept(step.becauseOfConceptId),
          })),
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          const source = data?.nudge ?? data;
          if (typeof source?.question === "string" && source.question.trim()) {
            setAiNudge({ key: stepsKey, value: { question: source.question.trim(), reason: typeof source.reason === "string" ? source.reason.trim() : fallbackNudge?.reason ?? "" } });
          }
        })
        .catch(() => undefined)
        .finally(() => setNudgeLoading(false));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepsKey, understood, content]);

  const openStep = (step: NextStep) => {
    if (step.kind === "curiosity" || !step.lessonId || !step.courseId) {
      const name = nameOfConcept(step.conceptId);
      if (name) void sendQuestion(`저장해 둔 ‘${name}’${josa(name, "이/가")} 궁금했어요. 쉽게 알려 주세요.`);
      return;
    }
    const target = StorageService.getCourseById(step.courseId);
    for (const chapter of target?.chapters ?? []) {
      const lesson = chapter.lessons.find((item) => item.id === step.lessonId);
      if (target && lesson && onStartNextLesson) {
        onStartNextLesson(target, lesson, chapter.title);
        return;
      }
    }
  };

  const saveTangent = (index: number) => {
    const tangent = messages[index]?.tangent;
    if (!tangent || tangent.saved) return;
    addCuriosity(currentConceptId, tangent.conceptName, tangent.question);
    setMessages((previous) => {
      const next = previous.map((message, i) => (i === index && message.tangent ? { ...message, tangent: { ...message.tangent, saved: true } } : message));
      saveConversation(historyKey, next);
      return next;
    });
  };

  const submitPracticalDone = () => {
    markPracticalDone(currentConceptId, reflection);
    setPracticalDone(true);
    triggerPulse(currentConceptId);
  };

  if (isLoadingContent || !content) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-[var(--lh-ink-secondary)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--lh-primary)]" />
        <span className="text-sm font-medium">AI 학습방을 준비하는 중...</span>
        <span className="text-xs">레슨 목표와 대화 흐름을 구성하고 있습니다.</span>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-none flex-col pt-4 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-5 sm:px-8 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
        <aside aria-label="학습 도우미" className="w-full shrink-0 lg:sticky lg:top-6 lg:order-2 lg:max-h-[calc(100dvh-3rem)] lg:w-[300px] lg:overflow-y-auto">
          <button
            type="button"
            aria-expanded={sideOpen}
            aria-controls="lesson-side-panel"
            onClick={() => setSideOpen((open) => !open)}
            className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-sm font-medium text-[var(--lh-ink)] cursor-pointer lg:hidden"
          >
            <span className="flex items-center gap-2"><Network aria-hidden className="h-4 w-4 text-[var(--lh-primary)]" /> 지도와 다음 단계</span>
            <ChevronDown aria-hidden className={`h-4 w-4 transition ${sideOpen ? "rotate-180" : ""}`} />
          </button>
          <div id="lesson-side-panel" className={`${sideOpen ? "mt-3 block" : "hidden"} space-y-4 lg:mt-0 lg:block`}>
            <MiniGraphPanel
              graph={graph}
              currentConceptId={currentConceptId}
              steps={steps}
              pulseId={pulseId}
              understood={understood}
              onOpenStep={openStep}
              onOpenMap={onOpenKnowledgeMap}
              embedded
              showSteps={false}
            />

            {/* 다음 학습 유도: 오늘은 여기까지 / 질문 + 추천 카드 */}
            <div ref={nudgeBlockRef}>
              <NextStepBlock
                compact
                graph={graph}
                steps={steps}
                nudge={nudge}
                nudgeLoading={nudgeLoading}
                currentName={lessonMeta.conceptName}
                wrappedUp={keepGoing}
                understood={understood}
                onOpenStep={openStep}
                onGoHome={onGoHome}
                onKeepGoing={() => setKeepGoing(true)}
              />
            </div>

            {/* 학습 마무리 & 다음 단계 */}
            <section aria-label="학습 마무리" className="space-y-3 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-4 shadow-xs">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-[var(--lh-ink)]">{isCompleted ? "이 레슨의 학습을 완료하셨습니다" : "본문 학습을 모두 마치셨나요?"}</p>
                <p className="text-[11px] leading-4 text-[var(--lh-ink-secondary)]">
                  {isCompleted ? "언제든 문제를 다시 풀거나 완료 결과를 다시 확인할 수 있습니다." : "배운 내용을 문제로 점검하거나, 완료 후 다음 단계로 진행하세요."}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (practiceOpen) setPracticeOpen(false);
                    else void generatePractice();
                  }}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition cursor-pointer ${
                    practiceOpen
                      ? "border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]"
                      : "border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)]"
                  }`}
                >
                  <CircleHelp className="h-4 w-4 text-[var(--lh-point)]" />
                  <span>{practiceOpen ? "문제 닫기" : "문제 풀기"}</span>
                </button>
                <button
                  type="button"
                  onClick={markLessonComplete}
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition cursor-pointer ${
                    isCompleted
                      ? "border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] text-[var(--lh-ink)] hover:bg-[var(--lh-surface)]"
                      : "bg-[var(--lh-primary)] text-white hover:bg-[var(--lh-primary-hover)]"
                  }`}
                >
                  <CheckCircle2 className={`h-4 w-4 ${isCompleted ? "text-emerald-500" : "text-white"}`} />
                  <span>{isCompleted ? "학습 완료 보기" : "충분히 학습했어요"}</span>
                </button>
              </div>
            </section>
          </div>
        </aside>

        <section className="flex min-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-[900px] flex-col lg:order-1 lg:flex-1">
          <div className="flex-1">
          {resume && (
            <div className="mb-5">
              <ResumeBanner
                resume={resume}
                onContinue={() => setResume(null)}
                onQuickReview={() => {
                  setResume(null);
                  void sendQuestion("지난번에 배운 내용을 1분 안에 복습할 수 있게 핵심만 짧게 정리해 주고, 확인 질문은 하나만 해 주세요.");
                }}
              />
            </div>
          )}
          <div className="space-y-5" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.sender}-${index}`} className={`flex w-full ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
                {message.sender === "tutor" ? (
                  <div className="flex w-full gap-3">
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]"><Bot className="h-4 w-4" /></span>
                    <div className="min-w-0 max-w-[820px] flex-1 text-[var(--lh-ink)]">
                      <RichLessonRenderer content={message.text} />
                      {message.tangent && (
                        <div className="mt-4 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4">
                          <p className="text-sm leading-6 text-[var(--lh-ink)]">
                            좋은 곁가지 질문이에요. ‘{message.tangent.conceptName}’{josa(message.tangent.conceptName, "은/는")} 지도에 <strong className="font-medium">궁금해요</strong>로 남겨 두고 나중에 이어서 볼 수 있어요.
                          </p>
                          <button
                            type="button"
                            onClick={() => saveTangent(index)}
                            disabled={message.tangent.saved}
                            className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-surface)] px-4 text-xs font-medium text-[var(--lh-primary-text)] transition hover:bg-[var(--lh-primary-subtle)] disabled:cursor-default disabled:opacity-70 cursor-pointer"
                          >
                            {message.tangent.saved ? "지도에 저장했어요" : "나중에 볼래요"}
                          </button>
                        </div>
                      )}
                      {index === messages.length - 1 && !isSending && !dismissedPrompts.has(index) && !practiceOpen && index > 0 && PRACTICE_OFFER.test(message.text) && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => { setDismissedPrompts((previous) => new Set(previous).add(index)); void generatePractice(); }} className="rounded-full bg-[var(--lh-primary)] px-4 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">좋아요, 풀어볼게요</button>
                          <button type="button" onClick={() => setDismissedPrompts((previous) => new Set(previous).add(index))} className="rounded-full border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-4 py-1.5 text-xs font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">괜찮아요, 넘길게요</button>
                        </div>
                      )}
                      {message.chips && message.chips.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {message.chips.map((chip) => <button type="button" key={chip} onClick={() => void sendQuestion(chip)} disabled={isSending} className="rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--lh-primary-text)] transition hover:bg-[var(--lh-primary)] hover:text-white disabled:opacity-40">{chip}</button>)}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[78%] rounded-2xl bg-[var(--lh-primary-subtle)] px-4 py-3 text-[var(--lh-primary-text)] sm:max-w-[70%]">
                    <p className="whitespace-pre-wrap text-sm leading-7">{message.text}</p>
                  </div>
                )}
              </div>
            ))}
            {isSending && <div className="flex items-center gap-2 text-sm text-[var(--lh-ink-secondary)]"><Loader2 className="h-4 w-4 animate-spin text-[var(--lh-primary)]" /> 학습 맥락을 확인해 답변을 만드는 중...</div>}
          </div>

          {/* 1. 문제풀이 실전 점검 모드 */}
          {practiceOpen && (
            <div className="mt-8 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 sm:p-6 shadow-xs animate-fade-in">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--lh-line)]">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]">
                    <CircleHelp className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-[var(--lh-ink)]">문제풀이 실전 점검</h3>
                    <p className="text-xs text-[var(--lh-ink-secondary)]">방금 배운 핵심 개념을 직접 적용해 풀어보세요.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPracticeOpen(false)}
                  className="rounded-lg px-2.5 py-1 text-xs text-[var(--lh-ink-tertiary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
                >
                  나중에 풀게요
                </button>
              </div>

              {isPracticeLoading && !practiceQuestion && (
                <div className="py-10 flex flex-col items-center justify-center gap-2.5 text-sm text-[var(--lh-ink-secondary)]">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--lh-primary)]" />
                  <span>맞춤형 문제를 구성하고 있습니다...</span>
                </div>
              )}

              {practiceError && (
                <div className="mt-4 space-y-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4">
                  <p className="text-sm text-[var(--lh-danger)]">{practiceError}</p>
                  <button
                    type="button"
                    onClick={() => void generatePractice()}
                    className="rounded-full bg-[var(--lh-primary)] px-4 py-1.5 text-xs font-medium text-white transition cursor-pointer"
                  >
                    다시 시도
                  </button>
                </div>
              )}

              {practiceQuestion && (
                <div className="mt-5 space-y-4">
                  <p className="text-base font-medium leading-7 text-[var(--lh-ink)]">{practiceQuestion.question}</p>
                  {practiceQuestion.quizType === "multiple_choice" && (
                    <div className="grid gap-2">
                      {practiceQuestion.options?.map((option) => (
                        <button
                          type="button"
                          key={option}
                          onClick={() => setPracticeAnswer(option)}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition cursor-pointer ${
                            practiceAnswer === option
                              ? "border-[var(--lh-primary)] bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)] font-medium"
                              : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] hover:border-[var(--lh-primary-border)] hover:bg-[var(--lh-surface-subtle)]"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}

                  {practiceQuestion.quizType === "short_answer" && (
                    <textarea
                      value={practiceAnswer}
                      onChange={(event) => setPracticeAnswer(event.target.value)}
                      rows={3}
                      placeholder="내 답을 적어보세요"
                      className="w-full resize-y rounded-xl border border-[var(--lh-line)] bg-[var(--lh-canvas)] p-3 text-sm leading-6 outline-none focus:border-[var(--lh-primary)] transition"
                    />
                  )}

                  {!practiceResult && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setPracticeHintIndex((index) => Math.min(index + 1, practiceQuestion.hints.length))}
                        disabled={practiceHintIndex >= practiceQuestion.hints.length}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-xs font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] disabled:opacity-40 cursor-pointer"
                      >
                        <Lightbulb className="h-3.5 w-3.5" /> 힌트 {practiceHintIndex}/{practiceQuestion.hints.length}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitPractice()}
                        disabled={!practiceAnswer.trim() || isPracticeLoading}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-5 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] disabled:opacity-40 cursor-pointer"
                      >
                        답안 제출 <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {practiceHintIndex > 0 && (
                    <p className="rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-3 text-xs sm:text-sm leading-6 text-[var(--lh-ink-secondary)]">
                      💡 힌트: {practiceQuestion.hints[practiceHintIndex - 1]}
                    </p>
                  )}

                  {practiceResult && (
                    <div
                      className={`rounded-xl border p-4.5 ${
                        practiceResult.isCorrect === true
                          ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
                          : practiceResult.isCorrect === false
                          ? "border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
                          : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)]"
                      }`}
                    >
                      <p className="font-medium text-sm sm:text-base">
                        {practiceResult.isCorrect === true
                          ? "🎉 정답이에요! 개념을 정확히 이해하셨네요."
                          : practiceResult.isCorrect === false
                          ? "🤔 아쉬워요! 한 번 더 확인해 볼까요?"
                          : "채점 상태를 확인해 주세요."}
                      </p>
                      <p className="mt-2 text-xs sm:text-sm leading-6">{practiceResult.feedback}</p>
                      {practiceResult.isCorrect === false && (
                        <p className="mt-2 text-xs sm:text-sm leading-6 opacity-90">
                          💡 힌트: {practiceResult.hint || practiceQuestion.hints[0]}
                        </p>
                      )}
                      {practiceResult.isCorrect === true && (
                        <p className="mt-2 text-xs sm:text-sm leading-6 opacity-90">
                          📖 해설: {practiceResult.explanation || practiceQuestion.explanation}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPracticeQuestion(null);
                            void generatePractice();
                          }}
                          className="rounded-full bg-[var(--lh-primary)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer"
                        >
                          다음 문제 풀기
                        </button>
                        {practiceResult.isCorrect !== true && (
                          <button
                            type="button"
                            onClick={() => setPracticeResult(null)}
                            className="rounded-full border border-current px-4 py-2 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                          >
                            다시 풀기
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}


          {isPractical && (
            <div className="mt-6 space-y-3 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-4 shadow-xs sm:p-5">
              <div>
                <h3 className="text-sm font-medium text-[var(--lh-ink)]">직접 해봤나요?</h3>
                <p className="text-xs text-[var(--lh-ink-secondary)]">문제 대신, 해본 뒤 느낀 점을 한두 줄 남겨 보세요. (선택)</p>
              </div>
              <textarea
                value={reflection}
                onChange={(event) => setReflection(event.target.value)}
                aria-label="해본 뒤 느낀 점"
                rows={2}
                maxLength={300}
                disabled={practicalDone}
                placeholder="예: 생각보다 어려웠지만 한 번 해보니 감이 왔어요"
                className="w-full resize-none rounded-xl border border-[var(--lh-line)] bg-[var(--lh-canvas)] p-3 text-sm leading-6 outline-none focus:border-[var(--lh-primary)] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={submitPracticalDone}
                disabled={practicalDone}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-5 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] disabled:cursor-default disabled:opacity-60 cursor-pointer sm:text-sm"
              >
                <CheckCircle2 aria-hidden className="h-4 w-4" /> {practicalDone ? "해봤어요 ✓ 지도에 남겼어요" : "해봤어요"}
              </button>
            </div>
          )}

            <div ref={endRef} />
          </div>

          {/* 하단 고정 AI 채팅 입력바: 읽다가 대화창처럼 바로 질문하고 코칭받습니다. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendQuestion(input);
            }}
            className="sticky bottom-0 z-10 -mx-5 mt-14 bg-[var(--lh-canvas)] px-5 pb-4 pt-1 sm:-mx-0 sm:px-0"
          >
            {/* 본문이 입력바 아래로 자연스럽게 사라지도록 위쪽 투명 → 아래 불투명 페이드를 깝니다. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-14 h-14 bg-gradient-to-t from-[var(--lh-canvas)] to-transparent" />
            <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1" role="group" aria-label="설명 깊이와 문제">
              {DEPTH_OPTIONS.map((option, optionIndex) => {
                const Icon = optionIndex === 0 ? Lightbulb : optionIndex === 1 ? CircleHelp : RotateCcw;
                return (
                  <button
                    type="button"
                    key={option.depth}
                    onClick={() => void sendQuestion(option.question, option.depth)}
                    disabled={isSending}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)]/90 px-3 text-xs font-medium text-[var(--lh-ink-secondary)] backdrop-blur transition hover:border-[var(--lh-primary-border)] hover:bg-[var(--lh-primary-subtle)] hover:text-[var(--lh-primary-text)] disabled:opacity-40 cursor-pointer"
                  >
                    <Icon aria-hidden className="h-3.5 w-3.5 text-[var(--lh-point)]" />
                    {option.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => void generatePractice()}
                disabled={isPracticeLoading}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)]/90 px-3 text-xs font-medium text-[var(--lh-ink-secondary)] backdrop-blur transition hover:border-[var(--lh-primary-border)] hover:bg-[var(--lh-primary-subtle)] hover:text-[var(--lh-primary-text)] disabled:opacity-40 cursor-pointer"
              >
                <CircleHelp aria-hidden className="h-3.5 w-3.5 text-[var(--lh-point)]" />
                문제 풀기
              </button>
            </div>
            <div className="flex items-end gap-1 rounded-[32px] border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] p-2 shadow-[var(--lh-shadow-md)] transition focus-within:border-[var(--lh-primary)]">
              <label htmlFor="lesson-chat-input" className="sr-only">궁금한 내용을 물어보세요</label>
              <textarea
                id="lesson-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void sendQuestion(input);
                  }
                }}
                rows={1}
                placeholder="읽다가 궁금한 점을 바로 물어보세요"
                className="lh-bare-input max-h-[160px] min-h-11 flex-1 resize-none bg-transparent px-4 py-2.5 text-base leading-6 text-[var(--lh-ink)] outline-none placeholder:text-[var(--lh-ink-tertiary)]"
              />
              <button
                type="submit"
                disabled={!input.trim() || isSending}
                aria-label="보내기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white transition hover:bg-[var(--lh-primary-hover)] disabled:cursor-default disabled:opacity-30 cursor-pointer"
              >
                <ArrowUp aria-hidden className="h-4.5 w-4.5" />
              </button>
            </div>
          </form>
        </section>
      </div>

      <LessonCompletionModal
        isOpen={completionOpen}
        onClose={() => setCompletionOpen(false)}
        courseTitle={course.title}
        lessonTitle={lessonMeta.title}
        savedStatus={completionSaveStatus === "saved" ? "saved" : completionSaveStatus === "error" ? "error" : "pending"}
        nextLesson={nextLesson}
        onStartNextLesson={nextLesson && onStartNextLesson ? () => onStartNextLesson(nextLesson.course, nextLesson.lesson, nextLesson.chapterTitle) : undefined}
        onGoHome={onBackToAssessment || onGoHome || onGoCourse || (() => setCompletionOpen(false))}
        courseCompleted={allCompleted}
        onStartAssessment={onStartAssessment}
      />
    </div>
  );
};
