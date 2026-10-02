import React, { useEffect, useState } from "react";
import {
  X,
  Palette,
  User,
  Sliders,
  Sun,
  Moon,
  Check,
  LogIn,
  LogOut,
  Maximize2,
  Minimize2,
  Sparkles,
  Cloud,
  ShieldCheck,
  Download,
  Trash2,
  BrainCircuit,
  RefreshCw,
} from "lucide-react";
import { UserAccount } from "../../types/learning";
import { ThemeMode, getStoredTheme, setTheme, THEME_CHANGED_EVENT } from "../../services/theme";
import { deleteAccount, signOut as authClientSignOut } from "../../services/authClient";
import { downloadLearningBackup } from "../../services/learningBackup";
import { authorizedFetch } from "../../services/authClient";
import {
  AI_MODEL_CATALOG,
  AI_OUTPUT_TOKEN_OPTIONS,
  AI_PROVIDER_LABELS,
  AI_PROVIDER_ORDER,
  REASONING_EFFORT_LABELS,
  nearestReasoningEffort,
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
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  onOpenTutor?: () => void;
  syncStatus?: "idle" | "loading" | "syncing" | "synced" | "error";
  syncError?: string;
  lastSyncedAt?: string | null;
}

type SettingsTab = "theme" | "account" | "general";

