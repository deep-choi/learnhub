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
    <div className="mx-auto w-full max-w-[760px] py-10 px-4 text-[#2F3437]">
      {/* 1. Header */}
      <div className="space-y-4 border-b border-[#E9E9E7] pb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl">📝</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#191919]">
              나만의 오답 공책
            </h1>
            <p className="text-sm text-[#787774] mt-0.5">
              틀린 문제는 실패가 아니에요. 다시 보면 실력이 쑥쑥 자라요.
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-md border border-[#E9E9E7] bg-white p-3">
            <span className="block text-[11px] font-semibold text-[#787774]">
              기록된 문제
            </span>
            <span className="mt-1 block font-mono text-xl font-bold text-[#191919]">
              {items.length}개
            </span>
          </div>
          <div className="rounded-md border border-[#E9E9E7] bg-white p-3">
            <span className="block text-[11px] font-semibold text-[#787774]">
              다시 볼 문제
            </span>
            <span className="mt-1 block font-mono text-xl font-bold text-[#191919]">
              {unresolvedCount}개
            </span>
          </div>
          <div className="rounded-md border border-[#E9E9E7] bg-white p-3">
            <span className="block text-[11px] font-semibold text-[#787774]">
              해결한 문제
            </span>
            <span className="mt-1 block font-mono text-xl font-bold text-[#787774]">
              {resolvedCount}개
            </span>
          </div>
        </div>

        {/* Filter & View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
          {/* View Mode */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab("table")}
              className={`px-2.5 py-1 rounded-sm border transition cursor-pointer ${
                activeTab === "table"
                  ? "bg-[#191919] text-white border-[#191919] font-medium"
                  : "bg-white border-[#E9E9E7] text-[#787774] hover:bg-[#F7F6F3]"
              }`}
            >
              표로 보기
            </button>
            <button
              onClick={() => setActiveTab("board")}
              className={`px-2.5 py-1 rounded-sm border transition cursor-pointer ${
                activeTab === "board"
                  ? "bg-[#191919] text-white border-[#191919] font-medium"
                  : "bg-white border-[#E9E9E7] text-[#787774] hover:bg-[#F7F6F3]"
              }`}
            >
              원인별로 모아보기
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center rounded-md border border-[#E9E9E7] bg-white p-0.5 text-[11px]">
              {(["all", "unresolved", "resolved"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`rounded-xs px-2 py-0.5 transition cursor-pointer ${
                    filterStatus === st
                      ? "bg-[#191919] text-white font-medium"
                      : "text-[#787774] hover:text-[#191919]"
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
              className="rounded-md border border-[#E9E9E7] bg-white px-2 py-1 text-[11px] text-[#787774] focus:outline-none focus:border-[#191919]"
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
          <div className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-10 text-center text-xs text-[#787774] space-y-2">
            <p className="font-semibold text-[#191919]">아직 오답 공책이 비어있어요.</p>
            <p>문제를 풀다가 헷갈리거나 틀린 문제는 여기에 자동으로 모여요.</p>
          </div>
        ) : activeTab === "table" ? (
          <div className="overflow-x-auto rounded-lg border border-[#E9E9E7] bg-white">
            <table className="min-w-[720px] w-full text-left text-xs">
              <thead className="border-b border-[#E9E9E7] bg-[#F7F6F3] text-[11px] font-semibold text-[#787774]">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center">완료</th>
                  <th className="px-4 py-2.5">문제 및 쉬운 설명</th>
                  <th className="px-4 py-2.5">틀린 이유</th>
                  <th className="px-4 py-2.5">내가 쓴 답 ➔ 정답</th>
                  <th className="px-4 py-2.5 text-right">다시 풀기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E9E7]">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition ${
                      item.isResolved ? "bg-[#FBFBFA] opacity-60" : "hover:bg-[#F7F6F3]"
                    }`}
                  >
                    {/* Resolved Checkbox */}
                    <td className="px-3 py-3 text-center align-top">
                      <input
                        type="checkbox"
                        checked={!!item.isResolved}
                        onChange={() => handleToggleResolved(item.id)}
                        className="rounded border-[#D3D3D0] text-[#191919] focus:ring-0 cursor-pointer"
                        title={item.isResolved ? "완료 취소" : "이해 완료 체크"}
                      />
                    </td>

                    {/* Question & Explanation */}
                    <td className="px-4 py-3 align-top space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#191919]">{item.concept}</span>
                        <span className="text-[10px] text-[#9B9A97]">{item.course}</span>
                      </div>
                      <div className="text-xs text-[#2F3437] font-medium">{item.question}</div>
                      <div className="text-[11px] text-[#787774] leading-relaxed">
                        <span className="font-semibold text-[#191919]">친절한 설명: </span>
                        {item.explanation}
                      </div>
                      {item.hint && (
                        <div className="rounded-sm bg-[#F7F6F3] p-1.5 text-[10px] text-[#787774]">
                          💡 AI 힌트: {item.hint}
                        </div>
                      )}
                    </td>

                    {/* Tag */}
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className="inline-block rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-1.5 py-0.5 text-[10px] font-semibold text-[#191919]">
                        {item.misconceptionTag}
                      </span>
                    </td>

                    {/* Answers */}
                    <td className="px-4 py-3 align-top font-mono text-xs whitespace-nowrap">
                      <span className="text-[#787774] line-through">{item.wrongAnswer}</span>
                      <span className="mx-1 text-[#D3D3D0]">➔</span>
                      <span className="font-bold text-[#191919]">{item.correctAnswer}</span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap space-x-1">
                      {onSelectView && (
                        <button
                          onClick={() => handleJumpToLesson(item)}
                          title="해당 레슨으로 복습 이동"
                          className="rounded-sm border border-[#E9E9E7] bg-white px-2 py-1 text-[10px] font-semibold text-[#191919] hover:bg-[#F7F6F3] transition cursor-pointer"
                        >
                          다시 풀기 ➔
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        title="기록 삭제"
                        className="rounded-sm p-1 text-[#D3D3D0] hover:text-[#787774] transition cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Board View */
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
                  className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-3 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-2">
                    <span className="font-bold text-xs text-[#191919]">{labelMap[tag] || tag}</span>
                    <span className="rounded-sm bg-white border border-[#E9E9E7] px-1.5 py-0.2 font-mono text-[10px] text-[#787774]">
                      {matched.length}개
                    </span>
                  </div>

                  <div className="space-y-2">
                    {matched.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-md border border-[#E9E9E7] bg-white p-3 space-y-2 text-xs shadow-xs transition ${
                          item.isResolved ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold text-[#191919] text-[11px] leading-tight">
                            {item.concept}
                          </span>
                          <input
                            type="checkbox"
                            checked={!!item.isResolved}
                            onChange={() => handleToggleResolved(item.id)}
                            className="rounded border-[#D3D3D0] text-[#191919] focus:ring-0 cursor-pointer"
                            title={item.isResolved ? "완료 취소" : "이해 완료 체크"}
                          />
                        </div>

                        <p className="text-[11px] font-medium text-[#2F3437]">{item.question}</p>

                        <div className="rounded-sm bg-[#F7F6F3] p-1.5 font-mono text-[10px]">
                          <span className="text-[#787774] line-through">{item.wrongAnswer}</span>
                          <span className="mx-1 text-[#D3D3D0]">➔</span>
                          <span className="font-bold text-[#191919]">{item.correctAnswer}</span>
                        </div>

                        <p className="text-[10px] text-[#787774] leading-relaxed">
                          {item.explanation}
                        </p>

                        <div className="flex items-center justify-between pt-1 border-t border-[#F0F0EE] text-[10px]">
                          <span className="text-[#9B9A97]">{item.date}</span>
                          {onSelectView && (
                            <button
                              onClick={() => handleJumpToLesson(item)}
                              className="font-semibold text-[#191919] hover:underline cursor-pointer"
                            >
                              다시 공부하기 ➔
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {matched.length === 0 && (
                      <div className="py-6 text-center text-[11px] text-[#9B9A97]">
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
