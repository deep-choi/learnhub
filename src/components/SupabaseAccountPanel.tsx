import React, { useEffect, useRef, useState } from "react";
import { Cloud, Download, LogOut, Mail, RefreshCw, Upload } from "lucide-react";
import { AuthStatus, getAuthStatus, requestMagicLink, signOut } from "../services/authClient";
import { LEARNHUB_AUTH_CHANGED_EVENT } from "../services/supabaseClient";
import {
  BackupConflictStrategy,
  BackupPreview,
  LearningBackupDocument,
  downloadLearningBackup,
  previewLearningBackup,
} from "../services/learningBackup";
import {
  SnapshotConflictError,
  getCloudDataOwnerId,
  getKnownLocalOwner,
  getLearningSnapshot,
  restoreLearningSnapshot,
  saveCurrentLearningSnapshot,
} from "../services/cloudSync";

export interface SupabaseAccountPanelProps {
  onDataChanged?: () => void;
  accountDisplay?: string;
}

export const getAccountDisplay = (status: AuthStatus = getAuthStatus()): string => {
  if (!status.signedIn) return "로그인되지 않음";
  return status.email || "이메일 로그인 계정";
};

export const formatAccountDisplay = getAccountDisplay;

const strategyLabels: Record<BackupConflictStrategy, string> = {
  preserve: "현재 데이터 유지",
  merge: "겹치지 않는 항목만 합치기",
  overwrite: "가져온 데이터로 덮어쓰기",
};

