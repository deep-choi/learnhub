/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Course, UserSkill, UserProgress, ReviewQuestion, LessonMeta, UserAccount } from "./types/learning";
import { LEARNHUB_DATA_CHANGED_EVENT, StorageService } from "./services/storage";
import { Sidebar, NotionPageView, type SidebarChatItem } from "./components/notion/Sidebar";
import { LearningRecordsView } from "./components/LearningRecordsView";
import { LearningConversationView } from "./components/LearningConversationView";
import { KnowledgeMapView } from "./components/notion/KnowledgeMapView";
import { getResumeContext, mergeCourseLinks } from "./components/graph/graphBridge";
import { fillConceptLinks, hasConceptLinks } from "./services/conceptLinks";
import { CloudSnapshotRequestError } from "./services/cloudSync";
import { clearPendingPreview, readPendingPreview, savePendingPreview } from "./components/graph/pendingPreview";
import { buildCourseFromPayload } from "./components/graph/courseFromPayload";
import { deleteChatSession, getChatSession, listChatSessions } from "./services/chatSessionStore";
import { readActiveChatId, writeActiveChatId } from "./components/chat/activeChat";
import type { CurriculumConceptLinks } from "./components/graph/graphTypes";
import { MistakeArchiveView } from "./components/notion/MistakeArchiveView";
import { CommandPaletteModal } from "./components/notion/CommandPaletteModal";
import { SkillMatrixView } from "./components/SkillMatrixView";
import { ReviewView } from "./components/ReviewView";
import { AuthModal } from "./components/notion/AuthModal";
import { trackLearningEvent } from "./services/learningAnalytics";
import { getAuthStatus, type AuthStatus } from "./services/authClient";
import { LEARNHUB_AUTH_CHANGED_EVENT } from "./services/firebaseClient";
import {
  clearPendingSync,
  getLearningSnapshot,
  markPendingSync,
  syncCurrentLearningSnapshot,
} from "./services/cloudSync";
import { captureLocalCacheForAccount, reconcileAccountSnapshot } from "./services/accountSync";
import { AiChatView } from "./components/AiChatView";
import { shouldIgnoreAuthEvent } from "./components/authEvents";
import { resolveCourseSetup } from "./domain/courseSetup";
import type { CourseSetup } from "./types/courseSetup";
import { CoursesView } from "./components/CoursesView";
import { CourseDetailView } from "./components/CourseDetailView";
import { SettingsModal } from "./components/notion/SettingsModal";
import { AppSkeleton } from "./components/notion/AppSkeleton";
import { CourseAssessmentView } from "./components/CourseAssessmentView";
import { courseIsComplete, nextUnfinishedLesson } from "./domain/assessment";
import { LearnHubLogo } from "./components/common/LearnHubLogo";

const getInitialView = (): NotionPageView => {
  // 새로고침해도 보던 대화로 돌아옵니다. (저장소에 그 대화가 있을 때만)
  const id = readActiveChatId();
  return id && getChatSession(id) ? { type: "ai-chat", sessionId: id } : { type: "ai-chat" };
};

const toChatItems = (): SidebarChatItem[] => listChatSessions().map((session) => ({ id: session.id, title: session.title }));

const getAuthCallbackError = (): string => {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const code = params.get("error_code");
  if (!params.get("error") && !code) return "";
  if (code === "bad_oauth_callback") {
    return "OAuth Callback 주소를 직접 열 수 없습니다. LearnHub의 ‘Google로 계속하기’ 버튼에서 로그인을 시작해 주세요.";
  }
  return params.get("error_description") || "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
};

const SYNC_UNAVAILABLE_MESSAGE = "잠시 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";

