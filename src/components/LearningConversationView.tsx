import { useStudyWorkspace } from "./study/useStudyWorkspace";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, CircleHelp, Lightbulb, Loader2 } from "lucide-react";
import { Course, LessonContent, LessonMeta, LessonStep } from "../types/learning";
import type { LessonCheckResult, LessonPhase } from "../types/lessonProgress";
import { authorizedFetch } from "../services/authClient";
import { aiResponseErrorMessage, readAiResponseError } from "../services/aiResponseError";
import { notifyLearningDataChanged, StorageService } from "../services/storage";
import { completeLesson } from "../services/lessonCompletion";
import { clearLessonProgress, getLessonProgress, saveLessonProgress } from "../services/lessonProgressStore";
import { validateLessonPayload } from "../domain/contentValidation";
import { createFallbackLessonContent } from "../domain/lessonFallback";
import { lessonLearningContext } from "../domain/lessonContext";
import { courseIsComplete } from "../domain/assessment";
import { RichLessonRenderer } from "./notion/RichLessonRenderer";
import { AgentMessage } from "./chat/AgentMessage";
import { ModelReasoningPicker } from "./chat/ModelReasoningPicker";
import { getTutorPersonaRequest } from "../services/tutorPersonaStore";
import { PaneWorkspace } from "./workspace/PaneWorkspace";
import type { PaneContext } from "./workspace/types";
import { ResumeBanner } from "./graph/ResumeBanner";
import { useKnowledgeGraph } from "./graph/useKnowledgeGraph";
import { addCuriosity, findMatchingConcept, getResumeContext, markPracticalDone, normalizeConceptKey, recommendNextSteps, setDepthReached, setLastPosition } from "./graph/graphBridge";
import { stepTitle, templateNudge, type NudgeText } from "./graph/nextStepText";
import { josa } from "./graph/korean";
import type { ConceptNode, ExplanationDepth, NextStep, ResumeContext } from "./graph/graphTypes";
import {
  ACTION_LABEL,
  DEPTH_QUESTION,
  buildStepText,
  checkActions,
  clampStepIndex,
  closingPrompt,
  reopenActions,
  stepActions,
  stepProgressLabel,
  type FlowAction,
} from "./lesson/lessonFlow";

interface LearningConversationViewProps {
  course: Course;
  lessonMeta: LessonMeta;
  chapterTitle: string;
  onFinishLesson: (metadata?: { kind: "read_only" | "quiz_checked"; courseId: string; lessonId: string }) => void;
  onGoHome?: () => void;
  onStartNextLesson?: (nextCourse: Course, nextLesson: LessonMeta, chapterTitle: string) => void;
  onGoCourse?: () => void;
  onStartAssessment?: () => void;
  onBackToAssessment?: () => void;
  /** 지도에서 "문제 풀기"로 들어왔을 때 곧바로 문제를 띄웁니다. */
  autoStartPractice?: boolean;
  onOpenKnowledgeMap?: () => void;
  /** 로그인했을 때만 입력바에 모델·추론 선택을 보여 줍니다. */
  isSignedIn?: boolean;
}

interface ConversationMessage {
  studyResultId?: string;
  sender: "user" | "tutor";
  text: string;
  chips?: string[];
  /** 이 메시지 아래에 보여 주는 빠른 답. 마지막 메시지의 것만 눌러 볼 수 있습니다. */
  actions?: FlowAction[];
  /** 지금 개념에서 벗어난 곁가지 질문. "나중에 볼래요"로 저장할 수 있습니다. */
  tangent?: { conceptName: string; question: string; saved?: boolean };
}

interface FlowProgress {
  stepIndex: number;
  phase: LessonPhase;
  checkResult?: LessonCheckResult;
}

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

const isUsableContent = (candidate: LessonContent | null, course: Course, lesson: LessonMeta) =>
  Boolean(candidate && candidate.courseId === course.id && candidate.lessonId === lesson.id && validateLessonPayload(candidate, course.learningType, { requireLearningArc: true }).length === 0);

