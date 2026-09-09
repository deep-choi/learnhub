import React from "react";
import { BarChart2, BookOpen, Home, Plus, RotateCcw, User } from "lucide-react";

export type TabType = "home" | "courses" | "review" | "stats" | "profile";

interface NavbarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenCreateCourse: () => void;
  pendingReviewsCount: number;
}

const navItems: Array<{ id: TabType; label: string; icon: React.ElementType }> = [
  { id: "home", label: "서재", icon: Home },
  { id: "courses", label: "교과 커리큘럼", icon: BookOpen },
  { id: "review", label: "망각곡선 복습", icon: RotateCcw },
  { id: "stats", label: "지식 매트릭스", icon: BarChart2 },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onOpenCreateCourse,
  pendingReviewsCount,
}) => {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[#E9E9E7] bg-white text-[#2F3437]">
        <div className="mx-auto flex h-13 max-w-5xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => onSelectTab("home")}
            className="flex items-center gap-2 text-left focus:outline-none"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-[#191919] text-[12px] font-bold text-white">
              L
            </span>
            <span className="text-sm font-bold tracking-tight text-[#191919]">LearnHub</span>
            <span className="hidden rounded-sm bg-[#F7F6F3] px-1.5 py-0.5 text-[10px] font-medium text-[#787774] sm:inline-block">
              Study
            </span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                onClick={() => onSelectTab(id)}
                className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === id
                    ? "bg-[#EFEFED] text-[#191919] font-semibold"
                    : "text-[#787774] hover:bg-[#F7F6F3] hover:text-[#2F3437]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {id === "review" && pendingReviewsCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#191919] px-1 text-[9px] font-bold text-white">
                    {pendingReviewsCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenCreateCourse}
              className="flex items-center gap-1.5 rounded-md bg-[#191919] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#37352F] focus:outline-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>새 과목 설계</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab("profile")}
              aria-label="설정"
              className={`hidden h-8 w-8 items-center justify-center rounded-md transition md:flex ${
                activeTab === "profile"
                  ? "bg-[#EFEFED] text-[#191919]"
                  : "text-[#787774] hover:bg-[#F7F6F3] hover:text-[#2F3437]"
              }`}
            >
              <User className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-[#E9E9E7] bg-white px-2 py-1 md:hidden">
        {[...navItems, { id: "profile" as TabType, label: "설정", icon: User }].map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            onClick={() => onSelectTab(id)}
            className={`relative flex flex-col items-center gap-0.5 rounded-md py-1 text-[10px] font-medium transition ${
              activeTab === id ? "text-[#191919] font-bold" : "text-[#787774]"
            }`}
          >
            <span className="relative">
              <Icon className="h-4 w-4" />
              {id === "review" && pendingReviewsCount > 0 && (
                <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#191919] px-1 text-[8px] font-bold text-white">
                  {pendingReviewsCount}
                </span>
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
};
