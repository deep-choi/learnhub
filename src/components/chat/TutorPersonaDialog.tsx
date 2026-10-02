import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ImagePlus, RotateCcw, X } from "lucide-react";
import {
  DEFAULT_TUTOR_NAME,
  PERSONA_LIMITS,
  PERSONA_PRESETS,
  RESPONSE_LENGTH_LABELS,
  TUTOR_AVATAR_PRESET_IDS,
  TUTOR_AVATAR_PRESET_LABELS,
} from "../../domain/tutorPersona";
import type { SaveTutorPersonaFailure, TutorAvatar as TutorAvatarValue, TutorPersonaInput, TutorResponseLength } from "../../types/tutorPersona";
import { getTutorPersona, resetTutorPersona, saveTutorPersona } from "../../services/tutorPersonaStore";
import { TutorAvatar } from "./TutorAvatar";
import { AvatarCropper } from "./AvatarCropper";
import { AVATAR_ACCEPT, AVATAR_MAX_FILE_BYTES } from "./avatarCrop";

const FAILURE_MESSAGES: Record<SaveTutorPersonaFailure, string> = {
  invalid_name: "이름은 1~20자로 적어 주세요. 링크·연락처나 부적절한 표현은 쓸 수 없어요.",
  invalid_personality: "성격 설명은 300자 이하로 적어 주세요. 부적절한 표현이나 규칙을 바꾸려는 내용은 쓸 수 없어요.",
  invalid_preset: "말투와 답변 길이를 다시 골라 주세요.",
  invalid_image: "이 사진은 쓸 수 없어요. 다른 사진으로 다시 올려 주세요.",
  storage: "저장 공간이 부족해 저장하지 못했어요. 사진을 빼고 다시 저장해 보세요.",
};

const RESPONSE_LENGTHS: TutorResponseLength[] = ["short", "medium", "long"];
const avatarKey = (avatar?: TutorAvatarValue): string => (!avatar ? "default" : avatar.kind === "preset" ? `preset:${avatar.id}` : "image");
const charCount = (value: string) => [...value].length;

interface TutorPersonaDialogProps {
  onClose: () => void;
}

const optionClass = (selected: boolean) =>
  `relative flex shrink-0 items-center justify-center rounded-full p-0.5 transition cursor-pointer ${
    selected ? "ring-2 ring-[var(--lh-primary)] ring-offset-2 ring-offset-[var(--lh-surface)]" : "hover:opacity-80"
  }`;

/**
 * 튜터 이름·프로필·말투·답변 길이 편집 창. 대화의 튜터 프로필(또는 이름)을 누르면 열린다.
 * 말투와 성격만 바꾸며, 설명 방식(쉬운 말 → 정식 개념 → 예시)과 안전 원칙은 그대로다.
 */
