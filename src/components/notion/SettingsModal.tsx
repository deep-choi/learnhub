import React, { useEffect, useState } from "react";
import {
  X,
  Palette,
  User,
  BrainCircuit,
  Check,
  ChevronDown,
  LogIn,
  LogOut,
  Download,
  Trash2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { UserAccount } from "../../types/learning";
import { ThemeMode, getStoredTheme, setTheme, THEME_CHANGED_EVENT } from "../../services/theme";
import { deleteAccount, signOut as authClientSignOut } from "../../services/authClient";
import { downloadLearningBackup } from "../../services/learningBackup";
import { authorizedFetch } from "../../services/authClient";
import { adminRequest } from "../../services/adminClient";
import {
  AI_MODEL_CATALOG,
  AI_OUTPUT_TOKEN_OPTIONS,
  AI_PROVIDER_LABELS,
  AI_PROVIDER_ORDER,
  REASONING_EFFORT_LABELS,
  nearestReasoningEffort,
  selectableReasoningEfforts,
  type AiProvider,
  type AiRuntimeSelection,
} from "../../domain/aiModels";
import {
  getAiPreferences,
  saveAiPreferences,
  type AiPublicConfiguration,
} from "../../services/aiPreferences";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAccount?: UserAccount;
  onOpenAuth?: () => void;
  onDataChanged?: () => void;
  syncStatus?: "idle" | "loading" | "syncing" | "synced" | "error";
  syncError?: string;
  lastSyncedAt?: string | null;
}

type SettingsTab = "appearance" | "account" | "ai";

const SETTINGS_TABS: { id: SettingsTab; label: string; description: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "appearance", label: "화면", description: "학습 화면의 테마를 고릅니다.", Icon: Palette },
  { id: "account", label: "계정", description: "로그인 정보와 학습 기록을 관리합니다.", Icon: User },
  { id: "ai", label: "AI 모델", description: "과정 생성·레슨·튜터·평가에 쓸 모델을 고릅니다.", Icon: BrainCircuit },
];

/** 설정 미리보기 카드는 현재 테마와 상관없이 각 테마의 실제 색을 보여 줍니다. */
const THEME_PREVIEWS: Record<ThemeMode, { label: string; caption: string; canvas: string; side: string; card: string; line: string; point: string }> = {
  light: { label: "라이트", caption: "밝은 화이트 캔버스 · 로얄블루", canvas: "#f8f9fc", side: "#eceef3", card: "#ffffff", line: "#dfe2e8", point: "#4169e1" },
  dark: { label: "다크", caption: "딥 차콜 캔버스 · 웜오렌지", canvas: "#0c0d12", side: "#161822", card: "#1e212d", line: "#2c3040", point: "#f38132" },
};

const sameSelection = (a: AiRuntimeSelection, b: AiRuntimeSelection) =>
  a.provider === b.provider && a.model === b.model && a.reasoningEffort === b.reasoningEffort && a.maxOutputTokens === b.maxOutputTokens;

/* ---------- 작은 빌딩 블록 ---------- */

/** 좁은 화면에서는 창 안에 상자를 한 번 더 두르지 않고 구분선만 둡니다. */
const Section: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    {title && <h4 className="text-sm font-medium text-[var(--lh-ink-tertiary)] sm:mb-2 sm:px-1">{title}</h4>}
    <div className="divide-y divide-[var(--lh-line)] sm:rounded-xl sm:border sm:border-[var(--lh-line)] sm:bg-[var(--lh-surface)]">{children}</div>
  </section>
);

