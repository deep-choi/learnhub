import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Play, Pause } from "lucide-react";
import type { StudyResult, StudySource } from "../../domain/study";
import { getNote, saveNote } from "../../services/noteStore";
import {
  downloadSlides,
  downloadStudyBlob,
  downloadStudyVideo,
  downloadVisual,
} from "../../services/studyVisual";
import { RichLessonRenderer } from "../notion/RichLessonRenderer";
import { studyDiagramUrl } from "../../domain/studyDiagram";
import { answerStudyQuiz, restartStudyQuiz } from "../../services/studyQuiz";
import { getKnownLocalOwnerId } from "../../services/cloudSync";
export const studyButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--lh-line)] px-3 py-2 text-sm transition hover:bg-[var(--lh-surface-subtle)] disabled:opacity-40";
export const StudyResultView: React.FC<{
  result: StudyResult;
  sources: StudySource[];
}> = ({ result, sources }) => {
  const [card, setCard] = useState(0),
    [flipped, setFlipped] = useState(false),
    [answers, setAnswers] = useState<Record<number, number>>(result.quizProgress?.answers || {}),
    [slide, setSlide] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<number | null>(null),
    [applied, setApplied] = useState<
      Record<number, { before: string; after: string }>
    >({});
  const abort = useRef<AbortController | null>(null);
  const owner = useRef(getKnownLocalOwnerId());
  useEffect(() => setAnswers(result.quizProgress?.answers || {}), [result.quizProgress]);
  const answerQuestion = (index?: number, option?: number) => {
    setError("");
    try {
      if (owner.current !== getKnownLocalOwnerId()) throw new Error("계정이 변경되었습니다.");
      const updated = index === undefined ? restartStudyQuiz(result.id) : answerStudyQuiz(result.id, index, option!);
      setAnswers(updated.quizProgress!.answers);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setSlide((i) => {
          if (i + 1 >= result.slides!.length) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      8000,
    );
    return () => clearInterval(timer);
  }, [playing, result.id]);
  const apply = (index: number, undo = false) => {
    setError("");
    const correction = result.corrections![index];
    if (!correction.sourceId.startsWith("note:")) return;
    window.dispatchEvent(new Event("learnhub:flush-notes"));
    const note = getNote(correction.sourceId.slice(5));
    if (!note) {
      setError("메모를 찾을 수 없습니다.");
      return;
    }
    const prior = applied[index];
    if (undo) {
      if (!prior || note.body !== prior.after) {
        setError("메모가 변경되어 되돌릴 수 없습니다.");
        return;
      }
      const saved = saveNote({
        id: note.id,
        title: note.title,
        body: prior.before,
      });
      if (!saved.ok) {
        setError("메모를 저장하지 못했습니다.");
        return;
      }
      setApplied((a) => {
        const next = { ...a };
        delete next[index];
        return next;
      });
      return;
    }
    if (
      !note.body.includes(correction.before) ||
      note.body.indexOf(correction.before) !==
        note.body.lastIndexOf(correction.before)
    ) {
      setError("원문이 변경되었습니다. 다시 교정해 주세요.");
      return;
    }
    const next = note.body.replace(correction.before, () => correction.after);
    const saved = saveNote({ id: note.id, title: note.title, body: next });
    if (!saved.ok) {
      setError("메모를 저장하지 못했습니다.");
      return;
    }
    setApplied((a) => ({ ...a, [index]: { before: note.body, after: next } }));
  };
  const exportResult = async () => {
    setError("");
    try {
      if (result.action === "visual") await downloadVisual(result);
      else if (result.action === "slides") downloadSlides(result);
      else if (result.action === "video") {
        const controller = new AbortController();
        abort.current = controller;
        setProgress(0);
        await downloadStudyVideo(result, controller.signal, setProgress);
      } else
        downloadStudyBlob(
          new Blob(
            [
              `# ${result.title}\n\n${result.reply}\n\n${result.cards?.map((c) => `Q. ${c.front}\nA. ${c.back}`).join("\n\n") || result.questions?.map((q) => `${q.question}\n${q.options.join("\n")}\n정답: ${q.options[q.answer]}\n${q.explanation}`).join("\n\n") || result.corrections?.map((c) => `${c.before}\n→ ${c.after}\n${c.reason}`).join("\n\n") || ""}\n\n${result.citations.map((c, i) => `[${i + 1}] ${sources.find((s) => s.id === c.sourceId)?.title || c.sourceId}\n> ${c.quote}`).join("\n\n")}`,
            ],
            { type: "text/markdown;charset=utf-8" },
          ),
          `${result.title}.md`,
        );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };
  const current = result.slides?.[slide];
  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        {progress !== null ? (
          <button
            className={studyButton}
            onClick={() => abort.current?.abort()}
          >
            저장 중 {progress}% · 취소
          </button>
        ) : (
          <button className={studyButton} onClick={() => void exportResult()}>
            <Download size={15} />
            {result.action === "video"
              ? "WebM 저장"
              : result.action === "visual"
                ? "PNG 저장"
                : result.action === "slides"
                  ? "슬라이드 저장"
                  : "저장"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--lh-danger)]">
          {error}
        </p>
      )}
      <RichLessonRenderer content={result.reply} />
      {result.cards?.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setFlipped((x) => !x)}
            aria-label={flipped ? "질문 보기" : "답 보기"}
            className="flex min-h-56 w-full items-center justify-center rounded-2xl border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] p-8 text-center text-lg leading-8"
          >
            {flipped ? result.cards[card].back : result.cards[card].front}
          </button>
          <div className="flex items-center justify-between">
            <button
              aria-label="이전 카드"
              disabled={!card}
              className={studyButton}
              onClick={() => {
                setCard((i) => i - 1);
                setFlipped(false);
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm">
              {card + 1} / {result.cards.length} · {flipped ? "답" : "질문"}
            </span>
            <button
              aria-label="다음 카드"
              disabled={card === result.cards.length - 1}
              className={studyButton}
              onClick={() => {
                setCard((i) => i + 1);
                setFlipped(false);
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      {result.questions?.map((q, i) => (
        <fieldset
          key={i}
          className="space-y-3 rounded-2xl border border-[var(--lh-line)] p-4"
        >
          <legend className="px-1 text-sm">{i + 1}</legend>
          <p className="font-medium">{q.question}</p>
          <div className="grid gap-2">
            {q.options.map((option, j) => (
              <button
                key={j}
                type="button"
                disabled={answers[i] !== undefined}
                onClick={() => answerQuestion(i, j)}
                className={`${studyButton} justify-start! text-left ${answers[i] !== undefined && j === q.answer ? "border-[var(--lh-primary)]! bg-[var(--lh-primary-subtle)] disabled:opacity-100!" : ""}`}
                aria-pressed={answers[i] === j}
              >
                {option}
              </button>
            ))}
          </div>
          {answers[i] !== undefined && (
            <p className="text-sm leading-7">
              {answers[i] === q.answer ? "정답" : "다시 확인"} · {q.explanation}
            </p>
          )}
        </fieldset>
      ))}
      {result.questions?.length > 0 &&
        Object.keys(answers).length === result.questions.length && (
          <div className="flex items-center justify-between">
            <span>
              {
                result.questions.filter((q, i) => answers[i] === q.answer)
                  .length
              }{" "}
              / {result.questions.length} 정답
            </span>
            <button className={studyButton} onClick={() => answerQuestion()}>
              다시 풀기
            </button>
          </div>
        )}
      {result.action === "visual" && (
        <figure><img src={studyDiagramUrl(result)} alt={`${result.title}: ${result.diagram?.nodes.map(n => `${n.label} ${n.items.join(", ")}`).join(" → ") || result.slides?.map(s => s.title).join(" → ")}`} className="w-full rounded-2xl" /></figure>
      )}
      {current && result.action !== "visual" && (
        <div className="space-y-3">
          <div className="flex min-h-72 flex-col justify-center rounded-2xl bg-[var(--lh-primary-subtle)] p-6 sm:p-9">
            <h3 className="mb-5 text-2xl font-medium">{current.title}</h3>
            <p className="leading-8">{current.body}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
              {current.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-between">
            <button
              aria-label="이전 슬라이드"
              className={studyButton}
              disabled={!slide}
              onClick={() => setSlide((i) => i - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {result.action === "video" && (
              <button
                className={studyButton}
                onClick={() => {
                  if (slide === result.slides!.length - 1) setSlide(0);
                  setPlaying((p) => !p);
                }}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
                {playing ? "일시정지" : "재생"}
              </button>
            )}
            <span className="text-sm">
              {slide + 1} / {result.slides!.length}
            </span>
            <button
              aria-label="다음 슬라이드"
              className={studyButton}
              disabled={slide === result.slides!.length - 1}
              onClick={() => setSlide((i) => i + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      {result.corrections?.map((c, i) => (
        <div
          key={i}
          className="space-y-3 rounded-2xl border border-[var(--lh-line)] p-4"
        >
          <p className="whitespace-pre-wrap text-sm text-[var(--lh-ink-secondary)] line-through">
            {c.before}
          </p>
          <p className="whitespace-pre-wrap leading-7">{c.after}</p>
          <p className="text-sm text-[var(--lh-ink-secondary)]">{c.reason}</p>
          {c.sourceId.startsWith("note:") && (
            <button
              className={studyButton}
              onClick={() => apply(i, !!applied[i])}
            >
              {applied[i] ? "되돌리기" : "메모에 반영"}
            </button>
          )}
        </div>
      ))}
      {result.citations.length > 0 && (
        <div className="space-y-2 border-t border-[var(--lh-line)] pt-4">
          {result.citations.map((c, i) => {
            const source = sources.find((s) => s.id === c.sourceId);
            return (
              <details
                key={i}
                className="rounded-xl bg-[var(--lh-surface-subtle)] px-3 py-2 text-sm"
              >
                <summary className="cursor-pointer">
                  [{i + 1}] {source?.title || "저장된 인용"}
                </summary>
                <blockquote className="my-3 whitespace-pre-wrap border-l-2 border-[var(--lh-primary)] pl-3 leading-7">
                  {c.quote}
                </blockquote>
                {source?.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    원문
                  </a>
                )}
                {source && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">자료 보기</summary>
                    <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap py-3 font-sans text-sm leading-6">
                      {source.text}
                    </pre>
                  </details>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
};
