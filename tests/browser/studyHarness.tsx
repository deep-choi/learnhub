/// <reference types="vite/client" />
// Development-only UI fixture. This is not an entry in the production Vite build.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AiChatView } from "../../src/components/AiChatView";
import { StorageService } from "../../src/services/storage";
import { saveNote, listNotes } from "../../src/services/noteStore";
import "../../src/index.css";
import { NotesPane } from "../../src/components/workspace/NotesPane";
import { emptyKnowledgeGraph } from "../../src/domain/knowledgeGraph";
import { MistakeArchiveView } from "../../src/components/notion/MistakeArchiveView";
const withNotes = new URLSearchParams(location.search).has("notes");
StorageService.setUser({
  id: "study-browser-test",
  name: "테스트",
  isGuest: false,
  isLocalOnly: true,
} as any);
if (!listNotes().length)
  saveNote({ title: "나의 생물 메모", body: "세포는 돌의 기본 단위입니다.", conceptId: "세포" });
function Fixture() {
  const [session, setSession] = useState<string | null>(() =>
    localStorage.getItem("test-active-session"),
  );
  if (new URLSearchParams(location.search).has("archive")) return <MistakeArchiveView />;
  return (
    <main className={`h-dvh bg-[var(--lh-chat-bg)] text-[var(--lh-ink)] ${withNotes ? "grid grid-cols-[1fr_320px]" : ""}`}>
      <AiChatView
        isSignedIn
        userName="테스트"
        sessionId={session}
        resume={null}
        onResume={() => {}}
        onStartCourse={() => {}}
        onGuestStartCourse={() => {}}
        onRequestAuth={() => {}}
        onBrowseCourses={() => {}}
        onPractice={() => {}}
        onSessionCreated={(id) => {
          setSession(id);
          localStorage.setItem("test-active-session", id);
        }}
      />
      {withNotes && <NotesPane context={{ graph: emptyKnowledgeGraph(), currentConceptId: "세포", nextIds: [], pulseId: null, noteTarget: { conceptId: "세포", conceptName: "세포" }, onOpenNotes: () => {} }} />}
    </main>
  );
}
if (import.meta.env.DEV)
  createRoot(document.getElementById("root")!).render(<Fixture />);
