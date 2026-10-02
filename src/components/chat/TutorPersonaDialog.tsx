import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, RotateCcw, Save, X } from "lucide-react";
import { DEFAULT_TUTOR_NAME, PERSONA_LIMITS, RESPONSE_LENGTH_LABELS } from "../../domain/tutorPersona";
import type { SaveTutorPersonaFailure, TutorPersonaInput, TutorResponseLength } from "../../types/tutorPersona";
import { getTutorPersona, resetTutorPersona, saveTutorPersona } from "../../services/tutorPersonaStore";
import { TutorAvatar } from "./TutorAvatar";
import { AvatarEditorModal } from "./AvatarEditorModal";
import { AVATAR_ACCEPT, AVATAR_MAX_FILE_BYTES } from "./avatarCrop";

const FAILURE_MESSAGES: Record<SaveTutorPersonaFailure, string> = {
  invalid_name: "이름은 1~20자로 적어 주세요. 링크·연락처나 부적절한 표현은 쓸 수 없어요.",
  invalid_personality: "성격과 행동 방식은 300자 이하로 적어 주세요. 부적절한 표현이나 규칙을 바꾸려는 내용은 쓸 수 없어요.",
  invalid_preset: "답변 길이를 다시 골라 주세요.",
  invalid_image: "이 사진은 쓸 수 없어요. 다른 사진으로 다시 올려 주세요.",
  invalid_role: "역할은 20자 이하로 적어 주세요. 링크·연락처나 부적절한 표현은 쓸 수 없어요.",
  invalid_tone: "말투는 40자 이하로 적어 주세요. 링크·연락처나 부적절한 표현은 쓸 수 없어요.",
  storage: "저장 공간이 부족해 저장하지 못했어요. 사진을 빼고 다시 저장해 보세요.",
};

const RESPONSE_LENGTHS: TutorResponseLength[] = ["short", "medium", "long"];
const charCount = (value: string) => [...value].length;

interface TutorPersonaDialogProps {
  onClose: () => void;
}

const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-3.5 text-base outline-none transition focus:border-[var(--lh-primary)]";

/**
 * 페르소나 편집 창. 대화의 튜터 프로필(또는 이름)을 누르면 열리고, 이미지·이름·역할·말투·답변 길이·성격을 바로 고칠 수 있다.
 * 말투와 성격만 바꾸며, 설명 방식(쉬운 말 → 정식 개념 → 예시)과 안전 원칙은 그대로다.
 */
