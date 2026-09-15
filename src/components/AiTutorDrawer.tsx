import React, { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, MessageCircle } from "lucide-react";
import { LessonContent } from "../types/learning";
import { authorizedFetch } from "../services/authClient";
import { notifyLearningDataChanged } from "../services/storage";

interface AiTutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  courseTitle: string;
  lessonTitle: string;
  conceptName: string;
  currentStepContent: string;
  lessonId?: string;
  currentStepId?: string;
  cachedLessonContent?: LessonContent | null;
  historyScope?: string;
  initialQuestion?: string;
}

interface ChatMessage {
  sender: "user" | "tutor";
  text: string;
  chips?: string[];
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 6000;

const initialMessages = (lessonTitle: string): ChatMessage[] => [
  {
    sender: "tutor",
    text: `'${lessonTitle}' 학습과 관련하여 이해가 되지 않는 부분이 있다면 무엇이든 물어보세요. 원리를 스스로 도출할 수 있도록 소크라테스식으로 도와드립니다.`,
    chips: [
      "이 수식의 의미는 무엇인가요?",
      "더 쉬운 일상 비유로 설명해주세요",
      "스스로 이해했는지 확인 질문을 던져주세요",
    ],
  },
];

const readHistory = (key: string, lessonTitle: string): ChatMessage[] => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return initialMessages(lessonTitle);
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : initialMessages(lessonTitle);
  } catch {
    return initialMessages(lessonTitle);
  }
};

const getLessonContext = (
  currentStepContent: string,
  cachedLessonContent: LessonContent | null | undefined,
  currentStepId?: string
) => {
  if (!cachedLessonContent) return currentStepContent;
  const step = currentStepId ? cachedLessonContent.steps.find((candidate) => candidate.id === currentStepId) : undefined;
  const lessonText = step
    ? `${step.title}\n${step.content}`
    : cachedLessonContent.steps
    .map((candidate) => `${candidate.title}\n${candidate.content}`)
    .join("\n\n");
  const isGenericContext = !currentStepContent || currentStepContent.includes("질의응답 세션입니다.");
  if (isGenericContext) return lessonText.slice(0, 12000);
  return `${lessonText.slice(0, 10000)}\n\n[사용자가 선택한 본문 인용]\n${currentStepContent.slice(0, 2000)}`;
};

const getBoundedHistory = (messages: ChatMessage[]) => {
  const history: Array<{ role: "user" | "assistant"; text: string }> = [];
  let totalChars = 0;
  for (const message of messages.slice(-MAX_HISTORY_MESSAGES)) {
    const text = message.text.trim().slice(0, 900);
    if (!text || totalChars + text.length > MAX_HISTORY_CHARS) continue;
    history.push({ role: message.sender === "user" ? "user" : "assistant", text });
    totalChars += text.length;
  }
  return history;
};

