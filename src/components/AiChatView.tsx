import { useStudyWorkspace } from "./study/useStudyWorkspace";
import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, BookOpen, Flag, ListChecks, Loader2, Plus, Sparkles, X } from "lucide-react";
import type { Course } from "../types/learning";
import { authorizedFetch } from "../services/authClient";
import { AiResponseError, aiResponseErrorMessage, readAiResponseError } from "../services/aiResponseError";
import { GUEST_TRIAL_EXHAUSTED_CODE, guestTutorFetch, readTrialRemaining } from "../services/guestTrial";
import { addCuriosity } from "./graph/graphBridge";
import type { CurriculumConceptLinks, ResumeContext } from "./graph/graphTypes";
import { AgentMessage } from "./chat/AgentMessage";
import { CoursePreviewCard } from "./chat/CoursePreviewCard";
import { ModelReasoningPicker } from "./chat/ModelReasoningPicker";
import { RichLessonRenderer } from "./notion/RichLessonRenderer";
import { getTutorPersonaRequest } from "../services/tutorPersonaStore";
import { appendChatMessage, createChatSession, getChatSession, setMessageCoursePreview, setMessageCourseId } from "../services/chatSessionStore";
import { getLearnerContext } from "../services/learnerContext";
import { toTutorHistory } from "../domain/chatSession";
import { resolveLearningIntent } from "../domain/learningIntent";
import type { NewChatMessage } from "../types/chat";
import { savePendingChat, takePendingChat } from "./chat/pendingChat";
import { restorePreviewSetup, restoreSetupFlow } from "./chat/restoreSetup";
import { findPreviewMessageIndex, toChatCoursePreview } from "./chat/previewPersist";
import {
  SETUP_INTRO,
  SETUP_LIMITS,
  SETUP_REASK,
  SETUP_SKIP_OPTION,
  SETUP_STEPS,
  applySetupAnswer,
  initialSetupProgress,
  nextSetupStep,
  sanitizeCourseSetup,
} from "../domain/courseSetup";
import { fetchLevelCheckQuestion, resolveSetupAnswer } from "../services/courseSetup";
import type { CourseSetup, SetupProgress, SetupStep, SetupStepId } from "../types/courseSetup";
import type { ChatSetupState } from "../types/chat";
import { submitContentReport } from "../services/contentReports";

interface ChatMessage {
  courseId?: string;
  autoStart?: boolean;
  studyResultId?: string;
  id: string;
  role: "user" | "assistant";
  text: string;
  /** 이 답변이 나온 질문. 궁금해요 저장·과목 만들기에 씁니다. */
  question?: string;
  /** AI가 짚어 준 개념 이름 */
  conceptName?: string;
  saved?: boolean;
  /** 있으면 이 메시지 아래에 과목 미리보기 카드를 띄웁니다. */
  previewSubject?: string;
  /** 미리보기 카드가 처음 쓸 설정(대화로 정한 수준·목적·하루 시간) */
  previewSetup?: CourseSetup;
  /** 저장해 둔 미리보기 결과. 있으면 다시 만들지 않고 그대로 그립니다. */
  previewData?: Record<string, any>;
  /** 과목 설정 질문. 빠른 답 칩을 보여 줍니다. */
  setupQuestion?: { stepId: SetupStepId; answered?: string; question: string };
  /** 이 답 뒤로 과목 설정 질문이 시작됐는지. 그러면 같은 일을 하는 버튼은 숨깁니다. */
  setupStarted?: boolean;
  chips?: string[];
}

/** 대화로 과목 설정을 묻는 중인 흐름. 한 번에 질문 하나씩 진행합니다. */
interface SetupFlow {
  subject: string;
  setup: CourseSetup;
  progress: SetupProgress;
  step: SetupStep;
  /** 지금 화면에 올라간 질문 문구 */
  question: string;
  /** 같은 질문을 이미 한 번 다시 물었는지 */
  reasked: boolean;
}

let messageSeq = 0;
const nextId = () => `m-${Date.now().toString(36)}-${messageSeq++}`;

