import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { authorizedFetch } from "../services/authClient";

interface ChatMessage { role: "user" | "assistant"; text: string; }

const starter: ChatMessage[] = [{ role: "assistant", text: "무엇을 배우고 싶은지 알려주세요. 개념 설명, 학습 계획, 예시 문제를 함께 정리할 수 있습니다." }];

export const AiChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(starter);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    const previous = messages;
    setMessages((items) => [...items, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const response = await authorizedFetch("/api/ai/tutor-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseTitle: "자유 학습",
          lessonTitle: "AI 학습 대화",
          conceptName: "사용자 질문",
          currentStepContent: "특정 레슨에 제한되지 않은 LearnHub 학습 대화입니다. 질문에 직접 답하고 필요한 경우 학습 순서를 제안합니다.",
          history: previous.slice(-12),
          userQuestion: trimmed,
        }),
      });
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
        throw new Error("auth_required");
      }
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      setMessages((items) => [...items, { role: "assistant", text: data.reply || "답변을 준비하지 못했습니다." }]);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", text: error instanceof Error && error.message === "auth_required" ? "AI 대화를 계속하려면 로그인해 주세요." : "지금은 답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto flex h-full min-h-[calc(100vh-104px)] w-full max-w-4xl flex-col px-5 py-8 sm:px-8">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--lh-line)] pb-6">
        <div><p className="lh-kicker flex items-center gap-2"><MessageCircle className="h-4 w-4" /> AI conversation</p><h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] sm:text-4xl">AI와 대화하기</h1><p className="mt-3 text-base leading-7 text-[var(--lh-ink-secondary)]">특정 레슨과 관계없이 궁금한 개념이나 학습 계획을 물어보세요.</p></div>
        <button type="button" onClick={() => setMessages(starter)} className="lh-button-secondary flex min-h-11 shrink-0 items-center gap-2 px-4 text-sm" aria-label="대화 내용 지우기"><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">새 대화</span></button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto py-8" aria-live="polite">
        {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-3xl px-5 py-4 text-sm leading-7 ${message.role === "user" ? "bg-[var(--lh-primary)] text-white" : "border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)]"}`}>{message.role === "assistant" && <Bot className="mb-2 h-4 w-4" />}<p className="whitespace-pre-wrap">{message.text}</p></div></div>)}
        {loading && <div className="flex items-center gap-2 text-sm text-[var(--lh-ink-secondary)]"><Loader2 className="h-4 w-4 animate-spin" /> 답변을 준비하는 중...</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void send(input); }} className="sticky bottom-0 border-t border-[var(--lh-line)] bg-[var(--lh-canvas)] py-4">
        <div className="flex items-end gap-2 rounded-[26px] border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] p-2 shadow-[var(--lh-shadow-md)] focus-within:border-[var(--lh-primary)]">
          <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} rows={1} placeholder="궁금한 내용을 입력하세요" className="min-h-12 flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-6 outline-none placeholder:text-[var(--lh-ink-tertiary)]" />
          <button type="submit" disabled={!input.trim() || loading} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white transition hover:bg-[var(--lh-primary-hover)] disabled:opacity-30" aria-label="질문 보내기"><ArrowUp className="h-4 w-4" /></button>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--lh-ink-tertiary)]">AI 답변은 틀릴 수 있습니다. 중요한 내용은 다시 확인하세요.</p>
      </form>
    </div>
  );
};
