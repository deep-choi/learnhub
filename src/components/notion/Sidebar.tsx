import React, { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  FileText,
  HelpCircle,
  History,
  Home,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  User,
} from "lucide-react";
import { Course, LessonMeta, UserAccount } from "../../types/learning";

export type NotionPageView =
  | { type: "home" }
  | { type: "records" }
  | { type: "lesson"; course: Course; lesson: LessonMeta; chapterTitle: string }
  | { type: "knowledge-map" }
  | { type: "skill-matrix" }
  | { type: "review-queue" }
  | { type: "mistake-archive" }
  | { type: "settings" };

interface SidebarProps {
  courses: Course[];
  activeView: NotionPageView;
  onSelectView: (view: NotionPageView) => void;
  onOpenLearning: () => void;
  onOpenCreateCourse: () => void;
  onOpenSearch: () => void;
  onOpenTimer: () => void;
  onOpenTutor: () => void;
  onOpenPlacementTest: () => void;
  pendingReviewsCount: number;
  isOpen: boolean;
  onToggleSidebar: () => void;
  userAccount?: UserAccount;
  onOpenAuth?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  courses,
  activeView,
  onSelectView,
  onOpenLearning,
  onOpenCreateCourse,
  onOpenSearch,
  onOpenTimer,
  onOpenTutor,
  onOpenPlacementTest,
  pendingReviewsCount,
  isOpen,
  onToggleSidebar,
  userAccount,
  onOpenAuth,
}) => {
  const [expandedCourseIds, setExpandedCourseIds] = useState<{ [id: string]: boolean }>({
    "course-high-math-01": true,
    "course-mid-math-01": false,
  });

  const toggleCourse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCourseIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectView = (view: NotionPageView) => {
    onSelectView(view);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      onToggleSidebar();
    }
  };

  const handleOpenLearning = () => {
    onOpenLearning();
    if (typeof window !== "undefined" && window.innerWidth < 768) onToggleSidebar();
  };

  if (!isOpen) {
    return (
      <div className="fixed top-3 left-3 z-40">
        <button
          onClick={onToggleSidebar}
          title="사이드바 열기 (⌘\)"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#E9E9E7] bg-white text-[#787774] shadow-xs transition hover:bg-[#F7F6F3] hover:text-[#191919] cursor-pointer"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onToggleSidebar}
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] transition-opacity md:hidden cursor-pointer"
      />
      <aside className="fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-[#E9E9E7] bg-[#F7F6F3] text-xs select-none shadow-2xl md:relative md:shadow-none">
      {/* 1. Workspace Switcher Header */}
      <div className="flex h-12 items-center justify-between px-3 border-b border-[#E9E9E7]">
        <div className="flex items-center gap-2 truncate">
          <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#191919] text-[10px] font-bold text-white">
            L
          </div>
          <span className="truncate font-bold text-[#191919] text-xs">
            LearnHub Study Space
          </span>
        </div>
        <button
          onClick={onToggleSidebar}
          title="사이드바 접기 (⌘\)"
          className="rounded-sm p-1 text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919] transition"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Primary navigation: home, current learning, and records. */}
      <nav className="space-y-0.5 border-b border-[#E9E9E7] p-2" aria-label="주요 메뉴">
        <button
          type="button"
          onClick={() => handleSelectView({ type: "home" })}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition cursor-pointer ${
            activeView.type === "home" ? "bg-[#191919] font-bold text-white" : "text-[#191919] hover:bg-[#EFEFED]"
          }`}
        >
          <Home className="h-3.5 w-3.5" />
          <span>홈</span>
        </button>
        <button
          type="button"
          onClick={handleOpenLearning}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium text-[#191919] transition hover:bg-[#EFEFED] cursor-pointer"
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>학습</span>
        </button>
        <button
          type="button"
          onClick={() => handleSelectView({ type: "records" })}
          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition cursor-pointer ${
            activeView.type === "records" ? "bg-[#191919] font-bold text-white" : "text-[#191919] hover:bg-[#EFEFED]"
          }`}
        >
          <span className="flex items-center gap-2"><History className="h-3.5 w-3.5" /><span>기록</span></span>
          {pendingReviewsCount > 0 && (
            <span className={`rounded-full px-1.5 text-[9px] font-bold ${activeView.type === "records" ? "bg-white text-[#191919]" : "bg-[#191919] text-white"}`}>
              {pendingReviewsCount}
            </span>
          )}
        </button>
      </nav>

      {/* 3. Optional advanced tools and legacy views remain reachable without competing with the primary flow. */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        <details className="rounded-md border border-[#E9E9E7] bg-white p-2">
          <summary className="cursor-pointer list-none px-1 py-1 text-[11px] font-bold text-[#787774]">
            고급 기능 및 예시 화면
          </summary>
          <div className="mt-2 space-y-0.5">
            <button type="button" onClick={onOpenSearch} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919] cursor-pointer">
              <Search className="h-3.5 w-3.5" /><span>빠른 찾기</span><span className="ml-auto text-[10px] text-[#9B9A97]">검색</span>
            </button>
            <button type="button" onClick={onOpenTutor} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919] cursor-pointer">
              <Sparkles className="h-3.5 w-3.5" /><span>AI에게 물어보기</span>
            </button>
            <button type="button" onClick={onOpenTimer} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919] cursor-pointer">
              <Timer className="h-3.5 w-3.5" /><span>집중 타이머</span>
            </button>
            <button type="button" onClick={onOpenPlacementTest} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919] cursor-pointer">
              <Target className="h-3.5 w-3.5" /><span>수학 예시 진단</span>
            </button>
            <div className="my-2 border-t border-[#E9E9E7]" />
            <button
            type="button"
            onClick={() => handleSelectView({ type: "knowledge-map" })}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition cursor-pointer ${
              activeView.type === "knowledge-map"
                ? "bg-[#EFEFED] font-bold text-[#191919]"
                : "text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919]"
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>🗺️ 수학 예시 지도</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectView({ type: "skill-matrix" })}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition cursor-pointer ${
              activeView.type === "skill-matrix"
                ? "bg-[#EFEFED] font-bold text-[#191919]"
                : "text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919]"
            }`}
          >
            <span className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>📊 내 실력 그래프</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectView({ type: "review-queue" })}
            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition cursor-pointer ${
              activeView.type === "review-queue"
                ? "bg-[#EFEFED] font-bold text-[#191919]"
                : "text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919]"
            }`}
          >
            <span className="flex items-center gap-2">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>⏰ 예정된 복습</span>
            </span>
            {pendingReviewsCount > 0 && (
              <span className="rounded-full bg-[#191919] px-1.5 text-[9px] font-bold text-white">
                {pendingReviewsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSelectView({ type: "mistake-archive" })}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition cursor-pointer ${
              activeView.type === "mistake-archive"
                ? "bg-[#EFEFED] font-bold text-[#191919]"
                : "text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919]"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>📝 나만의 오답 공책</span>
          </button>
          </div>
        </details>

        {/* Course Tree */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#9B9A97]">
            <span>교과목 서재</span>
            <button
              onClick={onOpenCreateCourse}
              title="새 과목 추가"
              className="text-[#787774] hover:text-[#191919]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {courses.map((course) => {
            const isExpanded = !!expandedCourseIds[course.id];
            const isCourseActive =
              activeView.type === "lesson" && activeView.course.id === course.id;

            return (
              <div key={course.id} className="space-y-0.5">
                {/* Course Item */}
                <button
                  type="button"
                  onClick={(e) => toggleCourse(course.id, e)}
                  aria-expanded={isExpanded}
                  aria-label={`${course.title} ${isExpanded ? "접기" : "펼치기"}`}
                  className={`group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left cursor-pointer transition ${
                    isCourseActive && !isExpanded
                      ? "bg-[#EFEFED] text-[#191919] font-bold"
                      : "text-[#2F3437] hover:bg-[#EFEFED]"
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="p-0.5 text-[#9B9A97]" aria-hidden="true">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </span>
                    <span className="truncate font-medium">{course.title}</span>
                  </span>
                </button>

                {/* Sub-items (Lessons) */}
                {isExpanded && (
                  <div className="ml-4 pl-1 border-l border-[#E9E9E7] space-y-0.5">
                    {course.chapters.map((chapter) => (
                      <div key={chapter.id} className="space-y-0.5">
                        <div className="px-2 py-1 text-[10px] font-semibold text-[#9B9A97] truncate">
                          {chapter.title}
                        </div>
                        {chapter.lessons.map((lesson) => {
                          const isLessonActive =
                            activeView.type === "lesson" &&
                            activeView.lesson.id === lesson.id;

                          return (
                            <button
                              key={lesson.id}
                              onClick={() =>
                                handleSelectView({
                                  type: "lesson",
                                  course,
                                  lesson,
                                  chapterTitle: chapter.title,
                                })
                              }
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition ${
                                isLessonActive
                                  ? "bg-[#EFEFED] font-bold text-[#191919]"
                                  : "text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919]"
                              }`}
                            >
                              <FileText className="h-3 w-3 shrink-0 text-[#9B9A97]" />
                              <span className="truncate">{lesson.title}</span>
                              {lesson.isCompleted && (
                                <span className="ml-auto text-[10px] text-[#9B9A97]">✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Bottom Utilities */}
      <div className="border-t border-[#E9E9E7] p-2 space-y-1">
        <button
          onClick={() => handleSelectView({ type: "settings" })}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition cursor-pointer ${
            activeView.type === "settings"
              ? "bg-[#EFEFED] font-bold text-[#191919]"
              : "text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919]"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          <span>환경 설정</span>
        </button>

        {/* User Account Bar */}
        <div className="flex items-center justify-between rounded-md bg-white border border-[#E9E9E7] px-2.5 py-1.5 mt-1 shadow-2xs">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-xs">{userAccount?.isGuest ? "🌱" : "👤"}</span>
            <span className="text-[11px] font-semibold text-[#191919] truncate">
              {userAccount?.name || "체험 학습자"}
            </span>
          </div>
          {userAccount?.isGuest && onOpenAuth && (
            <button
              onClick={onOpenAuth}
              className="text-[10px] font-bold text-[#191919] hover:underline shrink-0 cursor-pointer"
            >
              로그인
            </button>
          )}
        </div>
      </div>
    </aside>
  </>
);
};
