import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import { AVATAR_ACCEPT, AVATAR_MAX_FILE_BYTES, AVATAR_MAX_ZOOM, clampCropOffset, cropSourceRect, displayScale, renderAvatarDataUrl } from "./avatarCrop";

const VIEWPORT = 272;
const KEY_STEP = 8;
const KEY_DELTAS: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-KEY_STEP, 0],
  ArrowRight: [KEY_STEP, 0],
  ArrowUp: [0, -KEY_STEP],
  ArrowDown: [0, KEY_STEP],
};

/** 원 테두리 위의 손잡이 8개. 상하좌우는 크고 모서리(대각선)는 작습니다. */
const HANDLES = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => ({ angle, large: angle % 90 === 0 }));

interface AvatarEditorModalProps {
  /** 사진 파일, 또는 이미 저장된 사진 주소(data URL) */
  source: File | string;
  /** 제목에 쓰는 튜터 이름 */
  name: string;
  onClose: () => void;
  /** 256px WebP(또는 작은 PNG) data URL */
  onApply: (dataUrl: string) => void;
}

/**
 * 프로필 이미지 편집 창(페르소나 편집 창 위에 겹쳐 열린다).
 * 원 안을 끌면 위치가 바뀌고, 흰 테두리 손잡이를 잡아당기면 확대·축소된다. 아래 슬라이더로도 확대·축소한다.
 */
