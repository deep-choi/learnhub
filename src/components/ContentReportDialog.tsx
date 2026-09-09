import React, { useEffect, useRef, useState } from "react";
import {
  AccessTokenGetter,
  ContentReportCategory,
  ContentReportDraft,
  ContentReportResult,
  getContentReportDrafts,
  submitContentReport,
} from "../services/contentReports";

interface ContentReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  courseId?: string;
  lessonId?: string;
  stepId?: string;
  getAccessToken?: AccessTokenGetter;
}

const CATEGORIES: Array<{ value: ContentReportCategory; label: string }> = [
  { value: "wrong_answer", label: "정답·채점이 이상함" },
  { value: "inaccurate", label: "내용이 부정확함" },
  { value: "unclear", label: "설명이 이해하기 어려움" },
  { value: "rendering", label: "표시가 깨짐" },
  { value: "other", label: "기타" },
];

export const ContentReportDialog: React.FC<ContentReportDialogProps> = ({
  isOpen,
  onClose,
  courseId,
  lessonId,
  stepId,
  getAccessToken,
}) => {
  const [category, setCategory] = useState<ContentReportCategory>("unclear");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<ContentReportResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [drafts, setDrafts] = useState<ContentReportDraft[]>([]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setCategory("unclear");
      setDescription("");
      setResult(null);
      setIsSubmitting(false);
      setDrafts([]);
      return;
    }
    const savedDrafts = getContentReportDrafts({ courseId, lessonId, stepId });
    setDrafts(savedDrafts);
    const latestDraft = savedDrafts[savedDrafts.length - 1];
    if (latestDraft) {
      setCategory(latestDraft.category);
      setDescription(latestDraft.description);
    }
    closeButtonRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [courseId, isOpen, lessonId, stepId, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim() || isSubmitting) return;
    setIsSubmitting(true);
    const nextResult = await submitContentReport(
      { category, description, courseId, lessonId, stepId },
      { getAccessToken },
    );
    setResult(nextResult);
    setDrafts(getContentReportDrafts({ courseId, lessonId, stepId }));
    setIsSubmitting(false);
  };

  const isReceived = result?.status === "received";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="content-report-title" className="w-full max-w-sm rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 text-[var(--lh-ink)] shadow-2xl animate-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="content-report-title" className="text-lg font-medium text-[var(--lh-ink)]">내용 오류 신고</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--lh-ink-secondary)] font-normal">질문·정답은 자동으로 보내지 않습니다.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="오류 신고 닫기" className="flex min-h-9 min-w-9 items-center justify-center rounded-full text-xs font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer" disabled={isSubmitting}>닫기</button>
        </div>

        {isReceived ? (
          <div className="mt-5 space-y-3 text-xs">
            <p className="rounded-2xl border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] p-3.5 leading-relaxed text-[var(--lh-primary-text)] font-normal">신고가 접수되었습니다. 접수 번호: {result.id}</p>
            <p className="text-[11px] text-[var(--lh-ink-secondary)] font-normal">접수 완료 상태이며, 검토 완료를 의미하지는 않습니다.</p>
            <button type="button" onClick={onClose} className="w-full rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] py-2.5 text-xs font-medium text-white transition cursor-pointer">확인</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            {result?.status === "draft" && <p className="rounded-xl border border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] p-3 text-xs text-[var(--lh-secondary-text)] font-normal">기기에 임시 저장, 미접수</p>}
            {result?.status === "save_failed" && <p className="rounded-xl border border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] p-3 text-xs text-[var(--lh-secondary-text)] font-normal">기기에 저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.</p>}
            {drafts.length > 0 && (
              <label className="block space-y-1 text-[11px] font-medium text-[var(--lh-ink-secondary)]">
                이 레슨의 저장된 초안
                <select aria-label="저장된 신고 초안" defaultValue="" onChange={(event) => {
                  const draft = drafts[Number(event.target.value)];
                  if (draft) {
                    setCategory(draft.category);
                    setDescription(draft.description);
                    setResult(null);
                  }
                }} className="min-h-11 w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 py-2 text-sm font-normal text-[var(--lh-ink)]">
                  <option value="">초안 선택…</option>
                  {drafts.map((draft, index) => <option key={`${draft.createdAt}-${index}`} value={index}>{new Date(draft.createdAt).toLocaleString()} · {draft.category}</option>)}
                </select>
              </label>
            )}
            <label className="block space-y-1 text-xs font-medium text-[var(--lh-ink)]">
              신고 유형
              <select id="content-report-category" value={category} onChange={(event) => setCategory(event.target.value as ContentReportCategory)} className="min-h-11 w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 py-2 text-sm font-normal">
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-xs font-medium text-[var(--lh-ink)]">
              어떤 점이 문제인가요?
              <textarea id="content-report-description" aria-label="오류 설명" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={1000} placeholder="문제가 보인 위치와 이유를 적어주세요." className="min-h-28 w-full resize-none rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 py-2 text-sm font-normal leading-relaxed focus:border-[var(--lh-primary)] focus:outline-none" />
            </label>
            <button type="submit" disabled={!description.trim() || isSubmitting} className="flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-4 text-sm font-medium text-white transition cursor-pointer disabled:opacity-40">
              {isSubmitting ? "접수 상태 확인 중..." : result ? "다시 제출" : "신고 제출"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
