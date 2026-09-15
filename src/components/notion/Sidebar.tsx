import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileText,
  Home,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Settings,
  User,
  Layers,
  PanelLeftClose,
  MoreHorizontal,
  Archive,
  XCircle,
} from "lucide-react";
import { Course, LessonMeta, UserAccount } from "../../types/learning";
import { LearnHubLogo } from "../common/LearnHubLogo";

export type NotionPageView =
  | { type: "home" }
  | { type: "courses" }
  | { type: "course-detail"; course: Course }
  | { type: "assessment"; course: Course }
  | { type: "ai-chat" }
  | { type: "records" }
  | { type: "lesson"; course: Course; lesson: LessonMeta; chapterTitle: string; assessmentReturn?: boolean }
  | { type: "knowledge-map" }
  | { type: "skill-matrix" }
  | { type: "review-queue" }
  | { type: "mistake-archive" };

interface SidebarProps {
  courses: Course[];
  activeView: NotionPageView;
  onSelectView: (view: NotionPageView) => void;
  onOpenLearning: () => void;
  onOpenCreateCourse: () => void;
  onOpenSearch: () => void;
  onOpenTutor: () => void;
  pendingReviewsCount: number;
  isOpen: boolean;
  onToggleSidebar: () => void;
  userAccount?: UserAccount;
  onOpenAuth?: () => void;
  onOpenSettings?: () => void;
  onUpdateCourseStatus?: (courseId: string, status: "completed" | "cancelled" | "active") => void;
}

type RailCategory = "home" | "courses" | "ai-chat" | "records" | "review-queue";