export const TutorPersonaDialog: React.FC<TutorPersonaDialogProps> = ({ onClose }) => {
  const [draft, setDraft] = useState<TutorPersonaInput>(() => {
    const { updatedAt: _updatedAt, ...current } = getTutorPersona();
    return current;
  });
  const [editorSource, setEditorSource] = useState<File | string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const nameId = useId();
  const roleId = useId();
  const toneId = useId();
  const personalityId = useId();

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

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    // 창 안에서만 Tab 이동이 돌도록 묶습니다.
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
      .filter((element) => element.tabIndex >= 0 && (element.offsetParent !== null || element === document.activeElement));
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
    setEditorSource(file);
  };

  /** 연필이나 프로필을 누르면: 사진이 있으면 이미지 편집 창, 아직 없으면 바로 파일 선택부터. */
  const editImage = () => {
    if (draft.avatar?.kind === "image") setEditorSource(draft.avatar.dataUrl);
    else fileRef.current?.click();
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

  const displayName = draft.name.trim() || DEFAULT_TUTOR_NAME;
  const displayRole = draft.role?.trim() || "학습 코치";
  const nameLength = charCount(draft.name);
  const roleLength = charCount(draft.role ?? "");
  const toneLength = charCount(draft.tone ?? "");
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
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-medium">페르소나 편집</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--lh-ink-secondary)]">대화 중에도 이미지와 페르소나 설정을 바로 바꿀 수 있어요.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
          {/* 큰 원형 프로필과 연필 버튼, 그 아래 이름·역할 */}
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="relative">
              <button type="button" tabIndex={-1} aria-hidden onClick={editImage} className="block rounded-full transition hover:opacity-90 cursor-pointer">
                <TutorAvatar avatar={draft.avatar} className="h-24 w-24" iconClassName="h-11 w-11" />
              </button>
              <button
                ref={pencilRef}
                type="button"
                onClick={editImage}
                aria-label="프로필 이미지 편집"
                title="프로필 이미지 편집"
                className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] shadow-sm transition hover:text-[var(--lh-primary-text)] cursor-pointer"
              >
                <Pencil aria-hidden className="h-4 w-4" />
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
            <div className="text-center">
              <p className="text-lg font-medium">{displayName}</p>
              <p className="text-sm text-[var(--lh-ink-tertiary)]">{displayRole}</p>
            </div>
          </div>

          <div className="space-y-5 border-t border-[var(--lh-line)] pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={nameId} className="text-sm font-medium">이름</label>
                  <span className={`text-xs ${nameLength > PERSONA_LIMITS.nameLength ? "text-[var(--lh-danger)]" : "text-[var(--lh-ink-tertiary)]"}`}>{nameLength}/{PERSONA_LIMITS.nameLength}</span>
                </div>
                <input id={nameId} ref={nameRef} value={draft.name} onChange={(event) => update({ name: event.target.value })} maxLength={PERSONA_LIMITS.nameLength * 2} placeholder={DEFAULT_TUTOR_NAME} autoComplete="off" className={fieldClass} />
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={roleId} className="text-sm font-medium">역할</label>
                  <span className={`text-xs ${roleLength > PERSONA_LIMITS.roleLength ? "text-[var(--lh-danger)]" : "text-[var(--lh-ink-tertiary)]"}`}>{roleLength}/{PERSONA_LIMITS.roleLength}</span>
                </div>
                <input id={roleId} value={draft.role ?? ""} onChange={(event) => update({ role: event.target.value })} maxLength={PERSONA_LIMITS.roleLength * 2} placeholder="학습 코치" autoComplete="off" className={fieldClass} />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={toneId} className="text-sm font-medium">말투</label>
                <span className={`text-xs ${toneLength > PERSONA_LIMITS.toneLength ? "text-[var(--lh-danger)]" : "text-[var(--lh-ink-tertiary)]"}`}>{toneLength}/{PERSONA_LIMITS.toneLength}</span>
              </div>
              <input id={toneId} value={draft.tone ?? ""} onChange={(event) => update({ tone: event.target.value })} maxLength={PERSONA_LIMITS.toneLength * 2} placeholder="예: 부드럽고 친근하게" autoComplete="off" className={fieldClass} />
            </div>

            <fieldset>
              <legend className="text-sm font-medium">채팅 응답 길이 <span className="font-normal text-[var(--lh-ink-tertiary)]">· 선택</span></legend>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-[var(--lh-surface-subtle)] p-1" role="radiogroup" aria-label="채팅 응답 길이">
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

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={personalityId} className="text-sm font-medium">성격과 행동 방식</label>
                <span className={`text-xs ${personalityLength > PERSONA_LIMITS.personalityLength ? "text-[var(--lh-danger)]" : "text-[var(--lh-ink-tertiary)]"}`}>{personalityLength}/{PERSONA_LIMITS.personalityLength}</span>
              </div>
              <textarea
                id={personalityId}
                value={draft.customPersonality ?? ""}
                onChange={(event) => update({ customPersonality: event.target.value })}
                maxLength={PERSONA_LIMITS.personalityLength * 2}
                rows={5}
                placeholder={"예: 비유를 자주 들고, 끝에 짧게 응원해 줘요.\n모르는 건 모른다고 솔직하게 말해요."}
                className="mt-1.5 w-full resize-y rounded-xl border border-[var(--lh-line-strong)] bg-[var(--lh-surface)] px-3.5 py-2.5 text-base leading-6 outline-none transition focus:border-[var(--lh-primary)]"
              />
            </div>

            <p className="text-xs leading-5 text-[var(--lh-ink-tertiary)]">튜터의 말투만 바뀌어요. 쉬운 말로 시작해 정확한 개념과 예시로 이어 가는 설명 방식과 안전 원칙은 그대로예요.</p>
          </div>
        </div>

        <div className="border-t border-[var(--lh-line)] px-5 py-3.5 sm:px-6">
          {error && <p role="alert" className="mb-2.5 text-sm text-[var(--lh-danger)]">{error}</p>}
          {notice && <p role="status" className="mb-2.5 text-sm text-[var(--lh-ink-secondary)]">{notice}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={reset} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs text-[var(--lh-ink-tertiary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
              <RotateCcw aria-hidden className="h-3.5 w-3.5" /> 기본값으로 되돌리기
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="min-h-11 rounded-full px-4 text-sm font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">취소</button>
              <button type="button" onClick={save} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-5 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] cursor-pointer">
                <Save aria-hidden className="h-4 w-4" /> 저장하기
              </button>
            </div>
          </div>
        </div>
      </div>

      {editorSource !== null && (
        <AvatarEditorModal
          source={editorSource}
          name={displayName}
          onClose={() => { setEditorSource(null); pencilRef.current?.focus(); }}
          onApply={(dataUrl) => {
            update({ avatar: { kind: "image", dataUrl } });
            setEditorSource(null);
            pencilRef.current?.focus();
          }}
        />
      )}
    </div>,
    document.body,
  );
};
