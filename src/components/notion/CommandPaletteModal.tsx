import React, { useState, useEffect } from "react";
import { Search, BookOpen, Compass, RotateCcw, TrendingUp, History, X } from "lucide-react";
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
    { type: "knowledge-map" },
    { type: "skill-matrix" },
    { type: "review-queue" },
    { type: "mistake-archive" },
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/25 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-lg border border-[#E9E9E7] bg-white shadow-2xl overflow-hidden text-xs text-[#2F3437]">
        {/* Input */}
        <div className="flex items-center gap-2 border-b border-[#E9E9E7] px-3.5 py-3">
          <Search className="h-4 w-4 text-[#9B9A97]" />
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
            placeholder="교과목, 레슨, 지식 지도 검색..."
            className="flex-1 bg-transparent text-xs text-[#191919] placeholder-[#9B9A97] focus:outline-none"
          />
          <kbd className="rounded border border-[#D3D3D0] bg-[#F7F6F3] px-1 text-[9px] font-mono text-[#787774]">
            ESC
          </kbd>
        </div>

        {/* Quick Nav Options */}
        <div id="command-palette-results" className="max-h-80 overflow-y-auto p-2 space-y-1" role="listbox">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#9B9A97]">
            빠른 이동
          </div>

          <button
            id="command-palette-item-0"
            onClick={() => {
              onSelectView({ type: "knowledge-map" });
              onClose();
            }}
            aria-selected={activeIndex === 0}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition ${activeIndex === 0 ? "bg-[#F7F6F3]" : "hover:bg-[#F7F6F3]"}`}
          >
            <Compass className="h-3.5 w-3.5 text-[#787774]" />
            <span className="font-medium">교과 지식 지도 (선수 결손 추적)</span>
          </button>

          <button
            id="command-palette-item-1"
            onClick={() => {
              onSelectView({ type: "skill-matrix" });
              onClose();
            }}
            aria-selected={activeIndex === 1}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition ${activeIndex === 1 ? "bg-[#F7F6F3]" : "hover:bg-[#F7F6F3]"}`}
          >
            <TrendingUp className="h-3.5 w-3.5 text-[#787774]" />
            <span className="font-medium">개념별 지식 매트릭스 (0~100%)</span>
          </button>

          <button
            id="command-palette-item-2"
            onClick={() => {
              onSelectView({ type: "review-queue" });
              onClose();
            }}
            aria-selected={activeIndex === 2}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition ${activeIndex === 2 ? "bg-[#F7F6F3]" : "hover:bg-[#F7F6F3]"}`}
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#787774]" />
            <span className="font-medium">에빙하우스 망각곡선 복습</span>
          </button>

          <button
            id="command-palette-item-3"
            onClick={() => {
              onSelectView({ type: "mistake-archive" });
              onClose();
            }}
            aria-selected={activeIndex === 3}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition ${activeIndex === 3 ? "bg-[#F7F6F3]" : "hover:bg-[#F7F6F3]"}`}
          >
            <History className="h-3.5 w-3.5 text-[#787774]" />
            <span className="font-medium">오답 및 사유 아카이브</span>
          </button>

          {/* Lessons list */}
          <div className="pt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#9B9A97]">
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
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition ${
                activeIndex === quickViews.length + filteredLessons.indexOf(item)
                  ? "bg-[#F7F6F3]"
                  : "hover:bg-[#F7F6F3]"
              }`}
            >
              <div className="truncate pr-2">
                <span className="font-medium text-[#191919]">{item.lesson.title}</span>
                <span className="block text-[10px] text-[#787774] truncate">
                  {item.course.title} • {item.chapterTitle}
                </span>
              </div>
              <span className="text-[10px] text-[#9B9A97] shrink-0 font-mono">
                {item.lesson.estimatedMinutes}분
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
