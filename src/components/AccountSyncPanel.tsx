import React, { useState } from "react";
import { Download, FileUp, ShieldCheck } from "lucide-react";
import { getAuthStatus } from "../services/authClient";
import {
  BackupConflictStrategy,
  BackupPreview,
  LearningBackupDocument,
  createLearningBackup,
  downloadLearningBackup,
  importLearningBackup,
  previewLearningBackup,
  readLearningBackupFile,
} from "../services/learningBackup";

export interface AccountSyncPanelProps {
  onDataChanged?: () => void;
}

const strategyLabels: Record<BackupConflictStrategy, string> = {
  preserve: "현재 데이터 유지",
  merge: "겹치지 않는 항목만 합치기",
  overwrite: "가져온 데이터로 덮어쓰기",
};

const strategyDescriptions: Record<BackupConflictStrategy, string> = {
  preserve: "같은 항목이 있으면 현재 데이터를 그대로 둡니다.",
  merge: "같은 항목은 현재 값을 유지하고, 없는 항목만 추가합니다.",
  overwrite: "같은 항목을 백업 내용으로 바꿉니다. 적용 전 백업을 저장할 수 있습니다.",
};

const categoryLabels: Record<string, string> = {
  courses: "과목 저장 묶음",
  skills: "실력 기록 저장 묶음",
  progress: "학습 진도 저장 묶음",
  reviews: "복습 문제 저장 묶음",
  mistakes: "오답 기록 저장 묶음",
  quizAttempts: "퀴즈 기록 저장 묶음",
  lessonCache: "레슨 내용 저장 묶음",
  notes: "메모 저장 묶음",
  scratchpad: "연습장 저장 묶음",
  tutor: "튜터 대화 저장 묶음",
};

const formatCounts = (preview: BackupPreview) =>
  Object.entries(preview.counts)
    .map(([category, count]) => `${categoryLabels[category] || "학습 항목"} ${count}개`)
    .join(" · ");