/** 좁은 화면에서는 글 아래에 조작(버튼·선택 상자)을 전체 폭으로 두고, 넓은 화면에서만 오른쪽에 나란히 둡니다. */
const Row: React.FC<{ label: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; htmlFor?: string }> = ({ label, description, children, htmlFor }) => (
  <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
    <div className="min-w-0 sm:flex-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-[15px] font-medium text-[var(--lh-ink)]">{label}</label>
      ) : (
        <div className="text-[15px] font-medium text-[var(--lh-ink)]">{label}</div>
      )}
      {description && <div className="mt-0.5 break-keep text-sm leading-relaxed text-[var(--lh-ink-secondary)]">{description}</div>}
    </div>
    {children && <div className="w-full sm:w-auto sm:shrink-0">{children}</div>}
  </div>
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = "", children, ...props }) => (
  <div className={`relative ${className}`}>
    <select
      {...props}
      className="h-12 w-full cursor-pointer appearance-none rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] pl-3 pr-9 text-[15px]! text-[var(--lh-ink)] outline-none transition hover:border-[var(--lh-line-strong)] focus:border-[var(--lh-primary)] focus:ring-2 focus:ring-[var(--lh-primary-subtle)] sm:h-11 sm:rounded-lg"
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lh-ink-tertiary)]" />
  </div>
);

const buttonBase =
  "inline-flex h-12 w-full sm:h-10 sm:w-auto sm:min-h-0! cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 text-[15px]! font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-lg";
const secondaryButton = `${buttonBase} border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)]`;
const primaryButton = `${buttonBase} bg-[var(--lh-primary)] text-white hover:bg-[var(--lh-primary-hover)]`;
const dangerButton = `${buttonBase} border border-[var(--lh-danger)]/30 text-[var(--lh-danger)] hover:bg-[var(--lh-danger)]/10`;

