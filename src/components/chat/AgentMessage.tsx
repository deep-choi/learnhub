import React, { useRef, useState } from "react";
import { DEFAULT_TUTOR_NAME } from "../../domain/tutorPersona";
import { TutorAvatar, useTutorPersona } from "./TutorAvatar";
import { TutorPersonaDialog } from "./TutorPersonaDialog";

/** 기본 튜터 이름. 화면에는 저장된 튜터 설정의 이름을 씁니다. */
export const AGENT_NAME = DEFAULT_TUTOR_NAME;

interface AgentMessageProps {
  /** 같은 쪽이 연달아 보낸 메시지에서는 첫 메시지에만 프로필과 이름을 보여 줍니다. */
  showProfile: boolean;
  /** 본문(배경 없는 글, 빠른 답 칩, 버튼) */
  children: React.ReactNode;
  /** 미리보기 카드처럼 원래 카드인 UI. 본문과 같은 왼쪽 시작선에서 대화 열 전체 폭을 씁니다. */
  card?: React.ReactNode;
  /** 말풍선 없이 카드만 보여 줄 때 */
  className?: string;
}

/**
 * AI 메시지: 위에 한 줄로 [프로필 원 + 이름], 그 아래 배경 없는 왼쪽 정렬 글(ChatGPT·Claude 웹처럼). 메인 대화와 레슨 대화가 함께 씁니다.
 * 프로필이나 이름을 누르면 튜터 설정(이름·이미지·말투) 창이 열립니다.
 */
export const AgentMessage: React.FC<AgentMessageProps> = ({ showProfile, children, card, className = "" }) => {
  const persona = useTutorPersona();
  const [editing, setEditing] = useState(false);
  const nameRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setEditing(false);
    nameRef.current?.focus();
  };

  return (
    <div className={`w-full ${className}`}>
      {showProfile && (
        <div className="mb-2.5 flex items-center gap-2.5">
          {/* 키보드로는 바로 옆 이름 버튼으로 같은 창을 엽니다. 프로필은 마우스·터치용입니다. */}
          <button type="button" tabIndex={-1} aria-hidden onClick={() => setEditing(true)} title="튜터 설정" className="block shrink-0 rounded-full transition hover:opacity-80 cursor-pointer">
            <TutorAvatar avatar={persona.avatar} className="h-8 w-8 sm:h-9 sm:w-9" iconClassName="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          </button>
          <p className="text-sm font-medium text-[var(--lh-ink)]">
            <button
              ref={nameRef}
              type="button"
              onClick={() => setEditing(true)}
              aria-haspopup="dialog"
              aria-label={`${persona.name}, 튜터 이름과 말투 바꾸기`}
              className="rounded-md text-left underline-offset-4 transition hover:underline cursor-pointer"
            >
              {persona.name}
            </button>
            {persona.role && <span className="ml-2 text-xs font-normal text-[var(--lh-ink-tertiary)]">{persona.role}</span>}
          </p>
        </div>
      )}
      <div className="min-w-0 space-y-3">
        {children !== null && children !== undefined && children !== false && (
          <div className="min-w-0 max-w-full text-base leading-[1.75] text-[var(--lh-ink)]">{children}</div>
        )}
        {card}
      </div>
      {editing && <TutorPersonaDialog onClose={close} />}
    </div>
  );
};
