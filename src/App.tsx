/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Course, UserSkill, UserProgress, ReviewQuestion, LessonMeta, UserAccount } from "./types/learning";
import { LEARNHUB_DATA_CHANGED_EVENT, StorageService } from "./services/storage";
import { Sidebar, NotionPageView } from "./components/notion/Sidebar";
import { HomeView } from "./components/HomeView";
import { LearningRecordsView } from "./components/LearningRecordsView";
import { NotionLessonCanvas } from "./components/notion/NotionLessonCanvas";
import { KnowledgeMapView } from "./components/notion/KnowledgeMapView";
import { MistakeArchiveView } from "./components/notion/MistakeArchiveView";
import { CommandPaletteModal } from "./components/notion/CommandPaletteModal";
import { SkillMatrixView } from "./components/SkillMatrixView";
import { ReviewView } from "./components/ReviewView";
import { CreateCourseModal } from "./components/CreateCourseModal";
import { AiTutorDrawer } from "./components/AiTutorDrawer";
import { AuthModal } from "./components/notion/AuthModal";
import { trackLearningEvent } from "./services/learningAnalytics";
import { getAuthStatus, type AuthStatus } from "./services/authClient";
import { LEARNHUB_AUTH_CHANGED_EVENT } from "./services/supabaseClient";
import {
  clearPendingSync,
  getCloudDataOwnerId,
  getLearningSnapshot,
  getPendingSyncOwnerId,
  markPendingSync,
  restoreLearningSnapshot,
  syncCurrentLearningSnapshot,
} from "./services/cloudSync";
import { createLearningBackup, importLearningBackup, type LearningBackupDocument } from "./services/learningBackup";
import { AiChatView } from "./components/AiChatView";
import { LessonAiInputBar } from "./components/LessonAiInputBar";
import { CoursesView } from "./components/CoursesView";
import { CourseDetailView } from "./components/CourseDetailView";
import { SettingsModal } from "./components/notion/SettingsModal";
import { CourseAssessmentView } from "./components/CourseAssessmentView";
import { courseIsComplete, nextUnfinishedLesson } from "./domain/assessment";
import { LearnHubLogo } from "./components/common/LearnHubLogo";