/** 입력바 모델 선택과 같은 이름을 씁니다. */
const REASONING_LABELS = REASONING_EFFORT_LABELS;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userAccount,
  onOpenAuth,
  onDataChanged,
  isZenMode = false,
  onToggleZenMode,
  onOpenTutor,
  syncStatus = "idle",
  syncError = "",
  lastSyncedAt = null,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("theme");
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [accountActionError, setAccountActionError] = useState("");
  const [aiSelection, setAiSelection] = useState<AiRuntimeSelection>(() => getAiPreferences());
  const [aiConfiguration, setAiConfiguration] = useState<AiPublicConfiguration | null>(null);
  const [aiSettingsStatus, setAiSettingsStatus] = useState<"idle" | "loading" | "saved" | "error">("idle");
  const [aiSettingsError, setAiSettingsError] = useState("");

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
    if (isOpen) setAiSelection(getAiPreferences());
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
      setAiConfiguration(body);
      setAiSelection(getAiPreferences());
      setAiSettingsStatus("idle");
    } catch (error) {
      setAiSettingsStatus("error");
      setAiSettingsError(error instanceof Error ? error.message : "AI 설정과 사용량을 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== "general") return;
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

  const availableModels = (aiConfiguration?.models || AI_MODEL_CATALOG.map((model) => ({ ...model, available: false })))
    .filter((model) => model.provider === aiSelection.provider);
  const selectedModel = availableModels.find((model) => model.id === aiSelection.model) || availableModels[0];

  const updateAiProvider = (provider: AiProvider) => {
    const models = (aiConfiguration?.models || AI_MODEL_CATALOG.map((model) => ({ ...model, available: false }))).filter((model) => model.provider === provider);
    const model = models.find((candidate) => candidate.available) || models[0];
    if (!model) return;
    const reasoningEffort = model.reasoningEfforts.includes("medium") ? "medium" : model.reasoningEfforts[0];
    setAiSelection((current) => ({ ...current, provider, model: model.id, reasoningEffort }));
    setAiSettingsStatus("idle");
  };

  const updateAiModel = (modelId: string) => {
    const model = availableModels.find((candidate) => candidate.id === modelId);
    if (!model) return;
    // 입력바와 같은 규칙: 지금 단계를 지원하지 않으면 가장 가까운 지원 단계로 맞춥니다.
    const reasoningEffort = nearestReasoningEffort(aiSelection.reasoningEffort, model.reasoningEfforts);
    setAiSelection((current) => ({ ...current, model: model.id, reasoningEffort }));
    setAiSettingsStatus("idle");
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
    setAiSettingsStatus("saved");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--lh-line)] px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium tracking-tight text-[var(--lh-ink)]">
              설정
            </h2>
            <span className="rounded-full bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-2.5 py-0.5 text-[11px] font-normal text-[var(--lh-ink-secondary)]">
              환경 및 계정 관리
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--lh-ink-tertiary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Content: Left Nav Tabs + Right Panel */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row sm:min-h-[380px]">
          {/* Left Tab List */}
          <div className="w-full sm:w-44 border-b sm:border-b-0 sm:border-r border-[var(--lh-line)] bg-[var(--lh-surface-subtle)]/40 p-3 space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab("theme")}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition cursor-pointer ${
                activeTab === "theme"
                  ? "bg-[var(--lh-surface)] text-[var(--lh-ink)] font-medium shadow-2xs border border-[var(--lh-line)]"
                  : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] font-normal"
              }`}
            >
              <Palette className="h-4 w-4 text-[var(--lh-primary)]" />
              <span>테마 시스템</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("account")}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition cursor-pointer ${
                activeTab === "account"
                  ? "bg-[var(--lh-surface)] text-[var(--lh-ink)] font-medium shadow-2xs border border-[var(--lh-line)]"
                  : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] font-normal"
              }`}
            >
              <User className="h-4 w-4 text-[var(--lh-primary)]" />
              <span>프로필 계정</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition cursor-pointer ${
                activeTab === "general"
                  ? "bg-[var(--lh-surface)] text-[var(--lh-ink)] font-medium shadow-2xs border border-[var(--lh-line)]"
                  : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] font-normal"
              }`}
            >
              <Sliders className="h-4 w-4 text-[var(--lh-primary)]" />
              <span>기본 설정</span>
            </button>
          </div>

          {/* Right Tab Content */}
          <div className="min-h-0 flex-1 p-6 overflow-y-auto">
            {/* TAB 1: 테마 시스템 */}
            {activeTab === "theme" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-medium text-[var(--lh-ink)]">
                    화면 테마 시스템
                  </h3>
                  <p className="mt-1 text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
                    선호하는 화면 스타일에 맞춰 인터페이스 포인트 컬러와 배경이 자연스럽게 전환됩니다.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Light Mode Card */}
                  <button
                    type="button"
                    onClick={() => handleSelectTheme("light")}
                    className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition cursor-pointer ${
                      currentTheme === "light"
                        ? "border-[var(--lh-point)] bg-[var(--lh-surface-subtle)] shadow-xs"
                        : "border-[var(--lh-line)] bg-[var(--lh-surface)] hover:border-[var(--lh-line-strong)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef3ff] text-[#4169e1] border border-[#bacbf9]">
                          <Sun className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-medium text-[var(--lh-ink)]">
                          라이트 모드
                        </span>
                      </div>
                      {currentTheme === "light" && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4169e1] text-white">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--lh-line)] space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-[#4169e1]" />
                        <span className="text-[11px] font-normal text-[var(--lh-ink-secondary)]">
                          주요 포인트: 로얄블루
                        </span>
                      </div>
                      <p className="text-[10px] font-normal text-[var(--lh-ink-tertiary)]">
                        선명하고 맑은 화이트 캔버스
                      </p>
                    </div>
                  </button>

                  {/* Dark Mode Card */}
                  <button
                    type="button"
                    onClick={() => handleSelectTheme("dark")}
                    className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition cursor-pointer ${
                      currentTheme === "dark"
                        ? "border-[#f38132] bg-[var(--lh-surface-subtle)] shadow-xs"
                        : "border-[var(--lh-line)] bg-[var(--lh-surface)] hover:border-[var(--lh-line-strong)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a1b12] text-[#f38132] border border-[#f38132]/30">
                          <Moon className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-medium text-[var(--lh-ink)]">
                          다크 모드
                        </span>
                      </div>
                      {currentTheme === "dark" && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f38132] text-white">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--lh-line)] space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-[#f38132]" />
                        <span className="text-[11px] font-normal text-[var(--lh-ink-secondary)]">
                          주요 포인트: 웜오렌지
                        </span>
                      </div>
                      <p className="text-[10px] font-normal text-[var(--lh-ink-tertiary)]">
                        야간 학습에 편안한 딥 차콜 캔버스
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: 프로필 계정 */}
            {activeTab === "account" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-medium text-[var(--lh-ink)]">
                    프로필 및 계정 정보
                  </h3>
                  <p className="mt-1 text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
                    로그인 계정과 학습 기록 동기화 상태를 확인하고 관리합니다.
                  </p>
                </div>

                {/* Profile Card */}
                <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white text-base font-medium shadow-xs">
                      {userAccount?.isGuest ? (
                        <User className="h-5 w-5" />
                      ) : (
                        userAccount?.name?.slice(0, 1) || "U"
                      )}
                    </div>
                    <div className="truncate space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-[var(--lh-ink)] truncate">
                          {userAccount?.name || "게스트 사용자"}
                        </h4>
                        <span
                          className={`rounded-full px-2 py-0.2 text-[10px] font-medium border ${
                            userAccount?.isGuest
                              ? "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink-tertiary)]"
                              : "bg-[var(--lh-primary-subtle)] border-[var(--lh-primary-border)] text-[var(--lh-primary)]"
                          }`}
                        >
                          {userAccount?.isGuest ? "게스트 모드" : "로그인 완료"}
                        </span>
                      </div>
                      <p className="text-xs font-normal text-[var(--lh-ink-secondary)] truncate">
                        {userAccount?.email || "로그인하지 않은 상태입니다"}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[var(--lh-line)] flex items-center justify-between text-xs font-normal text-[var(--lh-ink-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <Cloud className="h-3.5 w-3.5 text-[var(--lh-point)]" />
                      <span>온라인 자동 동기화</span>
                    </span>
                    <span className="text-[11px] font-medium text-[var(--lh-ink)]">
                      {userAccount?.isGuest
                        ? "로그인 필요"
                        : syncStatus === "loading"
                          ? "기록 불러오는 중"
                          : syncStatus === "syncing"
                            ? "저장 중"
                            : syncStatus === "error"
                              ? "동기화 확인 필요"
                              : "최신 기록 저장됨"}
                    </span>
                  </div>
                  {!userAccount?.isGuest && lastSyncedAt && syncStatus !== "error" && (
                    <p className="text-right text-[10px] text-[var(--lh-ink-tertiary)]">
                      마지막 저장 {new Date(lastSyncedAt).toLocaleString()}
                    </p>
                  )}
                  {!userAccount?.isGuest && syncStatus === "error" && (
                    <p role="alert" className="rounded-xl bg-[var(--lh-surface)] p-2.5 text-[11px] leading-relaxed text-[var(--lh-danger)]">
                      {syncError || "온라인 저장 상태를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-1">
                  {userAccount?.isGuest ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onOpenAuth) onOpenAuth();
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-4 py-2.5 text-xs font-medium text-white shadow-xs transition cursor-pointer"
                    >
                      <LogIn className="h-4 w-4" />
                      <span>로그인 / 회원가입하기</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <button type="button" onClick={handleDownloadLearningData} className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-2 text-xs font-medium text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)]">
                        <Download className="h-4 w-4" /> 내 학습 기록 다운로드
                      </button>
                      <button
                        type="button"
                        disabled={isSigningOut || accountSyncInProgress}
                        onClick={handleSignOut}
                        className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] hover:bg-[var(--lh-surface-subtle)] px-4 py-2 text-xs font-medium text-[var(--lh-ink-secondary)] transition cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>{isSigningOut ? "처리 중..." : accountSyncInProgress ? "저장 완료 후 로그아웃" : "로그아웃"}</span>
                      </button>
                      <button type="button" disabled={isSigningOut} onClick={handleDeleteAccount} className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-[var(--lh-danger)] hover:bg-[var(--lh-surface-subtle)] disabled:opacity-50">
                        <Trash2 className="h-4 w-4" /> 회원 탈퇴 및 데이터 삭제
                      </button>
                      {accountActionError && <p role="alert" className="text-xs leading-relaxed text-[var(--lh-danger)]">{accountActionError}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: 기본 설정 */}
            {activeTab === "general" && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-sm font-medium text-[var(--lh-ink)]">
                    기본 환경 설정
                  </h3>
                  <p className="mt-1 text-xs font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
                    집중도 높은 몰입 학습을 위한 디스플레이와 AI 튜터 환경을 설정합니다.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Zen Mode Setting */}
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4">
                    <div className="space-y-0.5 pr-4">
                      <div className="flex items-center gap-2">
                        {isZenMode ? (
                          <Minimize2 className="h-4 w-4 text-[var(--lh-point)]" />
                        ) : (
                          <Maximize2 className="h-4 w-4 text-[var(--lh-ink-tertiary)]" />
                        )}
                        <span className="text-xs font-medium text-[var(--lh-ink)]">
                          집중 젠(Zen) 모드
                        </span>
                      </div>
                      <p className="text-[11px] font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
                        헤더와 사이드바를 최소화하여 학습 내용에 온전히 몰입합니다.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={onToggleZenMode}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        isZenMode ? "bg-[var(--lh-primary)]" : "bg-[var(--lh-line-strong)]"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isZenMode ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <BrainCircuit className="h-4 w-4 text-[var(--lh-primary)]" />
                          <span className="text-xs font-medium text-[var(--lh-ink)]">AI 모델 및 추론</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--lh-ink-secondary)]">
                          선택값은 모든 과정 생성·레슨·튜터·평가 요청에 적용되고 계정에 동기화됩니다.
                        </p>
                      </div>
                      <button type="button" onClick={() => void loadAiConfiguration()} disabled={aiSettingsStatus === "loading"} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface)] disabled:opacity-50">
                        <RefreshCw className={`h-3 w-3 ${aiSettingsStatus === "loading" ? "animate-spin" : ""}`} /> 새로고침
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {AI_PROVIDER_ORDER.map((provider) => {
                        const configured = aiConfiguration?.providers[provider]?.configured === true;
                        return (
                          <button key={provider} type="button" onClick={() => updateAiProvider(provider)} className={`min-w-0 rounded-xl border px-3 py-2 text-left transition ${aiSelection.provider === provider ? "border-[var(--lh-primary)] bg-[var(--lh-surface)]" : "border-[var(--lh-line)] hover:bg-[var(--lh-surface)]"}`}>
                            <span className="block truncate text-xs font-medium text-[var(--lh-ink)]">{AI_PROVIDER_LABELS[provider]}</span>
                            <span className={`mt-0.5 block truncate text-[10px] ${configured ? "text-[var(--lh-primary)]" : "text-[var(--lh-ink-tertiary)]"}`}>{configured ? "API 연결됨" : "준비 중"}</span>
                          </button>
                        );
                      })}
                    </div>

                    <label className="block space-y-1.5 text-[11px] text-[var(--lh-ink-secondary)]">
                      <span>모델</span>
                      <select value={aiSelection.model} onChange={(event) => updateAiModel(event.target.value)} className="min-h-10 w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 text-xs text-[var(--lh-ink)] outline-none focus:border-[var(--lh-primary)]">
                        {availableModels.map((model) => <option key={model.id} value={model.id}>{model.label}{model.lifecycle === "preview" ? " · Preview" : ""}{model.available ? "" : " · 준비 중"}</option>)}
                      </select>
                    </label>

                    <div className="space-y-1.5">
                      <span className="text-[11px] text-[var(--lh-ink-secondary)]">추론 수준</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedModel?.reasoningEfforts || []).map((effort) => (
                          <button key={effort} type="button" onClick={() => { setAiSelection((current) => ({ ...current, reasoningEffort: effort })); setAiSettingsStatus("idle"); }} className={`rounded-full border px-2.5 py-1 text-[10px] ${aiSelection.reasoningEffort === effort ? "border-[var(--lh-primary)] bg-[var(--lh-primary)] text-white" : "border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)]"}`}>
                            {REASONING_LABELS[effort]}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] leading-relaxed text-[var(--lh-ink-tertiary)]">높을수록 복잡한 문제에 유리하지만 응답 시간과 사용 토큰이 늘어날 수 있습니다.</p>
                    </div>

                    <label className="block space-y-1.5 text-[11px] text-[var(--lh-ink-secondary)]">
                      <span>요청당 최대 출력 한도</span>
                      <select value={aiSelection.maxOutputTokens} onChange={(event) => { setAiSelection((current) => ({ ...current, maxOutputTokens: Number(event.target.value) })); setAiSettingsStatus("idle"); }} className="min-h-10 w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3 text-xs text-[var(--lh-ink)] outline-none focus:border-[var(--lh-primary)]">
                        {(aiConfiguration?.outputTokenOptions || [...AI_OUTPUT_TOKEN_OPTIONS]).map((tokens) => <option key={tokens} value={tokens}>{tokens.toLocaleString()} tokens</option>)}
                      </select>
                      <span className="block text-[10px] text-[var(--lh-ink-tertiary)]">각 기능의 더 작은 안전 한도가 우선 적용됩니다.</span>
                    </label>

                    {aiConfiguration && (
                      <div className="rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-3 text-[10px] text-[var(--lh-ink-secondary)] space-y-1">
                        <div className="flex justify-between"><span>오늘 남은 요청</span><strong className="font-medium text-[var(--lh-ink)]">{aiConfiguration.usage.remainingRequestsToday.toLocaleString()} / {aiConfiguration.limits.requestsPerDay.toLocaleString()}</strong></div>
                        <div className="flex justify-between"><span>오늘 남은 예약 출력</span><strong className="font-medium text-[var(--lh-ink)]">{aiConfiguration.usage.remainingReservedOutputTokensToday.toLocaleString()} tokens</strong></div>
                        <div className="flex justify-between"><span>분당 요청 한도</span><strong className="font-medium text-[var(--lh-ink)]">{aiConfiguration.limits.requestsPerMinute.toLocaleString()}</strong></div>
                        <p className="pt-1 leading-relaxed text-[var(--lh-ink-tertiary)]">공급자 청구량이 아니라 LearnHub 서버가 보수적으로 예약한 사용량입니다. UTC 자정에 초기화됩니다.</p>
                      </div>
                    )}

                    <button type="button" onClick={handleSaveAiSettings} disabled={aiSettingsStatus === "loading" || !selectedModel} className="flex min-h-10 w-full items-center justify-center rounded-full bg-[var(--lh-primary)] px-4 text-xs font-medium text-white hover:bg-[var(--lh-primary-hover)] disabled:opacity-50">AI 설정 저장</button>
                    {aiSettingsStatus === "saved" && <p role="status" className="text-[11px] text-[var(--lh-primary)]">AI 설정을 저장하고 온라인 동기화를 요청했습니다.</p>}
                    {aiSettingsError && <p role="alert" className="text-[11px] leading-relaxed text-[var(--lh-danger)]">{aiSettingsError}</p>}
                  </div>

                  {/* AI Tutor Quick Access */}
                  {onOpenTutor && (
                    <div className="flex items-center justify-between rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4">
                      <div className="space-y-0.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[var(--lh-point)]" />
                          <span className="text-xs font-medium text-[var(--lh-ink)]">
                            AI 튜터
                          </span>
                        </div>
                        <p className="text-[11px] font-normal text-[var(--lh-ink-secondary)] leading-relaxed">
                          질문과 답변을 통해 스스로 답을 찾아가도록 돕는 1:1 대화형 튜터입니다.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenTutor();
                        }}
                        className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] hover:bg-[var(--lh-surface-subtle)] px-3.5 py-1.5 text-xs font-medium text-[var(--lh-ink)] transition cursor-pointer"
                      >
                        튜터 열기
                      </button>
                    </div>
                  )}

                  {/* Security & Privacy */}
                  <div className="flex items-center gap-2.5 px-3 py-2 text-[11px] font-normal text-[var(--lh-ink-tertiary)]">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--lh-point)]" />
                    <span>개인 학습 기록은 로그인한 계정별로 분리되어 저장됩니다.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-[var(--lh-line)] px-6 py-3 bg-[var(--lh-surface-subtle)]/30">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-1.5 text-xs font-medium text-[var(--lh-ink)] hover:bg-[var(--lh-surface-subtle)] transition cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
