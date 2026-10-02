import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import {
  AI_PROVIDER_LABELS,
  REASONING_EFFORT_LABELS,
  getAiModel,
  groupModelsByProvider,
  isCostlyReasoningEffort,
  selectionForModel,
  sortReasoningEfforts,
  type AiReasoningEffort,
  type AiRuntimeSelection,
} from "../../domain/aiModels";
import { getAiPreferences, saveAiPreferences } from "../../services/aiPreferences";
import { fetchAiAvailability, type AiAvailability } from "../../services/aiAvailability";
import { LEARNHUB_DATA_CHANGED_EVENT } from "../../services/storage";

export const REASONING_COST_HINT = "답이 더 느리고 하루 사용량을 더 써요";
export const PREPARING_LABEL = "준비 중";

/** 서버에 키가 없는 제공자의 모델에 붙는 작은 표시. */
const PreparingBadge: React.FC = () => (
  <span className="shrink-0 rounded-full bg-[var(--lh-surface-subtle)] px-1.5 text-[10px] leading-4 text-[var(--lh-ink-tertiary)]">{PREPARING_LABEL}</span>
);

/** 팝오버 첫 화면의 모델 이름. 설명 문구 없이 이름과 "준비 중" 표시만 보여 줍니다. */
export const ModelSummary: React.FC<{ label: string; available: boolean }> = ({ label, available }: { label: string; available: boolean }) => (
  <span className="flex min-w-0 flex-1 items-center gap-1.5">
    <span className="truncate text-[15px] font-medium">{label}</span>
    {!available && <PreparingBadge />}
  </span>
);

interface ModelListProps {
  models: AiAvailability["models"];
  selection: AiRuntimeSelection;
  onChoose: (provider: AiRuntimeSelection["provider"], id: string) => void;
  listRef?: React.Ref<HTMLDivElement>;
  onKeyDown?: (event: React.KeyboardEvent) => void;
}

/**
 * "모델 고르기" 목록. Claude → GPT → Gemini 순서로 제공자 제목 아래에 모델 이름만 보여 줍니다.
 * 키가 없는 제공자의 모델은 "준비 중"으로 표시하고 고를 수 없습니다.
 */