export const Sidebar: React.FC<SidebarProps> = ({
  courses,
  activeView,
  onSelectView,
  onOpenLearning,
  onOpenCreateCourse,
  onOpenSearch,
  onOpenTutor,
  pendingReviewsCount,
  isOpen,
  onToggleSidebar,
  userAccount,
  onOpenAuth,
  onOpenSettings,
  onUpdateCourseStatus,
}) => {
  // 1번째 사진 (Rail only) vs 2번째 사진 (Rail + Expanded Drawer)
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (userAccount?.isGuest) setIsPanelExpanded(false);
  }, [userAccount?.isGuest]);

  const [selectedRailCategory, setSelectedRailCategory] = useState<RailCategory>(() => {
    if (activeView.type === "courses" || activeView.type === "course-detail" || activeView.type === "lesson" || activeView.type === "assessment") return "courses";
    if (activeView.type === "ai-chat") return "ai-chat";
    if (activeView.type === "review-queue") return "review-queue";
    if (["records", "knowledge-map", "skill-matrix", "mistake-archive"].includes(activeView.type)) return "records";
    return "home";
  });

  const [expandedCourseIds, setExpandedCourseIds] = useState<{ [id: string]: boolean }>({
    "course-high-math-01": true,
    "course-mid-math-01": false,
  });
  const [courseMenuId, setCourseMenuId] = useState<string | null>(null);
  const activeCourses = courses.filter((course) => course.status !== "completed" && course.status !== "cancelled");

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

  // Determine current active rail tab from activeView
  const currentActiveRail: RailCategory = (() => {
    if (activeView.type === "courses" || activeView.type === "course-detail" || activeView.type === "lesson" || activeView.type === "assessment") return "courses";
    if (activeView.type === "ai-chat") return "ai-chat";
    if (activeView.type === "review-queue") return "review-queue";
    if (["records", "knowledge-map", "skill-matrix", "mistake-archive"].includes(activeView.type)) return "records";
    return "home";
  })();

  // Handle clicking a Rail Item
  const handleRailClick = (category: RailCategory) => {
    if (category !== "home" && category !== "courses" && userAccount?.isGuest && onOpenAuth) {
      onOpenAuth();
      return;
    }
    setSelectedRailCategory(category);

    if (category === "home") {
      setIsPanelExpanded(false);
      handleSelectView({ type: "home" });
      return;
    }

    if (category === "courses") {
      // 내 과목 클릭 시: 이미 펼쳐져 있는 상태라면 접고, 아니면 펼치기
      if (currentActiveRail === "courses" && isPanelExpanded) {
        setIsPanelExpanded(false);
      } else {
        setIsPanelExpanded(true);
        handleSelectView({ type: "courses" });
      }
      return;
    }

    if (category === "ai-chat") {
      setIsPanelExpanded(false);
      handleSelectView({ type: "ai-chat" });
      return;
    }

    if (category === "records") {
      setIsPanelExpanded(false);
      handleSelectView({ type: "records" });
      return;
    }

    if (category === "review-queue") {
      setIsPanelExpanded(false);
      handleSelectView({ type: "review-queue" });
      return;
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed left-4 top-3.5 z-40">
        <button
          onClick={onToggleSidebar}
          title="사이드바 열기 (⌘\)"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] shadow-sm transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onToggleSidebar}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity md:hidden cursor-pointer"
      />

      {/* Main Container: Slim Rail + Expansible Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 border-r border-t border-b border-l-0 border-[var(--lh-line)] bg-[var(--lh-surface)] text-sm select-none shadow-2xl md:relative md:shadow-none transition-all duration-200 rounded-tr-2xl rounded-br-2xl overflow-hidden`}
      >

        {/* =========================================================================
            SECTION 1: M3 Navigation Rail (1번째 사진)
            - Fixed slim width (~76px)
            - Top Search Button in rounded container
            - Navigation Destinations (Centered Icon in Pill + Text Label below)
            - Bottom Utilities (Theme, Tutor, Expand/Collapse Toggle, Profile)
           ========================================================================= */}
        <div
          className="flex h-full w-[76px] shrink-0 flex-col items-center justify-between border-r border-[var(--lh-line-strong)] bg-[var(--lh-surface)] py-3 transition-all duration-200"
        >

          {/* Top: LearnHub Official Brand Emblem (No box wrapper) & Quick Search */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleRailClick("home")}
              title="LearnHub 홈"
              className="flex items-center justify-center p-1 transition-transform hover:scale-110 cursor-pointer"
            >
              <LearnHubLogo size={32} />
            </button>

            <button
              type="button"
              onClick={onOpenSearch}
              title="검색 (⌘K)"
              className="group flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] text-[var(--lh-ink)] shadow-2xs transition hover:bg-[var(--lh-primary)] hover:text-white hover:border-[var(--lh-primary)] cursor-pointer"
            >
              <Search className="h-5 w-5 transition group-hover:scale-105" />
            </button>
          </div>

          {/* Middle: Navigation Rail Destinations (Icon on top with Pill indicator, Text label below) */}
          <nav className="flex flex-col items-center gap-2 py-3" aria-label="메인 레일 네비게이션">
            {/* 1. 홈 (Home) */}
            <button
              type="button"
              onClick={() => handleRailClick("home")}
              title="공부 홈"
              className="group flex flex-col items-center justify-center w-16 py-1 cursor-pointer"
            >
              <div
                className={`flex h-9 w-14 items-center justify-center rounded-full transition ${
                  currentActiveRail === "home"
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <Home className="h-5 w-5" />
              </div>
              <span
                className={`mt-1 text-[11px] tracking-tight text-center ${
                  currentActiveRail === "home"
                    ? "font-medium text-[var(--lh-primary)]"
                    : "font-medium text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                홈
              </span>
            </button>

            {/* 2. 내 과목 (My Courses / Curriculum) -> 클릭 시 서브 드로어 자동 펼침 */}
            <button
              type="button"
              onClick={() => handleRailClick("courses")}
              title="내 과목 (클릭하여 챕터/레슨 펼치기)"
              className="group flex flex-col items-center justify-center w-16 py-1 cursor-pointer relative"
            >
              <div
                className={`flex h-9 w-14 items-center justify-center rounded-full transition relative ${
                  currentActiveRail === "courses" || (isPanelExpanded && selectedRailCategory === "courses")
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <BookOpen className="h-5 w-5" />
                {activeCourses.length > 0 && (
                  <span className={`absolute -top-1 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium border ${
                    currentActiveRail === "courses" || (isPanelExpanded && selectedRailCategory === "courses")
                      ? "bg-white text-[var(--lh-primary)] border-white/80"
                      : "bg-[var(--lh-primary)] text-white border-white"
                  }`}>
                    {activeCourses.length}
                  </span>
                )}
              </div>
              <span
                className={`mt-1 text-[11px] tracking-tight text-center ${
                  currentActiveRail === "courses" || (isPanelExpanded && selectedRailCategory === "courses")
                    ? "font-medium text-[var(--lh-primary)]"
                    : "font-medium text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                내 과목
              </span>
            </button>

            {/* 3. AI 대화 */}
            <button
              type="button"
              onClick={() => handleRailClick("ai-chat")}
              title="AI와 대화하기"
              className="group flex flex-col items-center justify-center w-16 py-1 cursor-pointer"
            >
              <div
                className={`flex h-9 w-14 items-center justify-center rounded-full transition ${
                  currentActiveRail === "ai-chat"
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <MessageCircle className="h-5 w-5" />
              </div>
              <span
                className={`mt-1 text-[11px] tracking-tight text-center ${
                  currentActiveRail === "ai-chat"
                    ? "font-medium text-[var(--lh-primary)]"
                    : "font-medium text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                AI 대화
              </span>
            </button>

            {/* 4. 학습 기록 */}
            <button
              type="button"
              onClick={() => handleRailClick("records")}
              title="학습 기록"
              className="group flex flex-col items-center justify-center w-16 py-1 cursor-pointer"
            >
              <div
                className={`flex h-9 w-14 items-center justify-center rounded-full transition ${
                  currentActiveRail === "records"
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <BarChart3 className="h-5 w-5" />
              </div>
              <span
                className={`mt-1 text-[11px] tracking-tight text-center ${
                  currentActiveRail === "records"
                    ? "font-medium text-[var(--lh-primary)]"
                    : "font-medium text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                기록
              </span>
            </button>

            {/* 5. 예정 복습 (Review Queue) */}
            <button
              type="button"
              onClick={() => handleRailClick("review-queue")}
              title="예정된 복습 문제"
              className="group flex flex-col items-center justify-center w-16 py-1 cursor-pointer relative"
            >
              <div
                className={`flex h-9 w-14 items-center justify-center rounded-full transition relative ${
                  currentActiveRail === "review-queue"
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <RotateCcw className="h-5 w-5" />
                {pendingReviewsCount > 0 && (
                  <span className="absolute -top-1 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium bg-[var(--lh-secondary)] text-white border border-white shadow-xs">
                    {pendingReviewsCount}
                  </span>
                )}
              </div>
              <span
                className={`mt-1 text-[11px] tracking-tight text-center ${
                  currentActiveRail === "review-queue"
                    ? "font-medium text-[var(--lh-primary)]"
                    : "font-medium text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                복습
              </span>
            </button>
          </nav>

          {/* Bottom: Settings Icon + Profile Icon */}
          <div className="flex flex-col items-center gap-1.5 border-t border-[var(--lh-line)] pt-2.5 pb-1">
            {/* 설정 아이콘 */}
            <button
              type="button"
              onClick={onOpenSettings}
              title="설정 (테마 시스템, 프로필 계정, 기본 설정)"
              className="group flex flex-col items-center justify-center w-16 py-0.5 cursor-pointer"
            >
              <div className="flex h-8.5 w-14 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]">
                <Settings className="h-5 w-5" />
              </div>
              <span className="mt-0.5 text-[11px] font-medium tracking-tight text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)] text-center">
                설정
              </span>
            </button>

            {/* 프로필 아이콘 (설정 바로 밑에 위치) */}
            <button
              type="button"
              onClick={() => {
                if (userAccount?.isGuest && onOpenAuth) {
                  onOpenAuth();
                } else if (onOpenSettings) {
                  onOpenSettings();
                }
              }}
              title={userAccount?.isGuest ? "로그인하기" : `${userAccount?.name || "회원"} 프로필`}
              className="group flex flex-col items-center justify-center w-16 py-0.5 cursor-pointer"
            >
              <div
                className={`flex h-8.5 w-8.5 items-center justify-center rounded-full text-xs font-medium shadow-2xs transition group-hover:scale-105 ${
                  userAccount?.isGuest
                    ? "border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)] group-hover:bg-[var(--lh-surface-subtle)]"
                    : "bg-[var(--lh-primary)] text-white"
                }`}
              >
                {userAccount?.isGuest ? (
                  <User className="h-4.5 w-4.5" />
                ) : (
                  <span className="text-xs font-medium">{userAccount?.name?.slice(0, 1) || "U"}</span>
                )}
              </div>
              <span className="mt-0.5 text-[11px] font-medium tracking-tight text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)] text-center truncate max-w-[58px]">
                {userAccount?.isGuest ? "로그인" : (userAccount?.name || "프로필")}
              </span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            SECTION 2: M3 Expansible Sub-Drawer Panel (2번째 사진)
            - Attached immediately next to the Rail
            - Appears when user toggles expand or clicks "내 과목"
            - Header with section overview pill & fold button
            - Hierarchical Course Tree & Chapters / Lessons
            ========================================================================= */}
        {isPanelExpanded && (
          <div className="flex h-full w-[260px] sm:w-[280px] shrink-0 flex-col bg-[var(--lh-surface)] p-3 text-sm animate-fade-in transition-all">

            {/* 1. Header Overview Pill with Logo */}
            <div className="flex items-center justify-between gap-2 pb-3 pt-1 border-b border-[var(--lh-line)]">
              <div className="flex items-center gap-2 truncate">
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-3.5 py-1.5 text-xs font-medium text-[var(--lh-ink)] shadow-xs">
                  <LearnHubLogo size={16} />
                  <span>내 과목 커리큘럼</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPanelExpanded(false)}
                title="사이드바 접기"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface)] hover:text-[var(--lh-ink)] hover:border-[var(--lh-point)] shadow-2xs transition cursor-pointer group"
                aria-label="사이드바 접기"
              >
                <PanelLeftClose className="h-4.5 w-4.5 transition-transform group-hover:scale-105" />
              </button>
            </div>

            {/* 2. Primary Action Buttons */}
            <div className="pt-3 pb-2 space-y-1.5">
              <button
                type="button"
                onClick={() => handleSelectView({ type: "courses" })}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] hover:bg-[var(--lh-surface-subtle)] px-4 text-xs font-medium text-[var(--lh-ink)] shadow-xs transition cursor-pointer"
              >
                <Layers className="h-3.5 w-3.5 text-[var(--lh-point)]" />
                <span>학습 로드맵 전체 보기</span>
              </button>
              <button
                type="button"
                onClick={onOpenCreateCourse}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-4 text-xs font-medium text-white shadow-xs transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>새 과목 만들기</span>
              </button>
            </div>

            {/* 3. Scrollable Tree: Courses -> Chapters -> Lessons */}
            <div className="flex-1 space-y-3 overflow-y-auto pr-1 py-2">
              <div className="px-2 text-[10px] font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">
                수강 중인 과목 ({activeCourses.length})
              </div>

              <div className="space-y-2">
                {activeCourses.map((course) => {
                  const isExpanded = !!expandedCourseIds[course.id];
                  const isCourseActive =
                    activeView.type === "lesson" && activeView.course.id === course.id;

                  return (
                    <div
                      key={course.id}
                      className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-2.5 space-y-1.5 shadow-xs"
                    >
                      {/* Course Title Accordion Item */}
                      <div className="relative flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => toggleCourse(course.id, e)}
                          aria-expanded={isExpanded}
                          className={`flex min-w-0 flex-1 items-center justify-between rounded-xl px-2 py-1.5 text-left transition cursor-pointer ${
                            isCourseActive
                              ? "bg-[var(--lh-surface)] font-medium text-[var(--lh-ink)] shadow-2xs"
                              : "hover:bg-[var(--lh-surface)] text-[var(--lh-ink)] font-medium"
                          }`}
                        >
                          <span className="flex items-center gap-2 truncate text-xs">
                            <span className="text-[var(--lh-ink-tertiary)]">
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <span className="truncate">{course.title}</span>
                          </span>
                        </button>
                        {onUpdateCourseStatus && (
                          <button
                            type="button"
                            aria-label={`${course.title} 과목 관리`}
                            title="과목 관리"
                            onClick={() => setCourseMenuId((current) => current === course.id ? null : course.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface)] hover:text-[var(--lh-ink)] cursor-pointer"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        )}
                        {courseMenuId === course.id && onUpdateCourseStatus && (
                          <div role="menu" className="absolute right-0 top-9 z-30 min-w-44 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-1.5 text-xs shadow-lg">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { onUpdateCourseStatus(course.id, "completed"); setCourseMenuId(null); }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              학습 완료로 보관
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { onUpdateCourseStatus(course.id, "cancelled"); setCourseMenuId(null); }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--lh-danger)] hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              수강 취소
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Expanded Chapters & Lessons */}
                      {isExpanded && (
                        <div className="ml-2.5 space-y-2 border-l border-[var(--lh-line)] pl-2 pt-1">
                          {course.chapters.map((chapter, cIdx) => (
                            <div key={chapter.id} className="space-y-1">
                              <div className="truncate px-2 py-0.5 text-[10px] font-medium text-[var(--lh-ink-tertiary)]">
                                CH {cIdx + 1}. {chapter.title}
                              </div>
                              <div className="space-y-0.5">
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
                                      className={`flex w-full items-center gap-2 rounded-full px-2.5 py-1.5 text-left text-xs transition cursor-pointer ${
                                        isLessonActive
                                          ? "bg-[var(--lh-ink)] font-medium text-white shadow-xs"
                                          : "text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] font-medium"
                                      }`}
                                    >
                                      <FileText
                                        className={`h-3 w-3 shrink-0 ${
                                          isLessonActive ? "text-white" : "text-[var(--lh-ink-tertiary)]"
                                        }`}
                                      />
                                      <span className="truncate">{lesson.title}</span>
                                      {lesson.isCompleted && (
                                        <span
                                          className={`ml-auto text-[10px] font-medium ${
                                            isLessonActive ? "text-white" : "text-[var(--lh-ink)]"
                                          }`}
                                        >
                                          ✓
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {activeCourses.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[var(--lh-line)] px-3 py-4 text-center text-xs text-[var(--lh-ink-secondary)]">
                    수강 중인 과목이 없어요.
                  </p>
                )}
              </div>

            </div>

          </div>
        )}
      </aside>
    </>
  );
};
