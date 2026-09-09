import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Filter,
  History,
  RotateCcw,
  Trash2,
  BookOpen,
} from "lucide-react";
import { Course, MistakeItem } from "../../types/learning";
import { StorageService } from "../../services/storage";
import { NotionPageView } from "./Sidebar";

interface MistakeArchiveViewProps {
  courses?: Course[];
  onSelectView?: (view: NotionPageView) => void;
}

export const MistakeArchiveView: React.FC<MistakeArchiveViewProps> = ({
  courses = [],
  onSelectView,
}) => {
  const [items, setItems] = useState<MistakeItem[]>([]);
  const [activeTab, setActiveTab] = useState<"table" | "board">("table");
  const [filterStatus, setFilterStatus] = useState<"all" | "unresolved" | "resolved">("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  const loadMistakes = () => {
    setItems(StorageService.getMistakes());
  };

  useEffect(() => {
    loadMistakes();
  }, []);

  const handleToggleResolved = (id: string) => {
    StorageService.toggleMistakeResolved(id);
    loadMistakes();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    StorageService.removeMistake(id);
    loadMistakes();
  };

  const handleJumpToLesson = (item: MistakeItem) => {
    if (!onSelectView) return;

    let targetCourse: Course | undefined;
    let targetLesson: any;
    let chapterTitle = "";

    if (item.courseId) {
      targetCourse = courses.find((c) => c.id === item.courseId);
    } else if (item.course) {
      const titleMatches = courses.filter((c) => c.title === item.course);
      if (titleMatches.length === 1) targetCourse = titleMatches[0];
    }

    if (!targetCourse) {
      const conceptMatches = courses.filter((course) =>
        course.chapters.some((chapter) =>
          chapter.lessons.some(
            (lesson) =>
              (item.conceptId && lesson.conceptId === item.conceptId) ||
              lesson.conceptName === item.concept,
          ),
        ),
      );
      if (conceptMatches.length === 1) targetCourse = conceptMatches[0];
    }

    if (targetCourse) {
      for (const ch of targetCourse.chapters) {
        const found = ch.lessons.find(
          (l) =>
            l.id === item.lessonId ||
            (item.conceptId && l.conceptId === item.conceptId) ||
            l.conceptName === item.concept
        );
        if (found) {
          targetLesson = found;
          chapterTitle = ch.title;
          break;
        }
      }

      if (targetLesson) {
        onSelectView({
          type: "lesson",
          course: targetCourse,
          lesson: targetLesson,
          chapterTitle,
        });
      }
    }
  };

  const filteredItems = items.filter((item) => {
    if (filterStatus === "unresolved" && item.isResolved) return false;
    if (filterStatus === "resolved" && !item.isResolved) return false;
    if (filterTag !== "all" && item.misconceptionTag !== filterTag) return false;
    return true;
  });

  const unresolvedCount = items.filter((i) => !i.isResolved).length;
  const resolvedCount = items.filter((i) => i.isResolved).length;

  return (
    <div className="mx-auto w-full max-w-[880px] px-5 py-12 text-[var(--lh-ink)] sm:px-8">
      {/* 1. Header */}
      <div className="space-y-4 border-b border-[var(--lh-line)] pb-6">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] text-[var(--lh-primary)]">
            <History className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-3xl font-medium tracking-[-0.03em] text-[var(--lh-ink)] sm:text-4xl">
              오답 기록
            </h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base leading-relaxed text-[var(--lh-ink-secondary)] font-normal">
              틀린 이유와 정답을 비교하고 필요한 문제만 다시 학습하세요.
            </p>
          </div>
        </div>

        {/* Stats Row: Chunky M3 Stat Tiles */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 shadow-xs flex flex-col justify-between">
            <span className="block text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
              기록된 문제
            </span>
            <span className="mt-1 block font-mono text-2xl font-medium text-[var(--lh-ink)] sm:text-3xl">
              {items.length}개
            </span>
          </div>
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 shadow-xs flex flex-col justify-between">
            <span className="block text-xs font-medium uppercase tracking-wider text-[var(--lh-secondary-text)]">
              다시 볼 문제
            </span>
            <span className="mt-1 block font-mono text-2xl font-medium text-[var(--lh-secondary)] sm:text-3xl">
              {unresolvedCount}개
            </span>
          </div>
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 shadow-xs flex flex-col justify-between">
            <span className="block text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
              해결한 문제
            </span>
            <span className="mt-1 block font-mono text-2xl font-medium text-[var(--lh-primary)] sm:text-3xl">
              {resolvedCount}개
            </span>
          </div>
        </div>

        {/* Filter & View Switcher: M3 Pill Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs">
          {/* View Mode */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab("table")}
              className={`min-h-10 rounded-full border px-4 text-xs font-medium transition cursor-pointer shadow-xs ${
                activeTab === "table"
                  ? "bg-[var(--lh-primary)] text-white border-[var(--lh-primary)]"
                  : "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)]"
              }`}
            >
              표로 보기
            </button>
            <button
              onClick={() => setActiveTab("board")}
              className={`min-h-10 rounded-full border px-4 text-xs font-medium transition cursor-pointer shadow-xs ${
                activeTab === "board"
                  ? "bg-[var(--lh-primary)] text-white border-[var(--lh-primary)]"
                  : "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)]"
              }`}
            >
              원인별로 모아보기
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] p-1 text-xs shadow-xs">
              {(["all", "unresolved", "resolved"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`min-h-8 rounded-full px-3 text-xs transition cursor-pointer ${
                    filterStatus === st
                      ? "bg-[var(--lh-primary)] text-white font-medium"
                      : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] font-normal"
                  }`}
                >
                  {st === "all" ? "전체" : st === "unresolved" ? "다시 볼 문제" : "해결한 문제"}
                </button>
              ))}
            </div>

            {/* Tag Filter */}
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="min-h-10 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3.5 text-xs font-medium text-[var(--lh-ink-secondary)] shadow-xs"
            >
              <option value="all">전체 원인</option>
              <option value="개념 미숙">개념 이해 필요</option>
              <option value="계산 착오">계산 실수</option>
              <option value="조건 누락">문제 조건 놓침</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Content */}
      <div className="mt-6 space-y-4">
        {filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-12 text-center text-xs text-[var(--lh-ink-secondary)] space-y-2 shadow-xs">
            <p className="text-base font-medium text-[var(--lh-ink)]">저장된 오답이 없습니다.</p>
            <p className="font-normal">퀴즈에서 틀린 문제는 이 화면에 자동으로 정리됩니다.</p>
          </div>
        ) : activeTab === "table" ? (
          <>
          <div className="grid gap-4 md:hidden">
            {filteredItems.map((item) => (
              <article key={item.id} className={`rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 shadow-xs space-y-4 ${item.isResolved ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">{item.course}</p>
                    <h2 className="mt-1 text-base font-medium text-[var(--lh-ink)]">{item.concept}</h2>
                  </div>
                  <label className="flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-3 py-1 text-xs font-medium text-[var(--lh-ink-secondary)]">
                    <input type="checkbox" checked={!!item.isResolved} onChange={() => handleToggleResolved(item.id)} />
                    해결
                  </label>
                </div>
                <p className="text-sm font-medium leading-relaxed text-[var(--lh-ink)]">{item.question}</p>
                <dl className="grid gap-2.5 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 text-xs">
                  <div>
                    <dt className="text-[10px] font-medium uppercase text-[var(--lh-ink-tertiary)]">틀린 이유</dt>
                    <dd className="mt-1 font-medium text-[var(--lh-secondary-text)]">{item.misconceptionTag}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--lh-line)]">
                    <div>
                      <dt className="text-[10px] font-medium uppercase text-[var(--lh-ink-tertiary)]">내 답</dt>
                      <dd className="mt-1 font-mono text-[var(--lh-ink-secondary)] line-through">{item.wrongAnswer}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-medium uppercase text-[var(--lh-ink-tertiary)]">정답</dt>
                      <dd className="mt-1 font-mono font-medium text-[var(--lh-primary)]">{item.correctAnswer}</dd>
                    </div>
                  </div>
                </dl>
                <p className="text-xs leading-relaxed text-[var(--lh-ink-secondary)] font-normal">{item.explanation}</p>
                <div className="flex gap-2 border-t border-[var(--lh-line)] pt-4">
                  {onSelectView && (
                    <button
                      type="button"
                      onClick={() => handleJumpToLesson(item)}
                      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-4 text-xs font-medium text-white shadow-xs hover:bg-[var(--lh-primary-hover)] transition cursor-pointer"
                    >
                      <span>다시 학습하기</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(item.id, e)}
                    aria-label="오답 기록 삭제"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] shadow-xs hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] shadow-xs md:block">
            <table className="min-w-[720px] w-full text-left text-xs">
              <thead className="border-b border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] text-xs font-medium text-[var(--lh-ink-secondary)]">
                <tr>
                  <th className="w-12 px-4 py-3.5 text-center">완료</th>
                  <th className="px-5 py-3.5">문제 및 쉬운 설명</th>
                  <th className="px-5 py-3.5">틀린 이유</th>
                  <th className="px-5 py-3.5">내가 쓴 답 ➔ 정답</th>
                  <th className="px-5 py-3.5 text-right">다시 풀기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--lh-line)]">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition ${
                      item.isResolved ? "bg-[var(--lh-surface-subtle)] opacity-60" : "hover:bg-[var(--lh-surface-subtle)]"
                    }`}
                  >
                    {/* Resolved Checkbox */}
                    <td className="px-4 py-4 text-center align-top">
                      <input
                        type="checkbox"
                        checked={!!item.isResolved}
                        onChange={() => handleToggleResolved(item.id)}
                        className="rounded border-[var(--lh-line)] text-[var(--lh-primary)] focus:ring-0 cursor-pointer"
                        title={item.isResolved ? "완료 취소" : "이해 완료 체크"}
                      />
                    </td>

                    {/* Question & Explanation */}
                    <td className="px-5 py-4 align-top space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--lh-ink)] text-sm">{item.concept}</span>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">{item.course}</span>
                      </div>
                      <div className="text-xs text-[var(--lh-ink)] font-medium">{item.question}</div>
                      <div className="text-xs text-[var(--lh-ink-secondary)] leading-relaxed font-normal">
                        <span className="font-medium text-[var(--lh-ink)]">친절한 설명: </span>
                        {item.explanation}
                      </div>
                      {item.hint && (
                        <div className="rounded-xl bg-[var(--lh-primary-subtle)] p-2.5 text-[11px] text-[var(--lh-primary-text)] font-normal border border-[var(--lh-primary-border)]">
                          AI 힌트: {item.hint}
                        </div>
                      )}
                    </td>

                    {/* Tag */}
                    <td className="px-5 py-4 align-top whitespace-nowrap">
                      <span className="inline-block rounded-full bg-[var(--lh-secondary-subtle)] border border-[var(--lh-secondary-border)] px-3 py-1 text-[10px] font-medium text-[var(--lh-secondary-text)]">
                        {item.misconceptionTag}
                      </span>
                    </td>

                    {/* Answers */}
                    <td className="px-5 py-4 align-top font-mono text-xs whitespace-nowrap">
                      <span className="text-[var(--lh-ink-secondary)] line-through">{item.wrongAnswer}</span>
                      <span className="mx-1.5 text-[var(--lh-line)] font-sans">➔</span>
                      <span className="font-medium text-[var(--lh-primary)]">{item.correctAnswer}</span>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 align-top text-right whitespace-nowrap space-x-1">
                      {onSelectView && (
                        <button
                          onClick={() => handleJumpToLesson(item)}
                          title="해당 레슨으로 복습 이동"
                          className="rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-3.5 py-1.5 text-xs font-medium text-[var(--lh-primary-text)] hover:bg-[var(--lh-primary)] hover:text-white shadow-xs transition cursor-pointer"
                        >
                          다시 풀기 ➔
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        title="기록 삭제"
                        className="rounded-full p-2 text-[var(--lh-ink-tertiary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          /* Board View: Chunky M3 Columns & Cards */
          <div className="grid gap-4 sm:grid-cols-3">
            {(["개념 미숙", "계산 착오", "조건 누락"] as const).map((tag) => {
              const matched = filteredItems.filter((i) => i.misconceptionTag === tag);
              const labelMap: Record<string, string> = {
                "개념 미숙": "개념 이해 필요",
                "계산 착오": "계산 실수",
                "조건 누락": "문제 조건 놓침",
              };
              return (
                <div
                  key={tag}
                  className="rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 sm:p-5 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-[var(--lh-line)] pb-2.5">
                    <span className="font-medium text-xs text-[var(--lh-ink)]">{labelMap[tag] || tag}</span>
                    <span className="rounded-full bg-[var(--lh-surface)] border border-[var(--lh-secondary-border)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--lh-secondary-text)] shadow-xs">
                      {matched.length}개
                    </span>
                  </div>

                  <div className="space-y-3">
                    {matched.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-4 space-y-2.5 text-xs shadow-xs transition ${
                          item.isResolved ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-[var(--lh-ink)] text-xs leading-tight">
                            {item.concept}
                          </span>
                          <input
                            type="checkbox"
                            checked={!!item.isResolved}
                            onChange={() => handleToggleResolved(item.id)}
                            className="rounded border-[var(--lh-line)] text-[var(--lh-primary)] focus:ring-0 cursor-pointer"
                            title={item.isResolved ? "완료 취소" : "이해 완료 체크"}
                          />
                        </div>

                        <p className="text-xs font-medium text-[var(--lh-ink)] leading-relaxed">{item.question}</p>

                        <div className="rounded-xl bg-[var(--lh-surface-subtle)] p-2.5 font-mono text-xs border border-[var(--lh-line)]">
                          <span className="text-[var(--lh-ink-secondary)] line-through">{item.wrongAnswer}</span>
                          <span className="mx-1.5 text-[var(--lh-line)] font-sans">➔</span>
                          <span className="font-medium text-[var(--lh-primary)]">{item.correctAnswer}</span>
                        </div>

                        <p className="text-[11px] text-[var(--lh-ink-secondary)] leading-relaxed font-normal">
                          {item.explanation}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-[var(--lh-line)] text-[10px]">
                          <span className="text-[var(--lh-ink-tertiary)] font-normal">{item.date}</span>
                          {onSelectView && (
                            <button
                              onClick={() => handleJumpToLesson(item)}
                              className="font-medium text-[var(--lh-primary)] hover:underline cursor-pointer"
                            >
                              다시 공부하기 ➔
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {matched.length === 0 && (
                      <div className="py-8 text-center text-xs text-[var(--lh-ink-tertiary)] font-normal">
                        틀린 문제 없음
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