const strategyDescriptions: Record<BackupConflictStrategy, string> = {
  preserve: "같은 항목이 있으면 현재 데이터를 그대로 둡니다.",
  merge: "같은 항목은 현재 값을 유지하고, 없는 항목만 추가합니다.",
  overwrite: "같은 항목을 클라우드 내용으로 바꿉니다. 적용 전 백업을 저장할 수 있습니다.",
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

const formatPreview = (preview: BackupPreview) =>
  Object.entries(preview.counts)
    .map(([category, count]) => `${categoryLabels[category] || "학습 항목 저장 묶음"} ${count}개`)
    .join(" · ");

export const SupabaseAccountPanel: React.FC<SupabaseAccountPanelProps> = ({
  onDataChanged,
  accountDisplay,
}) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => getAuthStatus());
  const [email, setEmail] = useState("");
  const [cloudSnapshot, setCloudSnapshot] = useState<Awaited<ReturnType<typeof getLearningSnapshot>>>(null);
  const [cloudPreview, setCloudPreview] = useState<BackupPreview | null>(null);
  const [strategy, setStrategy] = useState<BackupConflictStrategy>("preserve");
  const [recoveryBackup, setRecoveryBackup] = useState<LearningBackupDocument | null>(null);
  const [busyAction, setBusyAction] = useState<"login" | "load" | "save" | "restore" | "logout" | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const previousUserId = useRef<string | undefined>(authStatus.userId);

  useEffect(() => {
    const refreshAuthStatus = () => {
      const nextStatus = getAuthStatus();
      if (previousUserId.current !== nextStatus.userId) {
        setCloudSnapshot(null);
        setCloudPreview(null);
        setRecoveryBackup(null);
        setMessage("");
        setErrorMessage("");
      }
      previousUserId.current = nextStatus.userId;
      setAuthStatus(nextStatus);
    };
    window.addEventListener(LEARNHUB_AUTH_CHANGED_EVENT, refreshAuthStatus);
    return () => window.removeEventListener(LEARNHUB_AUTH_CHANGED_EVENT, refreshAuthStatus);
  }, []);

  const clearFeedback = () => {
    setMessage("");
    setErrorMessage("");
  };

  const handleMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();
    if (!authStatus.configured) {
      setErrorMessage("공개 설정을 불러오지 못해 실제 로그인을 사용할 수 없습니다.");
      return;
    }
    setBusyAction("login");
    try {
      await requestMagicLink(email.trim());
      setMessage("로그인 링크를 이메일로 보냈습니다. 링크를 연 뒤 이 화면으로 돌아와 주세요.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "로그인 링크를 보내지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleLogout = async () => {
    clearFeedback();
    setBusyAction("logout");
    try {
      await signOut();
      setCloudSnapshot(null);
      setCloudPreview(null);
      setRecoveryBackup(null);
      setMessage("로그아웃했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "로그아웃하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleLoad = async () => {
    clearFeedback();
    const capturedUserId = authStatus.userId;
    if (!authStatus.signedIn || !capturedUserId) {
      setErrorMessage("클라우드 기록을 불러오려면 먼저 로그인해 주세요.");
      return;
    }
    setBusyAction("load");
    try {
      const loaded = await getLearningSnapshot(capturedUserId);
      if (getAuthStatus().userId !== capturedUserId) return;
      setCloudSnapshot(loaded);
      setCloudPreview(loaded ? previewLearningBackup(loaded.snapshot) : null);
      setMessage(loaded ? `클라우드 기록을 확인했습니다. 현재 버전은 ${loaded.revision}입니다.` : "아직 저장된 클라우드 기록이 없습니다.");
    } catch (error) {
      if (getAuthStatus().userId !== capturedUserId) return;
      setErrorMessage(error instanceof Error ? error.message : "클라우드 기록을 불러오지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSave = async () => {
    clearFeedback();
    const capturedUserId = authStatus.userId;
    if (!authStatus.signedIn || !capturedUserId) {
      setErrorMessage("클라우드에 저장하려면 먼저 로그인해 주세요.");
      return;
    }
    const localOwner = getKnownLocalOwner();
    const localOwnerId = localOwner.id;
    const canExplicitlyMigrate = localOwner.id === "guest-user" || localOwner.isLocalOnly;
    const confirmed = window.confirm(
      canExplicitlyMigrate
        ? "현재 학습 기록을 로그인한 계정에 연결해 저장할까요?"
        : "현재 학습 기록을 계정에 저장할까요?",
    );
    if (!confirmed) return;
    setBusyAction("save");
    try {
      const saved = await saveCurrentLearningSnapshot(capturedUserId, cloudSnapshot?.revision ?? null, {
        confirmed: true,
        localOwnerId,
        allowExplicitGuestMigration: canExplicitlyMigrate,
      });
      if (getAuthStatus().userId !== capturedUserId) return;
      setCloudSnapshot(saved);
      setCloudPreview(previewLearningBackup(saved.snapshot));
      setMessage(`클라우드에 저장했습니다. 새 버전은 ${saved.revision}입니다.`);
    } catch (error) {
      if (getAuthStatus().userId !== capturedUserId) return;
      if (error instanceof SnapshotConflictError) {
        if (error.current) {
          setCloudSnapshot(error.current);
          setCloudPreview(previewLearningBackup(error.current.snapshot));
          setMessage(`다른 화면에서 먼저 저장되었습니다. 최신 버전 ${error.current.revision}을 확인한 뒤 다시 선택해 주세요.`);
        } else {
          setMessage("다른 화면에서 먼저 저장되어 충돌했습니다. 최신 기록을 다시 불러와 주세요.");
        }
      } else {
        setErrorMessage(error instanceof Error ? error.message : "클라우드에 저장하지 못했습니다.");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestore = () => {
    clearFeedback();
    const capturedUserId = authStatus.userId;
    if (!cloudSnapshot || !capturedUserId) {
      setErrorMessage("먼저 로그인하고 클라우드 기록을 불러와 주세요.");
      return;
    }
    const confirmed = window.confirm(
      `계정의 버전 ${cloudSnapshot.revision} 학습 기록을 현재 학습 공간에 불러올까요? 선택한 방식에 따라 현재 데이터가 유지되거나 바뀔 수 있습니다.`,
    );
    if (!confirmed) return;
    setBusyAction("restore");
    try {
      const result = restoreLearningSnapshot(capturedUserId, cloudSnapshot.snapshot, strategy, { confirmed: true });
      if (getAuthStatus().userId !== capturedUserId) return;
      if (result.safetyBackup) setRecoveryBackup(result.safetyBackup);
      if (!result.ok) {
        setErrorMessage(result.error || "클라우드 기록을 복원하지 못했습니다.");
        return;
      }
      onDataChanged?.();
      setMessage(`클라우드 기록을 복원했습니다. ${result.importedEntries}개 저장 묶음을 적용했습니다.`);
    } catch (error) {
      if (getAuthStatus().userId !== capturedUserId) return;
      setErrorMessage(error instanceof Error ? error.message : "클라우드 기록을 복원하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const busy = busyAction !== null;
  const display = accountDisplay || getAccountDisplay(authStatus);
  const ownerMismatch = Boolean(getCloudDataOwnerId() && authStatus.userId && getCloudDataOwnerId() !== authStatus.userId);

  return (
    <section className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 text-[var(--lh-ink)] shadow-xs" aria-label="계정 및 클라우드 학습 기록">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-[var(--lh-primary)]" />
          <div>
            <h2 className="text-sm font-medium text-[var(--lh-ink)]">계정과 학습 기록</h2>
            <p className="mt-1 text-xs text-[var(--lh-ink-secondary)] font-normal">{authStatus.configured ? display : "실제 로그인 준비 중"}</p>
          </div>
        </div>
        {authStatus.signedIn && (
          <button type="button" onClick={handleLogout} disabled={busy} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] disabled:opacity-50 transition cursor-pointer">
            <LogOut className="h-3 w-3" /> 로그아웃
          </button>
        )}
      </div>

      {!authStatus.configured && <p className="mt-4 rounded-xl bg-[var(--lh-surface-subtle)] p-3 text-xs leading-relaxed text-[var(--lh-ink-secondary)] font-normal">로그인 서비스를 불러오지 못했습니다. 잠시 후 다시 시도하거나 고객 지원에 문의해 주세요.</p>}

      {!authStatus.signedIn && authStatus.configured && (
        <form onSubmit={handleMagicLink} className="mt-4 space-y-2">
          <label className="block text-[11px] font-medium text-[var(--lh-ink-secondary)]" htmlFor="learnhub-supabase-email">이메일 로그인 링크</label>
          <div className="flex gap-2">
            <input id="learnhub-supabase-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required className="min-w-0 flex-1 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 py-2 text-xs font-normal text-[var(--lh-ink)] focus:border-[var(--lh-primary)] focus:outline-none" />
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-xl bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-3.5 py-2 text-xs font-medium text-white disabled:opacity-50 transition cursor-pointer"><Mail className="h-3.5 w-3.5" /> 링크 보내기</button>
          </div>
          <p className="text-[10px] leading-relaxed text-[var(--lh-ink-tertiary)] font-normal">비밀번호는 사용하지 않습니다. 링크가 오지 않으면 스팸함을 확인하고 잠시 후 다시 보내 주세요. 문제가 계속되면 관리자에게 문의해 주세요.</p>
        </form>
      )}

      {authStatus.signedIn && (
        <div className="mt-4 space-y-3">
          {ownerMismatch && <p className="rounded-xl border border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] p-3 text-[11px] leading-relaxed text-[var(--lh-secondary-text)] font-normal">이 기기의 클라우드 기록은 다른 계정에 연결되어 있어 저장·복원을 중단합니다.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={handleSave} disabled={busy || ownerMismatch} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-3 py-2.5 text-xs font-medium text-white disabled:opacity-50 transition cursor-pointer"><Upload className="h-3.5 w-3.5" /> 계정에 현재 기록 저장</button>
            <button type="button" onClick={handleLoad} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] hover:bg-[var(--lh-surface-subtle)] px-3 py-2.5 text-xs font-medium text-[var(--lh-ink)] disabled:opacity-50 transition cursor-pointer"><RefreshCw className="h-3.5 w-3.5" /> 계정 기록 새로고침</button>
          </div>
        </div>
      )}

      {cloudSnapshot && (
        <div className="mt-4 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3.5 text-xs">
          <p className="font-medium text-[var(--lh-ink)]">클라우드 기록 미리보기</p>
          <p className="mt-1 text-[var(--lh-ink-secondary)] font-normal">버전 {cloudSnapshot.revision} · {new Date(cloudSnapshot.updatedAt).toLocaleString()}</p>
          {cloudPreview && <p className="mt-1 text-[var(--lh-ink-secondary)] font-normal">{formatPreview(cloudPreview) || "학습 기록 없음"}</p>}
          <label className="mt-3 block text-[var(--lh-ink)]">
            <span className="mb-1 block font-medium">복원 방식</span>
            <select value={strategy} onChange={(event) => setStrategy(event.target.value as BackupConflictStrategy)} className="w-full rounded-lg border border-[var(--lh-line)] bg-[var(--lh-surface)] px-2.5 py-2 text-xs font-normal">
              {Object.entries(strategyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-[var(--lh-ink-secondary)] font-normal">{strategyDescriptions[strategy]}</span>
          </label>
          <button type="button" onClick={handleRestore} disabled={busy || ownerMismatch} className="mt-3 w-full rounded-xl bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-3 py-2.5 text-xs font-medium text-white disabled:opacity-50 transition cursor-pointer">확인 후 학습 기록 불러오기</button>
        </div>
      )}

      {recoveryBackup && (
        <div className="mt-4 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-3.5 text-xs">
          <p className="font-medium text-[var(--lh-ink)]">복원 전 백업을 보관할 수 있어요</p>
          <button type="button" onClick={() => { try { downloadLearningBackup(recoveryBackup); setMessage("복원 전 백업 파일을 저장했습니다."); } catch { setErrorMessage("복원 전 백업 파일을 저장하지 못했습니다."); } }} className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-3 py-2 font-medium text-[var(--lh-primary-text)] transition cursor-pointer"><Download className="h-3.5 w-3.5" /> 복원 전 백업 저장</button>
        </div>
      )}

      {message && <p className="mt-3 text-xs text-[var(--lh-ink-secondary)] font-normal" role="status">{message}</p>}
      {errorMessage && <p className="mt-3 text-xs text-[var(--lh-secondary-text)] font-normal" role="alert">{errorMessage}</p>}
      <p className="mt-4 text-[10px] leading-relaxed text-[var(--lh-ink-tertiary)] font-normal">학습 기록은 로그인한 계정별로 분리됩니다. 다른 화면에서 먼저 변경된 경우 최신 기록을 확인한 뒤 저장해 주세요.</p>
    </section>
  );
};
