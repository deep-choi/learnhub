import { isTutorImageDataUrl } from "../../domain/tutorPersona";

/** 저장하는 프로필 사진 한 변(px). */
export const AVATAR_OUTPUT_SIZE = 256;
export const AVATAR_MAX_ZOOM = 3;
/** 올릴 수 있는 원본 파일 크기 상한. 줄여서 저장하므로 원본은 넉넉히 받는다. */
export const AVATAR_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export interface CropView {
  /** 화면의 정사각형 자르기 칸 한 변(px) */
  viewport: number;
  imageWidth: number;
  imageHeight: number;
  /** 1(칸을 꽉 채움) ~ AVATAR_MAX_ZOOM */
  zoom: number;
  /** 사진 중심이 칸 중심에서 벗어난 거리(화면 px) */
  offsetX: number;
  offsetY: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 화면에 그리는 배율. 짧은 변이 칸을 꽉 채우는 배율에 확대를 곱한다. */
export const displayScale = (view: Pick<CropView, "viewport" | "imageWidth" | "imageHeight" | "zoom">): number =>
  (view.viewport / Math.max(1, Math.min(view.imageWidth, view.imageHeight))) * clamp(view.zoom, 1, AVATAR_MAX_ZOOM);

/** 사진이 자르기 칸을 늘 덮도록 이동 거리를 제한한다. */
export const clampCropOffset = (view: CropView): { x: number; y: number } => {
  const scale = displayScale(view);
  const maxX = Math.max(0, (view.imageWidth * scale - view.viewport) / 2);
  const maxY = Math.max(0, (view.imageHeight * scale - view.viewport) / 2);
  return { x: clamp(view.offsetX, -maxX, maxX) || 0, y: clamp(view.offsetY, -maxY, maxY) || 0 };
};

/** 원본 사진에서 잘라 낼 정사각형(원본 px). */
export const cropSourceRect = (view: CropView): { sx: number; sy: number; size: number } => {
  const scale = displayScale(view);
  const { x, y } = clampCropOffset(view);
  const size = view.viewport / scale;
  return {
    sx: clamp((view.imageWidth * scale - view.viewport) / 2 / scale - x / scale, 0, Math.max(0, view.imageWidth - size)),
    sy: clamp((view.imageHeight * scale - view.viewport) / 2 / scale - y / scale, 0, Math.max(0, view.imageHeight - size)),
    size,
  };
};

/** 순서대로 시도한다. WebP를 먼저 쓰고, WebP로 저장할 수 없는 브라우저는 더 작은 PNG로 내려간다. */
export const AVATAR_ENCODE_ATTEMPTS: ReadonlyArray<{ type: "image/webp" | "image/png"; quality?: number; size: number }> = [
  { type: "image/webp", quality: 0.86, size: AVATAR_OUTPUT_SIZE },
  { type: "image/webp", quality: 0.74, size: AVATAR_OUTPUT_SIZE },
  { type: "image/webp", quality: 0.6, size: AVATAR_OUTPUT_SIZE },
  { type: "image/webp", quality: 0.5, size: 192 },
  { type: "image/png", size: 192 },
  { type: "image/png", size: 160 },
  { type: "image/png", size: 128 },
  { type: "image/png", size: 96 },
];

/**
 * `encode(type, quality, size)`가 만든 data URL 중 저장 조건(WebP/PNG, 80,000자 이하, 파일 시그니처)을
 * 처음으로 만족하는 것을 고른다. 모두 실패하면 null.
 */
export const pickEncodedAvatar = (encode: (type: string, quality: number | undefined, size: number) => string | null): string | null => {
  for (const attempt of AVATAR_ENCODE_ATTEMPTS) {
    const dataUrl = encode(attempt.type, attempt.quality, attempt.size);
    if (dataUrl && isTutorImageDataUrl(dataUrl)) return dataUrl;
  }
  return null;
};

/** 브라우저에서 잘라 낸 영역을 256px WebP로 줄여 data URL로 만든다. 실패하면 null. */
export const renderAvatarDataUrl = (image: CanvasImageSource, rect: { sx: number; sy: number; size: number }): string | null => {
  if (typeof document === "undefined") return null;
  return pickEncodedAvatar((type, quality, size) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, size, size);
    try {
      return canvas.toDataURL(type, quality);
    } catch {
      return null;
    }
  });
};
