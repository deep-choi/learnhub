import React from "react";
import { BarChart2, BookOpen, Home, Plus, RotateCcw, User } from "lucide-react";
import { LearnHubLogo } from "./common/LearnHubLogo";

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
      <header className="sticky top-0 z-30 border-b border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)]">
        <div className="mx-auto flex h-13 max-w-5xl items-center justify-between px-4">
          <button
            type="button"
            onClick={() => onSelectTab("home")}
            className="flex items-center gap-2.5 text-left focus:outline-none cursor-pointer"
          >
            <LearnHubLogo size={22} showWordmark={true} />
            <span className="hidden rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--lh-primary-text)] sm:inline-block">
              Study
            </span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                onClick={() => onSelectTab(id)}
                className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                  activeTab === id
                    ? "bg-[var(--lh-primary-subtle)] text-[var(--lh-primary)] border border-[var(--lh-primary-border)]"
                    : "text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] font-normal"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {id === "review" && pendingReviewsCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--lh-secondary)] px-1 text-[9px] font-medium text-white">
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
              className="flex items-center gap-1.5 rounded-full bg-[var(--lh-primary)] px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--lh-primary-hover)] shadow-xs cursor-pointer focus:outline-none"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>새 과목 설계</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab("profile")}
              aria-label="설정"
              className={`hidden h-8 w-8 items-center justify-center rounded-full transition md:flex cursor-pointer ${
                activeTab === "profile"
                  ? "bg-[var(--lh-primary-subtle)] text-[var(--lh-primary)] border border-[var(--lh-primary-border)]"
                  : "text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)]"
              }`}
            >
              <User className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-[var(--lh-line)] bg-[var(--lh-surface)] px-2 py-1 md:hidden">
        {[...navItems, { id: "profile" as TabType, label: "설정", icon: User }].map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            onClick={() => onSelectTab(id)}
            className={`relative flex flex-col items-center gap-0.5 rounded-md py-1 text-[10px] font-medium transition cursor-pointer ${
              activeTab === id ? "text-[var(--lh-primary)]" : "text-[var(--lh-ink-secondary)] font-normal"
            }`}
          >
            <span className="relative">
              <Icon className="h-4 w-4" />
              {id === "review" && pendingReviewsCount > 0 && (
                <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--lh-secondary)] px-1 text-[8px] font-medium text-white">
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
