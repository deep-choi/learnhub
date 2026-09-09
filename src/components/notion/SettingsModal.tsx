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
} from "lucide-react";
import { UserAccount } from "../../types/learning";
import { ThemeMode, getStoredTheme, setTheme, THEME_CHANGED_EVENT } from "../../services/theme";
import { signOut as authClientSignOut } from "../../services/authClient";
import { StorageService } from "../../services/storage";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userAccount?: UserAccount;
  onOpenAuth?: () => void;
  onDataChanged?: () => void;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  onOpenTutor?: () => void;
}

type SettingsTab = "theme" | "account" | "general";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userAccount,
  onOpenAuth,
  onDataChanged,
  isZenMode = false,
  onToggleZenMode,
  onOpenTutor,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("theme");
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectTheme = (mode: ThemeMode) => {
    setTheme(mode);
    setCurrentTheme(mode);
  };

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await authClientSignOut();
      StorageService.setUser({
        id: "guest-default",
        name: "게스트 사용자",
        email: "",
        isGuest: true,
        createdAt: new Date().toISOString(),
      });
      if (onDataChanged) onDataChanged();
      onClose();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-2xl animate-scale-in"
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
        <div className="flex flex-col sm:flex-row min-h-[380px]">
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
          <div className="flex-1 p-6 overflow-y-auto">
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
                      <span>클라우드 동기화</span>
                    </span>
                    <span className="text-[11px] font-medium text-[var(--lh-ink)]">
                      {userAccount?.isGuest ? "로컬 저장만 적용" : "Supabase 안전 보관"}
                    </span>
                  </div>
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
                    <button
                      type="button"
                      disabled={isSigningOut}
                      onClick={handleSignOut}
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] hover:bg-[var(--lh-surface-subtle)] px-4 py-2 text-xs font-medium text-[var(--lh-ink-secondary)] hover:text-[var(--lh-danger)] transition cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{isSigningOut ? "로그아웃 중..." : "로그아웃"}</span>
                    </button>
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

                  {/* AI Tutor Quick Access */}
                  {onOpenTutor && (
                    <div className="flex items-center justify-between rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4">
                      <div className="space-y-0.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[var(--lh-point)]" />
                          <span className="text-xs font-medium text-[var(--lh-ink)]">
                            AI 소크라테스 튜터
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
                    <span>개인 학습 기록은 철저하게 암호화되어 관리됩니다.</span>
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
