import React, { useEffect, useState } from "react";
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
  }, [courseId, isOpen, lessonId, stepId]);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-xl border border-[#E9E9E7] bg-white p-5 shadow-2xl text-[#2F3437]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-[#191919]">내용 오류 신고</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-[#787774]">질문·정답은 자동으로 보내지 않습니다.</p>
          </div>
          <button type="button" onClick={onClose} className="text-xs text-[#787774]" disabled={isSubmitting}>닫기</button>
        </div>

        {isReceived ? (
          <div className="mt-5 space-y-3 text-xs">
            <p className="rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-3 leading-relaxed text-[#191919]">신고가 접수되었습니다. 접수 번호: {result.id}</p>
            <p className="text-[11px] text-[#787774]">접수 완료 상태이며, 검토 완료를 의미하지는 않습니다.</p>
            <button type="button" onClick={onClose} className="w-full rounded-md bg-[#191919] py-2 text-xs font-semibold text-white">확인</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            {result?.status === "draft" && <p className="rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-3 text-xs text-[#191919]">기기에 임시 저장, 미접수</p>}
            {result?.status === "save_failed" && <p className="rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-3 text-xs text-[#191919]">기기에 저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.</p>}
            {drafts.length > 0 && (
              <label className="block space-y-1 text-[11px] font-semibold text-[#787774]">
                이 레슨의 저장된 초안
                <select defaultValue="" onChange={(event) => {
                  const draft = drafts[Number(event.target.value)];
                  if (draft) {
                    setCategory(draft.category);
                    setDescription(draft.description);
                    setResult(null);
                  }
                }} className="w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-xs font-normal text-[#2F3437]">
                  <option value="">초안 선택…</option>
                  {drafts.map((draft, index) => <option key={`${draft.createdAt}-${index}`} value={index}>{new Date(draft.createdAt).toLocaleString()} · {draft.category}</option>)}
                </select>
              </label>
            )}
            <label className="block space-y-1 text-xs font-semibold text-[#191919]">
              신고 유형
              <select value={category} onChange={(event) => setCategory(event.target.value as ContentReportCategory)} className="w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-xs font-normal">
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-xs font-semibold text-[#191919]">
              어떤 점이 문제인가요?
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={1000} placeholder="문제가 보인 위치와 이유를 적어주세요." className="w-full resize-none rounded-md border border-[#E9E9E7] px-3 py-2 text-xs font-normal leading-relaxed focus:border-[#191919] focus:outline-none" />
            </label>
            <button type="submit" disabled={!description.trim() || isSubmitting} className="w-full rounded-md bg-[#191919] py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              {isSubmitting ? "접수 상태 확인 중..." : result ? "다시 제출" : "신고 제출"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
