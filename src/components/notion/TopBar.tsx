import React, { useEffect, useState } from "react";
import {
  ChevronRight,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeft,
  Sparkles,
  Sun,
} from "lucide-react";
import { NotionPageView } from "./Sidebar";
import { UserAccount } from "../../types/learning";
import { LearnHubLogo } from "../common/LearnHubLogo";
import { THEME_CHANGED_EVENT, ThemeMode, getStoredTheme, toggleTheme } from "../../services/theme";

interface TopBarProps {
  activeView: NotionPageView;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenTutor: () => void;
  isZenMode: boolean;
  onToggleZenMode: () => void;
  userAccount?: UserAccount;
  onOpenAuth?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  isSidebarOpen,
  onToggleSidebar,
  onOpenTutor,
  isZenMode,
  onToggleZenMode,
  userAccount,
  onOpenAuth,
}) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: ThemeMode }>;
      if (customEvent.detail?.theme) {
        setThemeState(customEvent.detail.theme);
      }
    };
    window.addEventListener(THEME_CHANGED_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, handleThemeChange);
  }, []);

  const getBreadcrumbs = () => {
    switch (activeView.type) {
      case "home":
        return [{ label: "공부 홈" }, { label: "오늘의 학습" }];
      case "courses":
        return [{ label: "내 과목" }, { label: "학습 로드맵" }];
      case "course-detail":
        return [{ label: "내 과목" }, { label: activeView.course.title }];
      case "records":
        return [{ label: "기록" }, { label: "학습 기록" }];
      case "ai-chat":
        return [{ label: "AI" }, { label: "대화" }];
      case "lesson":
        return [
          { label: activeView.course.title },
          { label: activeView.chapterTitle },
          { label: activeView.lesson.title },
        ];
      case "knowledge-map":
        return [{ label: "고급 기능" }, { label: "수학 예시 지도" }];
      case "skill-matrix":
        return [{ label: "실력 분석" }, { label: "내 실력 현황" }];
      case "review-queue":
        return [{ label: "복습" }, { label: "오늘의 복습" }];
      case "mistake-archive":
        return [{ label: "오답 공책" }, { label: "다시 볼 문제들" }];
      case "settings":
        return [{ label: "설정" }, { label: "환경 설정" }];
    }
  };

  const crumbs = getBreadcrumbs();

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[var(--lh-line)] bg-[var(--lh-surface)]/90 px-4 text-sm text-[var(--lh-ink-secondary)] backdrop-blur-xl sm:px-6 transition-colors duration-200">
      {/* Left: Sidebar Toggle & Breadcrumbs */}
      <div className="flex items-center gap-2.5 truncate">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "사이드바 접기" : "사이드바 열기"}
          title="사이드바 토글 (⌘\)"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        {!isSidebarOpen && (
          <div className="flex items-center gap-2 pr-1">
            <LearnHubLogo size={20} />
            <span className="text-xs font-medium text-[var(--lh-ink)] hidden sm:inline">LearnHub</span>
          </div>
        )}

        <span className="text-[var(--lh-line-strong)]">/</span>

        <nav className="flex items-center gap-1.5 truncate max-w-[160px] sm:max-w-none">
          {crumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-[var(--lh-ink-tertiary)]" />}
              <span
                className={`truncate ${
                  idx === crumbs.length - 1
                    ? "rounded-full bg-[var(--lh-surface-subtle)] px-3 py-1 text-xs font-medium text-[var(--lh-ink)]"
                    : "hidden text-xs font-medium text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] sm:inline transition cursor-pointer"
                }`}
              >
                {crumb.label}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Right Actions: M3 Pill Chips & Buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenTutor}
          aria-label="AI 선생님께 질문"
          className="flex items-center gap-2 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-4 py-2 text-xs font-medium text-white shadow-xs transition cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">AI 튜터</span>
          <span className="sm:hidden">AI</span>
        </button>

        {/* Theme Toggle Button (Light = Royal Blue, Dark = Warm Orange) */}
        <button
          type="button"
          onClick={() => {
            const next = toggleTheme();
            setThemeState(next);
          }}
          title={theme === "dark" ? "라이트 모드로 전환 (블루 포인트)" : "다크 모드로 전환 (오렌지 포인트)"}
          aria-label="화면 테마 전환"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] shadow-xs transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-primary)] cursor-pointer"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-[var(--lh-primary)]" />
          ) : (
            <Moon className="h-4 w-4 text-[var(--lh-primary)]" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleZenMode}
          title={isZenMode ? "젠 모드 해제" : "집중 젠 모드"}
          className="hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-tertiary)] shadow-xs transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer md:flex"
        >
          {isZenMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>

        {userAccount?.isGuest ? (
          <button
            type="button"
            onClick={onOpenAuth}
            className="ml-1 flex items-center gap-1.5 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3.5 py-2 text-xs font-medium text-[var(--lh-ink)] shadow-xs transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
          >
            <span>로그인</span>
          </button>
        ) : (
          <div
            title="계정 및 학습 기록"
            className="ml-1 flex items-center gap-1 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3.5 py-2 text-xs font-medium text-[var(--lh-ink)] shadow-xs"
          >
            <span className="hidden sm:inline">{userAccount?.name}</span>
          </div>
        )}
      </div>
    </header>
  );
};