export const AiTutorDrawer: React.FC<AiTutorDrawerProps> = ({
  isOpen,
  onClose,
  courseTitle,
  lessonTitle,
  conceptName,
  currentStepContent,
  lessonId,
  currentStepId,
  cachedLessonContent,
  historyScope,
  initialQuestion,
}) => {
  const scope = historyScope || lessonId || `${courseTitle}:${lessonTitle}:${conceptName}`;
  const historyKey = `learnhub_tutor_history_${encodeURIComponent(scope)}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => readHistory(historyKey, lessonTitle));
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historySaveStatus, setHistorySaveStatus] = useState<"saved" | "error">("saved");
  const skipNextPersist = useRef(false);
  const activeScope = useRef(historyKey);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastInitialQuestion = useRef("");

  useEffect(() => {
    activeScope.current = historyKey;
    skipNextPersist.current = true;
    setMessages(readHistory(historyKey, lessonTitle));
    setInputQuestion("");
  }, [historyKey, lessonTitle]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (activeScope.current !== historyKey) return;
    try {
      localStorage.setItem(historyKey, JSON.stringify(messages));
      notifyLearningDataChanged();
      setHistorySaveStatus("saved");
    } catch {
      setHistorySaveStatus("error");
    }
  }, [messages, historyKey]);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isLoading, onClose]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    const userMsg = textToSend.trim();
    setInputQuestion("");
    setMessages((prev) => [...prev, { sender: "user", text: userMsg }]);
    setIsLoading(true);

    try {
      const conversationHistory = getBoundedHistory(messages);
      const res = await authorizedFetch("/api/ai/tutor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseTitle,
          lessonTitle,
          conceptName,
          currentStepContent: getLessonContext(currentStepContent, cachedLessonContent, currentStepId),
          history: conversationHistory,
          userQuestion: userMsg,
        }),
      });
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!res.ok) throw new Error("AI tutor unavailable");
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          sender: "tutor",
          text: data.reply || "질문에 대해 다시 생각해보겠습니다.",
          chips: data.suggestionChips || ["더 구체적인 예시 부탁드려요", "다음 단계로 넘어가도 될까요?"],
        },
      ]);
    } catch (error) {
      setMessages((prev) => [...prev, { sender: "tutor", text: error instanceof Error && error.message === "auth_required" ? "로그인 후 AI 튜터를 사용할 수 있습니다." : "응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요." }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const question = initialQuestion?.trim() || "";
    if (!question) {
      lastInitialQuestion.current = "";
      return;
    }
    if (!isOpen || question === lastInitialQuestion.current) return;
    lastInitialQuestion.current = question;
    void handleSendMessage(question);
    // The question is intentionally consumed once per drawer open/context change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="lh-dialog-backdrop fixed inset-0 z-50 flex justify-end" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-tutor-title"
        className="flex h-full w-full max-w-md min-w-0 flex-col bg-[var(--lh-canvas)] text-[var(--lh-ink)] shadow-2xl md:m-3 md:h-[calc(100vh-24px)] md:rounded-3xl md:border md:border-[var(--lh-line)] overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-[var(--lh-line)] bg-[var(--lh-surface)] px-6 py-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white shadow-xs">
              <MessageCircle className="h-5 w-5" />
            </span>
            <div>
              <h3 id="ai-tutor-title" className="text-base font-medium tracking-tight text-[var(--lh-ink)]">
                AI 튜터
              </h3>
              <p className="max-w-[220px] truncate text-xs text-[var(--lh-ink-secondary)] font-normal">
                {conceptName} · {historySaveStatus === "saved" ? "현재 레슨 대화" : "임시 저장 실패"}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="튜터 닫기"
            className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-4 text-sm">
          {messages.map((message, idx) => (
            <div key={idx} className={`flex flex-col ${message.sender === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[88%] break-words rounded-2xl p-4 text-sm leading-relaxed whitespace-pre-wrap shadow-xs ${
                  message.sender === "user"
                    ? "bg-[var(--lh-primary)] text-white font-normal"
                    : "border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] font-normal"
                }`}
              >
                {message.text}
              </div>
              {message.sender === "tutor" && message.chips && message.chips.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {message.chips.map((chip, chipIdx) => (
                    <button
                      type="button"
                      key={chipIdx}
                      onClick={() => handleSendMessage(chip)}
                      className="inline-flex min-h-9 items-center rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-3.5 py-1.5 text-xs font-medium text-[var(--lh-primary-text)] shadow-xs transition hover:bg-[var(--lh-primary)] hover:text-white cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3.5 text-xs font-normal text-[var(--lh-ink-secondary)] shadow-xs">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--lh-primary)]" />
              <span>답변을 준비하는 중...</span>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--lh-line)] bg-[var(--lh-surface)] p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSendMessage(inputQuestion);
            }}
            className="flex min-w-0 items-center gap-2"
          >
            <div className="flex min-w-0 flex-1 items-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-1.5 focus-within:border-[var(--lh-primary)] focus-within:bg-[var(--lh-surface)] transition shadow-xs">
              <input
                type="text"
                value={inputQuestion}
                onChange={(event) => setInputQuestion(event.target.value)}
                placeholder="궁금한 내용을 질문하세요"
                aria-label="튜터 질문"
                className="min-h-9 min-w-0 flex-1 border-0 bg-transparent text-xs sm:text-sm text-[var(--lh-ink)] outline-none placeholder:text-[var(--lh-ink-tertiary)] font-normal"
              />
            </div>
            <button
              type="submit"
              disabled={!inputQuestion.trim() || isLoading}
              aria-label="질문 보내기"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition disabled:opacity-30 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
