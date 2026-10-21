/// <reference types="vite/client" />
// Development-only integration fixture; never included in the production build.
import React, { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AiChatView } from "../../src/components/AiChatView";
import { LearningConversationView } from "../../src/components/LearningConversationView";
import { configureAuthAdapter } from "../../src/services/authClient";
import { StorageService } from "../../src/services/storage";
import { mergeCourseLinks } from "../../src/components/graph/graphBridge";
import { buildCourseFromPayload } from "../../src/components/graph/courseFromPayload";
import { resolveCourseSetup } from "../../src/domain/courseSetup";
import type { Course } from "../../src/types/learning";
import type { CurriculumConceptLinks } from "../../src/types/knowledgeGraph";
import type { CourseSetup } from "../../src/types/courseSetup";
import "../../src/index.css";

function Fixture() {
  const failNextSave = useRef(new URLSearchParams(location.search).has("failSave"));
  const [signedIn, setSignedIn] = useState(!new URLSearchParams(location.search).has("guest"));
  const [session, setSession] = useState<string | null>(() => localStorage.getItem("fixture-session"));
  const [course, setCourse] = useState<Course | null>(null);
  const [outline, setOutline] = useState(false);
  const [pending, setPending] = useState<{ subject: string; data: Record<string, any>; setup: CourseSetup } | null>(null);
  const [authRequested, setAuthRequested] = useState(false);
  configureAuthAdapter({ getAccessToken: async () => signedIn ? "fixture-token" : null, getAuthStatus: () => ({ configured: true, signedIn, provider: "fixture", userId: "fixture-user" }) });
  const start = (created: Course, links: CurriculumConceptLinks) => {
    if (failNextSave.current) { failNextSave.current = false; throw new Error("storage full"); }
    StorageService.addCourse(created);
    mergeCourseLinks(created, links);
    localStorage.setItem("fixture-start-count", String(Number(localStorage.getItem("fixture-start-count") || 0) + 1));
    setCourse(created);
  };
  return <main className="min-h-dvh bg-[var(--lh-chat-bg)] text-[var(--lh-ink)]">
    {course && <button onClick={() => { setCourse(null); setOutline(false); }}>대화로 돌아가기</button>}
    {course ? outline ? <div><h1>{course.title}</h1><button onClick={() => setOutline(false)}>수업으로 돌아가기</button></div> : <LearningConversationView
      course={course} lessonMeta={course.chapters[0].lessons[0]} chapterTitle={course.chapters[0].title}
      onFinishLesson={() => {}} onGoCourse={() => setOutline(true)} isSignedIn={signedIn}
    /> : <AiChatView
      isSignedIn={signedIn} sessionId={session} startInCourseMode={!session && !new URLSearchParams(location.search).has("chat")} resume={null} onResume={() => {}}
      onStartCourse={start} onResumeCourse={id => setCourse(StorageService.getCourseById(id) ?? null)}
      onGuestStartCourse={(subject, data, setup) => setPending({ subject, data, setup })}
      onRequestAuth={() => setAuthRequested(true)} onBrowseCourses={() => {}} onPractice={() => {}}
      onSessionCreated={id => { setSession(id); localStorage.setItem("fixture-session", id); }}
    />}
    {pending && <div role="dialog" aria-label="테스트 로그인"><button onClick={() => {
      setSignedIn(true);
      const built = buildCourseFromPayload(pending.data, pending.subject, resolveCourseSetup(pending.setup));
      setPending(null);
      start(built.course, built.links);
    }}>테스트 로그인 완료</button></div>}
    {authRequested && <div role="dialog" aria-label="체험 종료 로그인">로그인하기</div>}
  </main>;
}

if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