export const AvatarEditorModal: React.FC<AvatarEditorModalProps> = ({ source, name, onClose, onApply }) => {
  const [current, setCurrent] = useState<File | string>(source);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const moveDrag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const zoomDrag = useRef<{ pointerId: number; startDistance: number; startZoom: number } | null>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    let url = "";
    let alive = true;
    const next = new Image();
    setImage(null);
    setError("");
    next.onload = () => {
      if (!alive) return;
      if (!next.naturalWidth || !next.naturalHeight) setError("사진을 읽지 못했어요. 다른 사진을 골라 주세요.");
      else setImage(next);
    };
    next.onerror = () => { if (alive) setError("사진을 읽지 못했어요. PNG, JPG, WebP 사진을 골라 주세요."); };
    if (typeof current === "string") {
      next.src = current;
    } else {
      url = URL.createObjectURL(current);
      next.src = url;
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [current]);

  useEffect(() => {
    if (image) circleRef.current?.focus();
  }, [image]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  const geometry = (nextZoom: number, x: number, y: number) =>
    image ? { viewport: VIEWPORT, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight, zoom: nextZoom, offsetX: x, offsetY: y } : null;

  const moveTo = (x: number, y: number, nextZoom = zoom) => {
    const view = geometry(nextZoom, x, y);
    if (view) setOffset(clampCropOffset(view));
  };

  const changeZoom = (value: number) => {
    const next = Math.min(AVATAR_MAX_ZOOM, Math.max(1, value));
    setZoom(next);
    moveTo(offset.x, offset.y, next);
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
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
    reset();
    setCurrent(file);
  };

  const apply = () => {
    const view = geometry(zoom, offset.x, offset.y);
    if (!image || !view) return;
    setBusy(true);
    // 그리기·압축이 잠깐 걸리므로 "만드는 중" 표시를 먼저 그린 뒤 처리한다.
    window.setTimeout(() => {
      const dataUrl = renderAvatarDataUrl(image, cropSourceRect(view));
      setBusy(false);
      if (dataUrl) onApply(dataUrl);
      else setError("사진을 작게 줄이지 못했어요. 다른 사진으로 다시 해 주세요.");
    }, 0);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    // 이 창 위의 키 입력이 아래의 페르소나 편집 창(Esc로 닫기, Tab 가두기)으로 새지 않게 막습니다.
    event.stopPropagation();
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]):not([type=hidden]), [tabindex]:not([tabindex='-1'])")]
      .filter((element) => element.tabIndex >= 0 && element.offsetParent !== null);
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

  const scale = image ? displayScale({ viewport: VIEWPORT, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight, zoom }) : 1;
  const half = VIEWPORT / 2;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 sm:items-center sm:p-4" onKeyDown={onKeyDown} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-[var(--lh-shadow-md)] sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-medium">{name} 이미지 편집</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--lh-ink-secondary)]">원 안쪽을 끌면 위치가 바뀌고, 흰 테두리를 잡아당기면 확대/축소돼요.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          <div className="mx-auto flex items-center justify-center rounded-2xl bg-neutral-900 py-6" style={{ maxWidth: VIEWPORT + 80 }}>
            <div className="relative" style={{ width: VIEWPORT, height: VIEWPORT }}>
              <div
                ref={circleRef}
                tabIndex={image ? 0 : -1}
                role="group"
                aria-label="사진 위치. 화살표 키로 옮기고 +, - 키로 확대·축소해요."
                onPointerDown={(event) => {
                  if (!image) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  moveDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
                }}
                onPointerMove={(event) => {
                  const drag = moveDrag.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  moveTo(drag.originX + event.clientX - drag.startX, drag.originY + event.clientY - drag.startY);
                }}
                onPointerUp={() => { moveDrag.current = null; }}
                onPointerCancel={() => { moveDrag.current = null; }}
                onKeyDown={(event) => {
                  const delta = KEY_DELTAS[event.key];
                  if (delta) {
                    event.preventDefault();
                    moveTo(offset.x + delta[0], offset.y + delta[1]);
                  } else if (event.key === "+" || event.key === "=") {
                    event.preventDefault();
                    changeZoom(zoom + 0.1);
                  } else if (event.key === "-") {
                    event.preventDefault();
                    changeZoom(zoom - 0.1);
                  }
                }}
                style={{ width: VIEWPORT, height: VIEWPORT }}
                className="absolute inset-0 touch-none select-none overflow-hidden rounded-full bg-neutral-700 cursor-grab active:cursor-grabbing"
              >
                {image ? (
                  <img
                    src={image.src}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none"
                    style={{
                      width: image.naturalWidth * scale,
                      height: image.naturalHeight * scale,
                      left: half - (image.naturalWidth * scale) / 2 + offset.x,
                      top: half - (image.naturalHeight * scale) / 2 + offset.y,
                    }}
                  />
                ) : (
                  !error && <span className="absolute inset-0 flex items-center justify-center"><Loader2 aria-hidden className="h-6 w-6 animate-spin text-white/70" /></span>
                )}
                {/* 3x3 격자 */}
                <span aria-hidden className="pointer-events-none absolute inset-0">
                  <span className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
                  <span className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
                  <span className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
                  <span className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
                </span>
              </div>
              {/* 흰 테두리 */}
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white" />
              {/* 흰 손잡이 8개: 끌어서 확대/축소 */}
              {HANDLES.map(({ angle, large }) => {
                const radians = (angle - 90) * (Math.PI / 180);
                const x = half + Math.cos(radians) * half;
                const y = half + Math.sin(radians) * half;
                const tangent = angle % 180 === 0; // 위·아래 손잡이는 가로로 긴 알약, 좌·우는 세로로 긴 알약
                const size = large ? (tangent ? { width: 36, height: 12 } : { width: 12, height: 36 }) : { width: 14, height: 14 };
                return (
                  <button
                    key={angle}
                    type="button"
                    tabIndex={-1}
                    aria-hidden
                    onPointerDown={(event) => {
                      if (!image || !circleRef.current) return;
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      const rect = circleRef.current.getBoundingClientRect();
                      const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
                      zoomDrag.current = { pointerId: event.pointerId, startDistance: Math.max(1, distance), startZoom: zoom };
                    }}
                    onPointerMove={(event) => {
                      const drag = zoomDrag.current;
                      if (!drag || drag.pointerId !== event.pointerId || !circleRef.current) return;
                      const rect = circleRef.current.getBoundingClientRect();
                      const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
                      changeZoom(drag.startZoom * (distance / drag.startDistance));
                    }}
                    onPointerUp={() => { zoomDrag.current = null; }}
                    onPointerCancel={() => { zoomDrag.current = null; }}
                    style={{ left: x - size.width / 2, top: y - size.height / 2, width: size.width, height: size.height }}
                    className="absolute touch-none rounded-full bg-white shadow-md cursor-nwse-resize"
                  />
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="shrink-0 text-sm text-[var(--lh-ink-secondary)]">축소</span>
            <label className="sr-only" htmlFor="avatar-editor-zoom">확대 정도</label>
            <input
              id="avatar-editor-zoom"
              type="range"
              min={1}
              max={AVATAR_MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={!image}
              onChange={(event) => changeZoom(Number(event.target.value))}
              aria-valuetext={`${Math.round(zoom * 100)}%`}
              className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--lh-primary)]"
            />
            <span className="shrink-0 text-sm text-[var(--lh-ink-secondary)]">확대</span>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-[var(--lh-danger)]">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--lh-line)] px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">
              <ImagePlus aria-hidden className="h-4 w-4" /> 이미지 변경
            </button>
            <button type="button" onClick={reset} disabled={!image} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] disabled:opacity-40 cursor-pointer disabled:cursor-default">
              <RotateCcw aria-hidden className="h-4 w-4" /> 초기화
            </button>
            <input ref={fileRef} type="file" accept={AVATAR_ACCEPT} className="hidden" tabIndex={-1} onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = ""; }} />
          </div>
          <button type="button" onClick={apply} disabled={!image || busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-5 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] disabled:opacity-40 cursor-pointer disabled:cursor-default">
            {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />} 적용 완료
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
