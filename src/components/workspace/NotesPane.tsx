import React, { useEffect, useMemo, useRef, useState } from "react";
import { NOTE_LIMITS, extractNoteLinkNames, resolveNoteLinks } from "../../domain/learningNote";
import { getNoteForLesson, getNotesForConcept, saveNote } from "../../services/noteStore";
import type { LearningNote, SaveNoteFailure } from "../../types/learningNotes";
import type { PaneContext } from "./types";

const SAVE_DELAY_MS = 700;

const FAILURE_TEXT: Record<SaveNoteFailure, string> = {
  too_large: "메모가 너무 길어서 저장하지 못했어요. 조금 줄여 주세요.",
  too_many: "저장할 수 있는 메모 수를 넘었어요. 안 쓰는 메모를 정리해 주세요.",
  not_found: "메모를 찾지 못했어요. 다시 열어 주세요.",
  invalid: "메모를 저장할 수 없는 형식이에요.",
  storage: "이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.",
};

/** 지금 보여 줄 메모: 레슨의 개념이면 그 레슨 메모, 지도에서 고른 다른 개념이면 그 개념에 붙은 가장 최근 메모. */
const findNote = (context: PaneContext): LearningNote | undefined => {
  const { courseId, lessonId, noteTarget, currentConceptId } = context;
  if (courseId && lessonId && noteTarget.conceptId === currentConceptId) return getNoteForLesson(courseId, lessonId) ?? getNotesForConcept(noteTarget.conceptId)[0];
  return getNotesForConcept(noteTarget.conceptId)[0];
};

/** 메모 패널: 지금 개념에 붙은 메모를 씁니다. 저장 버튼으로 바로 저장하고, 놓쳐도 뒤에서 자동 저장합니다. [[개념]]은 그 개념과 연결됩니다. */
export const NotesPane: React.FC<{ context: PaneContext }> = ({ context }) => {
  const { noteTarget, graph, courseId, lessonId, currentConceptId } = context;
  const [body, setBody] = useState(() => findNote(context)?.body ?? "");
  const [status, setStatus] = useState<"saved" | "saving" | SaveNoteFailure>("saved");
  /** 저장 버튼을 누른 직후 잠깐 "저장됨"을 보여 줍니다. */
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef<string | undefined>(findNote(context)?.id);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ conceptId: string; name: string; body: string; withLesson: boolean } | null>(null);

  const flush = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    // 아직 쓴 적 없는데 비어 있으면 빈 메모를 만들지 않습니다.
    if (!noteIdRef.current && !pending.body.trim()) {
      setStatus("saved");
      return;
    }
    const result = saveNote({
      id: noteIdRef.current,
      body: pending.body,
      conceptId: pending.conceptId,
      ...(pending.withLesson ? { courseId, lessonId } : {}),
    });
    if ("reason" in result) {
      setStatus(result.reason);
    } else {
      noteIdRef.current = result.note.id;
      setStatus("saved");
    }
  };

  // 보여 줄 개념이 바뀌면 쓰던 메모를 먼저 저장하고 그 개념의 메모를 불러옵니다.
  useEffect(() => {
    flush();
    const note = findNote(context);
    noteIdRef.current = note?.id;
    setBody(note?.body ?? "");
    setStatus("saved");
    setJustSaved(false);
    return flush;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteTarget.conceptId]);

  // 새로고침·탭 닫기는 컴포넌트 정리 함수를 부르지 않으므로, 자동 저장 대기 중인 메모를 이때 바로 저장합니다.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const flushNow = () => flushRef.current();
    const flushWhenHidden = () => { if (document.visibilityState === "hidden") flushRef.current(); };
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, []);

  const saveNow = () => {
    flush();
    setJustSaved(true);
    if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
    justSavedTimerRef.current = setTimeout(() => setJustSaved(false), 1500);
  };

  useEffect(() => () => {
    if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
  }, []);

  const change = (value: string) => {
    setJustSaved(false);
    const next = value.slice(0, NOTE_LIMITS.maxBodyLength);
    setBody(next);
    setStatus("saving");
    pendingRef.current = { conceptId: noteTarget.conceptId, name: noteTarget.conceptName, body: next, withLesson: noteTarget.conceptId === currentConceptId };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const resolved = useMemo(() => resolveNoteLinks(body, graph), [body, graph]);
  const nameOf = (id: string) => graph.nodes.find((node) => node.id === id)?.name ?? id;
  const hasLinks = extractNoteLinkNames(body).length > 0;

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--lh-line)] px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-[var(--lh-ink)]">{noteTarget.conceptName}</p>
          {status !== "saved" && status !== "saving" && <p className="text-sm text-[var(--lh-danger)]" role="alert">{FAILURE_TEXT[status]}</p>}
        </div>
        <button
          type="button"
          onClick={saveNow}
          className="inline-flex h-9 min-h-0! shrink-0 items-center rounded-full bg-[var(--lh-primary)] px-4 text-sm! font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer"
        >
          {justSaved && status === "saved" ? "저장됨" : "저장"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <label htmlFor="note-body" className="sr-only">{noteTarget.conceptName} 메모</label>
        <textarea
          id="note-body"
          value={body}
          onChange={(event) => change(event.target.value)}
          placeholder="배운 것을 적어 보세요."
          className="lh-bare-input h-full min-h-[240px] w-full resize-none bg-transparent px-4 py-3 text-base leading-[1.75] text-[var(--lh-ink)] outline-none placeholder:text-[var(--lh-ink-tertiary)]"
        />
      </div>

      {hasLinks && (
        <div className="space-y-1.5 border-t border-[var(--lh-line)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--lh-ink-secondary)]">연결된 개념</p>
          <div className="flex flex-wrap gap-1.5">
            {resolved.links.map((id) => <span key={id} className="rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-3 py-1 text-sm text-[var(--lh-primary-text)]">{nameOf(id)}</span>)}
            {resolved.unresolved.map((name) => <span key={name} title="지도에 없는 개념이에요" className="rounded-full border border-dashed border-[var(--lh-line-strong)] px-3 py-1 text-sm text-[var(--lh-ink-tertiary)]">{name}</span>)}
          </div>
        </div>
      )}
    </div>
  );
};
