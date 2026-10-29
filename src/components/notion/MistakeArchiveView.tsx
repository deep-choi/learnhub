import React, { useState, useEffect } from "react";
import { ArrowRight, Check, Printer, Trash2 } from "lucide-react";
import { Course, MistakeItem } from "../../types/learning";
import { StorageService } from "../../services/storage";
import { NotionPageView } from "./Sidebar";
import { getStudyLibrary } from "../../services/studyStore";
import { StudyDialog } from "../study/StudyDialog";
import { StudyResultView } from "../study/StudyResultView";
import { AssessmentPrintSheet, type PrintMode } from "../AssessmentPrintSheet";
import type { AssessmentQuestion } from "../../domain/assessment";

interface MistakeArchiveViewProps {
  courses?: Course[];
  onSelectView?: (view: NotionPageView) => void;
  /** 학습 기록 탭 안에 들어갈 때는 페이지 제목과 바깥 여백을 빼요. */
  embedded?: boolean;
}

type StatusFilter = "unresolved" | "resolved" | "all";

const TAG_LABELS: Record<MistakeItem["misconceptionTag"], string> = {
  "개념 미숙": "개념 이해 필요",
  "계산 착오": "계산 실수",
  "조건 누락": "문제 조건 놓침",
};

const formatDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
};

/** 오답을 서술형 문항으로 바꿔 시험지 인쇄에 씁니다. 정답은 정답지에만 나옵니다. */
const toPrintQuestion = (item: MistakeItem): AssessmentQuestion => ({
  id: item.id,
  lessonId: item.lessonId || "",
  conceptId: item.conceptId || item.concept,
  conceptName: item.concept,
  type: "essay",
  question: item.question,
  answer: item.correctAnswer,
  explanation: item.explanation,
  criteria: [],
});