export const TutorPersonaDialog: React.FC<TutorPersonaDialogProps> = ({ onClose }) => {
  const [draft, setDraft] = useState<TutorPersonaInput>(() => {
    const { updatedAt: _updatedAt, ...current } = getTutorPersona();
    return current;
  });
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameId = useId();
  const personalityId = useId();

  const preset = PERSONA_PRESETS.find((item) => item.id === draft.preset) ?? PERSONA_PRESETS[0];
  const update = (patch: Partial<TutorPersonaInput>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
    setNotice("");
  };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  // 처음 열 때, 그리고 자르기를 마치거나 취소하면 편집 화면의 이름 칸으로 갑니다.
  useEffect(() => {
    if (!cropFile) nameRef.current?.focus();
  }, [cropFile]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (cropFile) setCropFile(null);
      else onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    // 창 안에서만 Tab 이동이 돌도록 묶습니다.
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
      .filter((element) => element.offsetParent !== null || element === document.activeElement);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!AVATAR_ACCEPT.split(",").includes(file.type)) {
      setError("PNG, JPG, WebP, GIF 사진만 올릴 수 있어요.");
      return;
    }
    if (file.size > AVATAR_MAX_FILE_BYTES) {
      setError("15MB 이하 사진을 골라 주세요.");
      return;
    }
    setError("");
    setCropFile(file);
  };

  const save = () => {
    const result = saveTutorPersona(draft);
    if ("reason" in result) {
      setError(FAILURE_MESSAGES[result.reason]);
      return;
    }
    onClose();
  };

  const reset = () => {
    const persona = resetTutorPersona();
    if (!persona) {
      setError(FAILURE_MESSAGES.storage);
      return;
    }
    const { updatedAt: _updatedAt, ...current } = persona;
    setDraft(current);
    setError("");
    setNotice("기본값으로 되돌렸어요.");
  };

  const avatarOptions: { key: string; label: string; avatar?: TutorAvatarValue }[] = [
    { key: "default", label: "LearnHub 로고" },
    ...TUTOR_AVATAR_PRESET_IDS.map((id) => ({ key: `preset:${id}`, label: TUTOR_AVATAR_PRESET_LABELS[id], avatar: { kind: "preset", id } as TutorAvatarValue })),
    ...(draft.avatar?.kind === "image" ? [{ key: "image", label: "올린 사진", avatar: draft.avatar }] : []),
  ];
  const selectedAvatar = avatarKey(draft.avatar);
  const nameLength = charCount(draft.name);
  const personalityLength = charCount(draft.customPersonality ?? "");

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-[var(--lh-shadow-md)] sm:max-h-[90dvh] sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--lh-line)] px-5 py-4 sm:px-6">
          <h2 id={titleId} className="text-lg font-medium">튜터 설정</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {cropFile ? (
            <AvatarCropper
              file={cropFile}
              onCancel={() => setCropFile(null)}
              onApply={(dataUrl) => {
                update({ avatar: { kind: "image", dataUrl } });
                setCropFile(null);
              }}
            />
          ) : (
            <div className="space-y-7">
              {/* 미리보기: AI를 부르지 않고 고른 말투의 고정 예시 문장을 보여 줍니다. */}
              <div className="flex items-start gap-3 rounded-2xl bg-[var(--lh-surface-subtle)] p-4" aria-live="polite">
                <TutorAvatar avatar={draft.avatar} className="h-11 w-11" iconClassName="h-5.5 w-5.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{draft.name.trim() || DEFAULT_TUTOR_NAME}</p>
                  <p className="mt-1.5 w-fit max-w-full rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-3.5 py-2.5 text-[15px] leading-6">{preset.example}</p>
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={nameId} className="text-sm font-medium">이름</label>
                  <span className={`text-xs ${nameLength > PERSONA_LIMITS.nameLength ? "text-[var(--lh-danger)]" : "text-[var(--lh-ink-tertiary)]"}`}>{nameLength}/{PERSONA_LIMITS.nameLength}</span>
                </div>
                <input
                  id={nameId}
                  ref={nameRef}
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                  maxLength={PERSONA_LIMITS.nameLength * 2}
                  placeholder={DEFAULT_TUTOR_NAME}
                  autoComplete="off"
                  className="mt-2 min-h-11 w-full rounded-xl border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-3.5 text-base outline-none transition focus:border-[var(--lh-primary)]"
                />
              </div>

              <fieldset>
                <legend className="text-sm font-medium">프로필 이미지</legend>
                <div className="mt-3 flex flex-wrap items-center gap-3" role="radiogroup" aria-label="프로필 이미지">
                  {avatarOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={selectedAvatar === option.key}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => update({ avatar: option.avatar })}
                      className={optionClass(selectedAvatar === option.key)}
                    >
                      <TutorAvatar avatar={option.avatar} className="h-11 w-11" iconClassName="h-5.5 w-5.5" />
                      {selectedAvatar === option.key && (
                        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white"><Check className="h-3 w-3" /></span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-[var(--lh-line-strong)] px-3.5 text-sm text-[var(--lh-ink-secondary)] transition hover:border-[var(--lh-primary)] hover:text-[var(--lh-primary-text)] cursor-pointer"
                  >
                    <ImagePlus aria-hidden className="h-4 w-4" /> 사진 올리기
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={AVATAR_ACCEPT}
                    className="hidden"
                    tabIndex={-1}
                    onChange={(event) => {
                      pickFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--lh-ink-tertiary)]">올린 사진은 작게 줄여 계정에 저장돼요.</p>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium">성격과 말투</legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="성격과 말투">
                  {PERSONA_PRESETS.map((item) => {
                    const selected = draft.preset === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => update({ preset: item.id })}
                        className={`rounded-2xl border px-4 py-3 text-left transition cursor-pointer ${
                          selected ? "border-[var(--lh-primary)] bg-[var(--lh-primary-subtle)]" : "border-[var(--lh-line)] hover:border-[var(--lh-line-strong)] hover:bg-[var(--lh-surface-subtle)]"
                        }`}
                      >
                        <span className={`block text-[15px] font-medium ${selected ? "text-[var(--lh-primary-text)]" : ""}`}>{item.label}</span>
                        <span className="mt-0.5 block text-[13px] leading-5 text-[var(--lh-ink-secondary)]">{item.description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={personalityId} className="text-sm text-[var(--lh-ink-secondary)]">직접 적기 (선택)</label>
                    <span className={`text-xs ${personalityLength > PERSONA_LIMITS.personalityLength ? "text-[var(--lh-danger)]" : "text-[var(--lh-ink-tertiary)]"}`}>{personalityLength}/{PERSONA_LIMITS.personalityLength}</span>
                  </div>
                  <textarea
                    id={personalityId}
                    value={draft.customPersonality ?? ""}
                    onChange={(event) => update({ customPersonality: event.target.value })}
                    maxLength={PERSONA_LIMITS.personalityLength * 2}
                    rows={3}
                    placeholder="예: 비유를 자주 들고, 끝에 짧게 응원해 줘요"
                    className="mt-2 w-full resize-y rounded-xl border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-3.5 py-2.5 text-base leading-6 outline-none transition focus:border-[var(--lh-primary)]"
                  />
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium">답변 길이</legend>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-[var(--lh-surface-subtle)] p-1" role="radiogroup" aria-label="답변 길이">
                  {RESPONSE_LENGTHS.map((length) => (
                    <button
                      key={length}
                      type="button"
                      role="radio"
                      aria-checked={draft.responseLength === length}
                      onClick={() => update({ responseLength: length })}
                      className={`min-h-10 rounded-full text-sm font-medium transition cursor-pointer ${
                        draft.responseLength === length ? "bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-[var(--lh-shadow-sm)]" : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)]"
                      }`}
                    >
                      {RESPONSE_LENGTH_LABELS[length]}
                    </button>
                  ))}
                </div>
              </fieldset>

              <p className="text-xs leading-5 text-[var(--lh-ink-tertiary)]">튜터의 말투만 바뀌어요. 쉬운 말로 시작해 정확한 개념과 예시로 이어 가는 설명 방식과 안전 원칙은 그대로예요.</p>
            </div>
          )}
        </div>

        {!cropFile && (
          <div className="border-t border-[var(--lh-line)] px-5 py-3.5 sm:px-6">
            {error && <p role="alert" className="mb-2.5 text-sm text-[var(--lh-danger)]">{error}</p>}
            {notice && <p role="status" className="mb-2.5 text-sm text-[var(--lh-ink-secondary)]">{notice}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
                <RotateCcw aria-hidden className="h-4 w-4" /> 기본값으로 되돌리기
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">취소</button>
                <button type="button" onClick={save} className="min-h-11 rounded-full bg-[var(--lh-primary)] px-5 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">저장</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
