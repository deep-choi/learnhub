import React from "react";
import { SupabaseAccountPanel } from "./SupabaseAccountPanel";

interface ProfileViewProps {
  onDataChanged?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onDataChanged }) => (
  <div className="mx-auto max-w-[760px] space-y-6 px-5 py-12 pb-20 text-[var(--lh-ink)] sm:px-8">
    <header className="lh-page-header space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--lh-primary)]">Account</p>
      <h1 className="text-3xl font-medium tracking-tight text-[var(--lh-ink)] sm:text-4xl">계정 및 학습 기록</h1>
      <p className="text-sm leading-relaxed text-[var(--lh-ink-secondary)] sm:text-base">
        로그인 계정과 클라우드에 저장된 학습 기록을 관리합니다.
      </p>
    </header>

    <SupabaseAccountPanel onDataChanged={onDataChanged} />
  </div>
);
