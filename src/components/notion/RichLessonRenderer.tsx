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
      return <strong key={idx} className="font-semibold text-[var(--lh-ink)]">{part.slice(2, -2)}</strong>;
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

/** Pipes inside inline code or escaped pipes belong to the cell, not the table layout. */
const tableCells = (line: string): string[] => {
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\" && value[i + 1] === "|") { cell += "|"; i++; }
    else if (value[i] === "`") { inCode = !inCode; cell += value[i]; }
    else if (value[i] === "|" && !inCode) { cells.push(cell.trim()); cell = ""; }
    else cell += value[i];
  }
  cells.push(cell.trim());
  return cells;
};

/** Older lessons often contain a single long paragraph. Break it at sentence boundaries without changing its words. */
const readableParagraphs = (text: string): string[] => {
  if (text.length < 240 || /\$|\\\(|\\\[|`/.test(text)) return [text];
  const sentences = text.match(/[^.!?。]+(?:[.!?。]+(?=\s|$)|$)/g);
  if (!sentences || sentences.length < 4 || sentences.join("") !== text) return [text];
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) paragraphs.push(sentences.slice(i, i + 2).join("").trim());
  return paragraphs;
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
        className={`${currentList.type === "ul" ? "list-disc" : "list-decimal"} my-4 ml-5 space-y-2 text-base leading-[1.8] text-[var(--lh-ink)] marker:text-[var(--lh-ink-secondary)]`}
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
          blocks.push(<p key={`${i}-remainder`} className="my-3.5 text-base leading-[1.8] text-[var(--lh-ink)] break-keep">{renderInlineContent(remainder)}</p>);
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
    const separators = i + 1 < lines.length ? tableCells(lines[i + 1]) : [];
    const headers = tableCells(line);
    if (trimmed.includes("|") && headers.length >= 2 && separators.length === headers.length && separators.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      flushList();
      const rows: string[][] = [];
      let nextLine = i + 2;
      while (nextLine < lines.length && lines[nextLine].trim().includes("|")) {
        const cells = tableCells(lines[nextLine]);
        if (cells.length !== headers.length) break;
        rows.push(cells);
        nextLine++;
      }
      const align = (column: number): "left" | "center" | "right" => separators[column].endsWith(":") ? (separators[column].startsWith(":") ? "center" : "right") : "left";
      blocks.push(
        <div key={`table-${i}`} role="region" aria-label="학습 내용 표" tabIndex={0} className="my-5 max-w-full overflow-x-auto rounded-xl border border-[var(--lh-line)] focus-visible:outline-2 focus-visible:outline-[var(--lh-primary)]">
          <table className="w-full border-collapse text-base leading-relaxed text-[var(--lh-ink)]">
            <thead className="bg-[var(--lh-surface-subtle)]">
              <tr>{headers.map((header, column) => <th key={column} scope="col" style={{ textAlign: align(column) }} className="min-w-24 border-b border-[var(--lh-line)] px-4 py-3 font-semibold">{renderInlineContent(header)}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column} style={{ textAlign: align(column) }} className="border-b border-[var(--lh-line)] px-4 py-3 align-top [tr:last-child_&]:border-b-0">{renderInlineContent(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      i = nextLine - 1;
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
      blocks.push(<h4 key={i} className="mt-6 mb-3 text-lg font-semibold leading-snug text-[var(--lh-ink)]">{renderInlineContent(trimmed.slice(4))}</h4>);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(<h3 key={i} className="mt-7 mb-3 text-xl font-semibold leading-snug text-[var(--lh-ink)]">{renderInlineContent(trimmed.slice(3))}</h3>);
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(<h2 key={i} className="mt-7 mb-4 text-2xl font-semibold leading-snug text-[var(--lh-ink)]">{renderInlineContent(trimmed.slice(2))}</h2>);
      continue;
    }
    if (trimmed.startsWith("> ")) {
      flushList();
      blocks.push(<blockquote key={i} className="my-5 border-l-3 border-[var(--lh-primary)] py-1 pl-4 text-lg font-medium leading-relaxed text-[var(--lh-ink)]">{renderInlineContent(trimmed.slice(2))}</blockquote>);
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
    readableParagraphs(line).forEach((paragraph, paragraphIndex) => {
      blocks.push(<p key={`${i}-${paragraphIndex}`} className="my-4 text-base leading-[1.8] text-[var(--lh-ink)] break-keep [overflow-wrap:anywhere]">{renderInlineContent(paragraph)}</p>);
    });
  }

  if (codeFence) pushCodeBlock();
  if (pendingMath) pushMathBlock(pendingMath.lines.join("\n"), "unterminated");
  flushList();

  return <div className={`min-w-0 max-w-full [&>:first-child]:mt-0 [&>:last-child]:mb-0 ${className}`}>{blocks}</div>;
};