/** 네트워크 실패·서버 점검 오류의 영어 원문은 콘솔에만 남기고, 화면에는 한국어 안내만 보여줍니다. */
const toFriendlySyncError = (error: unknown, fallback: string): string => {
  console.error("[learnhub] 학습 기록 동기화 실패", error);
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const unavailable =
    error instanceof TypeError ||
    (error instanceof CloudSnapshotRequestError && error.status === 503 && error.code === "cloud_store_unavailable");
  if (unavailable) return SYNC_UNAVAILABLE_MESSAGE;
  // 영어 등 원문이 섞인 오류는 숨기고, 이미 한국어로 정리된 문구만 그대로 보여줍니다.
  return /[가-힣]/.test(message) ? message : fallback;
};

const getResumeLesson = (course: Course) => {
  return nextUnfinishedLesson(course);
};

const hasCompletedLesson = (course: Course) =>
  course.chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.isCompleted));

const isFirstLesson = (course: Course, lesson: LessonMeta) =>
  course.chapters[0]?.lessons[0]?.id === lesson.id;

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [reviews, setReviews] = useState<ReviewQuestion[]>([]);
  const [userAccount, setUserAccount] = useState<UserAccount>(StorageService.getUser());
  const [progress, setProgress] = useState<UserProgress>({
    streakDays: 0,
    totalMinutesLearned: 0,
    completedLessonsCount: 0,
    lastActiveDate: "",
  });

  // Navigation State - Defaults to Home Dashboard
  const [activeView, setActiveView] = useState<NotionPageView>(getInitialView);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );

  // Modals & Drawers
  // 대화 화면을 새로 시작할 때마다 올려서 AiChatView를 다시 만듭니다.
  const [chatNonce, setChatNonce] = useState(0);
  const [chatItems, setChatItems] = useState<SidebarChatItem[]>(toChatItems);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [authCallbackError, setAuthCallbackError] = useState(getAuthCallbackError);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(() => Boolean(getAuthCallbackError()));
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingViewAfterAuth, setPendingViewAfterAuth] = useState<NotionPageView | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<AuthStatus>(() => getAuthStatus());
  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "syncing" | "synced" | "error">("idle");
  const [syncError, setSyncError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const snapshotRevisionRef = useRef<number | null>(null);
  const authGenerationRef = useRef(0);
  const dataReadyRef = useRef(false);
  const suppressSyncRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRequestRef = useRef(0);
  const dataChangeVersionRef = useRef(0);

  const refreshDataState = () => {
    const loadedCourses = StorageService.getCourses();
    const loadedSkills = StorageService.getSkills();
    const loadedReviews = StorageService.getDueReviews();
    const loadedProgress = StorageService.getProgress();
    const loadedUser = StorageService.getUser();

    setCourses(loadedCourses);
    setSkills(loadedSkills);
    setReviews(loadedReviews);
    setProgress(loadedProgress);
    setUserAccount(loadedUser);
    setChatItems(toChatItems());
  };

  const reloadData = refreshDataState;

  useEffect(() => {
    if (!authCallbackError || typeof window === "undefined") return;
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
  }, [authCallbackError]);

  useEffect(() => {
    const handleAuthChanged = async (event: Event) => {
      const authEvent = (event as CustomEvent<{ event?: string }>).detail?.event;
      const authStatus = getAuthStatus();
      if (shouldIgnoreAuthEvent(authEvent, authStatus.configured)) return;
      const generation = ++authGenerationRef.current;
      setAuthResolved(true);
      setSessionStatus(authStatus);
      if (authEvent === "PASSWORD_RECOVERY" || authEvent === "PASSWORD_RECOVERY_INVALID") {
        setPasswordRecoveryMode(true);
        setIsAuthModalOpen(true);
        setAuthCallbackError(authEvent === "PASSWORD_RECOVERY_INVALID" ? "비밀번호 재설정 링크가 만료되었거나 이미 사용되었습니다. 새 링크를 요청해 주세요." : "");
      }
      if (authEvent === "GOOGLE_REDIRECT_ERROR") {
        setAuthCallbackError("Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.");
        setIsAuthModalOpen(true);
      }
      if (authStatus.signedIn && authStatus.userId) {
        const isPasswordRecovery = authEvent === "PASSWORD_RECOVERY";
        if (activeUserIdRef.current === authStatus.userId && dataReadyRef.current) return;
        // 이 계정의 기기 기록은 서버 기록을 받기 전까지 지우지 않습니다. 아직 올리지 못한 변경을 살려야 하기 때문입니다.
        const localCache = captureLocalCacheForAccount(authStatus.userId);
        setDataReady(false);
        dataReadyRef.current = false;
        suppressSyncRef.current = true;
        setSyncStatus("loading");
        setSyncError("");
        if (!localCache.snapshot) StorageService.clearLearningData();
        const account: UserAccount = {
          id: authStatus.userId,
          name: authStatus.name?.trim() || authStatus.email?.split("@")[0] || "LearnHub 학습자",
          email: authStatus.email,
          isGuest: false,
          isLocalOnly: false,
          provider: authStatus.provider === "google" ? "google" : "email",
          createdAt: new Date().toISOString(),
        };
        StorageService.setUser(account);
        activeUserIdRef.current = authStatus.userId;
        setUserAccount(account);
        setAuthCallbackError("");
        setPasswordRecoveryMode(isPasswordRecovery);
        setIsAuthModalOpen(isPasswordRecovery);
        try {
          const snapshot = await getLearningSnapshot(authStatus.userId);
          const isCurrent = () => generation === authGenerationRef.current && getAuthStatus().userId === authStatus.userId;
          if (!isCurrent()) return;
          const synced = await reconcileAccountSnapshot(authStatus.userId, localCache, snapshot, isCurrent);
          if (!synced) return;
          snapshotRevisionRef.current = synced.revision;
          setLastSyncedAt(synced.updatedAt);
          refreshDataState();
          dataReadyRef.current = true;
          // 로그인 직후 만드는 과목(미리보기 이어서 만들기)도 미동기화 표시와 업로드 대상이 되도록 바로 풉니다.
          suppressSyncRef.current = false;
          setDataReady(true);
          setSyncStatus("synced");
          if (pendingViewAfterAuth) {
            setActiveView(pendingViewAfterAuth);
            setPendingViewAfterAuth(null);
          }
          const storedPreview = readPendingPreview();
          if (storedPreview) {
            // 로그인 전에 본 지도 미리보기는 다시 만들지 않고 같은 결과로 과목을 만듭니다.
            clearPendingPreview();
            try {
              const built = buildCourseFromPayload(storedPreview.data, storedPreview.subject, resolveCourseSetup(storedPreview.setup));
              handleCourseCreated(built.course, built.links);
            } catch {
              setActiveView({ type: "ai-chat", startInCourseMode: true });
              setChatNonce((value) => value + 1);
            }
          }
        } catch (error) {
          if (generation !== authGenerationRef.current) return;
          if (!localCache.snapshot) StorageService.clearLearningData();
          StorageService.setUser(account);
          if (localCache.pending) markPendingSync(authStatus.userId);
          refreshDataState();
          activeUserIdRef.current = null;
          snapshotRevisionRef.current = null;
          setSyncStatus("error");
          setSyncError(toFriendlySyncError(error, SYNC_UNAVAILABLE_MESSAGE));
        } finally {
          if (generation === authGenerationRef.current) suppressSyncRef.current = false;
        }
      } else {
        suppressSyncRef.current = true;
        syncRequestRef.current += 1;
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        activeUserIdRef.current = null;
        snapshotRevisionRef.current = null;
        dataReadyRef.current = true;
        StorageService.logout();
        refreshDataState();
        setDataReady(true);
        setSyncStatus("idle");
        setSyncError("");
        setLastSyncedAt(null);
        setActiveView({ type: "ai-chat" });
        setChatNonce((value) => value + 1);
        suppressSyncRef.current = false;
      }
    };
    window.addEventListener(LEARNHUB_AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => window.removeEventListener(LEARNHUB_AUTH_CHANGED_EVENT, handleAuthChanged);
  }, [pendingViewAfterAuth]);

  useEffect(() => {
    let scheduledSync: (() => void) | null = null;
    const handleDataChanged = () => {
      refreshDataState();
      const userId = activeUserIdRef.current;
      if (!userId || !dataReadyRef.current || suppressSyncRef.current) return;
      const changeVersion = ++dataChangeVersionRef.current;
      markPendingSync(userId);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      setSyncStatus("syncing");
      setSyncError("");
      const runSync = () => {
        syncTimerRef.current = null;
        scheduledSync = null;
        if (activeUserIdRef.current !== userId) return;
        setSyncStatus("syncing");
        const requestId = ++syncRequestRef.current;
        void syncCurrentLearningSnapshot(userId, snapshotRevisionRef.current)
          .then((saved) => {
            if (activeUserIdRef.current !== userId) return;
            snapshotRevisionRef.current = Math.max(snapshotRevisionRef.current ?? 0, saved.revision);
            refreshDataState();
            if (syncRequestRef.current !== requestId) return;
            if (dataChangeVersionRef.current === changeVersion) clearPendingSync(userId);
            setLastSyncedAt(saved.updatedAt);
            setSyncStatus("synced");
          })
          .catch((error) => {
            if (activeUserIdRef.current !== userId || syncRequestRef.current !== requestId) return;
            setSyncStatus("error");
            setSyncError(toFriendlySyncError(error, SYNC_UNAVAILABLE_MESSAGE));
          });
      };
      scheduledSync = runSync;
      syncTimerRef.current = setTimeout(runSync, 800);
    };
    // 탭을 숨기거나 떠날 때는 800ms를 기다리지 않고 바로 올립니다. 새로고침으로 요청이 끊겨도
    // 미동기화 표시가 남아 있어 다음 로그인에서 이 기기 기록을 먼저 살립니다.
    const flushScheduledSync = () => {
      if (!scheduledSync || !syncTimerRef.current) return;
      clearTimeout(syncTimerRef.current);
      scheduledSync();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushScheduledSync();
    };
    window.addEventListener(LEARNHUB_DATA_CHANGED_EVENT, handleDataChanged);
    window.addEventListener("pagehide", flushScheduledSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener(LEARNHUB_DATA_CHANGED_EVENT, handleDataChanged);
      window.removeEventListener("pagehide", flushScheduledSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleRequestAuth = () => setIsAuthModalOpen(true);
    window.addEventListener("learnhub:request-auth", handleRequestAuth);
    return () => window.removeEventListener("learnhub:request-auth", handleRequestAuth);
  }, []);

  // Global Keyboard Shortcuts (⌘K for search, ⌘\ for sidebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openLesson = (
    course: Course,
    lesson: LessonMeta,
    chapterTitle: string,
    source: string,
    resume: boolean,
    assessmentReturn = false,
    autoPractice = false,
  ) => {
    if (!getAuthStatus().signedIn) {
      setPendingViewAfterAuth({ type: "lesson", course, lesson, chapterTitle, assessmentReturn, autoPractice });
      setIsAuthModalOpen(true);
      return;
    }
    const savedCourse = StorageService.getCourseById(course.id);
    if (!savedCourse) { StorageService.addCourse(course); reloadData(); }
    const currentCourse = savedCourse || course;
    const currentLesson = currentCourse.chapters.flatMap((chapter) => chapter.lessons).find((item) => item.id === lesson.id) || lesson;
    trackLearningEvent("lesson_started", {
      courseId: course.id,
      lessonId: lesson.id,
      source,
      resume,
      firstLesson: isFirstLesson(course, lesson),
      sample: false,
    });
    setActiveView({ type: "lesson", course: currentCourse, lesson: currentLesson, chapterTitle, assessmentReturn, autoPractice });
  };

  const handleSelectView = (view: NotionPageView, source = "navigation") => {
    if (
      view.type !== "ai-chat" &&
      view.type !== "courses" &&
      view.type !== "course-detail" &&
      !getAuthStatus().signedIn
    ) {
      setPendingViewAfterAuth(view);
      setIsAuthModalOpen(true);
      return;
    }
    if (view.type === "lesson") {
      openLesson(view.course, view.lesson, view.chapterTitle, source, hasCompletedLesson(view.course), Boolean(view.assessmentReturn), Boolean(view.autoPractice));
      return;
    }
    if (view.type === "review-queue") {
      const hasUserCourse = courses.length > 0;
      trackLearningEvent("review_visited", { source, sample: !hasUserCourse });
    }
    setActiveView(view);
  };

  const handleCourseCreated = (newCourse: Course, links?: CurriculumConceptLinks) => {
    const existing = StorageService.getCourseById(newCourse.id);
    if (!existing) StorageService.addCourse(newCourse);
    if (!StorageService.getCourseById(newCourse.id)) throw new Error("course_save_failed");
    if (links) mergeCourseLinks(newCourse, links);
    // 개요만으로 먼저 수업을 열고, 개념 연결은 뒤에서 채웁니다.
    if (!existing && !hasConceptLinks(links)) void fillConceptLinks(newCourse, links?.domain);
    if (!existing) trackLearningEvent("course_created", { courseId: newCourse.id, sample: false, source: "chat" });
    reloadData();
    if (newCourse.chapters[0]?.lessons[0]) {
      openLesson(
        newCourse,
        newCourse.chapters[0].lessons[0],
        newCourse.chapters[0].title,
        "course-created",
        false,
      );
    }
  };

  const handleCourseStatusChange = (courseId: string, status: "completed" | "cancelled" | "active") => {
    if (!StorageService.updateCourseStatus(courseId, status)) return;
    reloadData();
    if ((activeView.type === "course-detail" || activeView.type === "lesson" || activeView.type === "assessment") && activeView.course.id === courseId && status !== "active") {
      setActiveView({ type: "courses" });
    }
  };

  const leaveCourseViews = (courseId: string) => {
    if ((activeView.type === "course-detail" || activeView.type === "lesson" || activeView.type === "assessment") && activeView.course.id === courseId) {
      setActiveView({ type: "ai-chat" });
      setChatNonce((value) => value + 1);
    }
  };

  const handleRenameCourse = (courseId: string, title: string) => {
    if (StorageService.renameCourse(courseId, title)) reloadData();
  };

  const handleToggleCoursePin = (courseId: string, pinned: boolean) => {
    if (StorageService.setCoursePinned(courseId, pinned)) reloadData();
  };

  const handleDeleteCourse = (courseId: string) => {
    const course = courses.find((item) => item.id === courseId);
    if (!window.confirm(`'${course?.title ?? "이 과목"}'을 삭제할까요? 개념 지도에 쌓인 배움 기록은 남아요.`)) return;
    if (!StorageService.deleteCourse(courseId)) return;
    reloadData();
    leaveCourseViews(courseId);
  };

  const handleEnrollRoadmap = (course: Course) => {
    const storedCourse = StorageService.getCourseById(course.id);
    if (!storedCourse) {
      StorageService.addCourse(course);
      trackLearningEvent("course_created", { courseId: course.id, sample: false, source: "roadmap" });
    } else if (storedCourse.status === "completed" || storedCourse.status === "cancelled") {
      // 보관하거나 취소했던 로드맵을 다시 시작하면 수강 중으로 되돌립니다.
      StorageService.updateCourseStatus(course.id, "active");
    }
    reloadData();
  };

  const handleLessonFinished = (metadata?: {
    kind?: "read_only" | "quiz_checked";
    courseId?: string;
    lessonId?: string;
  }) => {
    if (activeView.type === "lesson") {
      const completionKind = metadata?.kind || "unknown";
      trackLearningEvent("lesson_completed", {
        courseId: metadata?.courseId === activeView.course.id ? metadata.courseId : activeView.course.id,
        lessonId: metadata?.lessonId === activeView.lesson.id ? metadata.lessonId : activeView.lesson.id,
        firstLesson: isFirstLesson(activeView.course, activeView.lesson),
        sample: false,
        completionKind,
        source: "lesson",
      });
    }
    reloadData();
  };

  const handleNewChat = () => {
    setActiveView({ type: "ai-chat" });
    setChatNonce((value) => value + 1);
  };

  const handleOpenChat = (sessionId: string) => {
    setActiveView({ type: "ai-chat", sessionId });
    setChatNonce((value) => value + 1);
  };

  const handleCreateCourse = () => {
    setActiveView({ type: "ai-chat", startInCourseMode: true });
    setChatNonce((value) => value + 1);
  };

  const handleDeleteChat = (sessionId: string) => {
    if (!window.confirm("이 대화를 삭제할까요? 삭제한 대화는 되돌릴 수 없어요.")) return;
    deleteChatSession(sessionId);
    setChatItems(toChatItems());
    if (activeView.type === "ai-chat" && activeView.sessionId === sessionId) handleNewChat();
  };

  const handleGuestStartCourse = (subject: string, data: Record<string, any>, setup: CourseSetup) => {
    savePendingPreview(subject, data, setup);
    setIsAuthModalOpen(true);
  };

  const openAssessment = (course: Course) => {
    const stored = StorageService.getCourseById(course.id);
    if (!stored) {
      StorageService.addCourse(course);
      reloadData();
    }
    const latest = stored || course;
    handleSelectView({ type: "assessment", course: latest }, "course-assessment");
  };

  // 학습 기록이 바뀔 때마다 App이 다시 그려지므로 그때 지난 위치를 다시 읽습니다.
  const resumeContext = dataReady ? getResumeContext() : null;
  const openResume = () => {
    if (!resumeContext) return;
    const course = courses.find((item) => item.id === resumeContext.position.courseId);
    const chapter = course?.chapters.find((item) => item.lessons.some((lesson) => lesson.id === resumeContext.position.lessonId));
    const lesson = chapter?.lessons.find((item) => item.id === resumeContext.position.lessonId);
    if (course && chapter && lesson) openLesson(course, lesson, chapter.title, "chat-resume", true);
  };

  // 열려 있는 대화 id를 기억해 두었다가, 새 대화를 열면 지웁니다.
  useEffect(() => {
    if (activeView.type === "ai-chat") writeActiveChatId(activeView.sessionId ?? null);
  }, [activeView]);

  useEffect(() => {
    document.getElementById("learning-main")?.scrollTo({ top: 0 });
  }, [activeView.type, activeView.type === "lesson" ? activeView.lesson.id : null]);


  if (!authResolved || (sessionStatus.signedIn && !dataReady)) {
    // 기다리는 동안은 앱 뼈대를, 복원에 실패했을 때만 안내와 재시도 버튼을 보여 줍니다.
    if (syncStatus !== "error") return <AppSkeleton />;
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden bg-[var(--lh-canvas)] px-6 text-center text-[var(--lh-ink)]">
        <div className="w-full min-w-0 max-w-md space-y-4 [overflow-wrap:anywhere]">
          <LearnHubLogo size={40} />
          <h1 className="text-xl font-medium">학습 기록을 연결하지 못했습니다</h1>
          <p className="text-sm leading-relaxed text-[var(--lh-ink-secondary)]">{syncError}</p>
          <button type="button" onClick={() => {
            activeUserIdRef.current = null;
            window.dispatchEvent(new CustomEvent(LEARNHUB_AUTH_CHANGED_EVENT, { detail: { event: "RETRY_SYNC", userId: getAuthStatus().userId || null } }));
          }} className="rounded-full bg-[var(--lh-primary)] px-5 py-2.5 text-sm font-medium text-white">
            다시 연결하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--lh-canvas)] text-[var(--lh-ink)] font-sans">
      {/* 1. Left Notion Sidebar */}
      <Sidebar
        courses={courses}
        activeView={activeView}
        onSelectView={(view) => handleSelectView(view, "sidebar")}
        onNewChat={handleNewChat}
        onCreateCourse={handleCreateCourse}
        onOpenSearch={() => setIsSearchOpen(true)}
        pendingReviewsCount={reviews.length}
        isOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        userAccount={userAccount}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRenameCourse={handleRenameCourse}
        onToggleCoursePin={handleToggleCoursePin}
        onDeleteCourse={handleDeleteCourse}
        lastLessonId={resumeContext?.position.lessonId ?? null}
        chats={chatItems}
        activeChatId={activeView.type === "ai-chat" ? activeView.sessionId : null}
        onOpenChat={handleOpenChat}
        onDeleteChat={handleDeleteChat}
      />

      {/* 2. Main Workspace Canvas Area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Scrollable Viewport */}
        {/* 스크롤바 자리를 늘 비워 둬서 내용 길이에 따라 화면이 좌우로 밀리지 않게 합니다. */}
        <main id="learning-main" className={`flex-1 overflow-y-auto [scrollbar-gutter:stable] ${activeView.type === "ai-chat" || activeView.type === "lesson" ? "bg-[var(--lh-chat-bg)]" : "bg-[var(--lh-canvas)]"}`}>
          {activeView.type === "courses" && (
            <CoursesView
              key={activeView.roadmapId || "all"}
              initialRoadmapId={activeView.roadmapId}
              courses={courses}
              onSelectCourse={(course) => handleSelectView({ type: "course-detail", course })}
              onStartLesson={(course, lesson, chapterTitle) =>
                openLesson(course, lesson, chapterTitle, "roadmap-start", hasCompletedLesson(course))
              }
              onEnrollRoadmap={handleEnrollRoadmap}
              onOpenCreateCourse={handleCreateCourse}
              onStartAssessment={openAssessment}
              onUpdateCourseStatus={handleCourseStatusChange}
            />
          )}

          {activeView.type === "course-detail" && (
            <CourseDetailView
              course={activeView.course}
              onBack={() => handleSelectView({ type: "courses" })}
              onStartLesson={(course, lesson, chapterTitle) =>
                openLesson(course, lesson, chapterTitle, "course-detail-start", hasCompletedLesson(course))
              }
              onStartAssessment={openAssessment}
            />
          )}

          {activeView.type === "assessment" && (
            <CourseAssessmentView
              key={`${userAccount.id}:${activeView.course.id}`}
              course={courses.find((course) => course.id === activeView.course.id) || activeView.course}
              onBack={() => setActiveView({ type: "course-detail", course: StorageService.getCourseById(activeView.course.id) || activeView.course })}
              onDataChanged={reloadData}
              onReviewLesson={(lessonId) => {
                const course = StorageService.getCourseById(activeView.course.id) || activeView.course;
                const chapter = course.chapters.find((chapter) => chapter.lessons.some((lesson) => lesson.id === lessonId));
                const lesson = chapter?.lessons.find((lesson) => lesson.id === lessonId);
                if (chapter && lesson) openLesson(course, lesson, chapter.title, "assessment-review", false, true);
              }}
            />
          )}

          {activeView.type === "lesson" && (
            <LearningConversationView
              key={`${activeView.course.id}:${activeView.lesson.id}`}
              course={activeView.course}
              lessonMeta={activeView.lesson}
              chapterTitle={activeView.chapterTitle}
              onFinishLesson={handleLessonFinished}
              onGoHome={handleNewChat}
              onGoCourse={() => setActiveView({ type: "course-detail", course: StorageService.getCourseById(activeView.course.id) || activeView.course })}
              onStartAssessment={() => openAssessment(activeView.course)}
              onBackToAssessment={activeView.assessmentReturn ? () => openAssessment(activeView.course) : undefined}
              autoStartPractice={activeView.autoPractice}
              isSignedIn={!userAccount.isGuest}
              onOpenKnowledgeMap={() => handleSelectView({ type: "knowledge-map" }, "lesson-map")}
              onStartNextLesson={(nextCourse, nextLesson, chapterTitle) =>
                openLesson(nextCourse, nextLesson, chapterTitle, "lesson-next", false)
              }
            />
          )}

          {activeView.type === "ai-chat" && (
            <AiChatView
              key={`chat-${chatNonce}`}
              isSignedIn={!userAccount.isGuest}
              userName={userAccount.isGuest ? undefined : userAccount.name}
              sessionId={activeView.sessionId ?? null}
              startInCourseMode={Boolean(activeView.startInCourseMode)}
              resume={resumeContext}
              onResume={openResume}
              onStartCourse={handleCourseCreated}
              onResumeCourse={(courseId) => {
                const course = StorageService.getCourseById(courseId);
                if (!course) { setActiveView({ type: "courses" }); return; }
                const next = getResumeLesson(course);
                if (next) openLesson(course, next.lesson, next.chapterTitle, "chat-resume", true);
                else setActiveView({ type: "course-detail", course });
              }}
              onGuestStartCourse={handleGuestStartCourse}
              onRequestAuth={() => setIsAuthModalOpen(true)}
              onBrowseCourses={() => handleSelectView({ type: "courses" }, "chat-menu")}
              onPractice={() => handleSelectView({ type: "review-queue" }, "chat-menu")}
              onSessionCreated={(sessionId) => setActiveView({ type: "ai-chat", sessionId })}
            />
          )}

          {activeView.type === "knowledge-map" && (
            <KnowledgeMapView
              courses={courses}
              skills={skills}
              dueReviewCount={reviews.length}
              onSelectView={(view) => handleSelectView(view, "knowledge-map")}
              onOpenCreateCourse={handleCreateCourse}
            />
          )}

          {activeView.type === "records" && (
            <LearningRecordsView
              key={userAccount.id}
              skills={skills}
              courses={courses}
              onSelectView={(view) => handleSelectView(view, "records")}
              onDataChanged={reloadData}
            />
          )}

          {activeView.type === "skill-matrix" && (
            <div className="mx-auto max-w-3xl px-4 py-12">
              <SkillMatrixView
                skills={skills}
                progress={progress}
                courses={courses}
                onSelectView={(view) => handleSelectView(view, "skill-matrix")}
              />
            </div>
          )}

          {activeView.type === "review-queue" && (
            <ReviewView reviews={reviews} skills={skills} onReviewFinished={reloadData} />
          )}

          {activeView.type === "mistake-archive" && (
              <MistakeArchiveView
              courses={courses}
              onSelectView={(view) => handleSelectView(view, "mistakes")}
            />
          )}

        </main>

      </div>

      {/* 3. Modals */}
      <CommandPaletteModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        courses={courses}
        onSelectView={(view) => handleSelectView(view, "search")}
      />

      <div className="relative z-[60]">
        <AuthModal
          isOpen={isAuthModalOpen}
          initialError={authCallbackError}
          recoveryMode={passwordRecoveryMode}
          onRecoveryComplete={() => {
            setPasswordRecoveryMode(false);
            setIsAuthModalOpen(false);
          }}
          onClose={() => {
            setIsAuthModalOpen(false);
            setPasswordRecoveryMode(false);
            setAuthCallbackError("");
            setPendingViewAfterAuth(null);
          }}
        />
      </div>

      {/* 6. Settings Modal (Theme system, Profile account, General settings) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userAccount={userAccount}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onDataChanged={refreshDataState}
        syncStatus={syncStatus}
        syncError={syncError}
        lastSyncedAt={lastSyncedAt}
      />
    </div>
  );
}