export const ModelList: React.FC<ModelListProps> = ({ models, selection, onChoose, listRef, onKeyDown }: ModelListProps) => {
  const selectedAvailable = models.some((item) => item.available && item.provider === selection.provider && item.id === selection.model);
  const firstAvailable = models.find((item) => item.available);
  const groups = groupModelsByProvider(models);
  return (
    <div ref={listRef} role="radiogroup" aria-label="AI 모델" onKeyDown={onKeyDown} className="mt-1 max-h-[min(18rem,40dvh)] overflow-y-auto">
      {groups.map((group) => (
        <div key={group.provider} className="py-1">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium text-[var(--lh-ink-tertiary)]">{AI_PROVIDER_LABELS[group.provider]}</p>
          {group.models.map((item) => {
            const selected = item.provider === selection.provider && item.id === selection.model;
            const focusable = item.available && (selected || (!selectedAvailable && item === firstAvailable));
            return (
              <button
                key={`${item.provider}:${item.id}`}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!item.available}
                aria-label={item.available ? item.label : `${item.label}, ${PREPARING_LABEL}`}
                tabIndex={focusable ? 0 : -1}
                onClick={() => onChoose(item.provider, item.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                  !item.available
                    ? "cursor-not-allowed opacity-60"
                    : selected
                      ? "bg-[var(--lh-primary-subtle)] cursor-pointer"
                      : "hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
                }`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className={`truncate text-sm font-medium ${selected && item.available ? "text-[var(--lh-primary-text)]" : ""}`}>{item.label}</span>
                  {item.lifecycle === "preview" && (
                    <span className="shrink-0 rounded-full border border-[var(--lh-line-strong)] px-1.5 text-[10px] leading-4 text-[var(--lh-ink-secondary)]">미리보기</span>
                  )}
                  {!item.available && <PreparingBadge />}
                </span>
                {selected && item.available && <Check aria-hidden className="h-4 w-4 shrink-0 text-[var(--lh-primary-text)]" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

interface ReasoningSliderProps {
  efforts: AiReasoningEffort[];
  value: AiReasoningEffort;
  onChange: (effort: AiReasoningEffort) => void;
}

/** 모델이 지원하는 단계만 눈금으로 보여 주는 슬라이더. 화살표·Home·End 키와 끌기, 눈금 이름 누르기로 바꾼다. */
const ReasoningSlider: React.FC<ReasoningSliderProps> = ({ efforts, value, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const index = Math.max(0, efforts.indexOf(value));
  const last = efforts.length - 1;
  const percent = (i: number) => (last === 0 ? 0 : (i / last) * 100);

  const pick = (i: number) => {
    const next = efforts[Math.min(last, Math.max(0, i))];
    if (next && next !== value) onChange(next);
  };
  const pickAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    pick(Math.round(((clientX - rect.left) / rect.width) * last));
  };

  return (
    <div className="px-2">
      <div
        role="slider"
        tabIndex={0}
        aria-label="추론 단계"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={REASONING_EFFORT_LABELS[value]}
        onKeyDown={(event) => {
          const moves: Record<string, number> = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: last };
          if (event.key in moves) {
            event.preventDefault();
            pick(moves[event.key]);
          }
        }}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          pickAt(event.clientX);
        }}
        onPointerMove={(event) => { if (dragging.current) pickAt(event.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        className="relative flex h-8 touch-none items-center rounded-full cursor-pointer"
      >
        <div ref={trackRef} className="relative h-1 w-full rounded-full bg-[var(--lh-line-strong)]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--lh-primary)]" style={{ width: `${percent(index)}%` }} />
          {efforts.map((effort, i) => (
            <span
              key={effort}
              aria-hidden
              className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${i <= index ? "border-[var(--lh-primary)] bg-[var(--lh-primary)]" : "border-[var(--lh-line-strong)] bg-[var(--lh-surface)]"}`}
              style={{ left: `${percent(i)}%` }}
            />
          ))}
          <span
            aria-hidden
            className="absolute top-1/2 h-4.5 w-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--lh-surface)] bg-[var(--lh-primary)] shadow-[var(--lh-shadow-sm)] ring-4 ring-[var(--lh-primary-subtle)] transition-[left]"
            style={{ left: `${percent(index)}%` }}
          />
        </div>
      </div>
      <div className="relative mt-1 h-5" aria-hidden>
        {efforts.map((effort, i) => (
          <button
            key={effort}
            type="button"
            tabIndex={-1}
            onClick={() => pick(i)}
            className={`absolute top-0 whitespace-nowrap text-[11px] leading-5 transition cursor-pointer ${
              i === 0 ? "translate-x-0" : i === last ? "-translate-x-full" : "-translate-x-1/2"
            } ${i === index ? "font-medium text-[var(--lh-ink)]" : "text-[var(--lh-ink-tertiary)] hover:text-[var(--lh-ink-secondary)]"}`}
            style={{ left: `${percent(i)}%` }}
          >
            {REASONING_EFFORT_LABELS[effort]}
          </button>
        ))}
      </div>
    </div>
  );
};

interface ModelReasoningPickerProps {
  /** 팝오버를 여는 방향. 화면 아래쪽 입력바는 위로, 첫 화면 가운데 입력바는 아래로 엽니다. */
  direction?: "up" | "down";
}
// 부모 입력바 상자에 `relative`가 있어야 합니다. 팝오버는 그 상자의 오른쪽 끝에 맞춰 열려 좁은 화면에서도 밖으로 나가지 않습니다.

/**
 * 입력바의 "모델 · 추론 단계" 알약 버튼과 팝오버. 제공자별로 모델을 묶고, 키가 없으면 준비 중으로 표시하며,
 * 선택은 설정 창과 같은 `aiPreferences`에 저장돼 다음 메시지부터 적용되고 계정에 동기화됩니다.
 * 비로그인 화면에서는 부모가 이 버튼을 그리지 않습니다.
 */
export const ModelReasoningPicker: React.FC<ModelReasoningPickerProps> = ({ direction = "up" }) => {
  const [availability, setAvailability] = useState<AiAvailability | null>(null);
  const [selection, setSelection] = useState<AiRuntimeSelection>(() => getAiPreferences());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "models">("main");
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    let alive = true;
    void fetchAiAvailability().then((result) => { if (alive) setAvailability(result); });
    return () => { alive = false; };
  }, []);

  // 설정 창·동기화·다른 탭에서 바뀐 선택을 따라갑니다.
  useEffect(() => {
    const sync = () => setSelection(getAiPreferences());
    window.addEventListener(LEARNHUB_DATA_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LEARNHUB_DATA_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (view === "models") (listRef.current?.querySelector<HTMLElement>("[aria-checked='true']:not(:disabled)") ?? listRef.current?.querySelector<HTMLElement>("[role='radio']:not(:disabled)"))?.focus();
    else modelButtonRef.current?.focus();
  }, [open, view]);

  if (!availability || !availability.models.some((item) => item.available)) return null;

  const model = getAiModel(selection.provider, selection.model);
  const modelAvailable = availability.models.some((item) => item.available && item.provider === selection.provider && item.id === selection.model);
  const efforts = sortReasoningEfforts(model?.reasoningEfforts ?? []);
  const effortLabel = REASONING_EFFORT_LABELS[selection.reasoningEffort];
  const modelLabel = model?.label ?? selection.model;
  const statusLabel = modelAvailable ? effortLabel : PREPARING_LABEL;

  const save = (next: AiRuntimeSelection) => {
    if (saveAiPreferences(next)) {
      setSelection(next);
      setError("");
    } else {
      setError("선택을 저장하지 못했어요. 잠시 후 다시 해 주세요.");
    }
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const chooseModel = (provider: AiRuntimeSelection["provider"], id: string) => {
    const next = selectionForModel(selection, provider, id);
    if (next) save(next);
    setView("main");
  };

  const moveInList = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[role='radio']:not(:disabled)") ?? [])];
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className="min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          if (view === "models") setView("main");
          else close();
        }
      }}
      onBlur={(event) => {
        if (open && !rootRef.current?.contains(event.relatedTarget as Node | null) && event.relatedTarget) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setView("main");
          setOpen((value) => !value);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`AI 모델과 추론 단계: ${modelLabel} ${statusLabel}`}
        className="flex h-9 min-w-0 max-w-[10.5rem] items-center gap-1 rounded-full px-2.5 text-sm text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] sm:max-w-[17rem] cursor-pointer"
      >
        <span className="truncate">{modelLabel}</span>
        <span className="shrink-0 text-[var(--lh-ink-tertiary)]">{statusLabel}</span>
        <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="AI 모델과 추론 단계"
          className={`absolute right-0 z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-2 text-[var(--lh-ink)] shadow-lg ${direction === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {view === "main" ? (
            <div className="space-y-2">
              <button
                ref={modelButtonRef}
                type="button"
                onClick={() => setView("models")}
                aria-label={`모델: ${modelLabel}${modelAvailable ? "" : `, ${PREPARING_LABEL}`}. 눌러서 다른 모델 고르기`}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer"
              >
                <ModelSummary label={modelLabel} available={modelAvailable} />
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[var(--lh-ink-tertiary)]" />
              </button>
              {!modelAvailable && (
                <p className="px-3 text-xs leading-5 text-[var(--lh-ink-secondary)]">이 모델은 아직 준비 중이에요. 그동안에는 기본 모델이 답해요. 다른 모델을 골라도 돼요.</p>
              )}
              {efforts.length > 1 && (
                <div className="border-t border-[var(--lh-line)] px-1 pb-1 pt-3">
                  <div className="mb-1 flex items-center justify-between px-2 text-xs text-[var(--lh-ink-secondary)]">
                    <span>추론 단계</span>
                    <span className="font-medium text-[var(--lh-ink)]">{effortLabel}</span>
                  </div>
                  <ReasoningSlider efforts={efforts} value={selection.reasoningEffort} onChange={(reasoningEffort) => save({ ...selection, reasoningEffort })} />
                  {isCostlyReasoningEffort(selection.reasoningEffort) && (
                    <p className="mt-2 flex items-center gap-1.5 px-2 text-xs text-[var(--lh-ink-secondary)]">
                      <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" /> {REASONING_COST_HINT}
                    </p>
                  )}
                </div>
              )}
              {error && <p role="alert" className="px-3 pb-1 text-xs text-[var(--lh-danger)]">{error}</p>}
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setView("main")}
                className="flex min-h-10 w-full items-center gap-1.5 rounded-xl px-2 text-sm text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" /> 모델 고르기
              </button>
              <ModelList models={availability.models} selection={selection} onChoose={chooseModel} listRef={listRef} onKeyDown={moveInList} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