export const MistakeArchiveView: React.FC<MistakeArchiveViewProps> = ({
  courses = [],
  onSelectView,
  embedded = false,
}) => {
  const [items, setItems] = useState<MistakeItem[]>([]);
  const [studyLibrary, setStudyLibrary] = useState(getStudyLibrary);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const review = studyLibrary.results.find(result => result.id === reviewId);
  const [filterStatus, setFilterStatus] = useState<StatusFilter | null>(null);
  const [filterTag, setFilterTag] = useState<string>("all");
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);

  const loadMistakes = () => {
    setItems(StorageService.getMistakes());
    setStudyLibrary(getStudyLibrary());
  };

  useEffect(() => {
    loadMistakes();
    window.addEventListener("learnhub:data-changed", loadMistakes);
    window.addEventListener("storage", loadMistakes);
    return () => {
      window.removeEventListener("learnhub:data-changed", loadMistakes);
      window.removeEventListener("storage", loadMistakes);
    };
  }, []);

  const handleToggleResolved = (id: string) => {
    StorageService.toggleMistakeResolved(id);
    loadMistakes();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    StorageService.removeMistake(id);
    loadMistakes();
  };

  const handleJumpToLesson = (item: MistakeItem) => {
    if (item.studyResultId && studyLibrary.results.some(result => result.id === item.studyResultId)) {
      setReviewId(item.studyResultId);
      return;
    }
    if (!onSelectView) return;

    let targetCourse: Course | undefined;
    let targetLesson: any;
    let chapterTitle = "";

    if (item.courseId) {
      targetCourse = courses.find((c) => c.id === item.courseId);
    } else if (item.course) {
      const titleMatches = courses.filter((c) => c.title === item.course);
      if (titleMatches.length === 1) targetCourse = titleMatches[0];
    }

    if (!targetCourse) {
      const conceptMatches = courses.filter((course) =>
        course.chapters.some((chapter) =>
          chapter.lessons.some(
            (lesson) =>
              (item.conceptId && lesson.conceptId === item.conceptId) ||
              lesson.conceptName === item.concept,
          ),
        ),
      );
      if (conceptMatches.length === 1) targetCourse = conceptMatches[0];
    }

    if (targetCourse) {
      for (const ch of targetCourse.chapters) {
        const found = ch.lessons.find(
          (l) =>
            l.id === item.lessonId ||
            (item.conceptId && l.conceptId === item.conceptId) ||
            l.conceptName === item.concept
        );
        if (found) {
          targetLesson = found;
          chapterTitle = ch.title;
          break;
        }
      }

      if (targetLesson) {
        onSelectView({
          type: "lesson",
          course: targetCourse,
          lesson: targetLesson,
          chapterTitle,
        });
      }
    }
  };

  const unresolvedCount = items.filter((i) => !i.isResolved).length;
  const resolvedCount = items.length - unresolvedCount;
  // 다시 볼 문제가 없으면 처음부터 전체를 보여 줘요.
  const status: StatusFilter = filterStatus ?? (unresolvedCount > 0 ? "unresolved" : "all");
  const filteredItems = items.filter((item) => {
    if (status === "unresolved" && item.isResolved) return false;
    if (status === "resolved" && !item.isResolved) return false;
    if (filterTag !== "all" && item.misconceptionTag !== filterTag) return false;
    return true;
  });
  const canReview = (item: MistakeItem) => Boolean(onSelectView || item.studyResultId);
  const statusTabs: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: "unresolved", label: "다시 볼 문제", count: unresolvedCount },
    { id: "resolved", label: "해결한 문제", count: resolvedCount },
    { id: "all", label: "전체", count: items.length },
  ];

  return (
    <div className={embedded ? "space-y-6 text-[var(--lh-ink)]" : "mx-auto w-full max-w-[880px] space-y-6 px-5 py-12 text-[var(--lh-ink)] sm:px-8"}>
      {!embedded && (
        <header className="space-y-2">
          <h1 className="text-3xl font-medium tracking-[-0.03em] sm:text-4xl">오답 기록</h1>
          <p className="text-sm text-[var(--lh-ink-secondary)]">틀린 이유와 정답을 비교하고 필요한 문제만 다시 학습하세요.</p>
        </header>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="오답 상태">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="radio"
              aria-checked={status === tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs transition cursor-pointer ${
                status === tab.id
                  ? "border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]"
                  : "border-[var(--lh-line)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)]"
              }`}
            >
              {tab.label}<span className="font-mono opacity-70">{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            aria-label="틀린 이유로 거르기"
            className="min-h-9 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3.5 text-xs text-[var(--lh-ink-secondary)] cursor-pointer"
          >
            <option value="all">모든 이유</option>
            {Object.entries(TAG_LABELS).map(([tag, label]) => <option key={tag} value={tag}>{label}</option>)}
          </select>
          <button
            type="button"
            disabled={!filteredItems.length}
            onClick={() => setPrintMode("answers")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3.5 text-xs transition hover:bg-[var(--lh-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <Printer size={14} />오답 시험지 PDF
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="space-y-2 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-6 py-12 text-center">
          <p className="text-base font-medium">
            {items.length === 0 ? "아직 틀린 문제가 없어요" : status === "unresolved" ? "다시 볼 문제를 모두 해결했어요" : "조건에 맞는 오답이 없어요"}
          </p>
          <p className="text-sm text-[var(--lh-ink-secondary)]">문제를 풀다 틀리면 여기에 자동으로 모여요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="space-y-4 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 shadow-xs sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-xs text-[var(--lh-ink-tertiary)]">{item.course}</p>
                  <h2 className="text-base font-medium leading-snug">{item.concept}</h2>
                </div>
                <div className="flex flex-none items-center gap-2 text-xs">
                  <span className="rounded-full bg-[var(--lh-secondary-subtle)] px-2.5 py-1 text-[var(--lh-secondary-text)]">{TAG_LABELS[item.misconceptionTag] || item.misconceptionTag}</span>
                  <span className="text-[var(--lh-ink-tertiary)]">{formatDate(item.date)}</span>
                </div>
              </div>

              <p className="text-sm leading-relaxed">{item.question}</p>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl bg-[var(--lh-surface-subtle)] px-4 py-3">
                  <p className="text-xs text-[var(--lh-ink-tertiary)]">내 답</p>
                  <p className="mt-1 break-words text-sm text-[var(--lh-ink-secondary)] line-through">{item.wrongAnswer || "—"}</p>
                </div>
                <div className="rounded-2xl bg-[var(--lh-primary-subtle)] px-4 py-3">
                  <p className="text-xs text-[var(--lh-primary-text)]">정답</p>
                  <p className="mt-1 break-words text-sm font-medium text-[var(--lh-primary-text)]">{item.correctAnswer}</p>
                </div>
              </div>

              {item.explanation && <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--lh-ink-secondary)]">{item.explanation}</p>}
              {item.hint && <p className="text-xs leading-relaxed text-[var(--lh-ink-secondary)]">힌트 · {item.hint}</p>}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--lh-line)] pt-4">
                <button
                  type="button"
                  aria-pressed={!!item.isResolved}
                  onClick={() => handleToggleResolved(item.id)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs transition cursor-pointer ${
                    item.isResolved
                      ? "border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]"
                      : "border-[var(--lh-line)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)]"
                  }`}
                >
                  <Check size={14} />{item.isResolved ? "해결함" : "이해했어요"}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => handleDelete(item.id, e)}
                    aria-label="오답 기록 삭제"
                    title="기록 삭제"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                  {canReview(item) && (
                    <button
                      type="button"
                      onClick={() => handleJumpToLesson(item)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--lh-primary)] px-4 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer"
                    >
                      다시 풀기<ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {review && <StudyDialog title={review.title} close={() => setReviewId(null)}>
        <StudyResultView key={review.id} result={review} sources={studyLibrary.sources} />
      </StudyDialog>}
      {printMode && (
        <AssessmentPrintSheet courseTitle="오답 노트" questions={filteredItems.map(toPrintQuestion)} mode={printMode} onDone={() => setPrintMode(null)} />
      )}
    </div>
  );
};
