import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleHelp,
  Lightbulb,
  Loader2,
  RotateCcw,
  Send,
} from "lucide-react";
import { Course, LessonContent, LessonMeta, LessonStep } from "../types/learning";
import { authorizedFetch } from "../services/authClient";
import { notifyLearningDataChanged, StorageService } from "../services/storage";
import { validateLessonPayload } from "../domain/contentValidation";
import { createFallbackLessonContent } from "../domain/lessonFallback";
import { courseIsComplete } from "../domain/assessment";
import { RichLessonRenderer } from "./notion/RichLessonRenderer";
import { LessonCompletionModal } from "./notion/LessonCompletionModal";

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
}

interface ConversationMessage {
  sender: "user" | "tutor";
  text: string;
  chips?: string[];
}

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
  text: `# ${lesson.title}\n\n좋아요. 이제 **${course.title}**의 **${chapterTitle}**에서 ${lesson.conceptName}을 한 번에 흐름으로 배워볼게요. 아래 설명은 여러 카드로 쪼개지 않고, 개념에서 예시·적용·정리까지 이어지는 하나의 학습 본문으로 구성했습니다. 읽다가 막히는 부분은 바로 질문해 주세요.\n\n${content.steps.map((step, index) => `## ${index + 1}. ${step.title}\n\n${step.content}`).join("\n\n")}`,
  chips: ["이 개념을 아주 쉽게 설명해줘", "내가 이해했는지 질문해줘"],
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
  const endRef = useRef<HTMLDivElement>(null);

  const latestCourse = StorageService.getCourseById(course.id) || course;
  const lessonEntries = latestCourse.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ course: latestCourse, lesson, chapterTitle: chapter.title })));
  const currentLessonIndex = lessonEntries.findIndex((entry) => entry.lesson.id === lessonMeta.id);
  const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < lessonEntries.length - 1 ? lessonEntries[currentLessonIndex + 1] : null;
  const allCompleted = courseIsComplete(latestCourse);

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
  }, [messages, isSending, practiceResult]);

  const appendMessage = (message: ConversationMessage) => {
    setMessages((previous) => {
      const next = [...previous, message];
      saveConversation(historyKey, next);
      return next;
    });
  };

  const sendQuestion = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isSending || !content) return;
    setInput("");
    appendMessage({ sender: "user", text: trimmed });
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
        }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!response.ok) throw new Error("tutor_unavailable");
      const data = await response.json();
      appendMessage({
        sender: "tutor",
        text: data.reply || "질문을 다시 설명해 주세요.",
        chips: Array.isArray(data.suggestionChips) ? data.suggestionChips.slice(0, 3) : [],
      });
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
      onFinishLesson({ kind: "read_only", courseId: course.id, lessonId: lessonMeta.id });
    }
    setCompletionOpen(true);
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
    <div className="flex w-full max-w-none flex-col pb-20 pt-4 sm:pt-6">
      <div className="w-full">
        <section className="mx-auto w-full max-w-[900px] min-w-0 px-5 sm:px-8">
          <div className="space-y-5" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.sender}-${index}`} className={`flex w-full ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
                {message.sender === "tutor" ? (
                  <div className="flex w-full gap-3">
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]"><Bot className="h-4 w-4" /></span>
                    <div className="min-w-0 max-w-[820px] flex-1 text-[var(--lh-ink)]">
                      <RichLessonRenderer content={message.text} />
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
            <div ref={endRef} />
          </div>

          {practiceOpen && (
            <div className="mt-8 border-y border-[var(--lh-line)] py-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="lh-kicker flex items-center gap-2"><CircleHelp className="h-4 w-4" /> 문제풀이 모드</p><h2 className="mt-2 text-lg font-medium text-[var(--lh-ink)]">배운 내용을 직접 적용해 보세요</h2></div>
                <button type="button" onClick={() => setPracticeOpen(false)} className="text-xs text-[var(--lh-ink-secondary)] underline underline-offset-2">닫기</button>
              </div>
              {isPracticeLoading && !practiceQuestion && <div className="mt-5 flex items-center gap-2 text-sm text-[var(--lh-ink-secondary)]"><Loader2 className="h-4 w-4 animate-spin" /> 문제를 만드는 중...</div>}
              {practiceError && <div className="mt-5 space-y-3"><p className="text-sm text-[var(--lh-danger)]">{practiceError}</p><button type="button" onClick={() => void generatePractice()} className="rounded-full bg-[var(--lh-primary)] px-4 py-2 text-xs font-medium text-white">다시 시도</button></div>}
              {practiceQuestion && (
                <div className="mt-5 space-y-4">
                  <p className="text-base font-medium leading-7 text-[var(--lh-ink)]">{practiceQuestion.question}</p>
                  {practiceQuestion.quizType === "multiple_choice" && <div className="grid gap-2">{practiceQuestion.options?.map((option) => <button type="button" key={option} onClick={() => setPracticeAnswer(option)} className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${practiceAnswer === option ? "border-[var(--lh-primary)] bg-[var(--lh-surface)] text-[var(--lh-primary-text)]" : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] hover:border-[var(--lh-primary)]"}`}>{option}</button>)}</div>}
                  {practiceQuestion.quizType === "short_answer" && <textarea value={practiceAnswer} onChange={(event) => setPracticeAnswer(event.target.value)} rows={3} placeholder="내 답을 적어보세요" className="w-full resize-y rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3 text-sm leading-6 outline-none focus:border-[var(--lh-primary)]" />}
                  {!practiceResult && <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setPracticeHintIndex((index) => Math.min(index + 1, practiceQuestion.hints.length))} disabled={practiceHintIndex >= practiceQuestion.hints.length} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-xs font-medium text-[var(--lh-ink-secondary)] disabled:opacity-40"><Lightbulb className="h-3.5 w-3.5" /> 힌트 {practiceHintIndex}/{practiceQuestion.hints.length}</button><button type="button" onClick={() => void submitPractice()} disabled={!practiceAnswer.trim() || isPracticeLoading} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-5 text-xs font-medium text-white disabled:opacity-40">답안 제출 <ArrowRight className="h-3.5 w-3.5" /></button></div>}
                  {practiceHintIndex > 0 && <p className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-3 text-sm leading-6 text-[var(--lh-ink-secondary)]">힌트: {practiceQuestion.hints[practiceHintIndex - 1]}</p>}
                  {practiceResult && <div className={`rounded-2xl border p-4 ${practiceResult.isCorrect === true ? "border-emerald-200 bg-emerald-50 text-emerald-900" : practiceResult.isCorrect === false ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)]"}`}><p className="font-medium">{practiceResult.isCorrect === true ? "정답이에요." : practiceResult.isCorrect === false ? "한 번 더 생각해 볼까요?" : "채점 상태를 확인해 주세요."}</p><p className="mt-2 text-sm leading-6">{practiceResult.feedback}</p>{practiceResult.isCorrect === false && <p className="mt-2 text-sm leading-6">힌트: {practiceResult.hint || practiceQuestion.hints[0]}</p>}{practiceResult.isCorrect === true && <p className="mt-2 text-sm leading-6">해설: {practiceResult.explanation || practiceQuestion.explanation}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setPracticeQuestion(null); void generatePractice(); }} className="rounded-full bg-[var(--lh-primary)] px-4 py-2 text-xs font-medium text-white">다음 문제</button>{practiceResult.isCorrect !== true && <button type="button" onClick={() => setPracticeResult(null)} className="rounded-full border border-current px-4 py-2 text-xs font-medium">다시 풀기</button>}</div></div>}
                </div>
              )}
            </div>
          )}

          <form onSubmit={(event) => { event.preventDefault(); void sendQuestion(input); }} className="sticky bottom-0 z-10 mt-6 border-t border-[var(--lh-line)] bg-[var(--lh-canvas)] py-4">
            <div className="flex items-end gap-2 rounded-3xl border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] p-2 shadow-[var(--lh-shadow-md)] focus-within:border-[var(--lh-primary)]">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendQuestion(input); } }} rows={1} placeholder="궁금한 내용을 바로 물어보세요" className="min-h-12 flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-6 outline-none placeholder:text-[var(--lh-ink-tertiary)]" />
              <button type="submit" disabled={!input.trim() || isSending} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white disabled:opacity-30" aria-label="질문 보내기"><Send className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-center text-[11px] text-[var(--lh-ink-tertiary)]">AI 답변은 현재 챕터의 학습 본문을 기준으로 생성됩니다. 모르는 부분은 언제든 질문하세요.</p>
          </form>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--lh-line)] pt-4">
            <button type="button" onClick={() => void generatePractice()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-5 text-sm font-medium text-[var(--lh-primary-text)]"><CircleHelp className="h-4 w-4" /> 문제 풀기</button>
            <button type="button" onClick={() => void sendQuestion("방금 배운 내용을 더 쉬운 비유와 예시로 다시 설명해줘.")} disabled={isSending} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-5 text-sm font-medium text-[var(--lh-ink-secondary)] disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> 다시 설명</button>
            <button type="button" onClick={markLessonComplete} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-5 text-sm font-medium text-[var(--lh-ink)]"><CheckCircle2 className="h-4 w-4" /> {isCompleted ? "학습 완료 보기" : "충분히 학습했어요"}</button>
          </div>
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