export const LearningConversationView: React.FC<LearningConversationViewProps> = ({
  course,
  lessonMeta,
  chapterTitle,
  onFinishLesson,
  onGoHome,
  onGoCourse,
  onStartNextLesson,
  onStartAssessment,
  onBackToAssessment,
  autoStartPractice = false,
  onOpenKnowledgeMap,
  isSignedIn = false,
}) => {
  const historyKey = useMemo(() => getHistoryKey(course.id, lessonMeta.id), [course.id, lessonMeta.id]);
  const [content, setContent] = useState<LessonContent | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCompleted, setIsCompleted] = useState(lessonMeta.isCompleted);
  const [progress, setProgress] = useState<FlowProgress>({ stepIndex: 0, phase: "steps" });
  const [awaitingReflection, setAwaitingReflection] = useState(false);
  const [recommend, setRecommend] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceQuestion, setPracticeQuestion] = useState<PracticeQuestion | null>(null);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [practiceResult, setPracticeResult] = useState<PracticeResult | null>(null);
  const [practiceHintIndex, setPracticeHintIndex] = useState(0);
  const [isPracticeLoading, setIsPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState("");
  const [paneRequest, setPaneRequest] = useState<{ kind: string; nonce: number } | null>(null);
  const [pickedNote, setPickedNote] = useState<{ conceptId: string; conceptName: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const latestCourse = StorageService.getCourseById(course.id) || course;
  const allCompleted = courseIsComplete(latestCourse);

  // 개념 지도 · 다음 학습 유도
  const graph = useKnowledgeGraph();
  // 같은 개념이 다른 이름으로 합쳐져 있을 수 있어서, 지도에 있는 노드의 id를 우선 씁니다.
  const currentConceptId = findMatchingConcept(graph, lessonMeta.conceptName || lessonMeta.title)?.id ?? normalizeConceptKey(lessonMeta.conceptName || lessonMeta.title);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeContext | null>(null);
  const [keepGoing, setKeepGoing] = useState(false);
  const [understoodNow, setUnderstoodNow] = useState(false);
  const understood = understoodNow || isCompleted;
  const [dismissedPrompts, setDismissedPrompts] = useState<Set<number>>(new Set());
  const autoPracticeStartedRef = useRef(false);
  const initializedKeyRef = useRef("");
  const handledResultRef = useRef<PracticeResult | null>(null);
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
  const nameOfConcept = (id?: string) => graph.nodes.find((node) => node.id === id)?.name ?? "";
  const isPractical = course.learningType === "practical";
  const totalSteps = content?.steps.length ?? 0;

  // 비동기 작업이 끝난 뒤에도 가장 최근 값으로 추천 메시지를 만들기 위해 들고 있습니다.
  const latestRef = useRef({ steps, fallbackNudge, graph, allCompleted, keepGoing });
  latestRef.current = { steps, fallbackNudge, graph, allCompleted, keepGoing };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
        if (!cancelled) setContent(cached!);
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
            learningContext: lessonLearningContext(course, lessonMeta),
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

  const saveProgress = (next: FlowProgress) => {
    setProgress(next);
    saveLessonProgress({ courseId: course.id, lessonId: lessonMeta.id, stepIndex: next.stepIndex, phase: next.phase, ...(next.checkResult ? { checkResult: next.checkResult } : {}) });
  };

  const appendMessage = (message: ConversationMessage) => {
    setMessages((previous) => {
      const next = [...previous, message];
      saveConversation(historyKey, next);
      return next;
    });
  };
  const addUser = (text: string) => appendMessage({ sender: "user", text });
  const addTutor = (text: string, actions?: FlowAction[]) => appendMessage({ sender: "tutor", text, ...(actions ? { actions } : {}) });

  /** 단계 하나를 튜터 메시지로 보여 줍니다. 마지막 단계에는 확인 문제(실기형은 "해봤어요") 제안이 붙습니다. */
  const stepMessage = (stepContent: LessonContent, index: number): ConversationMessage => {
    const total = stepContent.steps.length;
    const i = clampStepIndex(index, total);
    let text = buildStepText({ index: i, step: stepContent.steps[i] });
    if (i === total - 1) text += `\n\n${closingPrompt(isPractical)}`;
    return { sender: "tutor", text, actions: stepActions(i, total, isPractical) };
  };

  const showStep = (index: number) => {
    if (!content) return;
    const i = clampStepIndex(index, content.steps.length);
    appendMessage(stepMessage(content, i));
    saveProgress({ stepIndex: i, phase: "steps" });
  };

  // 열 때: 저장된 진행 상태와 대화로 이어가거나, 처음이면 첫 단계부터 시작합니다.
  useEffect(() => {
    if (!content || initializedKeyRef.current === historyKey) return;
    initializedKeyRef.current = historyKey;
    const stored = readConversation(historyKey);
    const saved = getLessonProgress(course.id, lessonMeta.id);
    const total = content.steps.length;
    let nextMessages = stored;
    let next: FlowProgress;
    const legacyOpening = stored[0]?.sender === "tutor"
      && stored[0].text.includes("처음엔 큰 그림을")
      && (stored[0].text.match(/^#{1,3}\s/gm)?.length ?? 0) >= 3;
    const onlyLegacyIntroduction = legacyOpening && stored.every((message, index) =>
      message.sender === "tutor" && (index === 0
        || message.text === "이전에 한 번에 읽어 보셨던 레슨이에요. 이어서 확인해 볼까요?")
    );

    if (onlyLegacyIntroduction && !lessonMeta.isCompleted && saved?.phase !== "done" && !saved?.checkResult) {
      // 아직 질문하거나 문제를 풀지 않은 이전 도입만 새 단계 형식으로 바꿉니다.
      next = { stepIndex: 0, phase: "steps" };
      nextMessages = [stepMessage(content, 0)];
    } else if (saved) {
      next = { stepIndex: clampStepIndex(saved.stepIndex, total), phase: saved.phase, ...(saved.checkResult ? { checkResult: saved.checkResult } : {}) };
      // 질문하기 전의 첫 안내는 현재 레슨 데이터로 표시합니다.
      const untouchedOpening = stored.length === 1 && stored[0].sender === "tutor"
        && !!stored[0].actions?.length && next.phase === "steps" && next.stepIndex === 0;
      if (stored.length === 0 || untouchedOpening) nextMessages = [stepMessage(content, next.stepIndex)];
    } else if (stored.length === 0) {
      next = { stepIndex: 0, phase: "steps" };
      nextMessages = [stepMessage(content, 0)];
    } else {
      // 단계 대화가 생기기 전에 한 번에 읽던 레슨: 대화는 그대로 두고 확인 단계에서 이어갑니다.
      next = { stepIndex: Math.max(0, total - 1), phase: lessonMeta.isCompleted ? "done" : "check" };
      const legacyText = lessonMeta.isCompleted ? "이미 마친 레슨이에요. 어떻게 할까요?" : "이전에 한 번에 읽어 보셨던 레슨이에요. 이어서 확인해 볼까요?";
      // 진행 상태가 아직 저장되지 않은 채 다시 열어도 같은 안내가 쌓이지 않게 합니다.
      nextMessages = stored[stored.length - 1]?.text === legacyText ? stored : [...stored, { sender: "tutor", text: legacyText, actions: lessonMeta.isCompleted ? reopenActions() : checkActions(isPractical) }];
    }

    // 마지막 메시지에 이어갈 칩이 없으면(질문 도중 나갔거나 오류로 끝난 경우) 지금 단계의 칩을 다시 보여 줍니다.
    const last = nextMessages[nextMessages.length - 1];
    if (!(last?.sender === "tutor" && last.actions?.length)) {
      if (next.phase === "done") nextMessages = [...nextMessages, { sender: "tutor", text: "이미 마친 레슨이에요. 어떻게 할까요?", actions: reopenActions() }];
      else if (next.phase === "check") nextMessages = [...nextMessages, { sender: "tutor", text: closingPrompt(isPractical), actions: checkActions(isPractical) }];
      else nextMessages = [...nextMessages, { sender: "tutor", text: `이어서 진행할게요. ${stepProgressLabel(next.stepIndex, total)} 이 단계를 이해하셨나요?`, actions: stepActions(next.stepIndex, total, isPractical) }];
    }

    setMessages(nextMessages);
    saveProgress(next);
    saveConversation(historyKey, nextMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, historyKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending, practiceResult, practiceOpen, practiceQuestion]);

  const study = useStudyWorkspace({ scope: `course:${course.id}`, courseId: course.id, learningContext: { courseId: course.id, lessonId: lessonMeta.id, conceptId: currentConceptId, conceptName: lessonMeta.conceptName || lessonMeta.title }, busy: isSending || awaitingReflection, enabled: isSignedIn, onVoiceTurn: async (text) => sendQuestion(text) });

  const sendQuestion = async (question: string, depth?: ExplanationDepth, display?: string) => {
    const trimmed = question.trim() || study.defaultQuestion;
    if (!trimmed || isSending || study.working || !content) return;
    setInput("");
    if (awaitingReflection) {
      void submitReflection(trimmed);
      return;
    }
    if (!depth && progress.phase === "steps" && /^(?:이해(?:했어|했어요|했습니다)[.!]?\s*)?(?:이제\s*)?다음(?:\s*단계)?(?:로)?(?:\s*(?:가자|가요|넘어갈래|넘어가자|넘어가요|진행해줘|넘어가 주세요))?[.!?]*$/.test(trimmed)) {
      handleAction({ id: progress.stepIndex < content.steps.length - 1 ? "next" : "check", label: trimmed });
      return;
    }
    addUser(display ?? trimmed);
    if (!study.active && PRACTICE_REQUEST.test(trimmed)) {
      // 문제 요청은 AI 대화 호출 없이 대화 흐름 안에 바로 문제를 띄웁니다.
      startCheck();
      return;
    }
    setIsSending(true);
    try {
      const activeIndex = clampStepIndex(progress.stepIndex, content.steps.length);
      const activeStep = content.steps[activeIndex];
      const currentContext = `학습 맥락: ${JSON.stringify(lessonLearningContext(course, lessonMeta))}\n\n현재 챕터: ${chapterTitle}\n현재 단계 (${activeIndex + 1}/${content.steps.length}): ${activeStep.title}\n${activeStep.content}`;
      const lessonContext = currentContext;
      const studied = await study.answer(trimmed, boundedHistory(messages), lessonContext);
      if (studied) {
        appendMessage({ sender: "tutor", text: studied.reply, studyResultId: studied.id, actions: [{ id: "continue", label: ACTION_LABEL.continue }] });
        return studied.reply;
      }
      const response = await authorizedFetch("/api/ai/tutor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseTitle: course.title,
          lessonTitle: lessonMeta.title,
          conceptName: lessonMeta.conceptName,
          currentStepContent: lessonContext.slice(0, 8_000),
          history: boundedHistory(messages),
          userQuestion: trimmed,
          ...(depth ? { depth } : {}),
          persona: getTutorPersonaRequest(),
        }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!response.ok) throw await readAiResponseError(response);
      const data = await response.json();
      if (depth) setDepthReached(currentConceptId, depth);
      const tangent = data.tangent && typeof data.tangent.conceptName === "string" && typeof data.tangent.question === "string"
        ? { conceptName: data.tangent.conceptName.trim().slice(0, 40), question: data.tangent.question.trim().slice(0, 200) }
        : undefined;
      appendMessage({
        sender: "tutor",
        text: data.reply || "질문을 다시 설명해 주세요.",
        chips: Array.isArray(data.suggestionChips) ? data.suggestionChips.slice(0, 3) : [],
        // 질문에 답한 뒤에는 원래 하던 단계로 돌아올 수 있게 합니다.
        actions: [{ id: "continue", label: ACTION_LABEL.continue }],
        ...(tangent && tangent.conceptName ? { tangent } : {}),
      });
      const learned = typeof data.learnedConcept === "string" ? data.learnedConcept : data.learnedConcept?.conceptName;
      if (typeof learned === "string" && learned.trim()) triggerPulse(findMatchingConcept(graph, learned)?.id ?? currentConceptId);
      return data.reply as string;
    } catch (error) {
      appendMessage({
        sender: "tutor",
        text: error instanceof Error && error.message === "auth_required" ? "AI 학습 대화를 계속하려면 로그인해 주세요." : aiResponseErrorMessage(error),
        actions: [{ id: "continue", label: ACTION_LABEL.continue }],
      });
    } finally {
      setIsSending(false);
    }
  };

  const generatePractice = async () => {
    if (!content || isPracticeLoading) return;
    setPracticeOpen(true);
    setPracticeError("");
    setPracticeQuestion(null);
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
      if (!response.ok) throw await readAiResponseError(response);
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
      setPracticeError(error instanceof Error && error.message === "auth_required" ? "로그인 후 문제를 생성할 수 있습니다." : aiResponseErrorMessage(error, "문제를 준비하지 못했습니다. 다시 시도해 주세요."));
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
          persona: getTutorPersonaRequest(),
        }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!response.ok) throw await readAiResponseError(response);
      const data = await response.json();
      const isCorrect = typeof data.isCorrect === "boolean" ? data.isCorrect : null;
      setPracticeResult({ isCorrect, feedback: data.feedback || "답안을 확인해 보세요.", hint: data.hint, explanation: data.explanation });
      if (isCorrect !== null) {
        StorageService.recordQuizAnswer(course.id, course.title, lessonMeta.conceptId, lessonMeta.conceptName, isCorrect);
        if (isCorrect) triggerPulse(currentConceptId);
      }
    } catch (error) {
      setPracticeResult({ isCorrect: null, feedback: error instanceof Error && error.message === "auth_required" ? "로그인 후 답안을 채점할 수 있습니다." : aiResponseErrorMessage(error, "채점을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.") });
    } finally {
      setIsPracticeLoading(false);
    }
  };

  /** 확인 문제를 대화 안에서 엽니다. */
  const startCheck = () => {
    saveProgress({ stepIndex: progress.stepIndex, phase: "check" });
    addTutor("좋아요, 문제 하나 내볼게요. 아래에서 풀어 보세요. 어려우면 힌트를 봐도 되고, 넘기고 싶으면 ‘괜찮아요, 넘어갈게요’를 눌러도 돼요.", [{ id: "skip", label: ACTION_LABEL.skip }]);
    void generatePractice();
  };

  /** 레슨을 완료로 기록하고, 같은 대화에서 다음 학습을 이어서 권합니다. */
  const complete = (outcome: LessonCheckResult) => {
    const result = completeLesson(course.id, lessonMeta.id, outcome);
    if (!result.ok && !result.alreadyCompleted && result.reason !== undefined && result.reason !== "storage") {
      addTutor("레슨 기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", [{ id: "finish", label: ACTION_LABEL.finish }]);
      return;
    }
    setIsCompleted(true);
    setProgress({ stepIndex: progress.stepIndex, phase: "done", checkResult: outcome });
    triggerPulse(currentConceptId);
    onFinishLesson({ kind: outcome === "correct" || outcome === "incorrect" ? "quiz_checked" : "read_only", courseId: course.id, lessonId: lessonMeta.id });
    addTutor(outcome === "correct" ? "정답이에요! 이 레슨을 완료로 표시했어요. ✓" : "이 레슨을 완료로 표시했어요. ✓");
    setRecommend(true);
  };

  const submitReflection = async (text: string) => {
    setAwaitingReflection(false);
    if (text.trim()) {
      addUser(text.trim());
      markPracticalDone(currentConceptId, text.trim());
    }
    complete("practiced");
  };

  // 확인 문제를 채점한 결과를 대화로 이어 갑니다.
  useEffect(() => {
    if (!practiceResult || progress.phase !== "check" || handledResultRef.current === practiceResult) return;
    handledResultRef.current = practiceResult;
    if (practiceResult.isCorrect === true) {
      complete("correct");
    } else if (practiceResult.isCorrect === false) {
      addTutor("아쉬워요. 해설을 보고 다시 풀어 볼 수도 있고, 이대로 마칠 수도 있어요. 이대로 마치면 나중에 복습으로 다시 만나요.", [{ id: "retry", label: ACTION_LABEL.retry }, { id: "finish", label: ACTION_LABEL.finish }]);
    } else {
      addTutor("채점을 마치지 못했어요. 다시 풀어 보거나, 이대로 마칠 수 있어요.", [{ id: "retry", label: ACTION_LABEL.retry }, { id: "finish", label: ACTION_LABEL.finish }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceResult]);

  useEffect(() => {
    if (!autoStartPractice || !content || autoPracticeStartedRef.current || !initializedKeyRef.current) return;
    autoPracticeStartedRef.current = true;
    startCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartPractice, content, messages.length]);

  const fetchNudge = async (): Promise<NudgeText | null> => {
    const { steps: current, graph: currentGraph } = latestRef.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    const nameIn = (id?: string) => currentGraph.nodes.find((node) => node.id === id)?.name ?? "";
    try {
      const response = await authorizedFetch("/api/ai/next-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentConceptName: lessonMeta.conceptName,
          // 이름을 모르는 칸은 빼고 보냅니다. 빈 문자열은 서버 검증에서 요청 전체가 거절됩니다.
          steps: current.map((step) => {
            const conceptName = nameIn(step.conceptId);
            const becauseOfConceptName = nameIn(step.becauseOfConceptId);
            return { kind: step.kind, ...(conceptName ? { conceptName } : {}), ...(becauseOfConceptName ? { becauseOfConceptName } : {}) };
          }),
          persona: getTutorPersonaRequest(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json();
      const source = data?.nudge ?? data;
      if (typeof source?.question === "string" && source.question.trim()) {
        return { question: source.question.trim(), reason: typeof source.reason === "string" ? source.reason.trim() : "" };
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // 완료한 직후(또는 "조금 더 해볼래요" 뒤) 다음 학습 추천을 대화로 이어 줍니다. 세션이 길면 마무리 메시지를 줍니다.
  useEffect(() => {
    if (!recommend) return;
    setRecommend(false);
    const timer = setTimeout(async () => {
      const { steps: current, graph: currentGraph, fallbackNudge: fallback, allCompleted: courseDone, keepGoing: continuing } = latestRef.current;
      const extra: FlowAction[] = [];
      let lead = "";
      if (onBackToAssessment) extra.push({ id: "back", label: "시험으로 돌아가기" });
      if (courseDone && onStartAssessment) {
        extra.push({ id: "assessment", label: "과목 전체 문제로 실력 확인" });
        lead = "이 과목의 모든 레슨을 마쳤어요! ";
      }
      if (current[0]?.kind === "wrap_up" && !continuing) {
        const text = `${lead}오늘은 여기까지 잘했어요. 오늘 ‘${lessonMeta.conceptName}’까지 지도에 밝혀 뒀어요. 쉬었다 와도 지도는 그대로 남아 있고, 다음엔 이어서 시작할 수 있어요.`;
        if (mountedRef.current) addTutor(text, [...extra, { id: "stop", label: ACTION_LABEL.stop }, { id: "more", label: ACTION_LABEL.more }]);
        return;
      }
      const cards = current.filter((step) => step.kind !== "wrap_up").slice(0, 3);
      const nudge = cards.length > 0 ? (await fetchNudge()) ?? fallback : null;
      if (!mountedRef.current) return;
      const actions: FlowAction[] = [
        ...extra,
        ...cards.map((step) => ({ id: "step" as const, label: stepTitle(currentGraph, step), step: { kind: step.kind, conceptId: step.conceptId, courseId: step.courseId, lessonId: step.lessonId, becauseOfConceptId: step.becauseOfConceptId, score: step.score } })),
        { id: "other", label: ACTION_LABEL.other },
        { id: "stop", label: ACTION_LABEL.stop },
      ];
      const body = nudge ? `${nudge.question}${nudge.reason ? `\n\n${nudge.reason}` : ""}` : "다음엔 무엇을 해볼까요?";
      addTutor(`${lead}${body}`, actions);
    }, 150);
    // 정리(cleanup)에서 타이머를 지우면 안 됩니다: recommend를 곧바로 false로 되돌리므로 그 정리가 먼저 돌아 메시지가 사라집니다.
    void timer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommend]);

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

  /** 빠른 답 칩을 눌렀을 때. 사용자 말풍선을 남기고 다음 메시지로 이어 갑니다. */
  const handleAction = (action: FlowAction) => {
    if (isSending || !content) return;
    const total = content.steps.length;
    switch (action.id) {
      case "next":
        addUser(action.label);
        showStep(progress.stepIndex + 1);
        return;
      case "easier":
      case "example": {
        const { depth, question } = DEPTH_QUESTION[action.id];
        const step = content.steps[clampStepIndex(progress.stepIndex, total)];
        void sendQuestion(`${question} (지금은 “${step.title}” 단계예요.)`, depth, action.label);
        return;
      }
      case "continue":
        addUser(action.label);
        if (progress.phase === "done") {
          setRecommend(true);
        } else if (progress.phase === "check") {
          addTutor("좋아요. 확인 문제를 풀어 볼까요?", checkActions(isPractical));
        } else {
          addTutor(`좋아요, 이어갈게요. ${stepProgressLabel(progress.stepIndex, total)} 이 단계를 이해하셨나요?`, stepActions(progress.stepIndex, total, isPractical));
        }
        return;
      case "check":
        addUser(action.label);
        startCheck();
        return;
      case "skip":
      case "finish":
        addUser(action.label);
        complete("skipped");
        return;
      case "retry":
        addUser(action.label);
        setPracticeResult(null);
        handledResultRef.current = null;
        return;
      case "did":
        addUser(action.label);
        saveProgress({ stepIndex: progress.stepIndex, phase: "check" });
        setAwaitingReflection(true);
        addTutor("해보니 어땠는지 한 줄로 남겨 볼까요? 아래 입력창에 적어 주세요. 건너뛰어도 괜찮아요.", [{ id: "skip-reflection", label: ACTION_LABEL.skipReflection }]);
        return;
      case "skip-reflection":
        addUser(action.label);
        void submitReflection("");
        return;
      case "restart":
        addUser(action.label);
        clearLessonProgress(course.id, lessonMeta.id);
        setPracticeOpen(false);
        showStep(0);
        return;
      case "ask":
        addUser(action.label);
        addTutor("좋아요. 궁금한 점을 아래 입력창에 편하게 물어보세요.", [{ id: "continue", label: ACTION_LABEL.continue }]);
        return;
      case "step":
        addUser(action.label);
        if (action.step) openStep(action.step as NextStep);
        return;
      case "assessment":
        onStartAssessment?.();
        return;
      case "back":
        onBackToAssessment?.();
        return;
      case "other":
      case "stop":
        onGoHome?.();
        return;
      case "more":
        addUser(action.label);
        setKeepGoing(true);
        latestRef.current = { ...latestRef.current, keepGoing: true };
        setRecommend(true);
        return;
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

  // 오른쪽 작업 공간(패널)에 넘기는 정보
  const noteTarget = pickedNote ?? { conceptId: currentConceptId, conceptName: lessonMeta.conceptName || lessonMeta.title };
  const paneContext: PaneContext = {
    graph,
    currentConceptId,
    nextIds: steps.filter((step) => step.kind !== "wrap_up").map((step) => step.conceptId).filter((id): id is string => Boolean(id)),
    pulseId,
    courseId: course.id,
    lessonId: lessonMeta.id,
    noteTarget,
    onOpenNotes: (node: ConceptNode) => {
      setPickedNote(node.id === currentConceptId ? null : { conceptId: node.id, conceptName: node.name });
      setPaneRequest((previous) => ({ kind: "notes", nonce: (previous?.nonce ?? 0) + 1 }));
    },
    onOpenMap: onOpenKnowledgeMap,
  };

  if (isLoadingContent || !content) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-[var(--lh-ink-secondary)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--lh-primary)]" />
        <span className="text-sm font-medium">수업을 준비하고 있어요…</span>
      </div>
    );
  }

  const lastIndex = messages.length - 1;

  return (
    <div className="flex w-full">
      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col pt-4 sm:pt-6">
        <section aria-label={`${lessonMeta.title} 학습 대화`} className="mx-auto flex w-full min-w-0 max-w-[720px] flex-1 flex-col px-5 sm:px-8">
          {onGoCourse && <div className="mb-3 flex justify-end"><button type="button" onClick={onGoCourse} className="min-h-10 text-sm text-[var(--lh-ink-secondary)] underline-offset-4 hover:underline">전체 과정</button></div>}
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
              {messages.map((message, index) =>
                message.sender === "tutor" ? (
                  <AgentMessage key={`${message.sender}-${index}`} showProfile={messages[index - 1]?.sender !== "tutor"} className={messages[index - 1]?.sender === "tutor" ? "-mt-2" : ""}>
                    <RichLessonRenderer content={message.text} />
                    {study.renderResultLink(message.studyResultId)}
                    {message.tangent && (
                      <div className="mt-4 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4">
                        <p className="text-[15px] leading-6 text-[var(--lh-ink)]">
                          좋은 곁가지 질문이에요. ‘{message.tangent.conceptName}’{josa(message.tangent.conceptName, "은/는")} 지도에 <strong className="font-medium">궁금해요</strong>로 남겨 두고 나중에 이어서 볼 수 있어요.
                        </p>
                        <button
                          type="button"
                          onClick={() => saveTangent(index)}
                          disabled={message.tangent.saved}
                          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-surface)] px-4 text-sm font-medium text-[var(--lh-primary-text)] transition hover:bg-[var(--lh-primary-subtle)] disabled:cursor-default disabled:opacity-70 cursor-pointer"
                        >
                          {message.tangent.saved ? "지도에 저장했어요" : "나중에 볼래요"}
                        </button>
                      </div>
                    )}
                    {index === lastIndex && !isSending && !dismissedPrompts.has(index) && !practiceOpen && index > 0 && PRACTICE_OFFER.test(message.text) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setDismissedPrompts((previous) => new Set(previous).add(index)); startCheck(); }} className="min-h-10 rounded-full bg-[var(--lh-primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">좋아요, 풀어볼게요</button>
                        <button type="button" onClick={() => setDismissedPrompts((previous) => new Set(previous).add(index))} className="min-h-10 rounded-full border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-4 text-sm font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer">괜찮아요, 넘길게요</button>
                      </div>
                    )}
                    {message.chips && message.chips.length > 0 && index === lastIndex && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {message.chips.map((chip) => <button type="button" key={chip} onClick={() => void sendQuestion(chip)} disabled={isSending} className="min-h-9 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-3.5 text-sm font-medium text-[var(--lh-primary-text)] transition hover:bg-[var(--lh-primary)] hover:text-white disabled:opacity-40 cursor-pointer">{chip}</button>)}
                      </div>
                    )}
                    {message.actions && message.actions.length > 0 && index === lastIndex && !isSending && (
                      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="빠른 답">
                        {message.actions.map((action, actionIndex) => (
                          <button
                            type="button"
                            key={`${action.id}-${action.label}`}
                            onClick={() => handleAction(action)}
                            className={`inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-medium transition cursor-pointer ${
                              actionIndex === 0
                                ? "bg-[var(--lh-primary)] text-white hover:bg-[var(--lh-primary-hover)]"
                                : "border border-[var(--lh-primary-border)] bg-[var(--lh-surface)] text-[var(--lh-primary-text)] hover:bg-[var(--lh-primary-subtle)]"
                            }`}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </AgentMessage>
                ) : (
                  <div key={`${message.sender}-${index}`} className="flex w-full justify-end">
                    <div className="max-w-[88%] rounded-3xl bg-[var(--lh-primary-subtle)] px-5 py-3.5 text-[var(--lh-primary-text)] sm:max-w-[80%]">
                      <p className="whitespace-pre-wrap text-base leading-7">{message.text}</p>
                    </div>
                  </div>
                ),
              )}
              {isSending && <div className="flex items-center gap-2 text-[15px] text-[var(--lh-ink-secondary)]"><Loader2 className="h-4 w-4 animate-spin text-[var(--lh-primary)]" /> 학습 맥락을 확인해 답변을 만드는 중...</div>}
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


            <div ref={endRef} />
          </div>

          {/* 하단 고정 AI 채팅 입력바: 읽다가 대화창처럼 바로 질문하고 코칭받습니다. */}
          <form
            onDragOver={event => event.preventDefault()}
            onDrop={study.onDrop}
            onSubmit={(event) => {
              event.preventDefault();
              void sendQuestion(input);
            }}
            className="sticky bottom-0 z-10 -mx-5 mt-14 bg-[var(--lh-chat-bg)] px-5 pb-4 pt-1 sm:-mx-8 sm:px-8"
          >
            {/* 본문이 입력바 아래로 자연스럽게 사라지도록 위쪽 투명 → 아래 불투명 페이드를 깝니다. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-14 h-14 bg-gradient-to-t from-[var(--lh-chat-bg)] to-transparent" />
            {/* 로그인하면 글 칸 아래 줄에 모델·추론 선택과 보내기 버튼을 둡니다. */}
            <div className={`relative border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] p-2 shadow-[var(--lh-shadow-md)] transition focus-within:border-[var(--lh-primary)] ${isSignedIn ? "flex flex-col gap-0.5 rounded-[28px]" : "flex items-end gap-1 rounded-[32px]"}`}>
              {isSignedIn && study.status}
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
                maxLength={2000}
                placeholder={awaitingReflection ? "해본 뒤 느낀 점을 한 줄로 적어 주세요" : "읽다가 궁금한 점을 바로 물어보세요"}
                className={`lh-bare-input max-h-[160px] min-h-11 resize-none bg-transparent text-base leading-6 text-[var(--lh-ink)] outline-none placeholder:text-[var(--lh-ink-tertiary)] ${isSignedIn ? "block w-full px-3 pb-1 pt-2.5" : "flex-1 px-4 py-2.5"}`}
              />
              <div className={isSignedIn ? "flex items-center justify-end gap-1" : "contents"}>
                {isSignedIn && <>{study.toolbar}<div className="flex-1" /></>}
                {isSignedIn && <ModelReasoningPicker direction="up" />}
                <button
                  type="submit"
                  disabled={(!input.trim() && !study.defaultQuestion) || isSending || study.working}
                  aria-label="보내기"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white transition hover:bg-[var(--lh-primary-hover)] disabled:cursor-default disabled:opacity-30 cursor-pointer"
                >
                  <ArrowUp aria-hidden className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>

      {study.modal}
      <PaneWorkspace context={paneContext} request={paneRequest} />
    </div>
  );
};
