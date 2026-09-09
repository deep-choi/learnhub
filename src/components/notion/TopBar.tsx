import React from "react";
import { ChevronRight } from "lucide-react";
import { NotionPageView } from "./Sidebar";
import { LearnHubLogo } from "../common/LearnHubLogo";

interface TopBarProps {
  activeView: NotionPageView;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenTutor?: () => void;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  userAccount?: any;
  onOpenAuth?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  isSidebarOpen,
  onToggleSidebar,
}) => {

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
      {/* Left: Breadcrumbs (Clean Notion Style) */}
      <div className="flex items-center gap-2.5 truncate">
        {!isSidebarOpen && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title="사이드바 열기"
            className="flex items-center gap-2 pr-1 hover:opacity-80 transition cursor-pointer"
          >
            <LearnHubLogo size={22} />
            <span className="text-xs font-medium text-[var(--lh-ink)] hidden sm:inline">LearnHub</span>
          </button>
        )}

        <nav className="flex items-center gap-1.5 truncate max-w-[280px] sm:max-w-none">
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

      {/* Right side is intentionally clean and un-cluttered */}
      <div className="flex items-center shrink-0" />
    </header>
  );
};
