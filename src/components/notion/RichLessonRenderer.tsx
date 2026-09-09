import React from "react";
import { MathRenderer } from "./MathRenderer";

interface RichLessonRendererProps {
  content: string;
  className?: string;
}

// Supports the explicit lesson content contract: Markdown emphasis/code plus
// $...$, $$...$$, \(...\), and \[...\] math.
const renderInlineContent = (text: string): React.ReactNode[] => {
  const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^\$\n]+?\$|\*\*[^\*]+?\*\*|`[^`]+?`)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith("$$") && part.endsWith("$$")) {
      return <MathRenderer key={idx} block math={part.slice(2, -2).trim()} className="my-2" />;
    }
    if (part.startsWith("\\[") && part.endsWith("\\]")) {
      return <MathRenderer key={idx} block math={part.slice(2, -2).trim()} className="my-2" />;
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return <MathRenderer key={idx} math={part.slice(1, -1).trim()} />;
    }
    if (part.startsWith("\\(") && part.endsWith("\\)")) {
      return <MathRenderer key={idx} math={part.slice(2, -2).trim()} />;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx} className="font-medium text-[var(--lh-ink)]">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={idx} className="rounded bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-1 py-0.5 font-mono text-[13px] text-[var(--lh-danger)]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
};

export const RichLessonRenderer: React.FC<RichLessonRendererProps> = ({ content, className = "" }) => {
  if (!content) return null;

  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: React.ReactNode[] } | null = null;
  let codeFence: string[] | null = null;
  let pendingMath: { closing: "$$" | "\\]"; lines: string[] } | null = null;

  const flushList = () => {
    if (!currentList) return;
    const List = currentList.type === "ul" ? "ul" : "ol";
    blocks.push(
      <List
        key={`list-${blocks.length}`}
        className={`${currentList.type === "ul" ? "list-disc" : "list-decimal"} my-2 ml-5 space-y-1 text-[15px] sm:text-base leading-[1.8] text-[var(--lh-ink)]`}
      >
        {currentList.items.map((item, i) => <li key={i}>{item}</li>)}
      </List>
    );
    currentList = null;
  };

  const pushCodeBlock = () => {
    if (!codeFence) return;
    flushList();
    blocks.push(
      <pre key={`code-${blocks.length}`} className="my-3 overflow-x-auto rounded-md border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3 text-xs leading-relaxed text-[var(--lh-ink)]">
        <code>{codeFence.join("\n")}</code>
      </pre>
    );
    codeFence = null;
  };

  const pushMathBlock = (math: string, key: string | number) => {
    flushList();
    blocks.push(
      <div key={`math-${key}`} className="my-3 rounded-md border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3 text-center">
        <MathRenderer block math={math.trim()} className="text-base sm:text-lg text-[var(--lh-ink)]" />
      </div>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (codeFence) {
      if (trimmed.startsWith("```")) pushCodeBlock();
      else codeFence.push(line);
      continue;
    }
    if (trimmed.startsWith("```")) {
      flushList();
      codeFence = [];
      continue;
    }

    if (pendingMath) {
      const closing = pendingMath.closing;
      const closeIndex = line.indexOf(closing);
      if (closeIndex >= 0) {
        pendingMath.lines.push(line.slice(0, closeIndex));
        pushMathBlock(pendingMath.lines.join("\n"), i);
        pendingMath = null;
        const remainder = line.slice(closeIndex + closing.length).trim();
        if (remainder) {
          blocks.push(<p key={`${i}-remainder`} className="my-2.5 text-[15px] sm:text-base leading-[1.85] text-[var(--lh-ink)] break-keep">{renderInlineContent(remainder)}</p>);
        }
      } else {
        pendingMath.lines.push(line);
      }
      continue;
    }

    if (!trimmed) {
      flushList();
      continue;
    }
    if (trimmed.startsWith("$$") && !trimmed.endsWith("$$")) {
      flushList();
      pendingMath = { closing: "$$", lines: [trimmed.slice(2)] };
      continue;
    }
    if (trimmed.startsWith("\\[") && !trimmed.endsWith("\\]")) {
      flushList();
      pendingMath = { closing: "\\]", lines: [trimmed.slice(2)] };
      continue;
    }
    if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
      pushMathBlock(trimmed.slice(2, -2), i);
      continue;
    }
    if (trimmed.startsWith("\\[") && trimmed.endsWith("\\]")) {
      pushMathBlock(trimmed.slice(2, -2), i);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      blocks.push(<h4 key={i} className="mt-4 mb-1.5 text-base font-medium text-[var(--lh-ink)]">{renderInlineContent(trimmed.slice(4))}</h4>);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(<h3 key={i} className="mt-5 mb-2 text-lg font-medium text-[var(--lh-ink)]">{renderInlineContent(trimmed.slice(3))}</h3>);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(<h2 key={i} className="mt-6 mb-2.5 text-xl font-medium text-[var(--lh-ink)]">{renderInlineContent(trimmed.slice(2))}</h2>);
      continue;
    }
    if (trimmed.startsWith("> ")) {
      flushList();
      blocks.push(<blockquote key={i} className="my-3 rounded-r-md border-l-2 border-[var(--lh-ink)] bg-[var(--lh-surface-subtle)] py-2 px-3 text-sm italic text-[var(--lh-ink-secondary)]">{renderInlineContent(trimmed.slice(2))}</blockquote>);
      continue;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!currentList || currentList.type !== "ul") {
        flushList();
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(renderInlineContent(trimmed.slice(2)));
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!currentList || currentList.type !== "ol") {
        flushList();
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(renderInlineContent(numMatch[2]));
      continue;
    }

    flushList();
    blocks.push(<p key={i} className="my-2.5 text-[15px] sm:text-base leading-[1.85] text-[var(--lh-ink)] break-keep">{renderInlineContent(line)}</p>);
  }

  if (codeFence) pushCodeBlock();
  if (pendingMath) pushMathBlock(pendingMath.lines.join("\n"), "unterminated");
  flushList();

  return <div className={`space-y-1 ${className}`}>{blocks}</div>;
};