const getInitialView = (): NotionPageView => ({ type: "home" });

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
  const [isZenMode, setIsZenMode] = useState(false);

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [initialSubject, setInitialSubject] = useState("");
  const [pendingSubjectAfterAuth, setPendingSubjectAfterAuth] = useState("");
  const [pendingCreateAfterAuth, setPendingCreateAfterAuth] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [authCallbackError, setAuthCallbackError] = useState(getAuthCallbackError);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(() => Boolean(getAuthCallbackError()));
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tutorQuoteContext, setTutorQuoteContext] = useState("");
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
      if (authEvent === "INITIAL_SESSION" && !authStatus.configured) return;
      const generation = ++authGenerationRef.current;
      setAuthResolved(true);
      setSessionStatus(authStatus);
      if (authStatus.signedIn && authStatus.userId) {
        const isPasswordRecovery = authEvent === "PASSWORD_RECOVERY";
        if (activeUserIdRef.current === authStatus.userId && dataReadyRef.current) return;
        let pendingLocalSnapshot: LearningBackupDocument | null = null;
        try {
          if (getCloudDataOwnerId() === authStatus.userId && getPendingSyncOwnerId() === authStatus.userId) {
            pendingLocalSnapshot = createLearningBackup();
          }
        } catch {
          pendingLocalSnapshot = null;
        }
        setDataReady(false);
        dataReadyRef.current = false;
        suppressSyncRef.current = true;
        setSyncStatus("loading");
        setSyncError("");
        if (!pendingLocalSnapshot) StorageService.clearLearningData();
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
          if (generation !== authGenerationRef.current || getAuthStatus().userId !== authStatus.userId) return;
          if (pendingLocalSnapshot) {
            const localRestored = restoreLearningSnapshot(authStatus.userId, pendingLocalSnapshot, "overwrite", { confirmed: true });
            if (!localRestored.ok) throw new Error(localRestored.error || "이 기기에 남은 변경사항을 복구하지 못했습니다.");
            if (snapshot) {
              const remoteMerged = importLearningBackup(snapshot.snapshot, { strategy: "merge" });
              if (!remoteMerged.ok) throw new Error(remoteMerged.error || "서버 기록과 이 기기의 변경사항을 합치지 못했습니다.");
            }
            const saved = await syncCurrentLearningSnapshot(authStatus.userId, snapshot?.revision ?? null);
            if (generation !== authGenerationRef.current || getAuthStatus().userId !== authStatus.userId) return;
            snapshotRevisionRef.current = saved.revision;
            setLastSyncedAt(saved.updatedAt);
            clearPendingSync(authStatus.userId);
          } else if (snapshot) {
            const restored = restoreLearningSnapshot(authStatus.userId, snapshot.snapshot, "overwrite", { confirmed: true });
            if (!restored.ok) throw new Error(restored.error || "계정의 학습 기록을 적용하지 못했습니다.");
            snapshotRevisionRef.current = snapshot.revision;
            setLastSyncedAt(snapshot.updatedAt);
          } else {
            const created = await syncCurrentLearningSnapshot(authStatus.userId, null);
            if (generation !== authGenerationRef.current || getAuthStatus().userId !== authStatus.userId) return;
            snapshotRevisionRef.current = created.revision;
            setLastSyncedAt(created.updatedAt);
          }
          refreshDataState();
          dataReadyRef.current = true;
          setDataReady(true);
          setSyncStatus("synced");
          if (pendingViewAfterAuth) {
            setActiveView(pendingViewAfterAuth);
            setPendingViewAfterAuth(null);
          }
          if (pendingCreateAfterAuth) {
            setIsCreateModalOpen(true);
            setPendingSubjectAfterAuth("");
            setPendingCreateAfterAuth(false);
            setActiveView({ type: "home" });
          }
        } catch (error) {
          if (generation !== authGenerationRef.current) return;
          if (!pendingLocalSnapshot) StorageService.clearLearningData();
          StorageService.setUser(account);
          if (pendingLocalSnapshot) markPendingSync(authStatus.userId);
          refreshDataState();
          activeUserIdRef.current = null;
          snapshotRevisionRef.current = null;
          setSyncStatus("error");
          setSyncError(error instanceof Error ? error.message : "계정의 학습 기록을 연결하지 못했습니다.");
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
        setActiveView({ type: "home" });
        suppressSyncRef.current = false;
      }
    };
    window.addEventListener(LEARNHUB_AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => window.removeEventListener(LEARNHUB_AUTH_CHANGED_EVENT, handleAuthChanged);
  }, [pendingCreateAfterAuth, pendingViewAfterAuth]);

  useEffect(() => {
    const handleDataChanged = () => {
      refreshDataState();
      const userId = activeUserIdRef.current;
      if (!userId || !dataReadyRef.current || suppressSyncRef.current) return;
      const changeVersion = ++dataChangeVersionRef.current;
      markPendingSync(userId);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      setSyncStatus("syncing");
      setSyncError("");
      syncTimerRef.current = setTimeout(() => {
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
            setSyncError(error instanceof Error ? error.message : "학습 기록을 동기화하지 못했습니다.");
          });
      }, 800);
    };
    window.addEventListener(LEARNHUB_DATA_CHANGED_EVENT, handleDataChanged);
    return () => {
      window.removeEventListener(LEARNHUB_DATA_CHANGED_EVENT, handleDataChanged);
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
  ) => {
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
    setActiveView({ type: "lesson", course: currentCourse, lesson: currentLesson, chapterTitle, assessmentReturn });
  };

  const handleSelectView = (view: NotionPageView, source = "navigation") => {
    if (
      view.type !== "home" &&
      view.type !== "courses" &&
      view.type !== "course-detail" &&
      !getAuthStatus().signedIn
    ) {
      setPendingViewAfterAuth(view);
      setIsAuthModalOpen(true);
      return;
    }
    if (view.type === "lesson") {
      openLesson(view.course, view.lesson, view.chapterTitle, source, hasCompletedLesson(view.course));
      return;
    }
    if (view.type === "review-queue") {
      const hasUserCourse = courses.length > 0;
      trackLearningEvent("review_visited", { source, sample: !hasUserCourse });
    }
    setActiveView(view);
  };

  const handleOpenLearning = () => {
    if (!getAuthStatus().signedIn) {
      setPendingViewAfterAuth({ type: "home" });
      setIsAuthModalOpen(true);
      return;
    }
    const course = courses.find((candidate) => getResumeLesson(candidate)) || courses[0];
    const resume = course ? getResumeLesson(course) : null;
    if (course && courseIsComplete(course)) { setActiveView({ type: "assessment", course }); return; }
    if (!course || !resume) {
      setActiveView({ type: "home" });
      return;
    }
    openLesson(course, resume.lesson, resume.chapterTitle, "primary-learning", hasCompletedLesson(course));
  };

  const handleCourseCreated = (newCourse: Course) => {
    StorageService.addCourse(newCourse);
    trackLearningEvent("course_created", { courseId: newCourse.id, sample: false, source: "home" });
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

  const activeLessonScope = activeView.type === "lesson"
    ? `${activeView.course.id}:${activeView.lesson.id}`
    : null;

  useEffect(() => {
    setTutorQuoteContext("");
    setIsTutorOpen(false);
  }, [activeLessonScope]);

  const handleOpenTutor = () => {
    if (activeView.type !== "lesson") {
      handleSelectView({ type: "ai-chat" }, "ai-tutor");
      return;
    }
    setTutorQuoteContext("");
    setIsTutorOpen(true);
  };

  const handleOpenCreateCourse = (subject?: string) => {
    const trimmedSubject = subject?.trim() || "";
    setInitialSubject(trimmedSubject);
    const authStatus = getAuthStatus();
    if (!authStatus.signedIn) {
      setPendingSubjectAfterAuth(trimmedSubject);
      setPendingCreateAfterAuth(true);
      setIsAuthModalOpen(true);
      return;
    }
    setPendingSubjectAfterAuth("");
    setPendingCreateAfterAuth(false);
    setIsCreateModalOpen(true);
  };

  const currentLessonData =
    activeView.type === "lesson" ? activeView : null;
  const openAssessment = (course: Course) => {
    const stored = StorageService.getCourseById(course.id);
    if (!stored) {
      StorageService.addCourse(course);
      reloadData();
    }
    const latest = stored || course;
    handleSelectView({ type: "assessment", course: latest }, "course-assessment");
  };

  useEffect(() => {
    document.getElementById("learning-main")?.scrollTo({ top: 0 });
  }, [activeView.type, activeView.type === "lesson" ? activeView.lesson.id : null]);

  if (!authResolved || (sessionStatus.signedIn && !dataReady)) {
    const failed = syncStatus === "error";
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--lh-canvas)] px-6 text-center text-[var(--lh-ink)]">
        <div className="max-w-md space-y-4">
          <LearnHubLogo size={40} />
          <h1 className="text-xl font-medium">{failed ? "학습 기록을 연결하지 못했습니다" : "계정의 학습 공간을 불러오는 중…"}</h1>
          <p className="text-sm leading-relaxed text-[var(--lh-ink-secondary)]">{failed ? syncError : "다른 기기에서 이어서 학습할 수 있도록 최신 기록을 확인하고 있습니다."}</p>
          {failed && (
            <button type="button" onClick={() => {
              activeUserIdRef.current = null;
              window.dispatchEvent(new CustomEvent(LEARNHUB_AUTH_CHANGED_EVENT, { detail: { event: "RETRY_SYNC", userId: getAuthStatus().userId || null } }));
            }} className="rounded-full bg-[var(--lh-primary)] px-5 py-2.5 text-sm font-medium text-white">
              다시 연결하기
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--lh-canvas)] text-[var(--lh-ink)] font-sans">
      {/* 1. Left Notion Sidebar */}
      {!isZenMode && (
        <Sidebar
          courses={courses}
          activeView={activeView}
          onSelectView={(view) => handleSelectView(view, "sidebar")}
          onOpenLearning={handleOpenLearning}
          onOpenCreateCourse={() => handleOpenCreateCourse()}
          onOpenSearch={() => setIsSearchOpen(true)}
           onOpenTutor={handleOpenTutor}
          pendingReviewsCount={reviews.length}
          isOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          userAccount={userAccount}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onUpdateCourseStatus={handleCourseStatusChange}
        />
      )}

      {/* 2. Main Workspace Canvas Area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Scrollable Viewport */}
        <main id="learning-main" className="flex-1 overflow-y-auto bg-[var(--lh-canvas)]">
          {activeView.type === "home" && (
            <div>
              <HomeView
                courses={courses}
                progress={progress}
                reviews={reviews}
                onSelectCourse={(courseId) => {
                  const course = courses.find((c) => c.id === courseId);
                  if (course) handleSelectView({ type: "course-detail", course });
                }}
                onStartAssessment={openAssessment}
                onStartLesson={(course, lesson, chapterTitle) =>
                  openLesson(course, lesson, chapterTitle, "home-continue", hasCompletedLesson(course))
                }
                onStartReview={() => handleSelectView({ type: "review-queue" }, "home-review")}
                onOpenCreateCourse={handleOpenCreateCourse}
              />
            </div>
          )}

          {activeView.type === "courses" && (
            <CoursesView
              courses={courses}
              onSelectCourse={(course) => handleSelectView({ type: "course-detail", course })}
              onStartLesson={(course, lesson, chapterTitle) =>
                openLesson(course, lesson, chapterTitle, "roadmap-start", hasCompletedLesson(course))
              }
              onEnrollRoadmap={handleEnrollRoadmap}
              onOpenCreateCourse={handleOpenCreateCourse}
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
            <NotionLessonCanvas
              key={`${activeView.course.id}:${activeView.lesson.id}`}
              course={activeView.course}
              lessonMeta={activeView.lesson}
              chapterTitle={activeView.chapterTitle}
              onOpenTutorWithText={(quote) => {
                setTutorQuoteContext(quote);
                setIsTutorOpen(true);
              }}
              onFinishLesson={handleLessonFinished}
              onGoHome={() => handleSelectView({ type: "home" }, "lesson-home")}
              onGoCourse={() => setActiveView({ type: "course-detail", course: StorageService.getCourseById(activeView.course.id) || activeView.course })}
              onStartAssessment={() => openAssessment(activeView.course)}
              onBackToAssessment={activeView.assessmentReturn ? () => openAssessment(activeView.course) : undefined}
              onStartNextLesson={(nextCourse, nextLesson, chapterTitle) =>
                openLesson(nextCourse, nextLesson, chapterTitle, "lesson-next", false)
              }
            />
          )}

          {activeView.type === "ai-chat" && <AiChatView />}

          {activeView.type === "knowledge-map" && (
            <KnowledgeMapView
              courses={courses}
              onSelectView={(view) => handleSelectView(view, "knowledge-map")}
            />
          )}

          {activeView.type === "records" && (
            <LearningRecordsView
              skills={skills}
              progress={progress}
              courses={courses}
              reviews={reviews}
              onSelectView={(view) => handleSelectView(view, "records")}
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

        {activeView.type === "lesson" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 px-4">
            <div className="pointer-events-auto">
              <LessonAiInputBar onAsk={(question) => { setTutorQuoteContext(question); setIsTutorOpen(true); }} />
            </div>
          </div>
        )}
      </div>

      {/* 3. Global AI Socratic Drawer */}
      {currentLessonData && (
        <AiTutorDrawer
          key={`tutor:${currentLessonData.course.id}:${currentLessonData.lesson.id}`}
          isOpen={isTutorOpen}
          onClose={() => {
            setIsTutorOpen(false);
            setTutorQuoteContext("");
          }}
          courseTitle={currentLessonData.course.title}
          lessonTitle={currentLessonData.lesson.title}
          lessonId={currentLessonData.lesson.id}
          historyScope={`${currentLessonData.course.id}:${currentLessonData.lesson.id}`}
          cachedLessonContent={StorageService.getCachedLessonContent(currentLessonData.lesson.id)}
          conceptName={currentLessonData.lesson.conceptName}
          currentStepContent={
            tutorQuoteContext
              ? `사용자가 현재 레슨에서 다음 내용을 질문했습니다: "${tutorQuoteContext}"`
              : `${currentLessonData.course.title}의 ${currentLessonData.lesson.title} 학습 내용에 대한 질의응답 세션입니다.`
          }
          initialQuestion={tutorQuoteContext}
        />
      )}

      {/* 4. Modals */}
      <CommandPaletteModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        courses={courses}
        onSelectView={(view) => handleSelectView(view, "search")}
      />

      <CreateCourseModal
        isOpen={isCreateModalOpen}
        initialSubject={initialSubject}
        autoGenerate={Boolean(initialSubject)}
        onClose={() => {
          setIsCreateModalOpen(false);
          setInitialSubject("");
        }}
        onCourseCreated={(newCourse) => {
          setInitialSubject("");
          handleCourseCreated(newCourse);
        }}
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
            setPendingSubjectAfterAuth("");
            setPendingCreateAfterAuth(false);
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
        isZenMode={isZenMode}
        onToggleZenMode={() => setIsZenMode(!isZenMode)}
        onOpenTutor={handleOpenTutor}
        syncStatus={syncStatus}
        syncError={syncError}
        lastSyncedAt={lastSyncedAt}
      />
    </div>
  );
}