/** 이어서 나온 튜터 답변 묶음의 글을 모읍니다. 신고 버튼은 묶음 끝에 한 번만 두고, 묶음 전체를 함께 보냅니다. */
const assistantGroupText = (messages: ChatMessage[], lastIndex: number): string => {
  let start = lastIndex;
  while (start > 0 && messages[start - 1].role === "assistant") start -= 1;
  return messages.slice(start, lastIndex + 1).map((message) => message.text).join("\n\n");
};

/** 마우스로 쓰는 화면에서만 첫 입력칸에 바로 커서를 둡니다. 터치 화면에서는 누르지도 않았는데 입력창이 강조되고 키보드가 올라올 수 있습니다. */
const canAutoFocusInput = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** 질문에서 지도에 남길 짧은 이름을 만듭니다. */
const toConceptName = (question: string): string => {
  const firstSentence = question.split(/[.。!！?？\n]/u)[0] ?? question;
  const cleaned = firstSentence
    .replace(/^(?:나는|난|저는|전|내가|제가|그럼|그러면|근데|그런데|혹시)\s+/u, "")
    .replace(/\s*(?:을|를|은|는|이|가)?\s*(?:기초부터\s*|처음부터\s*|쉽게\s*|자세히\s*|깊이\s*있게\s*|정확히\s*)?(?:배우고\s*싶.*|배워\s*보고\s*싶.*|공부하고\s*싶.*|알고\s*싶.*|알아보고\s*싶.*|궁금.*|가르쳐\s*주.*|알려\s*주.*|설명해\s*주.*|무슨\s*뜻.*|무엇인가요.*|뭔가요.*|뭘까요.*|왜\s+.*(?:나요|인가요|끝나나요|시작하나요|될까요|되나요).*)$/u, "")
    .replace(/\s*(?:에\s*대해서?|에\s*대하여|에\s*관해서?)\s*$/u, "")
    .replace(/\s*(?:을|를|은|는|이|가)\s*$/u, "")
    .replace(/[?？!！.。]+$/g, "")
    .replace(/\s+/g, " ")
    .trim() || question.replace(/[?？!！.。]+$/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 24 ? `${cleaned.slice(0, 23)}…` : cleaned;
};

interface AiChatViewProps {
  isSignedIn: boolean;
  userName?: string;
  /** 저장된 대화를 열 때의 대화 id. 없으면 새 대화입니다. */
  sessionId?: string | null;
  /** 새 대화를 "과목으로 만들기" 입력 모드로 시작합니다. */
  startInCourseMode?: boolean;
  /** 이어갈 학습이 있을 때만 입력창 아래에 한 줄로 보여 줍니다. */
  resume: ResumeContext | null;
  onResume: () => void;
  /** 로그인한 사용자가 미리보기 카드에서 과목을 시작합니다. */
  onStartCourse: (course: Course, links: CurriculumConceptLinks) => void;
  onResumeCourse: (courseId: string) => void;
  /** 로그인 전 사용자가 미리보기 카드에서 시작을 눌렀을 때 */
  onGuestStartCourse: (subject: string, data: Record<string, any>, setup: CourseSetup) => void;
  onRequestAuth: () => void;
  onBrowseCourses: () => void;
  onPractice: () => void;
  /** 새 대화가 처음 저장될 때 알려 줍니다. 화면을 다시 만들지 않고 사이드바 강조만 갱신합니다. */
  onSessionCreated?: (sessionId: string) => void;
}

export const AiChatView: React.FC<AiChatViewProps> = ({
  isSignedIn,
  userName,
  sessionId = null,
  startInCourseMode = false,
  resume,
  onResume,
  onStartCourse,
  onResumeCourse,
  onGuestStartCourse,
  onRequestAuth,
  onBrowseCourses,
  onPractice,
  onSessionCreated,
}) => {
  // 다시 연 대화: 저장된 글을 불러오고, 답하지 않은 설정 질문이 있으면 그 단계를 되살립니다.
  const [initial] = useState(() => {
    const stored = sessionId ? getChatSession(sessionId)?.messages ?? [] : [];
    return { stored, restored: restoreSetupFlow(stored, isSignedIn) };
  });
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initial.stored.map((message, index) => ({
      id: nextId(),
      role: message.role,
      text: message.text,
      studyResultId: message.studyResultId,
      question: message.question,
      conceptName: message.conceptName,
      courseId: message.courseId,
      previewSubject: message.courseId ? undefined : message.coursePreview?.subject ?? message.learningIntent?.subject,
      // 저장된 설정(확인 질문으로 정해진 수준 포함)을 먼저 쓰고, 없는 예전 대화는 안내 문장과 질문·답에서 되살립니다.
      previewSetup: message.coursePreview?.setup ?? (message.learningIntent ? restorePreviewSetup(initial.stored, index) : undefined),
      previewData: message.coursePreview?.data,
      // 이 답 뒤로 설정 질문이 이어졌으면 '궁금해요/과목 만들기' 버튼은 숨깁니다.
      setupStarted: Boolean(message.question) && Boolean(initial.stored[index + 1]?.setupState || initial.stored[index + 1]?.text.startsWith(SETUP_INTRO)),
      setupQuestion: initial.restored?.messageIndex === index ? { stepId: initial.restored.step.id, question: initial.restored.question } : undefined,
    })),
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [preparingCourse, setPreparingCourse] = useState(false);
  const [courseMode, setCourseMode] = useState(startInCourseMode);
  /** 로그인 전 체험 대화가 몇 번 남았는지. 첫 답을 받기 전에는 알 수 없습니다. */
  const [trialRemaining, setTrialRemaining] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [flow, setFlow] = useState<SetupFlow | null>(() =>
    initial.restored
      ? { subject: initial.restored.subject, setup: initial.restored.setup, progress: initial.restored.progress, step: initial.restored.step, question: initial.restored.question, reasked: false }
      : null,
  );
  const sessionRef = useRef<string | null>(sessionId);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const started = messages.length > 0;
  const study = useStudyWorkspace({ scope: `chat:${sessionId || "draft"}`, busy: loading || preparingCourse || !!flow || courseMode, enabled: isSignedIn, onVoiceTurn: async (text) => send(text), extraActions: [
    { label: "\uacfc\ubaa9 \ub9cc\ub4e4\uae30", run: () => { setCourseMode(true); inputRef.current?.focus(); } },
    { label: "\ubb38\uc81c \ud480\uae30", run: onPractice },
    { label: "\uacfc\uc815 \ub458\ub7ec\ubcf4\uae30", run: onBrowseCourses },
  ] });

  useEffect(() => {
    if (started) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, started]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
      } else if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const persist = (message: NewChatMessage) => {
    if (!isSignedIn) return;
    const id = sessionRef.current;
    if (!id) {
      if (message.role !== "user") return;
      const created = createChatSession(message.text);
      if (created) {
        sessionRef.current = created.id;
        onSessionCreated?.(created.id);
      }
      return;
    }
    appendChatMessage(id, message);
  };

  /** 새로 받은 미리보기 결과를 그 안내 메시지에 붙여 저장합니다. 다시 열 때 AI를 다시 부르지 않기 위해서입니다. */
  const savePreview = (text: string, subject: string, data: Record<string, any>, setup: CourseSetup) => {
    const id = sessionRef.current;
    if (!isSignedIn || !id) return;
    const index = findPreviewMessageIndex(getChatSession(id)?.messages ?? [], text, subject);
    if (index >= 0) setMessageCoursePreview(id, index, toChatCoursePreview(subject, data, setup));
  };

  const startPreparedCourse = (message: ChatMessage, course: Course, links: CurriculumConceptLinks) => {
    onStartCourse(course, links);
    const id = sessionRef.current;
    if (id) {
      const index = findPreviewMessageIndex(getChatSession(id)?.messages ?? [], message.text, message.previewSubject!);
      if (index >= 0) setMessageCourseId(id, index, course.id);
    }
    setMessages(items => items.map(item => item.id === message.id ? { ...item, courseId: course.id, previewSubject: undefined, autoStart: false } : item));
  };

  const addMessages = (...items: ChatMessage[]) => setMessages((previous) => [...previous, ...items]);

  /** 안내를 반복하지 않고 질문만 표시합니다. */
  const askStep = (step: SetupStep, question: string, first = false, state?: Omit<ChatSetupState, "stepId" | "question">) => {
    const text = question;
    addMessages({ id: nextId(), role: "assistant", text, setupQuestion: { stepId: step.id, question } });
    persist({ role: "assistant", text, ...(state ? { setupState: { ...state, stepId: step.id, question } } : {}) });
  };

  const finishSetup = (subject: string, setup: CourseSetup, progress: SetupProgress = initialSetupProgress()) => {
    setFlow(null);
    // 목표·순서는 수업 본문에 녹이고, 여기서는 첫 수업을 준비한다.
    setPreparingCourse(true);
    const intro = "이제 함께 배워볼게요.";
    addMessages({ id: nextId(), role: "assistant", text: intro, previewSubject: subject, previewSetup: setup, autoStart: true });
    persist({ role: "assistant", text: intro, learningIntent: { subject }, setupState: { subject, setup, progress } });
  };

  /** 다음 질문으로 넘어가거나, 끝났으면 미리보기를 보여 줍니다. 확인 질문은 AI가 만들며, 못 만들면 그 단계를 건너뜁니다. */
  const advanceSetup = async (subject: string, setup: CourseSetup, progress: SetupProgress, first = false) => {
    let current = progress;
    for (;;) {
      const next = nextSetupStep(current, setup, isSignedIn);
      if (!next) {
        finishSetup(subject, setup, current);
        return;
      }
      let question = next.question ? next.question(subject) : null;
      if (!question) {
        setLoading(true);
        question = await fetchLevelCheckQuestion(subject, setup.experience, setup.levelEvidence);
        setLoading(false);
        if (!question) {
          const notice = "수업에서 함께 살펴볼게요.";
          addMessages({ id: nextId(), role: "assistant", text: notice });
          persist({ role: "assistant", text: notice });
          finishSetup(subject, setup, current);
          return;
        }
      }
      setFlow({ subject, setup, progress: current, step: next, question, reasked: false });
      askStep(next, question, first, { subject, setup, progress: current });
      return;
    }
  };

  /** 과목 설정 질문을 시작합니다. userText가 있으면 그 말을 먼저 사용자 메시지로 남깁니다. */
  const beginSetup = async (subject: string, userText?: string, learningRequest = userText) => {
    const topic = resolveLearningIntent(subject)?.subject ?? subject.trim();
    if (userText) {
      addMessages({ id: nextId(), role: "user", text: userText });
      persist({ role: "user", text: userText });
    }
    setLoading(true);
    try {
      const setup = sanitizeCourseSetup(learningRequest ? { levelEvidence: `학습자가 원하는 배움: ${learningRequest.trim().slice(0, 400)}` } : {});
      await advanceSetup(topic, setup, initialSetupProgress(), true);
    } finally {
      setLoading(false);
    }
  };

  const markAnswered = (items: ChatMessage[], stepId: SetupStepId, label: string) =>
    items.map((item) => (item.setupQuestion && !item.setupQuestion.answered && item.setupQuestion.stepId === stepId ? { ...item, setupQuestion: { ...item.setupQuestion, answered: label } } : item));

  /** 답을 기록하고 다음 질문으로 넘어갑니다. */
  const answerStep = async (value: Partial<CourseSetup>, label: string, feedback?: string, nextQuestion?: string) => {
    if (!flow) return;
    setLoading(true);
    try {
      const evidence = flow.step.id === "experience" ? { ...value, levelEvidence: [flow.setup.levelEvidence, `경험에 대한 자기 보고: ${label.slice(0, 400)}`].filter(Boolean).join("\n") } : value;
      const applied = applySetupAnswer(flow.setup, flow.progress, flow.step.id, evidence);
      const state = { subject: flow.subject, setup: applied.setup, progress: applied.progress };
      setMessages((previous) => [...markAnswered(previous, flow.step.id, label), { id: nextId(), role: "user", text: label }]);
      persist({ role: "user", text: label, setupState: state });
      if (feedback) {
        addMessages({ id: nextId(), role: "assistant", text: feedback });
        persist({ role: "assistant", text: feedback, setupState: state });
      }
      if (flow.step.id === "levelCheck" && nextQuestion && (applied.progress.levelCheckCount ?? 0) < SETUP_LIMITS.maxLevelChecks) {
        const progress = { ...applied.progress, answered: applied.progress.answered.filter(id => id !== "levelCheck") };
        setFlow({ subject: flow.subject, setup: applied.setup, progress, step: SETUP_STEPS.levelCheck, question: nextQuestion, reasked: false });
        askStep(SETUP_STEPS.levelCheck, nextQuestion, false, { ...state, progress });
        return;
      }
      await advanceSetup(flow.subject, applied.setup, applied.progress);
    } finally {
      setLoading(false);
    }
  };

  /** 남은 질문을 건너뛰고 기본값으로 바로 만듭니다. */
  const skipRest = () => {
    if (!flow) return;
    const label = SETUP_SKIP_OPTION.label;
    setMessages((previous) => [...markAnswered(previous, flow.step.id, label), { id: nextId(), role: "user", text: label }]);
    persist({ role: "user", text: label });
    finishSetup(flow.subject, flow.setup, { ...flow.progress, skipped: true });
  };

  /** 질문에 직접 적어서 답했을 때: 규칙 → (로그인 사용자) AI 순으로 해석합니다. */
  const answerWithText = async (text: string) => {
    if (!flow) return;
    setInput("");
    if (/바로\s*(?:만들|배울|시작)/.test(text)) {
      skipRest();
      return;
    }
    setLoading(true);
    const result = await resolveSetupAnswer(flow.step.id, text, { subject: flow.subject, signedIn: isSignedIn, question: flow.question, experience: flow.setup.experience, levelEvidence: flow.setup.levelEvidence, levelCheckCount: flow.progress.levelCheckCount ?? 0 });
    setLoading(false);
    const needsMatch = flow.step.id === "experience" || flow.step.id === "dailyMinutes";
    if (!result.matched && needsMatch && !flow.reasked) {
      setFlow({ ...flow, reasked: true });
      addMessages({ id: nextId(), role: "user", text }, { id: nextId(), role: "assistant", text: SETUP_REASK });
      persist({ role: "user", text });
      persist({ role: "assistant", text: SETUP_REASK });
      return;
    }
    await answerStep(result.setup, text, result.feedback, result.nextQuestion);
  };

  const send = async (question: string) => {
    const trimmed = question.trim() || study.defaultQuestion;
    if (!trimmed || loading || preparingCourse || study.working) return;

    if (flow) {
      await answerWithText(trimmed);
      return;
    }

    if (courseMode) {
      setCourseMode(false);
      setInput("");
      await beginSetup(trimmed, trimmed);
      return;
    }

    const previous = messages;
    const learnerContext = getLearnerContext();
    setMessages((items) => [...items, { id: nextId(), role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    persist({ role: "user", text: trimmed });
    try {
      const studied = isSignedIn ? await study.answer(trimmed, toTutorHistory(previous)) : null;
      if (studied) {
        setMessages(items => [...items, { id: nextId(), role: "assistant", text: studied.reply, studyResultId: studied.id }]);
        persist({ role: "assistant", text: studied.reply, studyResultId: studied.id });
        return studied.reply;
      }
      const tutorRequest = {
        courseTitle: "자유 학습",
        lessonTitle: "AI 학습 대화",
        conceptName: "사용자 질문",
        currentStepContent: "특정 레슨에 제한되지 않은 LearnHub 학습 대화입니다. 질문에 직접 답하고 필요한 경우 학습 순서를 제안합니다.",
        mode: "free",
        ...(learnerContext ? { learnerContext } : {}),
        history: toTutorHistory(previous),
        userQuestion: trimmed,
        persona: getTutorPersonaRequest(),
      };
      const response = isSignedIn
        ? await authorizedFetch("/api/ai/tutor-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tutorRequest) })
        : await guestTutorFetch(tutorRequest);
      if (isSignedIn && response.status === 401) {
        savePendingChat(trimmed);
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!response.ok) throw await readAiResponseError(response);
      const data = await response.json();
      if (!isSignedIn) setTrialRemaining(readTrialRemaining(data));
      const tangentName = typeof data.tangent?.conceptName === "string" ? data.tangent.conceptName.trim() : "";
      const reply: string = data.reply || "답변을 준비하지 못했습니다.";
      const subject = resolveLearningIntent(trimmed, data.learningIntent)?.subject ?? "";
      setMessages((items) => [
        ...items,
        { id: nextId(), role: "assistant", text: reply, question: trimmed, conceptName: tangentName || subject || undefined, chips: Array.isArray(data.suggestionChips) ? data.suggestionChips.filter((c: unknown): c is string => typeof c === "string" && Boolean(c.trim())).slice(0, 4) : undefined, setupStarted: Boolean(subject && isSignedIn) },
      ]);
      persist({ role: "assistant", text: reply, question: trimmed, conceptName: tangentName || undefined });
      if (subject && isSignedIn) await beginSetup(subject, undefined, trimmed);
      return reply;
    } catch (error) {
      const trialOver = !isSignedIn && error instanceof AiResponseError && error.code === GUEST_TRIAL_EXHAUSTED_CODE;
      if (trialOver) {
        // 체험을 모두 썼으면 방금 쓴 말을 보관해 두었다가 로그인 뒤 이어서 보냅니다.
        setTrialRemaining(0);
        savePendingChat(trimmed);
      }
      setMessages((items) => [
        ...items,
        { id: nextId(), role: "assistant", text: error instanceof Error && error.message === "auth_required" ? "AI 대화를 계속하려면 로그인해 주세요." : aiResponseErrorMessage(error) },
      ]);
      if (trialOver) onRequestAuth();
    } finally {
      setLoading(false);
    }
  };

  // 로그인 전에 쓴 첫 메시지가 있으면 로그인 뒤에 이어서 보냅니다.
  useEffect(() => {
    if (!isSignedIn) return;
    const pending = takePendingChat();
    if (pending) void send(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (startInCourseMode) inputRef.current?.focus();
  }, [startInCourseMode]);

  const greeting = isSignedIn && userName ? `${userName}님, 무엇을 배워볼까요?` : "무엇을 배워볼까요?";
  const menuItems = [
    { label: "과목으로 만들기", icon: Sparkles, run: () => { setCourseMode(true); inputRef.current?.focus(); } },
    { label: "문제 풀기", icon: ListChecks, run: onPractice },
    { label: "준비된 과정 둘러보기", icon: BookOpen, run: onBrowseCourses },
  ];

  const plusMenu = (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="더 보기"
        className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"
      >
        <Plus aria-hidden className={`h-5 w-5 transition-transform ${menuOpen ? "rotate-45" : ""}`} />
      </button>
      {menuOpen && (
        <div role="menu" aria-label="입력 도구" className={`absolute left-0 z-20 min-w-56 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-1.5 text-sm shadow-lg ${started ? "bottom-12" : "top-12"}`}>
          {menuItems.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); run(); }}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
            >
              <Icon aria-hidden className="h-4 w-4 text-[var(--lh-ink-secondary)]" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const textField = (
    <>
      <label htmlFor="chat-input" className="sr-only">배우고 싶은 것을 물어보세요</label>
      <textarea
        id="chat-input"
        ref={inputRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send(input);
          }
        }}
        rows={1}
        maxLength={2000}
        autoFocus={!started && canAutoFocusInput()}
        placeholder={flow ? "직접 적어서 답해도 돼요" : courseMode ? "어떤 과목을 만들까요?" : "배우고 싶은 것을 물어보세요"}
        className={`lh-bare-input max-h-[200px] min-h-11 resize-none bg-transparent text-base leading-6 outline-none placeholder:text-[var(--lh-ink-tertiary)] ${isSignedIn ? "block w-full px-3 pb-1 pt-2.5" : "flex-1 px-2 py-2.5"}`}
      />
    </>
  );

  const sendButton = (
    <button
      type="submit"
      disabled={(!input.trim() && !study.defaultQuestion) || loading || preparingCourse || study.working}
      aria-label="보내기"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white transition hover:bg-[var(--lh-primary-hover)] disabled:opacity-30 cursor-pointer disabled:cursor-default"
    >
      <ArrowUp aria-hidden className="h-4.5 w-4.5" />
    </button>
  );

  const composer = (
    <form
      onSubmit={(event) => { event.preventDefault(); void send(input); }}
      onDragOver={event => event.preventDefault()}
      onDrop={study.onDrop}
      className={`mx-auto w-full max-w-[720px] ${started ? "px-4 pb-4 pt-2 sm:px-6" : "px-4 sm:px-6"}`}
    >
      {courseMode && (
        <div className="mb-2 flex items-center gap-2 px-2 text-xs text-[var(--lh-primary-text)]">
          <Sparkles aria-hidden className="h-3.5 w-3.5" />
          <span className="font-medium">과목으로 만들기</span>
          <button type="button" onClick={() => setCourseMode(false)} aria-label="과목으로 만들기 끄기" className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {/* 로그인하면 글 칸 아래 줄에 도구(+), 모델·추론 선택, 보내기 버튼을 둡니다. 비로그인은 한 줄 그대로입니다. */}
      <div className={`relative border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] p-2 shadow-[var(--lh-shadow-md)] transition focus-within:border-[var(--lh-primary)] ${isSignedIn ? "flex flex-col gap-0.5 rounded-[28px]" : "flex items-end gap-1 rounded-[32px]"}`}>
        {isSignedIn ? (
          <>
            {study.status}
            {textField}
            <div className="flex items-center gap-1">
              {study.toolbar}
              <div className="min-w-0 flex-1" />
              <ModelReasoningPicker direction="up" />
              {sendButton}
            </div>
          </>
        ) : (
          <>
            {plusMenu}
            {textField}
            {sendButton}
          </>
        )}
      </div>
      {!isSignedIn && trialRemaining !== null && (
        <p className="mt-2 px-2 text-center text-xs text-[var(--lh-ink-tertiary)]" aria-live="polite">
          {trialRemaining > 0 ? `로그인 없이 체험 중이에요 · ${trialRemaining}회 남았어요` : "체험을 모두 사용했어요 · 로그인하면 계속 대화할 수 있어요"}
        </p>
      )}
      {study.modal}
    </form>
  );

  if (!started) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center px-0 pb-24 pt-16">
        <div aria-hidden className="lh-start-glow pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex w-full flex-col items-center gap-8">
          <h1 className="px-6 text-center text-3xl font-medium tracking-[-0.03em] text-[var(--lh-ink)] sm:text-4xl">{greeting}</h1>
          {composer}
          {resume && (
            <button type="button" onClick={onResume} className="inline-flex max-w-[calc(100%-3rem)] items-center gap-1.5 rounded-full px-3 py-2 text-sm text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
              <span className="truncate">지난번엔 ‘{resume.conceptName}’까지 했어요</span>
              <span aria-hidden>·</span>
              <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--lh-primary-text)]">이어가기 <ArrowRight aria-hidden className="h-3.5 w-3.5" /></span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto w-full max-w-[720px] space-y-7 px-4 py-8 sm:px-6">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[88%] rounded-3xl bg-[var(--lh-primary)] px-5 py-3.5 text-base leading-7 text-white sm:max-w-[80%]">
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </div>
              </div>
            ) : (
              <AgentMessage
                key={message.id}
                showProfile={messages[index - 1]?.role !== "assistant"}
                className={messages[index - 1]?.role === "assistant" ? "-mt-3" : ""}
                card={
                  message.previewSubject ? (
                    <CoursePreviewCard
                      autoStart={message.autoStart}
                      onPreparingChange={setPreparingCourse}
                      subject={message.previewSubject}
                      setup={message.previewSetup}
                      initialData={message.previewData}
                      onReady={(data, setup) => savePreview(message.text, message.previewSubject!, data, setup)}
                      isSignedIn={isSignedIn}
                      onStart={(course, links) => startPreparedCourse(message, course, links)}
                      onGuestStart={onGuestStartCourse}
                      onRequestAuth={onRequestAuth}
                    />
                  ) : undefined
                }
              >
                <RichLessonRenderer content={message.text} />
                {message.courseId && <button type="button" onClick={() => onResumeCourse(message.courseId!)} className="mt-3 inline-flex min-h-10 items-center gap-2 text-[var(--lh-primary)] underline underline-offset-4">수업 이어가기 <ArrowRight aria-hidden className="h-4 w-4" /></button>}
                {study.renderResultLink(message.studyResultId)}
                {message.setupQuestion && (
                  <div className="mt-3.5 flex flex-wrap gap-2" role="group" aria-label="빠른 답">
                    {SETUP_STEPS[message.setupQuestion.stepId].options.map((option) => {
                      const answered = message.setupQuestion!.answered;
                      const active = !answered && !loading && flow?.step.id === message.setupQuestion!.stepId;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={!active}
                          aria-pressed={answered === option.label}
                          onClick={() => void (message.setupQuestion!.stepId === "levelCheck" ? answerWithText(option.label) : answerStep(option.value, option.label))}
                          className={`inline-flex min-h-10 items-center rounded-full border px-4 text-[15px] font-medium transition ${
                            answered === option.label
                              ? "border-[var(--lh-primary)] bg-[var(--lh-primary)] text-white"
                              : "border-[var(--lh-primary-border)] bg-[var(--lh-surface)] text-[var(--lh-primary-text)] hover:bg-[var(--lh-primary-subtle)] disabled:opacity-40 cursor-pointer disabled:cursor-default"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                    {!message.setupQuestion.answered && !loading && flow?.step.id === message.setupQuestion.stepId && (
                      <button type="button" onClick={skipRest} className="inline-flex min-h-10 items-center rounded-full px-3 text-[15px] text-[var(--lh-ink-tertiary)] underline-offset-2 transition hover:text-[var(--lh-ink)] hover:underline cursor-pointer">{SETUP_SKIP_OPTION.label}</button>
                    )}
                  </div>
                )}
                {message.chips && message.chips.length > 0 && index === messages.length - 1 && !flow && !message.setupStarted && (
                  <div className="mt-3.5 flex flex-col items-start gap-1.5" role="group" aria-label="이어서 물어보기">
                    {message.chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        disabled={loading || preparingCourse}
                        onClick={() => void send(chip)}
                        className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-xl border border-[var(--lh-line-strong)] bg-[var(--lh-surface-subtle)] px-3 py-1.5 text-left text-[13px] font-medium leading-5 text-[var(--lh-ink-secondary)] transition hover:border-[var(--lh-primary-border)] hover:bg-[var(--lh-primary-subtle)] hover:text-[var(--lh-primary-text)] disabled:opacity-50 cursor-pointer"
                      >
                        <span>💬 {chip}</span>
                      </button>
                    ))}
                  </div>
                )}
                {message.question && !message.setupStarted && (
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={message.saved}
                      onClick={() => {
                        addCuriosity(null, message.conceptName || toConceptName(message.question!), message.question!);
                        setMessages((items) => items.map((item, i) => (i === index ? { ...item, saved: true } : item)));
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-surface)] px-4 text-sm font-medium text-[var(--lh-primary-text)] transition hover:bg-[var(--lh-primary-subtle)] disabled:cursor-default disabled:opacity-70 cursor-pointer"
                    >
                      {message.saved ? "지도에 저장했어요" : "궁금해요로 저장"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const subject = message.conceptName || toConceptName(message.question!);
                        if (!flow) void beginSetup(subject);
                      }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[var(--lh-primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer"
                    >
                      <Sparkles aria-hidden className="h-4 w-4" /> 이걸로 과목 만들기
                    </button>
                  </div>
                )}
                {messages[index + 1]?.role !== "assistant" && (
                  <button type="button" aria-label="이 답변 신고하기" title="이 답변 신고하기" className="-ml-1.5 mt-1 flex w-fit min-h-7! items-center gap-1 rounded-full px-1.5 text-xs! text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-danger)] disabled:opacity-50 cursor-pointer" onClick={async (event) => {
                    const button = event.currentTarget;
                    const reason = window.prompt("신고 사유를 입력해 주세요. 이 응답의 일부와 사유를 운영자에게 보냅니다.");
                    if (!reason?.trim()) return;
                    button.disabled = true;
                    try {
                      const result = await submitContentReport({ category: "other", description: `사유: ${reason.trim().slice(0, 450)}\n신고 응답: ${assistantGroupText(messages, index).slice(0, 1500)}` });
                      window.alert(result.status === "received" ? "신고를 접수했습니다. 운영자가 검토합니다." : result.savedLocally ? "신고 초안을 기기에 저장했습니다. 로그인과 연결을 확인한 뒤 다시 신고해 주세요." : "신고를 접수하지 못했습니다. 다시 시도해 주세요.");
                    } finally { button.disabled = false; }
                  }}><Flag aria-hidden className="h-3 w-3" />신고</button>
                )}
              </AgentMessage>
            ),
          )}
          {loading && (
            <div role="status" className="flex items-center gap-2 text-[15px] text-[var(--lh-ink-secondary)]">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> 답변을 준비하는 중...
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      {composer}
    </div>
  );
};
