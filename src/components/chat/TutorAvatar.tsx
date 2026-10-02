import React, { useSyncExternalStore } from "react";
import { Bird, Cat, Lightbulb, Rabbit, Sprout, Star, type LucideIcon } from "lucide-react";
import { LearnHubLogo } from "../common/LearnHubLogo";
import { TUTOR_AVATAR_PRESET_IDS, type TutorAvatarPresetId } from "../../domain/tutorPersona";
import type { TutorAvatar as TutorAvatarValue, TutorPersona } from "../../types/tutorPersona";
import { getTutorPersonaSnapshot, subscribeTutorPersona } from "../../services/tutorPersonaStore";

/** 저장된 튜터 설정. 설정 창·동기화·다른 탭에서 바뀌면 다시 그린다. */
export const useTutorPersona = (): TutorPersona =>
  useSyncExternalStore(subscribeTutorPersona, getTutorPersonaSnapshot, getTutorPersonaSnapshot);

export const PRESET_AVATAR_ICONS: Record<TutorAvatarPresetId, LucideIcon> = {
  bird: Bird,
  cat: Cat,
  rabbit: Rabbit,
  sprout: Sprout,
  star: Star,
  bulb: Lightbulb,
};

const PRIMARY_TONE = "border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] text-[var(--lh-primary-text)]";
const SECONDARY_TONE = "border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] text-[var(--lh-secondary-text)]";

const isPresetId = (id: string): id is TutorAvatarPresetId => (TUTOR_AVATAR_PRESET_IDS as readonly string[]).includes(id);

interface TutorAvatarProps {
  /** 비어 있으면 LearnHub 로고(기본 이미지)다. */
  avatar?: TutorAvatarValue;
  /** 바깥 원 크기 */
  className?: string;
  /** 안쪽 아이콘·로고 크기 */
  iconClassName?: string;
}

/** 튜터 프로필 원. 기본 로고, 기본 이미지(아이콘), 올린 사진을 같은 원 모양으로 그린다. 장식이라 스크린 리더에는 숨긴다. */
export const TutorAvatar: React.FC<TutorAvatarProps> = ({ avatar, className = "h-10 w-10", iconClassName = "h-5 w-5" }) => {
  if (avatar?.kind === "image") {
    return <img src={avatar.dataUrl} alt="" aria-hidden className={`${className} shrink-0 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] object-cover`} />;
  }
  if (avatar?.kind === "preset" && isPresetId(avatar.id)) {
    const Icon = PRESET_AVATAR_ICONS[avatar.id];
    const tone = TUTOR_AVATAR_PRESET_IDS.indexOf(avatar.id) % 2 === 0 ? PRIMARY_TONE : SECONDARY_TONE;
    return (
      <span aria-hidden className={`${className} flex shrink-0 items-center justify-center rounded-full border ${tone}`}>
        <Icon className={iconClassName} />
      </span>
    );
  }
  return (
    <span aria-hidden className={`${className} flex shrink-0 items-center justify-center rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)]`}>
      <span className={`block ${iconClassName} [&_div]:flex [&_svg]:h-full [&_svg]:w-full`}><LearnHubLogo size={20} /></span>
    </span>
  );
};
