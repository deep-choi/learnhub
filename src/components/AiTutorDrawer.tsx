import React, { useEffect, useRef, useState } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { LessonContent } from "../types/learning";

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
  const isGenericContext = !currentStepContent || currentStepContent.includes("소크라틱 질의응답 세션입니다.");
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
}) => {
  const scope = historyScope || lessonId || `${courseTitle}:${lessonTitle}:${conceptName}`;
  const historyKey = `learnhub_tutor_history_${encodeURIComponent(scope)}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => readHistory(historyKey, lessonTitle));
  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historySaveStatus, setHistorySaveStatus] = useState<"saved" | "error">("saved");
  const skipNextPersist = useRef(false);
  const activeScope = useRef(historyKey);

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
      setHistorySaveStatus("saved");
    } catch {
      setHistorySaveStatus("error");
    }
  }, [messages, historyKey]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    const userMsg = textToSend.trim();
    setInputQuestion("");
    setMessages((prev) => [...prev, { sender: "user", text: userMsg }]);
    setIsLoading(true);

    try {
      const conversationHistory = getBoundedHistory(messages);
      const res = await fetch("/api/ai/tutor-chat", {
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
    } catch {
      setMessages((prev) => [...prev, { sender: "tutor", text: "응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-xs">
      <div className="bg-white border-l border-[#E9E9E7] w-full max-w-md h-full flex flex-col shadow-xl text-[#2F3437]">
        <div className="p-4 border-b border-[#E9E9E7] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-[#191919] text-[11px] font-bold text-white">✦</span>
            <div>
              <h3 className="text-xs font-bold text-[#191919]">소크라틱 AI 연구 파트너</h3>
              <p className="text-[10px] text-[#787774] truncate max-w-[240px]">
                {conceptName} · {historySaveStatus === "saved" ? "이 레슨 대화 저장됨" : "대화 저장 실패"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="튜터 닫기" className="p-1 rounded-sm text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {messages.map((message, idx) => (
            <div key={idx} className={`flex flex-col ${message.sender === "user" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[88%] p-3.5 rounded-lg leading-relaxed whitespace-pre-wrap ${message.sender === "user" ? "bg-[#191919] text-white" : "bg-[#F7F6F3] border border-[#E9E9E7] text-[#2F3437]"}`}>
                {message.text}
              </div>
              {message.sender === "tutor" && message.chips && message.chips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.chips.map((chip, chipIdx) => (
                    <button type="button" key={chipIdx} onClick={() => handleSendMessage(chip)} className="text-[11px] bg-white border border-[#E9E9E7] hover:border-[#D3D3D0] hover:bg-[#F7F6F3] text-[#2F3437] px-2.5 py-1 rounded-sm transition-colors text-left">
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && <div className="flex items-center gap-2 text-[#787774] text-xs p-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>사유 및 답변 구성 중...</span></div>}
        </div>

        <div className="p-3.5 border-t border-[#E9E9E7] bg-white">
          <form onSubmit={(event) => { event.preventDefault(); handleSendMessage(inputQuestion); }} className="flex items-center gap-2">
            <input type="text" value={inputQuestion} onChange={(event) => setInputQuestion(event.target.value)} placeholder="궁금한 원리를 질문하세요" aria-label="튜터 질문" className="flex-1 bg-[#F7F6F3] border border-[#E9E9E7] focus:border-[#191919] rounded-md px-3 py-2 text-xs text-[#191919] placeholder-[#9B9A97] focus:outline-none" />
            <button type="submit" disabled={!inputQuestion.trim() || isLoading} aria-label="질문 보내기" className="bg-[#191919] hover:bg-[#37352F] disabled:opacity-30 text-white p-2 rounded-md transition-colors">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
