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
import { FocusTimerModal } from "./components/notion/FocusTimerModal";
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
import { PenTool } from "lucide-react";

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
  const [activeView, setActiveView] = useState<NotionPageView>({ type: "home" });
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );
  const [isZenMode, setIsZenMode] = useState(false);

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [initialSubject, setInitialSubject] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isTimerOpen, setIsTimerOpen] = useState(false);
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [isPlacementTestOpen, setIsPlacementTestOpen] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [tutorQuoteContext, setTutorQuoteContext] = useState("");

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
    reloadData();
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
      window.alert("질문할 레슨을 먼저 열어주세요.");
      return;
    }
    setTutorQuoteContext("");
    setIsTutorOpen(true);
  };

  const handleLogout = () => {
    StorageService.logout();
    setActiveView({ type: "home" });
    reloadData();
  };

  const currentLessonData =
    activeView.type === "lesson" ? activeView : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[#2F3437] font-sans selection:bg-[#2F3437] selection:text-white">
      {/* 1. Left Notion Sidebar */}
      {!isZenMode && (
        <Sidebar
          courses={courses}
          activeView={activeView}
          onSelectView={(view) => handleSelectView(view, "sidebar")}
          onOpenLearning={handleOpenLearning}
          onOpenCreateCourse={() => {
            setInitialSubject("");
            setIsCreateModalOpen(true);
          }}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenTimer={() => setIsTimerOpen(true)}
           onOpenTutor={handleOpenTutor}
          onOpenPlacementTest={() => setIsPlacementTestOpen(true)}
          pendingReviewsCount={reviews.length}
          isOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          userAccount={userAccount}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}

      {/* 2. Main Workspace Canvas Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Breadcrumb & Actions Bar */}
        <TopBar
          activeView={activeView}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
           onOpenTutor={handleOpenTutor}
          onOpenTimer={() => setIsTimerOpen(true)}
          isZenMode={isZenMode}
          onToggleZenMode={() => setIsZenMode(!isZenMode)}
          userAccount={userAccount}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto bg-white">
          <div className="border-b border-[#E9E9E7] bg-[#FBFBFA] px-4 py-2 text-center text-[11px] text-[#787774]">
            이 LearnHub 체험판은 여러 분야 주제로 학습 코스를 만들고, 기록은 현재 기기에만 저장합니다. 수학 체험 진단은 선택 기능이며 전체 실력 판정이 아닙니다.
          </div>
          {activeView.type === "home" && (
            <div className="mx-auto max-w-[760px] py-10 px-4">
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
                onOpenCreateCourse={(subject) => {
                  setInitialSubject(subject?.trim() || "");
                  setIsCreateModalOpen(true);
                }}
              />
            </div>
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
              onDataChanged={refreshDataState}
            />
          )}

          {activeView.type === "skill-matrix" && (
            <div className="mx-auto max-w-[760px] py-10 px-4">
              <SkillMatrixView
                skills={skills}
                progress={progress}
                courses={courses}
                onSelectView={(view) => handleSelectView(view, "skill-matrix")}
              />
            </div>
          )}

          {activeView.type === "review-queue" && (
            <div className="mx-auto max-w-[760px] py-10 px-4">
              <ReviewView
                reviews={reviews}
                skills={skills}
                onReviewFinished={reloadData}
              />
            </div>
          )}

          {activeView.type === "mistake-archive" && (
              <MistakeArchiveView
              courses={courses}
              onSelectView={(view) => handleSelectView(view, "mistakes")}
            />
          )}

          {activeView.type === "settings" && (
            <div className="mx-auto max-w-[760px] py-10 px-4">
              <ProfileView
                onResetData={reloadData}
                userAccount={userAccount}
                onLogout={handleLogout}
              />
            </div>
          )}
        </main>
      </div>

      {/* 3. Global AI Socratic Drawer */}
      {currentLessonData && (
        <AiTutorDrawer
          key={`${currentLessonData.course.id}:${currentLessonData.lesson.id}`}
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
              ? `사용자가 본문에서 다음 문장을 직접 인용하여 질문했습니다: "${tutorQuoteContext}"`
              : `${currentLessonData.course.title}의 ${currentLessonData.lesson.title} 학습 내용에 대한 소크라틱 질의응답 세션입니다.`
          }
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

      <FocusTimerModal
        isOpen={isTimerOpen}
        onClose={() => setIsTimerOpen(false)}
      />

      {/* 5. Floating Scratchpad Trigger */}
      <button
        onClick={() => setIsScratchpadOpen(!isScratchpadOpen)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-1.5 rounded-full bg-[#191919] px-3.5 py-2 text-xs font-semibold text-white shadow-xl hover:bg-[#37352F] transition cursor-pointer"
      >
        <PenTool className="h-3.5 w-3.5" />
        <span>수식 연습장</span>
      </button>

      <ScratchpadCanvas
        key={
          activeView.type === "lesson"
            ? `${activeView.course.id}:${activeView.lesson.id}`
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

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={(user) => {
          setUserAccount(user);
          reloadData();
        }}
      />
    </div>
  );
}
