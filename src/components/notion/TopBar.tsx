import React from "react";
import {
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelLeft,
  Share2,
  Sparkles,
} from "lucide-react";
import { NotionPageView } from "./Sidebar";
import { UserAccount } from "../../types/learning";

interface TopBarProps {
  activeView: NotionPageView;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenTutor: () => void;
  onOpenTimer: () => void;
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
  onOpenTimer,
  isZenMode,
  onToggleZenMode,
  userAccount,
  onOpenAuth,
}) => {
  const getBreadcrumbs = () => {
    switch (activeView.type) {
      case "home":
        return [{ label: "공부 홈" }, { label: "오늘의 학습" }];
      case "records":
        return [{ label: "기록" }, { label: "학습 기록" }];
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
    <header className="sticky top-0 z-30 flex h-11 w-full items-center justify-between border-b border-[#E9E9E7] bg-white px-3 text-xs text-[#787774]">
      {/* Left: Sidebar Toggle & Breadcrumbs */}
      <div className="flex items-center gap-1.5 truncate">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? "사이드바 접기" : "사이드바 열기"}
          title="사이드바 토글 (⌘\)"
          className="rounded-sm p-1 hover:bg-[#F7F6F3] hover:text-[#191919] transition cursor-pointer"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>

        <span className="text-[#D3D3D0]">/</span>

        <nav className="flex items-center gap-1 truncate max-w-[160px] sm:max-w-none">
          {crumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight className="h-3 w-3 text-[#D3D3D0] shrink-0" />}
              <span
                className={`truncate ${
                  idx === crumbs.length - 1
                    ? "font-semibold text-[#191919]"
                    : "hidden sm:inline hover:text-[#191919] transition cursor-pointer"
                }`}
              >
                {crumb.label}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onOpenTimer}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919] transition cursor-pointer"
          title="25분 집중 타이머"
        >
          <span>⏱️</span>
          <span className="font-mono text-[11px] hidden sm:inline">25분 집중</span>
        </button>

        <button
          type="button"
          onClick={onOpenTutor}
          aria-label="AI 선생님께 질문"
          className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-[#191919] hover:bg-[#F7F6F3] transition cursor-pointer"
        >
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#191919] text-[7px] text-white">
            ✦
          </span>
          <span className="font-semibold text-[11px] hidden sm:inline">AI 선생님께 질문</span>
          <span className="font-semibold text-[11px] sm:hidden">AI 질문</span>
        </button>

        <button
          type="button"
          onClick={onToggleZenMode}
          title={isZenMode ? "젠 모드 해제" : "집중 젠 모드"}
          className="rounded-sm p-1 text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919] transition cursor-pointer"
        >
          {isZenMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>

        {userAccount?.isGuest ? (
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1 rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-2 py-1 text-[11px] font-semibold text-[#191919] hover:bg-[#EFEFED] transition cursor-pointer ml-1"
          >
            <span>🌱 체험 중</span>
            <span className="text-[10px] text-[#787774] hidden md:inline">• 로그인하고 저장 ➔</span>
          </button>
        ) : (
          <div
            title="현재는 이 기기에만 저장되는 로컬 프로필입니다."
            className="flex items-center gap-1 rounded-sm border border-[#E9E9E7] px-2 py-1 text-[11px] font-semibold text-[#191919] ml-1"
          >
            <span>👤</span>
            <span className="hidden sm:inline">{userAccount?.name} · 이 기기</span>
          </div>
        )}
      </div>
    </header>
  );
};
