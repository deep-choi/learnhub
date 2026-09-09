/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Course, UserSkill, UserProgress, ReviewQuestion, LessonMeta, UserAccount } from "./types/learning";
import { StorageService } from "./services/storage";
import { Sidebar, NotionPageView } from "./components/notion/Sidebar";
import { TopBar } from "./components/notion/TopBar";
import { HomeView } from "./components/HomeView";
import { LearningRecordsView } from "./components/LearningRecordsView";
import { NotionLessonCanvas } from "./components/notion/NotionLessonCanvas";
import { KnowledgeMapView } from "./components/notion/KnowledgeMapView";
import { MistakeArchiveView } from "./components/notion/MistakeArchiveView";
import { CommandPaletteModal } from "./components/notion/CommandPaletteModal";
import { SkillMatrixView } from "./components/SkillMatrixView";
import { ReviewView } from "./components/ReviewView";
import { ProfileView } from "./components/ProfileView";
import { CreateCourseModal } from "./components/CreateCourseModal";
import { AiTutorDrawer } from "./components/AiTutorDrawer";
import { PlacementTestModal } from "./components/notion/PlacementTestModal";
import { ScratchpadCanvas } from "./components/notion/ScratchpadCanvas";
import { AuthModal } from "./components/notion/AuthModal";
import { INITIAL_COURSES } from "./data/initialData";
import { trackLearningEvent } from "./services/learningAnalytics";
import { getAuthStatus } from "./services/authClient";
import { LEARNHUB_AUTH_CHANGED_EVENT } from "./services/supabaseClient";
import { PenTool } from "lucide-react";
import { AiChatView } from "./components/AiChatView";
import { LessonAiInputBar } from "./components/LessonAiInputBar";
import { CoursesView } from "./components/CoursesView";
import { CourseDetailView } from "./components/CourseDetailView";

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
  for (const chapter of course.chapters) {
    const lesson = chapter.lessons.find((item) => !item.isCompleted);
    if (lesson) return { lesson, chapterTitle: chapter.title };
  }

  const firstLesson = course.chapters[0]?.lessons[0];
  return firstLesson
    ? { lesson: firstLesson, chapterTitle: course.chapters[0].title }
    : null;
};

const SAMPLE_COURSE_IDS = new Set(INITIAL_COURSES.map((course) => course.id));

