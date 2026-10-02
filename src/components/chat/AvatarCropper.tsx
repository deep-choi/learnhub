import React, { useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { AVATAR_MAX_ZOOM, clampCropOffset, cropSourceRect, displayScale, renderAvatarDataUrl } from "./avatarCrop";

const VIEWPORT = 224;
const KEY_STEP = 8;
const KEY_DELTAS: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-KEY_STEP, 0],
  ArrowRight: [KEY_STEP, 0],
  ArrowUp: [0, -KEY_STEP],
  ArrowDown: [0, KEY_STEP],
};

interface AvatarCropperProps {
  file: File;
  onCancel: () => void;
  /** 256px WebP(또는 작은 PNG) data URL */
  onApply: (dataUrl: string) => void;
}

/** 올린 사진을 원 안에 맞춰 옮기고 확대해 자른다. 끌기·화살표 키로 옮기고 슬라이더로 확대한다. */
export const AvatarCropper: React.FC<AvatarCropperProps> = ({ file, onCancel, onApply }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const next = new Image();
    let alive = true;
    next.onload = () => {
      if (!alive) return;
      if (!next.naturalWidth || !next.naturalHeight) setError("사진을 읽지 못했어요. 다른 사진을 골라 주세요.");
      else setImage(next);
    };
    next.onerror = () => { if (alive) setError("사진을 읽지 못했어요. PNG, JPG, WebP 사진을 골라 주세요."); };
    next.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (image) areaRef.current?.focus();
  }, [image]);

  const view = image
    ? { viewport: VIEWPORT, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight, zoom, offsetX: offset.x, offsetY: offset.y }
    : null;

  const moveTo = (x: number, y: number, nextZoom = zoom) => {
    if (!image) return;
    setOffset(clampCropOffset({ viewport: VIEWPORT, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight, zoom: nextZoom, offsetX: x, offsetY: y }));
  };

  const changeZoom = (value: number) => {
    const next = Math.min(AVATAR_MAX_ZOOM, Math.max(1, value));
    setZoom(next);
    moveTo(offset.x, offset.y, next);
  };

  const apply = () => {
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

  const scale = view ? displayScale(view) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium text-[var(--lh-ink)]">사진 자르기</h3>
        <p className="mt-1 text-sm text-[var(--lh-ink-secondary)]">원 안에 들어갈 부분을 끌어서 맞춰 주세요. 키보드 화살표로도 옮길 수 있어요.</p>
      </div>
      <div className="flex justify-center">
        <div
          ref={areaRef}
          tabIndex={image ? 0 : -1}
          role="group"
          aria-label="사진 위치. 화살표 키로 옮겨요."
          onPointerDown={(event) => {
            if (!image) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            moveTo(current.originX + event.clientX - current.startX, current.originY + event.clientY - current.startY);
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
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
          className="relative touch-none select-none overflow-hidden rounded-2xl bg-[var(--lh-surface-strong)] cursor-grab active:cursor-grabbing"
        >
          {image && view ? (
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                width: view.imageWidth * scale,
                height: view.imageHeight * scale,
                left: VIEWPORT / 2 - (view.imageWidth * scale) / 2 + offset.x,
                top: VIEWPORT / 2 - (view.imageHeight * scale) / 2 + offset.y,
              }}
            />
          ) : (
            !error && <span className="absolute inset-0 flex items-center justify-center"><Loader2 aria-hidden className="h-5 w-5 animate-spin text-[var(--lh-ink-tertiary)]" /></span>
          )}
          {/* 원 바깥을 어둡게 덮어 실제로 쓰일 부분을 보여 줍니다. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] ring-2 ring-white/80" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => changeZoom(zoom - 0.25)} disabled={!image || zoom <= 1} aria-label="축소" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] disabled:opacity-40 cursor-pointer disabled:cursor-default">
          <ZoomOut aria-hidden className="h-4.5 w-4.5" />
        </button>
        <label className="sr-only" htmlFor="avatar-zoom">확대</label>
        <input
          id="avatar-zoom"
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
        <button type="button" onClick={() => changeZoom(zoom + 0.25)} disabled={!image || zoom >= AVATAR_MAX_ZOOM} aria-label="확대" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] disabled:opacity-40 cursor-pointer disabled:cursor-default">
          <ZoomIn aria-hidden className="h-4.5 w-4.5" />
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--lh-danger)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full px-4 text-sm font-medium text-[var(--lh-ink-secondary)] transition hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer">취소</button>
        <button type="button" onClick={apply} disabled={!image || busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-5 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] disabled:opacity-40 cursor-pointer disabled:cursor-default">
          {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />} 이 사진 쓰기
        </button>
      </div>
    </div>
  );
};
