import React, { useRef, useState } from "react";
import { DEFAULT_TUTOR_NAME } from "../../domain/tutorPersona";
import { TutorAvatar, useTutorPersona } from "./TutorAvatar";
import { TutorPersonaDialog } from "./TutorPersonaDialog";

/** 기본 튜터 이름. 화면에는 저장된 튜터 설정의 이름을 씁니다. */
export const AGENT_NAME = DEFAULT_TUTOR_NAME;

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

/**
 * AI 메시지: 왼쪽 원형 프로필, 그 위에 이름, 테두리 있는 말풍선. 메인 대화와 레슨 대화가 함께 씁니다.
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
    <div className={`flex w-full items-start gap-2.5 sm:gap-3 ${className}`}>
      <div className="w-8 shrink-0 sm:w-10">
        {showProfile && (
          // 키보드로는 바로 옆 이름 버튼으로 같은 창을 엽니다. 프로필은 마우스·터치용입니다.
          <button type="button" tabIndex={-1} aria-hidden onClick={() => setEditing(true)} title="튜터 설정" className="block rounded-full transition hover:opacity-80 cursor-pointer">
            <TutorAvatar avatar={persona.avatar} className="h-8 w-8 sm:h-10 sm:w-10" iconClassName="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {showProfile && (
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
          </p>
        )}
        {children !== null && children !== undefined && children !== false && (
          <div className="w-fit max-w-full rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 py-3.5 text-base leading-[1.75] text-[var(--lh-ink)] sm:px-5">{children}</div>
        )}
        {card}
      </div>
      {editing && <TutorPersonaDialog onClose={close} />}
    </div>
  );
};
