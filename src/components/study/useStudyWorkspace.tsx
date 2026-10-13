import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FilePlus2,
  FolderOpen,
  Loader2,
  Mic,
  Plus,
  Search,
  Square,
  WandSparkles,
  X,
  Trash2,
} from "lucide-react";
import {
  STUDY_ACTIONS,
  STUDY_LIMITS,
  groundedStudyOutput,
  safeWebUrl,
  buildStudyRequest,
  validStudyOutput,
  type StudyAction,
  type StudyResult,
  type StudySource,
} from "../../domain/study";
import { getStudyLibrary, updateStudyLibrary } from "../../services/studyStore";
import { listNotes } from "../../services/noteStore";
import { getKnownLocalOwnerId } from "../../services/cloudSync";
import { StorageService } from "../../services/storage";
import {
  extractStudyFile,
  STUDY_ACCEPT,
  studyPost,
} from "../../services/studyImport";
import { useVoiceConversation } from "./useVoiceConversation";
import { StudyDialog } from "./StudyDialog";
import { StudyResultView, studyButton } from "./StudyResultView";
import { RichLessonRenderer } from "../notion/RichLessonRenderer";
const iconButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] disabled:opacity-40";
const uid = () => crypto.randomUUID();
export function useStudyWorkspace({
  scope,
  courseId,
  learningContext,
  busy,
  onVoiceTurn,
  enabled = true,
  extraActions = [],
}: {
  scope: string;
  courseId?: string;
  learningContext?: StudyResult["learningContext"];
  busy: boolean;
  onVoiceTurn: (text: string) => Promise<string | void>;
  enabled?: boolean;
  extraActions?: { label: string; run: () => void }[];
}) {
  const [library, setLibrary] = useState(getStudyLibrary),
    [unsavedResult, setUnsavedResult] = useState<StudyResult | null>(null),
    [action, setAction] = useState<StudyAction>("chat"),
    [menu, setMenu] = useState<"add" | "tools" | null>(null),
    [dialog, setDialog] = useState<"library" | "research" | "result" | null>(
      null,
    ),
    [tab, setTab] = useState<"sources" | "notes" | "results">("sources"),
    [query, setQuery] = useState(""),
    [folder, setFolder] = useState(courseId || ""),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [resultId, setResultId] = useState<string | null>(null),
    [research, setResearch] = useState<{
      text: string;
      sources: { title: string; url: string }[];
      searchHtml?: string;
      requestedUrl?: string;
    } | null>(null);
  const files = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    lock = useRef(false),
    scopeRef = useRef(scope),
    oldScope = useRef(scope),
    menuRef = useRef<HTMLDivElement>(null);
  scopeRef.current = scope;
  const voice = useVoiceConversation(onVoiceTurn);
  const refresh = () => setLibrary(getStudyLibrary());
  useEffect(() => {
    window.addEventListener("learnhub:study-changed", refresh);
    window.addEventListener("learnhub:data-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("learnhub:study-changed", refresh);
      window.removeEventListener("learnhub:data-changed", refresh);
      window.removeEventListener("storage", refresh);
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (oldScope.current === scope) return;
    const prior = oldScope.current;
    oldScope.current = scope;
    try {
      setLibrary(
        updateStudyLibrary((l) => ({
          ...l,
          bindings: l.bindings.some((b) => b.scope === scope)
            ? l.bindings.filter((b) => b.scope !== prior)
            : l.bindings.map((b) => (b.scope === prior ? { ...b, scope } : b)),
          results: l.results.map((r) =>
            r.scope === prior ? { ...r, scope } : r,
          ),
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [scope]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") setMenu(null);
      } else if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  const notes = (): StudySource[] =>
    listNotes()
      .filter((n) => n.body.trim())
      .map((n) => ({
        id: `note:${n.id}`,
        title: n.title,
        text: n.body,
        kind: "note",
        courseId: n.courseId,
        updatedAt: n.updatedAt,
      }));
  const allSources = () => [...getStudyLibrary().sources, ...notes()];
  const ids = library.bindings.find((b) => b.scope === scope)?.ids || [];
  const chosen = allSources().filter((s) => ids.includes(s.id));
  const choose = (id: string) => {
    setError("");
    try {
      setLibrary(
        updateStudyLibrary((l) => {
          const previous =
            l.bindings.find((b) => b.scope === scopeRef.current)?.ids || [];
          const next = previous.includes(id)
            ? previous.filter((x) => x !== id)
            : [...previous, id];
          if (next.length > STUDY_LIMITS.selected)
            throw new Error("자료는 한 번에 8개까지 연결할 수 있습니다.");
          return {
            ...l,
            bindings: [
              ...l.bindings.filter((b) => b.scope !== scopeRef.current),
              {
                scope: scopeRef.current,
                ids: next,
                updatedAt: new Date().toISOString(),
              },
            ],
          };
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const saveSource = (source: StudySource) => {
    setLibrary(
      updateStudyLibrary((l) => {
        const previous =
          l.bindings.find((b) => b.scope === scopeRef.current)?.ids || [];
        if (previous.length >= STUDY_LIMITS.selected)
          throw new Error("자료는 한 번에 8개까지 연결할 수 있습니다.");
        return {
          ...l,
          sources: [source, ...l.sources],
          bindings: [
            ...l.bindings.filter((b) => b.scope !== scopeRef.current),
            {
              scope: scopeRef.current,
              ids: [...previous, source.id],
              updatedAt: new Date().toISOString(),
            },
          ],
        };
      }),
    );
  };
  const removeSource = (id: string) => {
    try {
      setLibrary(
        updateStudyLibrary((l) => ({
          ...l,
          sources: l.sources.filter((s) => s.id !== id),
          bindings: l.bindings.map((b) => ({
            ...b,
            ids: b.ids.filter((x) => x !== id),
          })),
        })),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const ingest = async (items: FileList | File[]) => {
    if (lock.current || busy || !enabled) return;
    lock.current = true;
    setWorking(true);
    setError("");
    const owner = getKnownLocalOwnerId();
    const abort = new AbortController();
    controller.current = abort;
    try {
      for (const file of Array.from(items)) {
        const text = await extractStudyFile(file, abort.signal);
        if (abort.signal.aborted || getKnownLocalOwnerId() !== owner) return;
        saveSource({
          id: uid(),
          title: file.name.slice(0, 200),
          kind: "file",
          text,
          ...(folder ? { courseId: folder } : {}),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      lock.current = false;
      setWorking(false);
      if (files.current) files.current.value = "";
    }
  };
  const answer = async (
    question: string,
    history: { role: string; text: string }[],
    context = "",
  ): Promise<{ reply: string; id: string } | null> => {
    if (action === "chat" && !chosen.length) return null;
    if (lock.current) throw new Error("자료를 처리하는 중입니다.");
    lock.current = true;
    setWorking(true);
    setError("");
    const owner = getKnownLocalOwnerId();
    const abort = new AbortController();
    controller.current = abort;
    try {
      const request = buildStudyRequest(
        action,
        question,
        allSources().filter((s) => ids.includes(s.id)),
        history,
        context,
      );
      const data = await studyPost("study", request, abort.signal);
      if (abort.signal.aborted || owner !== getKnownLocalOwnerId())
        throw new Error("대화가 변경되었습니다.");
      if (
        !validStudyOutput(data, action) ||
        !groundedStudyOutput(data, request.sources)
      )
        throw new Error("응답과 출처를 확인하지 못했습니다.");
      const result: StudyResult = {
        ...data,
        id: uid(),
        scope: scopeRef.current,
        action,
        createdAt: new Date().toISOString(),
        ...(learningContext ? { learningContext } : {}),
      };
      try {
        setLibrary(
          updateStudyLibrary((l) => ({
            ...l,
            results: [result, ...l.results],
          })),
        );
        setUnsavedResult(null);
      } catch {
        setUnsavedResult(result);
        setError("결과를 보관하지 못했습니다. 파일로 저장해 주세요.");
        setDialog("result");
      }
      setAction("chat");
      setResultId(result.id);
      if (action !== "chat") setDialog("result");
      return { reply: result.reply, id: result.id };
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "요청을 완료하지 못했습니다.",
        );
      throw e;
    } finally {
      lock.current = false;
      setWorking(false);
    }
  };
  const search = async () => {
    if (!query.trim() || lock.current) return;
    const isUrl = /^https?:\/\//i.test(query.trim());
    const url = isUrl ? safeWebUrl(query.trim()) : null;
    if (isUrl && !url) {
      setError("공개 HTTPS 주소를 입력해 주세요.");
      return;
    }
    if (url) {
      await importLink(url);
      return;
    }
    lock.current = true;
    setWorking(true);
    setError("");
    setResearch(null);
    const abort = new AbortController();
    controller.current = abort;
    const owner = getKnownLocalOwnerId();
    try {
      const value = await studyPost(
        "study-research",
        { query: query.trim(), ...(url ? { url } : {}) },
        abort.signal,
      );
      if (!abort.signal.aborted && owner === getKnownLocalOwnerId())
        setResearch(value);
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      lock.current = false;
      setWorking(false);
    }
  };
  const importLink = async (url: string) => {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    const owner = getKnownLocalOwnerId();
    try {
      const value = await studyPost("study-url", { url }, abort.signal);
      let text = value.text;
      if (value.pdf) {
        const bytes = Uint8Array.from(atob(value.pdf), (c) => c.charCodeAt(0));
        text = await extractStudyFile(
          new File([bytes], `${value.title}.pdf`, { type: "application/pdf" }),
          abort.signal,
        );
      }
      if (abort.signal.aborted || owner !== getKnownLocalOwnerId()) return;
      saveSource({
        id: uid(),
        title: value.title,
        text,
        kind: "web",
        url: value.url,
        ...(folder ? { courseId: folder } : {}),
        updatedAt: new Date().toISOString(),
      });
      setTab("sources");
      setQuery("");
      setDialog("library");
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      lock.current = false;
      setWorking(false);
    }
  };
  const openResult = (id: string) => {
    setResultId(id);
    setDialog("result");
  };
  const renderResultLink = (id?: string) =>
    id &&
    (library.results.some((r) => r.id === id) || unsavedResult?.id === id) ? (
      <button
        type="button"
        className={`${studyButton} mt-3`}
        onClick={() => openResult(id)}
      >
        자료·결과 보기
      </button>
    ) : null;
  const selectedResult =
    library.results.find((r) => r.id === resultId) ||
    (unsavedResult?.id === resultId ? unsavedResult : undefined);
  const visibleSources = (tab === "notes" ? notes() : library.sources).filter(
    (s) =>
      (!folder || s.courseId === folder) &&
      `${s.title} ${s.text.slice(0, 200)}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const disabled = busy || working || !enabled;
  const toolbar = (
    <div ref={menuRef} className="relative flex shrink-0 items-center gap-0.5">
      <input
        ref={files}
        type="file"
        multiple
        accept={STUDY_ACCEPT}
        className="hidden"
        aria-label="자료 첨부"
        onChange={(e) => {
          if (e.target.files) void ingest(e.target.files);
        }}
      />
      <button
        type="button"
        className={iconButton}
        aria-label="자료·메모"
        title="자료·메모"
        aria-expanded={menu === "add"}
        disabled={disabled}
        onClick={() => setMenu((m) => (m === "add" ? null : "add"))}
      >
        <Plus size={19} />
      </button>
      <button
        type="button"
        className={iconButton}
        aria-label="학습 도구"
        title="학습 도구"
        aria-expanded={menu === "tools"}
        disabled={disabled}
        onClick={() => setMenu((m) => (m === "tools" ? null : "tools"))}
      >
        <WandSparkles size={18} />
      </button>
      <button
        type="button"
        className={`${iconButton} ${voice.state !== "off" ? "bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]!" : ""}`}
        aria-label={voice.state === "off" ? "음성 대화" : "음성 대화 종료"}
        title={voice.state === "off" ? "음성 대화" : "음성 대화 종료"}
        disabled={voice.state === "off" && disabled}
        onClick={() => (voice.state === "off" ? voice.start() : voice.stop())}
      >
        {voice.state === "off" ? <Mic size={18} /> : <Square size={16} />}
      </button>
      {menu && (
        <div
          className="absolute bottom-12 left-0 z-30 max-h-80 w-48 overflow-y-auto rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-1.5 shadow-xl"
          role="group"
          aria-label={menu === "add" ? "자료·메모" : "학습 도구"}
        >
          {menu === "add" ? (
            [
              {
                label: "파일 첨부",
                Icon: FilePlus2,
                run: () => files.current?.click(),
              },
              {
                label: "자료함",
                Icon: FolderOpen,
                run: () => {
                  setQuery("");
                  setTab("sources");
                  setDialog("library");
                },
              },
              {
                label: "내 메모",
                Icon: BookOpen,
                run: () => {
                  setQuery("");
                  setTab("notes");
                  setDialog("library");
                },
              },
              {
                label: "자료 찾기·링크",
                Icon: Search,
                run: () => {
                  setQuery("");
                  setDialog("research");
                },
              },
            ]
              .map(({ label, Icon, run }) => (
                <button
                  type="button"
                  key={label}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-[var(--lh-surface-subtle)]"
                  onClick={() => {
                    setMenu(null);
                    run();
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))
              .concat(
                extraActions.map((item) => (
                  <button
                    type="button"
                    key={item.label}
                    className="block min-h-10 w-full rounded-xl border-t border-[var(--lh-line)] px-3 text-left text-sm hover:bg-[var(--lh-surface-subtle)]"
                    onClick={() => {
                      setMenu(null);
                      item.run();
                    }}
                  >
                    {item.label}
                  </button>
                )),
              )
          ) : (
            <>
              {Object.entries(STUDY_ACTIONS)
                .filter(([id]) => id !== "chat")
                .map(([id, label]) => (
                  <button
                    type="button"
                    key={id}
                    className="block min-h-10 w-full rounded-xl px-3 text-left text-sm hover:bg-[var(--lh-surface-subtle)]"
                    onClick={() => {
                      setAction(id as StudyAction);
                      setMenu(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              <button
                type="button"
                className="block min-h-10 w-full rounded-xl border-t border-[var(--lh-line)] px-3 text-left text-sm"
                onClick={() => {
                  setTab("results");
                  setQuery("");
                  setDialog("library");
                  setMenu(null);
                }}
              >
                저장된 결과
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
  const status = (
    <>
      {(chosen.length > 0 || action !== "chat") && (
        <div className="flex flex-wrap gap-1.5 px-2 pt-1">
          {chosen.map((s) => (
            <button
              key={s.id}
              disabled={working}
              type="button"
              onClick={() => choose(s.id)}
              aria-label={`${s.title} 연결 해제`}
              className="flex max-w-48 items-center gap-1 rounded-full bg-[var(--lh-surface-subtle)] px-2.5 py-1 text-xs"
            >
              <span className="truncate">{s.title}</span>
              <X size={12} />
            </button>
          ))}
          {action !== "chat" && (
            <button
              disabled={working}
              type="button"
              onClick={() => setAction("chat")}
              className="flex items-center gap-1 rounded-full bg-[var(--lh-primary-subtle)] px-2.5 py-1 text-xs text-[var(--lh-primary-text)]"
            >
              {STUDY_ACTIONS[action]}
              <X size={12} />
            </button>
          )}
        </div>
      )}
      {working && (
        <div
          role="status"
          className="flex items-center gap-2 px-3 py-1 text-xs"
        >
          <Loader2 size={13} className="animate-spin" />
          처리 중
          <button
            type="button"
            onClick={() => controller.current?.abort()}
            className="ml-auto underline"
          >
            취소
          </button>
        </div>
      )}
      {voice.state !== "off" && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs"
          aria-live="polite"
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--lh-primary)]" />
          <span className="min-w-0 flex-1 truncate">
            {voice.transcript ||
              (
                {
                  listening: "듣는 중",
                  thinking: "생각 중",
                  speaking: "말하는 중",
                } as const
              )[voice.state]}
          </span>
          {voice.state === "speaking" && (
            <button
              type="button"
              onClick={voice.interrupt}
              className="underline"
            >
              말하기
            </button>
          )}
          {voice.recording && (
            <button
              type="button"
              onClick={voice.finishRecording}
              className="underline"
            >
              보내기
            </button>
          )}
        </div>
      )}
      {(error || voice.error) && (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--lh-danger)]"
        >
          <span className="flex-1">{error || voice.error}</span>
          <button
            type="button"
            aria-label="오류 닫기"
            onClick={() => {
              setError("");
              voice.clearError();
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
  const modal = dialog ? (
    <StudyDialog
      title={
        dialog === "library"
          ? "자료함"
          : dialog === "research"
            ? "자료 찾기"
            : selectedResult?.title || "학습 결과"
      }
      close={() => setDialog(null)}
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-[var(--lh-danger)]">
          {error}
        </p>
      )}
      {dialog === "library" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["sources", "notes", "results"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                className={`${studyButton} ${tab === t ? "bg-[var(--lh-primary-subtle)]" : ""}`}
                onClick={() => {
                  setTab(t);
                  setQuery("");
                }}
              >
                {{ sources: "자료", notes: "메모", results: "결과" }[t]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              aria-label="자료 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색"
              className="min-w-0 flex-1 rounded-xl border border-[var(--lh-line)] bg-transparent px-3 py-2 text-sm"
            />
            {tab !== "results" && (
              <select
                aria-label="과목"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                className="max-w-48 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-2 text-sm"
              >
                <option value="">전체 과목</option>
                {StorageService.getCourses().map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          {tab === "results" ? (
            <div className="space-y-2">
              {library.results
                .filter((r) => r.scope === scope && r.title.includes(query))
                .map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-xl border border-[var(--lh-line)] px-3"
                  >
                    <button
                      className="min-h-12 min-w-0 flex-1 truncate text-left text-sm"
                      onClick={() => openResult(r.id)}
                    >
                      {r.title}
                      <span className="ml-2 text-xs text-[var(--lh-ink-tertiary)]">
                        {STUDY_ACTIONS[r.action]}
                      </span>
                    </button>
                    <button
                      aria-label={`${r.title} 삭제`}
                      className={iconButton}
                      onClick={() => {
                        try {
                          setLibrary(
                            updateStudyLibrary((l) => ({
                              ...l,
                              results: l.results.filter((x) => x.id !== r.id),
                            })),
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              {!library.results.some((r) => r.scope === scope) && (
                <p className="py-6 text-center text-sm text-[var(--lh-ink-tertiary)]">
                  저장된 결과 없음
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleSources.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[var(--lh-line)] px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        aria-label={`${s.title} 참고`}
                        checked={ids.includes(s.id)}
                        disabled={working}
                        onChange={() => choose(s.id)}
                      />
                      <details className="min-w-0 flex-1">
                        <summary className="cursor-pointer truncate py-1 text-sm">
                          {s.title}
                        </summary>
                        <pre className="my-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs leading-6">
                          {s.text}
                        </pre>
                        {s.url && (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline"
                          >
                            원문
                          </a>
                        )}
                        {tab === "sources" && (
                          <select
                            aria-label={`${s.title} 과목 변경`}
                            value={s.courseId || ""}
                            className="mt-2 w-full rounded border border-[var(--lh-line)] bg-[var(--lh-surface)] p-2 text-xs"
                            onChange={(e) => {
                              const course = e.target.value;
                              try {
                                setLibrary(
                                  updateStudyLibrary((l) => ({
                                    ...l,
                                    sources: l.sources.map((x) =>
                                      x.id === s.id
                                        ? {
                                            ...x,
                                            courseId: course || undefined,
                                            updatedAt: new Date().toISOString(),
                                          }
                                        : x,
                                    ),
                                  })),
                                );
                              } catch (e) {
                                setError((e as Error).message);
                              }
                            }}
                          >
                            <option value="">공통 자료</option>
                            {StorageService.getCourses().map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.title}
                              </option>
                            ))}
                          </select>
                        )}
                      </details>
                      {tab === "sources" && (
                        <button
                          type="button"
                          aria-label={`${s.title} 삭제`}
                          className={iconButton}
                          onClick={() => removeSource(s.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!visibleSources.length && (
                  <p className="py-6 text-center text-sm text-[var(--lh-ink-tertiary)]">
                    {tab === "notes" ? "메모 없음" : "자료 없음"}
                  </p>
                )}
              </div>
              {tab === "sources" && (
                <button
                  type="button"
                  className={studyButton}
                  disabled={disabled}
                  onClick={() => files.current?.click()}
                >
                  <FilePlus2 size={15} />
                  파일 첨부
                </button>
              )}
            </>
          )}
        </div>
      )}
      {dialog === "research" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              aria-label="검색어 또는 링크"
              placeholder="검색어 또는 HTTPS 링크"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void search();
                }
              }}
              className="min-w-0 flex-1 rounded-xl border border-[var(--lh-line)] bg-transparent px-3 py-2"
            />
            <button
              type="button"
              className={studyButton}
              disabled={working || !query.trim()}
              onClick={() => void search()}
            >
              {working ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              찾기
            </button>
          </div>
          {research && (
            <>
              <RichLessonRenderer content={research.text} />
              <div className="space-y-2">
                {research.sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <a
                      className="min-w-0 flex-1 truncate text-sm underline"
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.title}
                    </a>
                    <button
                      type="button"
                      className={studyButton}
                      disabled={working}
                      onClick={() => void importLink(s.url)}
                    >
                      {"\ucd94\uac00"}
                    </button>
                  </div>
                ))}
                {research.requestedUrl && (
                  <a
                    href={research.requestedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm underline"
                  >
                    요청한 원문
                  </a>
                )}
              </div>
              {research.searchHtml && (
                <iframe
                  title="Google 검색 제안"
                  sandbox=""
                  className="h-32 w-full border-0"
                  srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:">${research.searchHtml}`}
                />
              )}
              <button
                type="button"
                className={studyButton}
                onClick={() => {
                  try {
                    saveSource({
                      id: uid(),
                      title: `웹 조사: ${query}`.slice(0, 200),
                      kind: "web",
                      text: `[AI가 작성한 웹 조사 요약]\n${research.text}\n\n${research.sources.map((s) => `${s.title}\n${s.url}`).join("\n")}`,
                      ...(research.requestedUrl
                        ? { url: research.requestedUrl }
                        : research.sources[0]
                          ? { url: research.sources[0].url }
                          : {}),
                      ...(folder ? { courseId: folder } : {}),
                      updatedAt: new Date().toISOString(),
                    });
                    setDialog(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                조사 요약 추가
              </button>
            </>
          )}
        </div>
      )}
      {dialog === "result" && selectedResult && (
        <StudyResultView
          key={selectedResult.id}
          result={selectedResult}
          sources={allSources()}
        />
      )}
    </StudyDialog>
  ) : null;
  return {
    toolbar,
    status,
    modal,
    answer,
    renderResultLink,
    working,
    active: chosen.length > 0 || action !== "chat",
    action,
    ingest,
    voice,
    defaultQuestion:
      action !== "chat"
        ? `${STUDY_ACTIONS[action]}해 줘`
        : chosen.length
          ? "이 자료를 설명해 줘"
          : "",
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files);
    },
  };
}
