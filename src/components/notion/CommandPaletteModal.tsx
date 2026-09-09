import React, { useState, useEffect } from "react";
import { Search, BookOpen, MessageCircle, Compass, RotateCcw, TrendingUp, X } from "lucide-react";
import { Course } from "../../types/learning";
import { NotionPageView } from "./Sidebar";

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  onSelectView: (view: NotionPageView) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  courses,
  onSelectView,
}) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const allLessons = courses.flatMap((course) =>
    course.chapters.flatMap((chapter) =>
      chapter.lessons.map((lesson) => ({
        course,
        chapterTitle: chapter.title,
        lesson,
      }))
    )
  );

  const filteredLessons = allLessons.filter(
    (item) =>
      item.lesson.title.toLowerCase().includes(query.toLowerCase()) ||
      item.course.title.toLowerCase().includes(query.toLowerCase())
  );

  const quickViews: NotionPageView[] = [
    { type: "courses" },
    { type: "ai-chat" },
    { type: "knowledge-map" },
    { type: "review-queue" },
    { type: "skill-matrix" },
  ];
  const totalItems = quickViews.length + filteredLessons.length;

  const handlePaletteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!totalItems) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % totalItems);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + totalItems) % totalItems);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex < quickViews.length) {
        onSelectView(quickViews[activeIndex]);
      } else {
        const item = filteredLessons[activeIndex - quickViews.length];
        if (item) {
          onSelectView({
            type: "lesson",
            course: item.course,
            lesson: item.lesson,
            chapterTitle: item.chapterTitle,
          });
        }
      }
      onClose();
    }
  };

  return (
    <div className="lh-dialog-backdrop fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-20">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3 text-sm text-[var(--lh-ink)] shadow-2xl space-y-2">
        {/* Input: Chunky Pill Search Box */}
        <div className="flex items-center gap-3 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-2 focus-within:border-[var(--lh-primary)] focus-within:bg-[var(--lh-surface)] transition shadow-xs">
          <Search className="h-4 w-4 text-[var(--lh-primary)]" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handlePaletteKeyDown}
            role="combobox"
            aria-controls="command-palette-results"
            aria-activedescendant={`command-palette-item-${activeIndex}`}
            aria-label="교과목과 레슨 검색"
            placeholder="과목, 레슨, 화면 검색"
            className="flex-1 bg-transparent text-sm sm:text-base text-[var(--lh-ink)] placeholder-[var(--lh-ink-tertiary)] outline-none font-normal"
          />
          <kbd className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-2 py-0.5 text-[10px] font-mono text-[var(--lh-ink-secondary)] shadow-xs">
            ESC
          </kbd>
        </div>

        {/* Quick Nav Options */}
        <div id="command-palette-results" className="max-h-80 overflow-y-auto p-1 space-y-1" role="listbox">
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
            빠른 이동
          </div>

          <button
            id="command-palette-item-0"
            onClick={() => {
              onSelectView({ type: "courses" });
              onClose();
            }}
            aria-selected={activeIndex === 0}
            className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition cursor-pointer ${
              activeIndex === 0 ? "bg-[var(--lh-primary-subtle)] font-medium text-[var(--lh-primary-text)]" : "hover:bg-[var(--lh-surface-subtle)] text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] font-normal"
            }`}
          >
            <BookOpen className="h-4 w-4 text-[var(--lh-primary)]" />
            <span className="text-xs sm:text-sm">학습 로드맵 탐색 (내 과목)</span>
          </button>

          <button
            id="command-palette-item-1"
            onClick={() => {
              onSelectView({ type: "ai-chat" });
              onClose();
            }}
            aria-selected={activeIndex === 1}
            className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition cursor-pointer ${
              activeIndex === 1 ? "bg-[var(--lh-primary-subtle)] font-medium text-[var(--lh-primary-text)]" : "hover:bg-[var(--lh-surface-subtle)] text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] font-normal"
            }`}
          >
            <MessageCircle className="h-4 w-4 text-[var(--lh-primary)]" />
            <span className="text-xs sm:text-sm">AI와 대화하기</span>
          </button>

          <button
            id="command-palette-item-2"
            onClick={() => {
              onSelectView({ type: "knowledge-map" });
              onClose();
            }}
            aria-selected={activeIndex === 2}
            className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition cursor-pointer ${
              activeIndex === 2 ? "bg-[var(--lh-primary-subtle)] font-medium text-[var(--lh-primary-text)]" : "hover:bg-[var(--lh-surface-subtle)] text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] font-normal"
            }`}
          >
            <Compass className="h-4 w-4 text-[var(--lh-primary)]" />
            <span className="text-xs sm:text-sm">지식 지도</span>
          </button>

          <button
            id="command-palette-item-3"
            onClick={() => {
              onSelectView({ type: "review-queue" });
              onClose();
            }}
            aria-selected={activeIndex === 3}
            className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition cursor-pointer ${
              activeIndex === 3 ? "bg-[var(--lh-secondary-subtle)] font-medium text-[var(--lh-secondary-text)]" : "hover:bg-[var(--lh-surface-subtle)] text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] font-normal"
            }`}
          >
            <RotateCcw className="h-4 w-4 text-[var(--lh-secondary)]" />
            <span className="text-xs sm:text-sm">예정된 복습</span>
          </button>

          <button
            id="command-palette-item-4"
            onClick={() => {
              onSelectView({ type: "skill-matrix" });
              onClose();
            }}
            aria-selected={activeIndex === 4}
            className={`flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition cursor-pointer ${
              activeIndex === 4 ? "bg-[var(--lh-primary-subtle)] font-medium text-[var(--lh-primary-text)]" : "hover:bg-[var(--lh-surface-subtle)] text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] font-normal"
            }`}
          >
            <TrendingUp className="h-4 w-4 text-[var(--lh-primary)]" />
            <span className="text-xs sm:text-sm">개념별 학습 현황</span>
          </button>

          {/* Lessons list */}
          <div className="pt-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
            교과 레슨 ({filteredLessons.length})
          </div>

          {filteredLessons.map((item) => (
            <button
              id={`command-palette-item-${quickViews.length + filteredLessons.indexOf(item)}`}
              key={item.lesson.id}
              onClick={() => {
                onSelectView({
                  type: "lesson",
                  course: item.course,
                  lesson: item.lesson,
                  chapterTitle: item.chapterTitle,
                });
                onClose();
              }}
              aria-selected={activeIndex === quickViews.length + filteredLessons.indexOf(item)}
              className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left transition cursor-pointer ${
                activeIndex === quickViews.length + filteredLessons.indexOf(item)
                  ? "bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]"
                  : "hover:bg-[var(--lh-surface-subtle)]"
              }`}
            >
              <div className="truncate pr-2">
                <span className="font-medium text-xs sm:text-sm text-[var(--lh-ink)]">{item.lesson.title}</span>
                <span className="block text-[11px] text-[var(--lh-ink-secondary)] truncate font-normal">
                  {item.course.title} • {item.chapterTitle}
                </span>
              </div>
              <span className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-2.5 py-0.5 text-[10px] font-mono font-medium text-[var(--lh-ink-tertiary)] shrink-0">
                {item.lesson.estimatedMinutes}분
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