/* ---------- 모달 ---------- */

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userAccount,
  onOpenAuth,
  onDataChanged,
  syncStatus = "idle",
  syncError = "",
  lastSyncedAt = null,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [accountActionError, setAccountActionError] = useState("");
  const [aiSelection, setAiSelection] = useState<AiRuntimeSelection>(() => getAiPreferences());
  const [savedAiSelection, setSavedAiSelection] = useState<AiRuntimeSelection>(() => getAiPreferences());
  const [aiConfiguration, setAiConfiguration] = useState<AiPublicConfiguration | null>(null);
  const [aiSettingsStatus, setAiSettingsStatus] = useState<"idle" | "loading" | "saved" | "error">("idle");
  const [aiSettingsError, setAiSettingsError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsAdmin(false);
    if (isOpen && userAccount && !userAccount.isGuest) {
      void adminRequest("session").then(() => { if (!cancelled) setIsAdmin(true); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [isOpen, userAccount?.email, userAccount?.isGuest]);

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: ThemeMode }>;
      if (customEvent.detail?.theme) {
        setCurrentTheme(customEvent.detail.theme);
      }
    };
    window.addEventListener(THEME_CHANGED_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, handleThemeChange);
  }, []);

  // 입력바에서 바꾼 모델·추론 선택이 있으면 창을 열 때 다시 읽습니다.
  useEffect(() => {
    if (!isOpen) return;
    const stored = getAiPreferences();
    setAiSelection(stored);
    setSavedAiSelection(stored);
  }, [isOpen]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const loadAiConfiguration = async () => {
    setAiSettingsStatus("loading");
    setAiSettingsError("");
    try {
      const response = await authorizedFetch("/api/ai/config", { headers: { Accept: "application/json" } });
      const body = await response.json() as AiPublicConfiguration & { error?: string };
      if (!response.ok || !body || !Array.isArray(body.models) || !Array.isArray(body.outputTokenOptions)) {
        throw new Error(body?.error || "AI 설정과 사용량을 불러오지 못했습니다.");
      }
      // 선택값은 창을 열 때 읽습니다. 여기서 다시 덮으면 탭 이동·새로고침 때 저장 전 변경이 사라집니다.
      setAiConfiguration(body);
      setAiSettingsStatus("idle");
    } catch (error) {
      setAiSettingsStatus("error");
      setAiSettingsError(error instanceof Error ? error.message : "AI 설정과 사용량을 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== "ai") return;
    void loadAiConfiguration();
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const handleSelectTheme = (mode: ThemeMode) => {
    setTheme(mode);
    setCurrentTheme(mode);
  };

  const handleSignOut = async () => {
    if (syncStatus === "error" && !window.confirm("아직 서버에 저장되지 않은 변경사항이 있을 수 있습니다. 그래도 로그아웃할까요?")) return;
    setAccountActionError("");
    try {
      setIsSigningOut(true);
      await authClientSignOut();
      if (onDataChanged) onDataChanged();
      onClose();
    } catch (err) {
      setAccountActionError(err instanceof Error ? err.message : "로그아웃을 완료하지 못했습니다.");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleDownloadLearningData = () => {
    setAccountActionError("");
    try {
      downloadLearningBackup();
    } catch (error) {
      setAccountActionError(error instanceof Error ? error.message : "학습 기록을 다운로드하지 못했습니다.");
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm("회원 탈퇴 시 계정과 클라우드 학습 기록이 영구 삭제됩니다. 계속할까요?");
    if (!confirmed) return;
    setAccountActionError("");
    try {
      setIsSigningOut(true);
      await deleteAccount();
      onClose();
    } catch (error) {
      setAccountActionError(error instanceof Error ? error.message : "회원 탈퇴를 완료하지 못했습니다.");
    } finally {
      setIsSigningOut(false);
    }
  };

  const accountSyncInProgress = syncStatus === "loading" || syncStatus === "syncing";
  const isGuest = userAccount?.isGuest ?? true;

  const syncLabel = syncStatus === "loading"
    ? "기록 불러오는 중"
    : syncStatus === "syncing"
      ? "저장 중"
      : syncStatus === "error"
        ? "동기화 확인 필요"
        : "최신 기록 저장됨";
  const syncDotClass = syncStatus === "error"
    ? "bg-[var(--lh-danger)]"
    : accountSyncInProgress
      ? "bg-amber-400 animate-pulse"
      : "bg-emerald-500";

  const allModels = aiConfiguration?.models || AI_MODEL_CATALOG.map((model) => ({ ...model, available: false }));
  const availableModels = allModels.filter((model) => model.provider === aiSelection.provider);
  const selectedModel = availableModels.find((model) => model.id === aiSelection.model) || availableModels[0];
  const aiDirty = !sameSelection(aiSelection, savedAiSelection);

  const resetAiStatus = () => {
    setAiSettingsStatus("idle");
    setAiSettingsError("");
  };

  const updateAiProvider = (provider: AiProvider) => {
    const models = allModels.filter((model) => model.provider === provider);
    const model = models.find((candidate) => candidate.available) || models[0];
    if (!model) return;
    const efforts = selectableReasoningEfforts(model.reasoningEfforts);
    const reasoningEffort = efforts.includes("medium") ? "medium" : efforts[0];
    setAiSelection((current) => ({ ...current, provider, model: model.id, reasoningEffort }));
    resetAiStatus();
  };

  const updateAiModel = (modelId: string) => {
    const model = availableModels.find((candidate) => candidate.id === modelId);
    if (!model) return;
    // 입력바와 같은 규칙: 지금 단계를 지원하지 않으면 가장 가까운 지원 단계로 맞춥니다.
    const reasoningEffort = nearestReasoningEffort(aiSelection.reasoningEffort, selectableReasoningEfforts(model.reasoningEfforts));
    setAiSelection((current) => ({ ...current, model: model.id, reasoningEffort }));
    resetAiStatus();
  };

  const updateAiSelection = (patch: Partial<AiRuntimeSelection>) => {
    setAiSelection((current) => ({ ...current, ...patch }));
    resetAiStatus();
  };

  const handleSaveAiSettings = () => {
    setAiSettingsError("");
    if (!selectedModel?.available) {
      setAiSettingsStatus("error");
      setAiSettingsError(`${AI_PROVIDER_LABELS[aiSelection.provider]} 모델은 아직 준비 중입니다. 다른 모델을 선택해 주세요.`);
      return;
    }
    if (!saveAiPreferences(aiSelection)) {
      setAiSettingsStatus("error");
      setAiSettingsError("AI 설정을 저장하지 못했습니다.");
      return;
    }
    setSavedAiSelection(aiSelection);
    setAiSettingsStatus("saved");
  };

  const activeTabMeta = SETTINGS_TABS.find((tab) => tab.id === activeTab)!;
  const limitsDisabled = aiConfiguration?.limits.enabled === false;

  return (
    // 모바일: 보이는 화면 안에서 위쪽에 붙은 창으로 띄우고 높이는 내용만큼만 씁니다. 탭을 바꿔도 제목 위치가 흔들리지 않습니다.
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] items-start justify-center bg-black/40 px-4 pb-4 pt-[max(1rem,6dvh)] backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex max-h-[calc(100dvh-max(1rem,6dvh)-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-2xl sm:h-[min(720px,calc(100dvh-3rem))] sm:max-h-none sm:flex-row sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 사이드 내비게이션 */}
        <aside className="shrink-0 border-b border-[var(--lh-line)] sm:w-60 sm:border-b-0 sm:border-r sm:bg-[var(--lh-surface-subtle)]/60">
          <div className="flex items-center justify-between pb-3 pl-5 pr-2.5 pt-4 sm:px-5 sm:pb-5 sm:pt-6">
            <h2 id="settings-title" className="text-xl font-semibold tracking-tight sm:text-[17px]">설정</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="설정 닫기"
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] sm:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="mx-4 mb-4 grid grid-cols-3 gap-1 rounded-xl bg-[var(--lh-surface-subtle)] p-1 sm:m-0 sm:flex sm:flex-col sm:bg-transparent sm:px-3 sm:pb-3 sm:pt-0">
            {SETTINGS_TABS.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-sm! transition sm:h-11 sm:w-full sm:justify-start sm:gap-2.5 sm:px-3 sm:text-[15px]! ${
                    active
                      ? "bg-[var(--lh-surface)] font-medium text-[var(--lh-ink)] shadow-sm"
                      : "text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-strong)]/60 hover:text-[var(--lh-ink)]"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px] ${active ? "text-[var(--lh-primary)]" : "text-[var(--lh-ink-tertiary)]"}`} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* 본문 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="hidden items-start justify-between gap-4 px-10 pb-5 pt-8 sm:flex">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">{activeTabMeta.label}</h3>
              <p className="mt-0.5 text-[15px] text-[var(--lh-ink-secondary)]">{activeTabMeta.description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="설정 닫기"
              className="hidden h-8 w-8 sm:min-h-0! shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] sm:flex"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-5 sm:px-10 sm:pb-10 sm:pt-0">
            {/* 화면 */}
            {activeTab === "appearance" && (
              <div className="space-y-7">
                <section>
                  <h4 className="mb-2 sm:px-1 text-sm font-medium text-[var(--lh-ink-tertiary)]">테마</h4>
                  <div role="radiogroup" aria-label="테마" className="grid grid-cols-2 gap-3">
                    {(Object.keys(THEME_PREVIEWS) as ThemeMode[]).map((mode) => {
                      const preview = THEME_PREVIEWS[mode];
                      const selected = currentTheme === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => handleSelectTheme(mode)}
                          className="group cursor-pointer text-left"
                        >
                          <div
                            className={`overflow-hidden rounded-xl border-2 transition ${
                              selected ? "border-[var(--lh-primary)]" : "border-[var(--lh-line)] group-hover:border-[var(--lh-line-strong)]"
                            }`}
                          >
                            {/* 미니 화면 미리보기 */}
                            <div className="flex aspect-[16/10] gap-1.5 p-2" style={{ background: preview.canvas }}>
                              <div className="flex w-1/4 flex-col gap-1 rounded-md p-1.5" style={{ background: preview.side }}>
                                <span className="h-1.5 w-3/4 rounded-full" style={{ background: preview.point }} />
                                <span className="h-1.5 w-full rounded-full" style={{ background: preview.line }} />
                                <span className="h-1.5 w-2/3 rounded-full" style={{ background: preview.line }} />
                              </div>
                              <div className="flex flex-1 flex-col gap-1.5 rounded-md p-2" style={{ background: preview.card }}>
                                <span className="h-2 w-1/2 rounded-full" style={{ background: preview.line }} />
                                <span className="h-1.5 w-full rounded-full" style={{ background: preview.line }} />
                                <span className="h-1.5 w-5/6 rounded-full" style={{ background: preview.line }} />
                                <span className="mt-auto h-3 w-1/3 self-end rounded-full" style={{ background: preview.point }} />
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2 px-0.5">
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded-full border transition ${
                                selected ? "border-[var(--lh-primary)] bg-[var(--lh-primary)] text-white" : "border-[var(--lh-line-strong)]"
                              }`}
                            >
                              {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                            </span>
                            <span className="text-[15px] font-medium">{preview.label}</span>
                          </div>
                          <p className="mt-0.5 break-keep pl-6.5 text-[13px] leading-5 text-[var(--lh-ink-tertiary)] sm:text-sm">{preview.caption}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* 계정 */}
            {activeTab === "account" && (
              <div className="space-y-7">
                <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap sm:rounded-xl sm:border sm:border-[var(--lh-line)] sm:p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-xl font-semibold text-white">
                    {isGuest ? <User className="h-5 w-5" /> : userAccount?.name?.slice(0, 1) || "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px] font-semibold">{userAccount?.name || "게스트"}</div>
                    <div className={`text-[15px] text-[var(--lh-ink-secondary)] ${isGuest ? "break-keep leading-6" : "truncate"}`}>
                      {userAccount?.email || "로그인하면 학습 기록이 모든 기기에 저장됩니다."}
                    </div>
                  </div>
                  {isGuest && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onOpenAuth) onOpenAuth();
                      }}
                      className={primaryButton}
                    >
                      <LogIn className="h-4 w-4" />
                      로그인
                    </button>
                  )}
                </div>

                {!isGuest && (
                  <>
                    {isAdmin && <Section title="운영"><Row label="관리자 페이지"><a href="/admin" className={secondaryButton}><ShieldCheck className="h-4 w-4" />운영 콘솔 열기</a></Row></Section>}
                    <Section title="동기화">
                      <Row
                        label="온라인 자동 저장"
                        description={
                          syncStatus === "error"
                            ? <span role="alert" className="text-[var(--lh-danger)]">{syncError || "온라인 저장 상태를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."}</span>
                            : lastSyncedAt
                              ? `마지막 저장 ${new Date(lastSyncedAt).toLocaleString()}`
                              : "학습 기록이 계정에 자동으로 저장됩니다."
                        }
                      >
                        <span className="inline-flex items-center gap-2 text-[15px] text-[var(--lh-ink-secondary)]">
                          <span className={`h-2 w-2 rounded-full ${syncDotClass}`} />
                          {syncLabel}
                        </span>
                      </Row>
                    </Section>

                    <Section title="데이터">
                      <Row label="학습 기록 내보내기" description="모든 과정과 노트, 진도를 파일로 받습니다.">
                        <button type="button" onClick={handleDownloadLearningData} className={secondaryButton}>
                          <Download className="h-4 w-4" />
                          다운로드
                        </button>
                      </Row>
                      <Row label="로그아웃" description={accountSyncInProgress ? "저장이 끝나면 로그아웃할 수 있습니다." : "이 기기에서 계정 연결을 해제합니다."}>
                        <button type="button" disabled={isSigningOut || accountSyncInProgress} onClick={handleSignOut} className={secondaryButton}>
                          <LogOut className="h-4 w-4" />
                          {isSigningOut ? "처리 중..." : "로그아웃"}
                        </button>
                      </Row>
                    </Section>

                    <Section title="위험 구역">
                      <Row label="회원 탈퇴" description="계정과 클라우드 학습 기록이 영구 삭제되며 되돌릴 수 없습니다.">
                        <button type="button" disabled={isSigningOut} onClick={handleDeleteAccount} className={dangerButton}>
                          <Trash2 className="h-4 w-4" />
                          탈퇴하기
                        </button>
                      </Row>
                    </Section>

                    {accountActionError && <p role="alert" className="text-[15px] text-[var(--lh-danger)]">{accountActionError}</p>}
                  </>
                )}

                <div className="flex flex-wrap gap-4 sm:px-1 text-sm text-[var(--lh-ink-secondary)]">
                  <a href="/privacy/" target="_blank" rel="noopener noreferrer">개인정보처리방침</a>
                  <a href="/account-deletion/" target="_blank" rel="noopener noreferrer">계정 삭제 안내</a>
                </div>
                <p className="flex items-center gap-2 sm:px-1 text-sm text-[var(--lh-ink-tertiary)]">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  개인 학습 기록은 로그인한 계정별로 분리되어 저장됩니다.
                </p>
              </div>
            )}

            {/* AI 모델 */}
            {activeTab === "ai" && (
              <div className="space-y-7">
                <section>
                  <div className="mb-2 flex items-center justify-between sm:px-1">
                    <h4 className="text-sm font-medium text-[var(--lh-ink-tertiary)]">제공자</h4>
                    <button
                      type="button"
                      onClick={() => void loadAiConfiguration()}
                      disabled={aiSettingsStatus === "loading"}
                      className="inline-flex cursor-pointer items-center gap-1 text-sm! sm:min-h-0! text-[var(--lh-ink-tertiary)] transition hover:text-[var(--lh-ink)] disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${aiSettingsStatus === "loading" ? "animate-spin" : ""}`} />
                      연결 상태 새로고침
                    </button>
                  </div>
                  <div role="radiogroup" aria-label="AI 제공자" className="grid gap-2 sm:grid-cols-3">
                    {AI_PROVIDER_ORDER.map((provider) => {
                      const configured = aiConfiguration?.providers[provider]?.configured === true;
                      const selected = aiSelection.provider === provider;
                      return (
                        <button
                          key={provider}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => updateAiProvider(provider)}
                          className={`min-w-0 cursor-pointer rounded-xl border px-4 py-3 text-left transition sm:px-3.5 ${
                            selected
                              ? "border-[var(--lh-primary)] bg-[var(--lh-primary-subtle)] ring-1 ring-[var(--lh-primary)]"
                              : "border-[var(--lh-line)] hover:border-[var(--lh-line-strong)]"
                          }`}
                        >
                          <span className="block truncate text-[15px] font-semibold">{AI_PROVIDER_LABELS[provider]}</span>
                          <span className="mt-1 flex items-center gap-1.5 text-sm text-[var(--lh-ink-secondary)]">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${configured ? "bg-emerald-500" : "bg-[var(--lh-line-strong)]"}`} />
                            <span className="truncate">{configured ? "연결됨" : "준비 중"}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <Section title="모델과 추론">
                  <Row label="모델" htmlFor="settings-ai-model">
                    <Select id="settings-ai-model" className="w-full sm:w-64" value={aiSelection.model} onChange={(event) => updateAiModel(event.target.value)}>
                      {availableModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}{model.lifecycle === "preview" ? " · Preview" : ""}{model.available ? "" : " · 준비 중"}
                        </option>
                      ))}
                    </Select>
                  </Row>
                  <div className="py-4 sm:px-5">
                    <div className="text-[15px] font-medium">추론 수준</div>
                    <div className="mt-0.5 break-keep text-sm leading-relaxed text-[var(--lh-ink-secondary)]">
                      높을수록 복잡한 문제에 유리하지만 응답이 느려지고 토큰을 더 씁니다.
                    </div>
                    <div role="radiogroup" aria-label="추론 수준" className="mt-3 flex rounded-lg border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-0.5">
                      {selectableReasoningEfforts(selectedModel?.reasoningEfforts || []).map((effort) => {
                        const selected = aiSelection.reasoningEffort === effort;
                        return (
                          <button
                            key={effort}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => updateAiSelection({ reasoningEffort: effort })}
                            className={`h-10 sm:min-h-0! flex-1 cursor-pointer whitespace-nowrap rounded-md px-2 text-[15px]! transition ${
                              selected
                                ? "bg-[var(--lh-surface)] font-medium text-[var(--lh-ink)] shadow-sm"
                                : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)]"
                            }`}
                          >
                            {REASONING_EFFORT_LABELS[effort]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Row label="요청당 최대 출력" htmlFor="settings-ai-tokens" description="기능별 한도가 더 낮으면 그 값을 따릅니다.">
                    <Select
                      id="settings-ai-tokens"
                      className="w-full sm:w-48"
                      value={aiSelection.maxOutputTokens}
                      onChange={(event) => updateAiSelection({ maxOutputTokens: Number(event.target.value) })}
                    >
                      {(aiConfiguration?.outputTokenOptions || [...AI_OUTPUT_TOKEN_OPTIONS]).map((tokens) => (
                        <option key={tokens} value={tokens}>{tokens.toLocaleString()} tokens</option>
                      ))}
                    </Select>
                  </Row>
                </Section>

                {aiConfiguration && (
                  <section>
                    <h4 className="text-sm font-medium text-[var(--lh-ink-tertiary)] sm:mb-2 sm:px-1">오늘 사용량</h4>
                    <div className="grid divide-y divide-[var(--lh-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:rounded-xl sm:border sm:border-[var(--lh-line)]">
                      {[
                        { label: "남은 요청", value: limitsDisabled ? "제한 없음" : `${aiConfiguration.usage.remainingRequestsToday.toLocaleString()} / ${aiConfiguration.limits.requestsPerDay.toLocaleString()}` },
                        { label: "남은 예약 출력", value: limitsDisabled ? "제한 없음" : aiConfiguration.usage.remainingReservedOutputTokensToday.toLocaleString() },
                        { label: "분당 요청 한도", value: limitsDisabled ? "제한 없음" : aiConfiguration.limits.requestsPerMinute.toLocaleString() },
                      ].map((stat) => (
                        <div key={stat.label} className="min-w-0 py-3 sm:px-4">
                          <div className="truncate text-sm text-[var(--lh-ink-tertiary)]">{stat.label}</div>
                          <div className="mt-1 truncate text-[17px] font-semibold tabular-nums">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 break-keep sm:px-1 text-sm leading-relaxed text-[var(--lh-ink-tertiary)]">
                      {limitsDisabled
                        ? "테스트용으로 앱의 사용량 제한이 해제되어 있습니다. AI 제공자의 요금과 제한은 별도로 적용됩니다."
                        : "공급자 청구량이 아니라 LearnHub 서버가 보수적으로 예약한 사용량입니다. UTC 자정에 초기화됩니다."}
                    </p>
                  </section>
                )}

              </div>
            )}
          </div>

          {/* AI 탭 저장 바 */}
          {activeTab === "ai" && (
            <footer className="flex flex-col gap-3 border-t border-[var(--lh-line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-10">
              <div className="min-w-0 text-sm">
                {aiSettingsError ? (
                  <p role="alert" className="text-[var(--lh-danger)]">{aiSettingsError}</p>
                ) : aiSettingsStatus === "saved" ? (
                  <p role="status" className="inline-flex items-center gap-1 text-[var(--lh-ink-secondary)]">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    저장했고 계정에 동기화를 요청했습니다.
                  </p>
                ) : aiDirty ? (
                  <p className="text-[var(--lh-ink-secondary)]">저장하지 않은 변경사항이 있습니다.</p>
                ) : (
                  <p className="text-[var(--lh-ink-tertiary)]">선택값은 계정에 동기화됩니다.</p>
                )}
              </div>
              <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
                {aiDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setAiSelection(savedAiSelection);
                      resetAiStatus();
                    }}
                    className={secondaryButton}
                  >
                    되돌리기
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveAiSettings}
                  disabled={!aiDirty || aiSettingsStatus === "loading" || !selectedModel}
                  className={primaryButton}
                >
                  저장
                </button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
};
