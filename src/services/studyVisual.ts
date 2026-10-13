import { studyDiagramUrl } from "../domain/studyDiagram";
import type { StudyResult, StudySlide } from "../domain/study";
export function downloadStudyBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function downloadSlides(result: StudyResult) {
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(result.title)}</title><style>body{font-family:system-ui;margin:0;background:#f0f2f5;color:#15232d}section{box-sizing:border-box;margin:24px auto;padding:60px;max-width:1000px;min-height:560px;background:white;border-radius:24px}h1{font-size:38px}p,li{font-size:24px;line-height:1.7}@media print{section{page-break-after:always;margin:0;min-height:90vh}}</style>${result.slides!.map((s, i) => `<section><small>${i + 1} / ${result.slides!.length}</small><h1>${escape(s.title)}</h1><p>${escape(s.body)}</p><ul>${s.points.map((p) => `<li>${escape(p)}</li>`).join("")}</ul></section>`).join("")}</html>`;
  downloadStudyBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    `${result.title}.html`,
  );
}
const wrap = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 10,
) => {
  let line = "",
    count = 0;
  for (const char of text) {
    if (ctx.measureText(line + char).width > maxWidth || char === "\n") {
      ctx.fillText(line, x, y);
      line = char === "\n" ? "" : char;
      y += lineHeight;
      if (++count >= maxLines) return y;
    } else line += char;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
};
export function drawStudySlide(
  canvas: HTMLCanvasElement,
  slide: StudySlide,
  index: number,
  total: number,
) {
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#eef5f5";
  ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = "#16706b";
  ctx.fillRect(0, 0, 14, 720);
  ctx.font = "22px system-ui";
  ctx.fillText(`LearnHub   /   ${index + 1} · ${total}`, 64, 64);
  ctx.fillStyle = "#142f36";
  ctx.font = "bold 44px system-ui";
  let y = wrap(ctx, slide.title, 64, 148, 1130, 56, 2);
  ctx.font = "28px system-ui";
  y = wrap(ctx, slide.body, 64, y + 40, 1130, 42, 6) + 20;
  ctx.fillStyle = "#23685e";
  ctx.font = "24px system-ui";
  for (const point of slide.points.slice(0, 3)) {
    y = wrap(ctx, `• ${point}`, 64, y + 10, 1130, 36, 2);
    if (y > 675) break;
  }
}
export async function downloadVisual(result: StudyResult) {
  const img = new Image();
  img.src = studyDiagramUrl(result);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("그림을 저장하지 못했습니다.");
  downloadStudyBlob(blob, `${result.title}.png`);
}
/** Captioned slide video: no podcast, host, or generated executable markup. */
export async function downloadStudyVideo(
  result: StudyResult,
  signal: AbortSignal,
  onProgress: (n: number) => void,
) {
  const mime = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find(
    (t) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
  );
  if (!mime || !HTMLCanvasElement.prototype.captureStream)
    throw new Error("이 브라우저에서는 영상 저장을 지원하지 않습니다.");
  const canvas = document.createElement("canvas");
  drawStudySlide(canvas, result.slides![0], 0, result.slides!.length);
  const stream = canvas.captureStream(15);
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    recorder.onerror = () => reject(new Error("영상 저장에 실패했습니다."));
  });
  // Recorder failures can occur while a frame timer is still pending.
  // Attach a handler immediately; `await done` below still reports the failure.
  void done.catch(() => {});
  recorder.start();
  try {
    for (let i = 0; i < result.slides!.length; i++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      drawStudySlide(canvas, result.slides![i], i, result.slides!.length);
      onProgress(Math.round((i / result.slides!.length) * 100));
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timeout);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timeout = setTimeout(() => {
          signal.removeEventListener("abort", cancel);
          resolve();
        }, 8000);
        signal.addEventListener("abort", cancel, { once: true });
      });
    }
    recorder.stop();
    const blob = await done;
    if (!signal.aborted) downloadStudyBlob(blob, `${result.title}.webm`);
  } finally {
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  }
}
