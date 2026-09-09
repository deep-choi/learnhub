import React, { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

export const LessonAiInputBar: React.FC<{ onAsk: (question: string) => void }> = ({ onAsk }) => {
  const [question, setQuestion] = useState("");
  return (
    <form onSubmit={(event) => { event.preventDefault(); const value = question.trim(); if (!value) return; onAsk(value); setQuestion(""); }} className="mx-auto flex w-full max-w-[720px] items-center gap-2 rounded-full border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] p-2 shadow-[var(--lh-shadow-md)]">
      <Sparkles className="ml-3 h-4 w-4 shrink-0 text-[var(--lh-ink)]" />
      <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="이 레슨에서 궁금한 내용을 바로 물어보세요" className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--lh-ink)] outline-none placeholder:text-[var(--lh-ink-tertiary)]" aria-label="레슨 AI 질문" />
      <button type="submit" disabled={!question.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white transition hover:bg-[var(--lh-primary-hover)] disabled:opacity-30" aria-label="AI 튜터에게 질문 보내기"><ArrowUp className="h-4 w-4" /></button>
    </form>
  );
};
