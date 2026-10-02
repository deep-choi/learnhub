import React from "react";
import { LearnHubLogo } from "../common/LearnHubLogo";

export const AGENT_NAME = "LearnHub 튜터";

interface AgentMessageProps {
  /** 같은 쪽이 연달아 보낸 메시지에서는 첫 메시지에만 프로필과 이름을 보여 줍니다. */
  showProfile: boolean;
  /** 말풍선 안에 들어갈 내용(글, 빠른 답 칩, 버튼) */
  children: React.ReactNode;
  /** 미리보기 카드처럼 말풍선 폭에 묶이지 않는 큰 카드. 프로필 오른쪽 열 전체 폭을 씁니다. */
  card?: React.ReactNode;
  /** 말풍선 없이 카드만 보여 줄 때 */
  className?: string;
}

/** AI 메시지: 왼쪽 원형 프로필, 그 위에 이름, 테두리 있는 말풍선. 메인 대화와 레슨 대화가 함께 씁니다. */
export const AgentMessage: React.FC<AgentMessageProps> = ({ showProfile, children, card, className = "" }) => (
  <div className={`flex w-full items-start gap-2.5 sm:gap-3 ${className}`}>
    <div className="w-8 shrink-0 sm:w-10">
      {showProfile && (
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] sm:h-10 sm:w-10">
          <span className="block h-4 w-4 sm:h-5 sm:w-5 [&_div]:flex [&_svg]:h-full [&_svg]:w-full"><LearnHubLogo size={20} /></span>
        </span>
      )}
    </div>
    <div className="min-w-0 flex-1 space-y-3">
      {showProfile && <p className="text-sm font-medium text-[var(--lh-ink)]">{AGENT_NAME}</p>}
      {children !== null && children !== undefined && children !== false && (
        <div className="w-fit max-w-full rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-3.5 text-base leading-[1.75] text-[var(--lh-ink)] sm:px-5">{children}</div>
      )}
      {card}
    </div>
  </div>
);
