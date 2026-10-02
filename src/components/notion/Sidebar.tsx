import React, { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Network,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
  User,
} from "lucide-react";
import { Course, LessonMeta, UserAccount } from "../../types/learning";
import { LearnHubLogo } from "../common/LearnHubLogo";

export type NotionPageView =
  | { type: "courses"; roadmapId?: string }
  | { type: "course-detail"; course: Course }
  | { type: "assessment"; course: Course }
  | { type: "ai-chat"; sessionId?: string; startInCourseMode?: boolean }
  | { type: "records" }
  | { type: "lesson"; course: Course; lesson: LessonMeta; chapterTitle: string; assessmentReturn?: boolean; autoPractice?: boolean }
  | { type: "knowledge-map" }
  | { type: "skill-matrix" }
  | { type: "review-queue" }
  | { type: "mistake-archive" };

export interface SidebarChatItem {
  id: string;
  title: string;
}

interface SidebarProps {
  courses: Course[];
  activeView: NotionPageView;
  onSelectView: (view: NotionPageView) => void;
  /** 빈 새 대화를 엽니다. */
  onNewChat: () => void;
  /** 새 대화를 "과목으로 만들기" 모드로 엽니다. */
  onCreateCourse: () => void;
  onOpenSearch: () => void;
  pendingReviewsCount: number;
  /** 데스크톱에서는 오른쪽 패널, 모바일에서는 레일과 패널을 함께 담은 서랍이 열려 있는지 */
  isOpen: boolean;
  onToggleSidebar: () => void;
  userAccount?: UserAccount;
  onOpenAuth?: () => void;
  onOpenSettings?: () => void;
  onUpdateCourseStatus?: (courseId: string, status: "completed" | "cancelled" | "active") => void;
  onRenameCourse?: (courseId: string, title: string) => void;
  onToggleCoursePin?: (courseId: string, pinned: boolean) => void;
  onDeleteCourse?: (courseId: string) => void;
  /** 마지막으로 학습한 레슨(현재 위치). 레슨을 열지 않은 화면에서도 표시합니다. */
  lastLessonId?: string | null;
  chats: SidebarChatItem[];
  activeChatId?: string | null;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

type RailCategory = "chat" | "map" | "records";

const railOf = (view: NotionPageView): RailCategory => {
  if (view.type === "knowledge-map") return "map";
  if (view.type === "records" || view.type === "skill-matrix" || view.type === "mistake-archive" || view.type === "review-queue") return "records";
  return "chat";
};

const RAIL_BUTTON =
  "relative flex h-11 w-11 items-center justify-center rounded-xl transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lh-primary)]";
const RAIL_IDLE = "text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)]";
const RAIL_ACTIVE = "bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]";

export const Sidebar: React.FC<SidebarProps> = ({
  courses,
  activeView,
  onSelectView,
  onNewChat,
  onCreateCourse,
  onOpenSearch,
  pendingReviewsCount,
  isOpen,
  onToggleSidebar,
  userAccount,
  onOpenAuth,
  onOpenSettings,
  onRenameCourse,
  onToggleCoursePin,
  onDeleteCourse,
  lastLessonId,
  chats,
  activeChatId,
  onOpenChat,
  onDeleteChat,
}) => {
  // 고정한 과목이 맨 위(최근에 고정한 것부터), 나머지는 원래 순서를 지킵니다.
  const activeCourses = courses
    .filter((course) => course.status !== "completed" && course.status !== "cancelled")
    .map((course, index) => ({ course, index }))
    .sort((a, b) => (b.course.pinnedAt ?? "").localeCompare(a.course.pinnedAt ?? "") || a.index - b.index)
    .map(({ course }) => course);
  const hasCourseMenu = Boolean(onRenameCourse || onToggleCoursePin || onDeleteCourse);
  const activeLessonId = activeView.type === "lesson" ? activeView.lesson.id : null;
  const activeLessonCourseId = activeView.type === "lesson" ? activeView.course.id : null;
  const rail = railOf(activeView);
  const isGuest = Boolean(userAccount?.isGuest);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [courseMenuId, setCourseMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Enter·Esc로 끝낸 뒤 입력창이 사라지며 생기는 blur가 다시 저장하지 않도록 한 번만 처리합니다.
  const renameDoneRef = useRef(false);
  const startRename = (course: Course) => {
    renameDoneRef.current = false;
    setRenameDraft(course.title);
    setRenamingId(course.id);
  };
  const finishRename = (courseId: string, save: boolean) => {
    if (renameDoneRef.current) return;
    renameDoneRef.current = true;
    if (save && renameDraft.trim()) onRenameCourse?.(courseId, renameDraft);
    setRenamingId(null);
  };

  // 지금 보고 있는 레슨의 과목 폴더는 자동으로 펼칩니다.
  useEffect(() => {
    if (activeLessonCourseId) setExpanded((prev) => (prev[activeLessonCourseId] ? prev : { ...prev, [activeLessonCourseId]: true }));
  }, [activeLessonCourseId]);

  // 과목 관리 메뉴는 바깥 클릭이나 Esc로 닫습니다.
  useEffect(() => {
    if (!courseMenuId) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && (event.target as Element | null)?.closest?.("[data-course-menu]")) return;
      setCourseMenuId(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [courseMenuId]);

  const isMobile = () => typeof window !== "undefined" && window.innerWidth < 768;
  /** 모바일에서는 항목을 고르면 서랍을 닫습니다. */
  const afterNavigate = () => {
    if (isMobile() && isOpen) onToggleSidebar();
  };
  const go = (action: () => void) => {
    action();
    afterNavigate();
  };

  const reviewLabel = pendingReviewsCount > 0 ? `기록 · 복습 ${pendingReviewsCount}개` : "기록";

  return (
    <>
      {/* 모바일: 서랍 열기 버튼 */}
      {!isOpen && (
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="메뉴 열기"
          title="메뉴 열기"
          className="fixed left-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] shadow-sm transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer md:hidden"
        >
          <Menu aria-hidden className="h-5 w-5" />
        </button>
      )}
      {/* 모바일: 서랍 뒷배경 */}
      {isOpen && <div aria-hidden onClick={onToggleSidebar} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] md:hidden cursor-pointer" />}

      <aside
        aria-label="LearnHub 메뉴"
        className={`${isOpen ? "fixed inset-y-0 left-0 z-50 flex shadow-2xl" : "hidden"} h-screen shrink-0 border-r border-[var(--lh-line)] bg-[var(--lh-surface)] text-sm select-none md:relative md:z-auto md:flex md:shadow-none`}
      >
        {/* 1단: 아이콘 레일 */}
        <div className="flex h-full w-[60px] shrink-0 flex-col items-center justify-between border-r border-[var(--lh-line)] py-3">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => go(onNewChat)}
              aria-label="LearnHub 대화 첫 화면"
              title="LearnHub"
              className="flex h-11 w-11 items-center justify-center rounded-xl transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lh-primary)]"
            >
              <LearnHubLogo size={28} />
            </button>
            {/* 접힌 사이드바의 펼치기 버튼은 접기 버튼과 비슷한 높이(로고 바로 아래)에 둡니다. */}
            {!isOpen && (
              <button type="button" onClick={onToggleSidebar} aria-label="사이드바 펼치기" title="사이드바 펼치기 (Ctrl+\)" className={`${RAIL_BUTTON} ${RAIL_IDLE} hidden md:flex`}>
                <PanelLeft aria-hidden className="h-5 w-5" />
              </button>
            )}
            <nav aria-label="주요 화면" className="mt-2 flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => go(onNewChat)}
                aria-label="대화"
                title="대화"
                aria-current={rail === "chat" ? "page" : undefined}
                className={`${RAIL_BUTTON} ${rail === "chat" ? RAIL_ACTIVE : RAIL_IDLE}`}
              >
                <MessageCircle aria-hidden className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(() => onSelectView({ type: "knowledge-map" }))}
                aria-label="지도"
                title="개념 지도"
                aria-current={rail === "map" ? "page" : undefined}
                className={`${RAIL_BUTTON} ${rail === "map" ? RAIL_ACTIVE : RAIL_IDLE}`}
              >
                <Network aria-hidden className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(() => onSelectView({ type: "records" }))}
                aria-label={reviewLabel}
                title={reviewLabel}
                aria-current={rail === "records" ? "page" : undefined}
                className={`${RAIL_BUTTON} ${rail === "records" ? RAIL_ACTIVE : RAIL_IDLE}`}
              >
                <BarChart3 aria-hidden className="h-5 w-5" />
                {pendingReviewsCount > 0 && (
                  <span aria-hidden className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--lh-secondary)] px-1 text-[9px] font-medium text-white">
                    {pendingReviewsCount > 99 ? "99+" : pendingReviewsCount}
                  </span>
                )}
              </button>
            </nav>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button type="button" onClick={() => onOpenSettings?.()} aria-label="설정" title="설정" className={`${RAIL_BUTTON} ${RAIL_IDLE}`}>
              <Settings aria-hidden className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => (isGuest ? onOpenAuth?.() : onOpenSettings?.())}
              aria-label={isGuest ? "로그인하기" : `${userAccount?.name || "회원"} 프로필`}
              title={isGuest ? "로그인하기" : `${userAccount?.name || "회원"} 프로필`}
              className="flex h-11 w-11 items-center justify-center rounded-xl transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--lh-primary)]"
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${isGuest ? "border border-[var(--lh-line)] text-[var(--lh-ink-secondary)]" : "bg-[var(--lh-primary)] text-white"}`}>
                {isGuest ? <User aria-hidden className="h-4 w-4" /> : userAccount?.name?.slice(0, 1) || "U"}
              </span>
            </button>
          </div>
        </div>

        {/* 2단: 패널 */}
        {isOpen && (
          <div className="flex h-full w-[264px] shrink-0 flex-col">
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
              <span className="px-1 text-sm font-medium tracking-tight text-[var(--lh-ink)]">LearnHub</span>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={onOpenSearch} aria-label="검색" title="검색 (⌘K)" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
                  <Search aria-hidden className="h-4 w-4" />
                </button>
                <button type="button" onClick={onToggleSidebar} aria-label="사이드바 접기" title="사이드바 접기 (Ctrl+\)" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
                  <PanelLeftClose aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={() => go(onNewChat)}
                className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-medium text-[var(--lh-ink)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
              >
                <SquarePen aria-hidden className="h-4 w-4" /> 새 대화
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-1">
              {/* 과목 폴더 */}
              <section aria-labelledby="sidebar-courses">
                <div className="flex items-center justify-between px-3 pb-1">
                  <h2 id="sidebar-courses" className="text-xs font-medium text-[var(--lh-ink-tertiary)]">과목</h2>
                  <button type="button" onClick={() => go(onCreateCourse)} aria-label="새 과목 만들기" title="새 과목 만들기" className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
                    <Plus aria-hidden className="h-4 w-4" />
                  </button>
                </div>
                {activeCourses.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--lh-ink-tertiary)]">아직 과목이 없어요.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {activeCourses.map((course) => {
                      const isExpanded = Boolean(expanded[course.id]);
                      const lessons = course.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ lesson, chapterTitle: chapter.title })));
                      const FolderIcon = isExpanded ? FolderOpen : Folder;
                      return (
                        <li key={course.id}>
                          <div className="group relative flex items-center" data-course-menu>
                            {renamingId === course.id ? (
                              <input
                                autoFocus
                                aria-label="과목 이름"
                                value={renameDraft}
                                maxLength={200}
                                onChange={(event) => setRenameDraft(event.target.value)}
                                onFocus={(event) => event.currentTarget.select()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") finishRename(course.id, true);
                                  if (event.key === "Escape") finishRename(course.id, false);
                                }}
                                onBlur={() => finishRename(course.id, true)}
                                className="min-h-10 min-w-0 flex-1 rounded-xl border border-[var(--lh-primary)] bg-[var(--lh-surface)] px-3 text-sm! text-[var(--lh-ink)] outline-none"
                              />
                            ) : (
                            <button
                              type="button"
                              onClick={() => setExpanded((prev) => ({ ...prev, [course.id]: !prev[course.id] }))}
                              aria-expanded={isExpanded}
                              className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-left text-sm text-[var(--lh-ink)] transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
                            >
                              <FolderIcon aria-hidden className="h-4 w-4 shrink-0 text-[var(--lh-ink-secondary)]" />
                              <span className="truncate">{course.title}</span>
                              {course.pinnedAt && <Pin aria-label="상단 고정됨" className="h-3.5 w-3.5 shrink-0 text-[var(--lh-ink-tertiary)]" />}
                              {isExpanded ? <ChevronDown aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--lh-ink-tertiary)]" /> : <ChevronRight aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--lh-ink-tertiary)]" />}
                            </button>
                            )}
                            {hasCourseMenu && renamingId !== course.id && (
                              <button
                                type="button"
                                aria-label={`${course.title} 과목 관리`}
                                aria-haspopup="menu"
                                aria-expanded={courseMenuId === course.id}
                                title="과목 관리"
                                onClick={() => setCourseMenuId((current) => (current === course.id ? null : course.id))}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:aria-expanded:opacity-100"
                              >
                                <MoreHorizontal aria-hidden className="h-4 w-4" />
                              </button>
                            )}
                            {courseMenuId === course.id && hasCourseMenu && (
                              <div role="menu" aria-label={`${course.title} 과목 관리`} className="absolute right-0 top-10 z-30 min-w-52 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-1.5 shadow-lg">
                                {onRenameCourse && (
                                  <button type="button" role="menuitem" onClick={() => { setCourseMenuId(null); startRename(course); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm! transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer text-[var(--lh-ink)]">
                                    <Pencil aria-hidden className="h-4 w-4 text-[var(--lh-ink-secondary)]" /> 이름 변경
                                  </button>
                                )}
                                {onToggleCoursePin && (
                                  <button type="button" role="menuitem" onClick={() => { setCourseMenuId(null); onToggleCoursePin(course.id, !course.pinnedAt); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm! transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer text-[var(--lh-ink)]">
                                    {course.pinnedAt ? <PinOff aria-hidden className="h-4 w-4 text-[var(--lh-ink-secondary)]" /> : <Pin aria-hidden className="h-4 w-4 text-[var(--lh-ink-secondary)]" />}
                                    {course.pinnedAt ? "고정 해제" : "상단 고정"}
                                  </button>
                                )}
                                {onDeleteCourse && (
                                  <>
                                    <div aria-hidden className="mx-2 my-1 h-px bg-[var(--lh-line)]" />
                                    <button type="button" role="menuitem" onClick={() => { setCourseMenuId(null); onDeleteCourse(course.id); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm! transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer text-[var(--lh-danger)]">
                                      <Trash2 aria-hidden className="h-4 w-4" /> 삭제
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {isExpanded && (
                            <ul className="ml-[22px] space-y-0.5 py-0.5">
                              {lessons.map(({ lesson, chapterTitle }) => {
                                const isCurrent = lesson.id === activeLessonId;
                                return (
                                  <li key={lesson.id}>
                                    <button
                                      type="button"
                                      onClick={() => go(() => onSelectView({ type: "lesson", course, lesson, chapterTitle }))}
                                      aria-current={isCurrent ? "true" : undefined}
                                      className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] transition cursor-pointer ${
                                        isCurrent
                                          ? "bg-[var(--lh-primary-subtle)] font-medium text-[var(--lh-primary-text)]"
                                          : "text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)]"
                                      }`}
                                    >
                                      <span className="truncate">{lesson.title}</span>
                                      {lesson.isCompleted && <Check aria-label="완료" className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--lh-ink-tertiary)]" />}
                                      {!isCurrent && lesson.id === lastLessonId && !lesson.isCompleted && <span aria-label="마지막으로 학습한 레슨" className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lh-primary)]" />}
                                      {isCurrent && !lesson.isCompleted && <span aria-hidden className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lh-primary)]" />}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* 최근 대화 */}
              {chats.length > 0 && (
                <section aria-labelledby="sidebar-recent">
                  <h2 id="sidebar-recent" className="px-3 pb-1 text-xs font-medium text-[var(--lh-ink-tertiary)]">최근</h2>
                  <ul className="space-y-0.5">
                    {chats.map((chat) => {
                      const isCurrent = activeView.type === "ai-chat" && chat.id === activeChatId;
                      return (
                        <li key={chat.id} className="group relative flex items-center">
                          <button
                            type="button"
                            onClick={() => go(() => onOpenChat(chat.id))}
                            aria-current={isCurrent ? "true" : undefined}
                            className={`flex min-h-10 min-w-0 flex-1 items-center rounded-xl px-3 text-left text-sm transition cursor-pointer ${
                              isCurrent
                                ? "bg-[var(--lh-primary-subtle)] font-medium text-[var(--lh-primary-text)]"
                                : "text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)]"
                            }`}
                          >
                            <span className="truncate">{chat.title}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteChat(chat.id)}
                            aria-label={`${chat.title} 대화 삭제`}
                            title="대화 삭제"
                            className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--lh-surface)] text-[var(--lh-ink-tertiary)] transition hover:text-[var(--lh-danger)] cursor-pointer md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                          >
                            <Trash2 aria-hidden className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