/** Standalone local backup surface; it does not initiate authentication or sync. */
export const AccountSyncPanel: React.FC<AccountSyncPanelProps> = ({ onDataChanged }) => {
  const [pendingBackup, setPendingBackup] = useState<LearningBackupDocument | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [strategy, setStrategy] = useState<BackupConflictStrategy>("preserve");
  const [safetyBackup, setSafetyBackup] = useState<LearningBackupDocument | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const authStatus = getAuthStatus();

  const handleExport = () => {
    setErrorMessage("");
    try {
      downloadLearningBackup(createLearningBackup());
      setMessage("LearnHub 백업 파일을 저장했습니다.");
    } catch {
      setErrorMessage("백업 파일을 내보내지 못했습니다. 브라우저 저장소와 다운로드 권한을 확인해 주세요.");
    }
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setErrorMessage("");
    setMessage("");
    setSafetyBackup(null);
    try {
      const backup = await readLearningBackupFile(file);
      const nextPreview = previewLearningBackup(backup);
      setPendingBackup(backup);
      setPreview(nextPreview);
      setMessage("백업 파일을 읽었습니다. 내용을 확인한 뒤 가져오기를 적용하세요.");
    } catch (error) {
      setPendingBackup(null);
      setPreview(null);
      setErrorMessage(error instanceof Error ? error.message : "백업 파일을 확인하지 못했습니다.");
    }
  };

  const handleImport = () => {
    if (!pendingBackup || !preview?.valid) return;
    setErrorMessage("");
    const result = importLearningBackup(pendingBackup, { strategy });
    if (result.safetyBackup) setSafetyBackup(result.safetyBackup);
    if (!result.ok) {
      setErrorMessage(result.error || "백업을 가져오지 못했습니다.");
      return;
    }
    onDataChanged?.();
    const warning = result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";
    setMessage(`가져오기를 완료했습니다. ${result.importedEntries}개 저장 묶음을 적용했고, ${result.skippedEntries}개는 현재 데이터를 유지했습니다.${warning}`);
    setPendingBackup(null);
    setPreview(null);
  };

  return (
    <section className="rounded-xl border border-[#E9E9E7] bg-white p-5 text-[#2F3437] shadow-sm" aria-label="계정 및 데이터 백업">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#787774]" />
        <div>
          <h2 className="text-sm font-semibold text-[#191919]">계정 및 학습 데이터</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#787774]">
            실제 로그인/클라우드 연결 준비 중, 공급자 선택 필요
          </p>
          <p className="mt-1 text-[11px] text-[#9B9A97]">
            {authStatus.configured ? "인증 어댑터가 연결되어 있습니다." : "현재는 이 브라우저의 로컬 학습 데이터만 사용할 수 있습니다."}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#191919] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#37352F]"
        >
          <Download className="h-3.5 w-3.5" />
          백업 파일 저장
        </button>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#D9D9D6] bg-[#FBFBFA] px-3 py-2.5 text-xs font-semibold text-[#37352F] transition hover:bg-[#F1F1EF]">
          <FileUp className="h-3.5 w-3.5" />
          백업 파일 불러오기
          <input type="file" accept="application/json,.json" onChange={handleFileSelected} className="sr-only" />
        </label>
      </div>

      {preview && (
        <div className="mt-4 rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-3 text-xs">
          <p className="font-semibold text-[#191919]">가져오기 미리보기</p>
          <p className="mt-1 text-[#787774]">{formatCounts(preview) || "학습 데이터 없음"}</p>
          <p className="mt-1 text-[#787774]">
            새 항목 {preview.newEntries}개 · 겹치는 항목 {preview.conflictingEntries}개
          </p>
          {preview.conflictingEntries > 0 && (
            <label className="mt-3 block text-[#37352F]">
              <span className="mb-1 block font-semibold">충돌 처리</span>
              <select
                value={strategy}
                onChange={(event) => setStrategy(event.target.value as BackupConflictStrategy)}
                className="w-full rounded-md border border-[#D9D9D6] bg-white px-2 py-2 text-xs"
              >
                {Object.entries(strategyLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-[#787774]">{strategyDescriptions[strategy]}</span>
            </label>
          )}
          <button
            type="button"
            onClick={handleImport}
            className="mt-3 w-full rounded-lg bg-[#37352F] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#191919]"
          >
            확인 후 가져오기 적용
          </button>
        </div>
      )}

      {safetyBackup && (
        <div className="mt-4 rounded-lg border border-[#E5D5A5] bg-[#FFFCF0] p-3 text-xs">
          <p className="font-semibold text-[#5E4B16]">가져오기 전 백업을 보관할 수 있어요</p>
          <p className="mt-1 leading-relaxed text-[#786A3C]">
            적용 전 현재 학습 데이터를 저장해 두면, 덮어쓰기나 복구가 불확실한 경우 직접 되돌릴 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                downloadLearningBackup(safetyBackup);
                setMessage("가져오기 전 백업 파일을 저장했습니다.");
              } catch {
                setErrorMessage("가져오기 전 백업 파일을 저장하지 못했습니다.");
              }
            }}
            className="mt-2 rounded-lg border border-[#CBBE8E] bg-white px-3 py-2 font-semibold text-[#5E4B16] transition hover:bg-[#FFF8D9]"
          >
            가져오기 전 백업 저장
          </button>
        </div>
      )}

      {message && <p className="mt-3 text-xs text-[#497A5A]" role="status">{message}</p>}
      {errorMessage && <p className="mt-3 text-xs text-[#9B1C1C]" role="alert">{errorMessage}</p>}
      <p className="mt-4 text-[10px] leading-relaxed text-[#9B9A97]">
        백업에는 LearnHub 학습 기록만 포함되며 로그인·세션·토큰 정보와 다른 앱의 저장값은 포함하지 않습니다.
      </p>
    </section>
  );
};
