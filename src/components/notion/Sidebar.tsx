import React, { useEffect, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  FileText,
  Home,
  LogIn,
  MessageCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  Target,
  Layers,
} from "lucide-react";
import { Course, LessonMeta, UserAccount } from "../../types/learning";
import { LearnHubLogo } from "../common/LearnHubLogo";
import { THEME_CHANGED_EVENT, ThemeMode, getStoredTheme, toggleTheme } from "../../services/theme";

export type NotionPageView =
  | { type: "home" }
  | { type: "courses" }
  | { type: "course-detail"; course: Course }
  | { type: "ai-chat" }
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
  onOpenTutor: () => void;
  onOpenPlacementTest: () => void;
  pendingReviewsCount: number;
  isOpen: boolean;
  onToggleSidebar: () => void;
  userAccount?: UserAccount;
  onOpenAuth?: () => void;
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
  onOpenPlacementTest,
  pendingReviewsCount,
  isOpen,
  onToggleSidebar,
  userAccount,
  onOpenAuth,
}) => {
  // 1번째 사진 (Rail only) vs 2번째 사진 (Rail + Expanded Drawer)
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(false);
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: ThemeMode }>;
      if (customEvent.detail?.theme) {
        setThemeState(customEvent.detail.theme);
      }
    };
    window.addEventListener(THEME_CHANGED_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, handleThemeChange);
  }, []);

  useEffect(() => {
    if (userAccount?.isGuest) setIsPanelExpanded(false);
  }, [userAccount?.isGuest]);

  const [selectedRailCategory, setSelectedRailCategory] = useState<RailCategory>(() => {
    if (activeView.type === "courses" || activeView.type === "course-detail" || activeView.type === "lesson") return "courses";
    if (activeView.type === "ai-chat") return "ai-chat";
    if (activeView.type === "review-queue") return "review-queue";
    if (["records", "knowledge-map", "skill-matrix", "mistake-archive"].includes(activeView.type)) return "records";
    return "home";
  });

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

  // Determine current active rail tab from activeView
  const currentActiveRail: RailCategory = (() => {
    if (activeView.type === "courses" || activeView.type === "course-detail" || activeView.type === "lesson") return "courses";
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
      handleSelectView({ type: "home" });
      return;
    }

    if (category === "courses") {
      handleSelectView({ type: "courses" });
      return;
    }

    if (category === "ai-chat") {
      handleSelectView({ type: "ai-chat" });
      return;
    }

    if (category === "records") {
      handleSelectView({ type: "records" });
      return;
    }

    if (category === "review-queue") {
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
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity md:hidden cursor-pointer"
      />

      {/* Main Container: Slim Rail (Image 1) + Optional Expansible Drawer (Image 2) */}
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
          className={`flex h-full w-[76px] shrink-0 flex-col items-center justify-between bg-[var(--lh-surface)] py-3 transition-all duration-200 ${
            isPanelExpanded ? "border-r-0" : "border-r border-[var(--lh-line)]"
          }`}
        >

          {/* Top: LearnHub Official Brand Emblem & Quick Search */}
          <div className="flex flex-col items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleRailClick("home")}
              title="LearnHub 홈"
              className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] transition-all duration-200 hover:scale-105 hover:shadow-sm cursor-pointer"
            >
              <LearnHubLogo size={28} />
            </button>

            <button
              type="button"
              onClick={onOpenSearch}
              title="검색 (⌘K)"
              className="group flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] text-[var(--lh-ink)] shadow-2xs transition hover:bg-[var(--lh-primary)] hover:text-white hover:border-[var(--lh-primary)] cursor-pointer"
            >
              <Search className="h-4 w-4 transition group-hover:scale-105" />
            </button>
          </div>

          {/* Middle: Navigation Rail Destinations (Icon on top with Pill indicator, Text label below) */}
          <nav className="flex flex-col items-center gap-2.5 py-4" aria-label="메인 레일 네비게이션">
            {/* 1. 홈 (Home) */}
            <button
              type="button"
              onClick={() => handleRailClick("home")}
              title="공부 홈"
              className="group flex flex-col items-center justify-center w-16 py-1 cursor-pointer"
            >
              <div
                className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
                  currentActiveRail === "home"
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <Home className="h-4 w-4" />
              </div>
              <span
                className={`mt-1 text-[10px] tracking-tight text-center ${
                  currentActiveRail === "home"
                    ? "font-medium text-[var(--lh-primary)]"
                    : "font-medium text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                홈
              </span>
            </button>

            {/* 2. 내 과목 (My Courses / Curriculum) -> 클릭 시 2번째 사진처럼 서브 드로어 펼침 */}
            <button
              type="button"
              onClick={() => handleRailClick("courses")}
              title="내 과목 (클릭하여 챕터/레슨 펼치기)"
              className="group flex flex-col items-center justify-center w-16 py-1 cursor-pointer relative"
            >
              <div
                className={`flex h-8 w-14 items-center justify-center rounded-full transition relative ${
                  currentActiveRail === "courses" || (isPanelExpanded && selectedRailCategory === "courses")
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <BookOpen className="h-4 w-4" />
                {courses.length > 0 && (
                  <span className={`absolute -top-1 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium border ${
                    currentActiveRail === "courses" || (isPanelExpanded && selectedRailCategory === "courses")
                      ? "bg-white text-[var(--lh-primary)] border-white/80"
                      : "bg-[var(--lh-primary)] text-white border-white"
                  }`}>
                    {courses.length}
                  </span>
                )}
              </div>
              <span
                className={`mt-1 text-[10px] tracking-tight text-center ${
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
                className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
                  currentActiveRail === "ai-chat"
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <MessageCircle className="h-4 w-4" />
              </div>
              <span
                className={`mt-1 text-[10px] tracking-tight text-center ${
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
                className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
                  currentActiveRail === "records"
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <BarChart3 className="h-4 w-4" />
              </div>
              <span
                className={`mt-1 text-[10px] tracking-tight text-center ${
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
                className={`flex h-8 w-14 items-center justify-center rounded-full transition relative ${
                  currentActiveRail === "review-queue"
                    ? "bg-[var(--lh-primary)] text-white shadow-xs"
                    : "text-[var(--lh-ink-secondary)] group-hover:bg-[var(--lh-surface-subtle)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                <RotateCcw className="h-4 w-4" />
                {pendingReviewsCount > 0 && (
                  <span className="absolute -top-1 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-medium bg-[var(--lh-secondary)] text-white border border-white shadow-xs">
                    {pendingReviewsCount}
                  </span>
                )}
              </div>
              <span
                className={`mt-1 text-[10px] tracking-tight text-center ${
                  currentActiveRail === "review-queue"
                    ? "font-medium text-[var(--lh-primary)]"
                    : "font-medium text-[var(--lh-ink-secondary)] group-hover:text-[var(--lh-ink)]"
                }`}
              >
                복습
              </span>
            </button>
          </nav>

          {/* Bottom: Utilities & Toggle (Theme, AI Tutor, Expand/Collapse Drawer, Profile) */}
          <div className="flex flex-col items-center gap-2 border-t border-[var(--lh-line)] pt-3">
            {/* 테마 토글 버튼 (Light 블루 / Dark 오렌지 포인트) */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "라이트 모드로 전환 (블루 포인트)" : "다크 모드로 전환 (주황 포인트)"}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-point)] transition cursor-pointer"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-[var(--lh-point)]" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            {/* AI 튜터 */}
            <button
              type="button"
              onClick={onOpenTutor}
              title="AI 튜터에게 질문하기"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-secondary)] transition cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
            </button>

            {/* 2번째 사진 펼치기 / 접기 토글 버튼 */}
            <button
              type="button"
              onClick={() => {
                if (userAccount?.isGuest && onOpenAuth) onOpenAuth();
                else setIsPanelExpanded((prev) => !prev);
              }}
              title={isPanelExpanded ? "서브 메뉴 접기 (1번째 사진 모드)" : "서브 메뉴 펼치기 (2번째 사진 모드)"}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition cursor-pointer ${
                isPanelExpanded
                  ? "bg-[var(--lh-surface-subtle)] text-[var(--lh-primary)] border border-[var(--lh-line)] shadow-xs"
                  : "text-[var(--lh-ink-tertiary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)]"
              }`}
            >
              {isPanelExpanded ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>

            {/* 사용자 계정 / 프로필 */}
            <button
              type="button"
              onClick={() => (userAccount?.isGuest && onOpenAuth ? onOpenAuth() : handleSelectView({ type: "settings" }))}
              title={userAccount?.isGuest ? "로그인" : `${userAccount?.name || "회원"} 프로필`}
              className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium shadow-xs transition hover:scale-105 cursor-pointer ${
                userAccount?.isGuest
                  ? "border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)]"
                  : "bg-[var(--lh-primary)] text-white"
              }`}
            >
              {userAccount?.isGuest ? <LogIn className="h-4 w-4" /> : userAccount?.name?.slice(0, 1) || "U"}
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
                title="서브 메뉴 접기"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--lh-ink-tertiary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] hover:shadow-xs transition cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
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
                수강 중인 과목 ({courses.length})
              </div>

              <div className="space-y-2">
                {courses.map((course) => {
                  const isExpanded = !!expandedCourseIds[course.id];
                  const isCourseActive =
                    activeView.type === "lesson" && activeView.course.id === course.id;

                  return (
                    <div
                      key={course.id}
                      className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-2.5 space-y-1.5 shadow-xs"
                    >
                      {/* Course Title Accordion Item */}
                      <button
                        type="button"
                        onClick={(e) => toggleCourse(course.id, e)}
                        aria-expanded={isExpanded}
                        className={`flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition cursor-pointer ${
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
              </div>

              {/* Quick Placement Test Card in Sub-Drawer */}
              <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3 space-y-2 shadow-xs mt-3">
                <div className="flex items-center gap-2 font-medium text-xs text-[var(--lh-ink)]">
                  <Target className="h-4 w-4" />
                  <span>수학 진단 테스트</span>
                </div>
                <p className="text-[11px] text-[var(--lh-ink-secondary)] leading-relaxed font-medium">
                  나의 수학 시작 위치를 3문제로 가볍게 점검해 보세요.
                </p>
                <button
                  type="button"
                  onClick={onOpenPlacementTest}
                  className="inline-flex min-h-8 w-full items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 text-xs font-medium text-[var(--lh-ink)] hover:bg-[var(--lh-ink)] hover:text-white transition cursor-pointer shadow-xs"
                >
                  진단 시작하기
                </button>
              </div>
            </div>

            {/* 4. Sub-Drawer Footer: Profile Info */}
            <div className="pt-2 border-t border-[var(--lh-line)]">
              <div className="flex items-center justify-between rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-2.5 shadow-xs">
                <div className="flex items-center gap-2 truncate">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--lh-ink)] text-[10px] font-medium text-white shadow-xs">
                    {userAccount?.name?.slice(0, 1) || "G"}
                  </span>
                  <div className="flex flex-col truncate">
                    <span className="truncate text-xs font-medium text-[var(--lh-ink)]">
                      {userAccount?.name || "로그인이 필요합니다"}
                    </span>
                    <span className="text-[9px] text-[var(--lh-ink-tertiary)] font-medium">
                      {userAccount?.isGuest ? "서비스 계정으로 시작" : "회원 계정"}
                    </span>
                  </div>
                </div>
                {userAccount?.isGuest && onOpenAuth && (
                  <button
                    onClick={onOpenAuth}
                    type="button"
                    className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-2.5 py-1 text-[10px] font-medium text-[var(--lh-ink)] hover:bg-[var(--lh-ink)] hover:text-white transition cursor-pointer"
                  >
                    로그인
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
