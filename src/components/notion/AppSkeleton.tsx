import React from "react";
import { LearnHubLogo } from "../common/LearnHubLogo";

/**
 * 로그인 확인과 클라우드 기록 복원이 끝날 때까지 보여 주는 앱 뼈대.
 * Sidebar(아이콘 레일 60px + 패널 264px)와 첫 화면 입력창의 자리를 그대로 잡아서
 * 실제 화면으로 바뀔 때 레이아웃이 튀지 않게 합니다.
 */

const Bar: React.FC<{ className?: string; round?: boolean }> = ({ className = "", round = false }) => (
  <span aria-hidden className={`block bg-[var(--lh-surface-strong)] ${round ? "rounded-full" : "rounded-md"} ${className}`} />
);

const COURSE_WIDTHS = ["w-36", "w-40", "w-32", "w-44"];
const RECENT_WIDTHS = ["w-32", "w-28", "w-36", "w-24", "w-40", "w-20", "w-32", "w-28"];

export const AppSkeleton: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="flex h-screen w-screen overflow-hidden bg-[var(--lh-canvas)]"
  >
    <span className="sr-only">계정의 학습 공간을 불러오는 중입니다.</span>

    <div aria-hidden className="flex flex-1 animate-pulse motion-reduce:animate-none">
      {/* 사이드바: 데스크톱에서만 (실제 Sidebar도 768px 미만에서는 접혀 있음) */}
      <div className="hidden h-full shrink-0 border-r border-[var(--lh-line)] bg-[var(--lh-surface)] md:flex">
        <div className="flex h-full w-[60px] flex-col items-center justify-between border-r border-[var(--lh-line)] py-3">
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex h-11 w-11 items-center justify-center">
              <LearnHubLogo size={28} />
            </span>
            <div className="mt-2 flex flex-col items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex h-11 w-11 items-center justify-center">
                  <Bar className="h-5 w-5" />
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex h-11 w-11 items-center justify-center">
              <Bar className="h-5 w-5" />
            </span>
            <span className="flex h-11 w-11 items-center justify-center">
              <Bar round className="h-8 w-8" />
            </span>
          </div>
        </div>

        <div className="flex h-full w-[264px] flex-col px-3 pt-3">
          <div className="flex h-11 items-center justify-between px-1">
            <Bar className="h-4 w-20" />
            <div className="flex gap-3">
              <Bar className="h-4 w-4" />
              <Bar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex h-10 items-center gap-2 px-2">
            <Bar className="h-4 w-4" />
            <Bar className="h-4 w-16" />
          </div>

          <Bar className="mt-6 ml-2 h-3 w-8" />
          <div className="mt-2 space-y-1">
            {COURSE_WIDTHS.map((width, i) => (
              <div key={i} className="flex h-9 items-center gap-2 px-2">
                <Bar className="h-4 w-4" />
                <Bar className={`h-3.5 ${width}`} />
              </div>
            ))}
          </div>

          <Bar className="mt-6 ml-2 h-3 w-8" />
          <div className="mt-2 space-y-1">
            {RECENT_WIDTHS.map((width, i) => (
              <div key={i} className="flex h-9 items-center px-2">
                <Bar className={`h-3.5 ${width}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 본문: 첫 화면(인사말 + 입력창 + 이어가기) 자리. ChatHome과 같은 간격·크기를 씁니다. */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--lh-chat-bg)] pb-24 pt-16">
        <div className="flex w-full flex-col items-center gap-8">
          <Bar className="h-9 w-[420px] max-w-[80%] rounded-lg sm:h-10" />
          <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6">
            <div className="flex h-[108px] flex-col justify-between rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] px-5 py-4">
              <Bar className="h-4 w-52" />
              <div className="flex items-center justify-between">
                <Bar className="h-5 w-5" />
                <div className="flex items-center gap-3">
                  <Bar className="h-4 w-36" />
                  <Bar round className="h-9 w-9" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex h-11 items-center">
            <Bar className="h-4 w-[340px] max-w-[80vw]" />
          </div>
        </div>
      </div>
    </div>
  </div>
);