const isSampleCourse = (course: Course) => SAMPLE_COURSE_IDS.has(course.id);

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [isPlacementTestOpen, setIsPlacementTestOpen] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [authCallbackError, setAuthCallbackError] = useState(getAuthCallbackError);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(() => Boolean(getAuthCallbackError()));
  const [tutorQuoteContext, setTutorQuoteContext] = useState("");
  const [pendingViewAfterAuth, setPendingViewAfterAuth] = useState<NotionPageView | null>(null);

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
    reloadData();
    const handleAuthChanged = (event: Event) => {
      const authEvent = (event as CustomEvent<{ event?: string }>).detail?.event;
      const authStatus = getAuthStatus();
      if (authStatus.signedIn && authStatus.userId) {
        const existingAccount = StorageService.getUser();
        const account: UserAccount = {
          id: authStatus.userId,
          name: authStatus.name?.trim() || authStatus.email?.split("@")[0] || "LearnHub 학습자",
          email: authStatus.email,
          isGuest: false,
          isLocalOnly: false,
          provider: authStatus.provider === "google" ? "google" : "email",
          createdAt: existingAccount.id === authStatus.userId ? existingAccount.createdAt : new Date().toISOString(),
        };
        StorageService.setUser(account);
        setUserAccount(account);
        setAuthCallbackError("");
        setIsAuthModalOpen(false);
        if (pendingViewAfterAuth) {
          setActiveView(pendingViewAfterAuth);
          setPendingViewAfterAuth(null);
        }
      } else {
        StorageService.logout();
        refreshDataState();
        setActiveView({ type: "home" });
      }
      if (authStatus.signedIn && pendingSubjectAfterAuth) {
        setIsCreateModalOpen(true);
        setPendingSubjectAfterAuth("");
        setActiveView({ type: "home" });
      }
    };
    window.addEventListener(LEARNHUB_AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => window.removeEventListener(LEARNHUB_AUTH_CHANGED_EVENT, handleAuthChanged);
  }, [activeView.type, pendingSubjectAfterAuth, pendingViewAfterAuth]);

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
  ) => {
    trackLearningEvent("lesson_started", {
      courseId: course.id,
      lessonId: lesson.id,
      source,
      resume,
      firstLesson: isFirstLesson(course, lesson),
      sample: isSampleCourse(course),
    });
    setActiveView({ type: "lesson", course, lesson, chapterTitle });
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
      const hasUserCourse = courses.some((course) => !isSampleCourse(course));
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
    const course = courses.find((candidate) => !isSampleCourse(candidate));
    const resume = course ? getResumeLesson(course) : null;
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

  const handleEnrollRoadmap = (course: Course) => {
    if (!courses.some((c) => c.id === course.id)) {
      StorageService.addCourse(course);
      reloadData();
      trackLearningEvent("course_created", { courseId: course.id, sample: false, source: "roadmap" });
    }
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
        sample: isSampleCourse(activeView.course),
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
      setIsAuthModalOpen(true);
      return;
    }
    setPendingSubjectAfterAuth("");
    setIsCreateModalOpen(true);
  };

  const currentLessonData =
    activeView.type === "lesson" ? activeView : null;
  const isAuthenticated = getAuthStatus().signedIn && !userAccount.isGuest;

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
          onOpenPlacementTest={() => isAuthenticated ? setIsPlacementTestOpen(true) : setIsAuthModalOpen(true)}
          pendingReviewsCount={reviews.length}
          isOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          userAccount={userAccount}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}

      {/* 2. Main Workspace Canvas Area */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Top Breadcrumb & Actions Bar */}
        <TopBar
          activeView={activeView}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
           onOpenTutor={handleOpenTutor}
          isZenMode={isZenMode}
          onToggleZenMode={() => setIsZenMode(!isZenMode)}
          userAccount={userAccount}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto bg-[var(--lh-canvas)]">
          {activeView.type === "home" && (
            <div>
              <HomeView
                courses={courses}
                progress={progress}
                reviews={reviews}
                onSelectCourse={(courseId) => {
                  const course = courses.find((c) => c.id === courseId);
                  const resume = course ? getResumeLesson(course) : null;
                  if (course && resume) {
                    openLesson(course, resume.lesson, resume.chapterTitle, "home-course", hasCompletedLesson(course));
                  }
                }}
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
            />
          )}

          {activeView.type === "course-detail" && (
            <CourseDetailView
              course={activeView.course}
              onBack={() => handleSelectView({ type: "courses" })}
              onStartLesson={(course, lesson, chapterTitle) =>
                openLesson(course, lesson, chapterTitle, "course-detail-start", hasCompletedLesson(course))
              }
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

          {activeView.type === "settings" && (
            <ProfileView
              onDataChanged={refreshDataState}
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
      <PlacementTestModal
        isOpen={isPlacementTestOpen}
        onClose={() => setIsPlacementTestOpen(false)}
        courses={courses}
        onSelectView={(view) => handleSelectView(view, "placement")}
      />

      <CommandPaletteModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        courses={courses}
        onSelectView={(view) => handleSelectView(view, "search")}
      />

      {/* 5. Floating Scratchpad Trigger */}
      {isAuthenticated && <button
        onClick={() => setIsScratchpadOpen(!isScratchpadOpen)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full border border-white/10 bg-[var(--lh-ink)] px-4 py-2.5 text-xs font-medium text-white shadow-[var(--lh-shadow-md)] transition hover:bg-[var(--lh-ink-secondary)] cursor-pointer"
        aria-label="수식 연습장 열기"
      >
        <PenTool className="h-3.5 w-3.5" />
        <span>수식 연습장</span>
      </button>}

      <ScratchpadCanvas
        key={
          activeView.type === "lesson"
            ? `scratchpad:${activeView.course.id}:${activeView.lesson.id}`
            : "global"
        }
        isOpen={isScratchpadOpen}
        onClose={() => setIsScratchpadOpen(false)}
        courseId={activeView.type === "lesson" ? activeView.course.id : undefined}
        lessonId={activeView.type === "lesson" ? activeView.lesson.id : undefined}
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
          onClose={() => {
            setIsAuthModalOpen(false);
            setAuthCallbackError("");
            setPendingViewAfterAuth(null);
            setPendingSubjectAfterAuth("");
          }}
        />
      </div>
    </div>
  );
}
