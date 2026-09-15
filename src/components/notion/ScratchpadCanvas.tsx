import React, { useRef, useState, useEffect } from "react";
import { Eraser, PenTool, RotateCcw, X, Minimize2 } from "lucide-react";
import { notifyLearningDataChanged } from "../../services/storage";

interface ScratchpadCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  courseId?: string;
  lessonId?: string;
  storageScope?: string;
}

type SaveStatus = "saved" | "error" | "idle";

const makeStorageKey = (courseId?: string, lessonId?: string, storageScope?: string) => {
  const scope = storageScope || (courseId && lessonId ? `${courseId}_${lessonId}` : "global");
  return `learnhub_scratchpad_${encodeURIComponent(scope)}`;
};

export const ScratchpadCanvas: React.FC<ScratchpadCanvasProps> = ({
  isOpen,
  onClose,
  courseId,
  lessonId,
  storageScope,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [isMinimized, setIsMinimized] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const storageKey = makeStorageKey(courseId, lessonId, storageScope);
  const hasLessonScope = Boolean(courseId && lessonId) || Boolean(storageScope);

  const persistCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      localStorage.setItem(storageKey, canvas.toDataURL("image/png"));
      notifyLearningDataChanged();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen || isMinimized) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 420;
    canvas.height = 320;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      const savedImage = localStorage.getItem(storageKey);
      if (!savedImage) {
        setSaveStatus("idle");
        return;
      }
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        setSaveStatus("saved");
      };
      image.onerror = () => setSaveStatus("error");
      image.src = savedImage;
    } catch {
      setSaveStatus("error");
    }
  }, [isOpen, isMinimized, storageKey]);

  if (!isOpen) return null;

  const getPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.strokeStyle = tool === "pen" ? "var(--lh-ink)" : "var(--lh-surface)";
    ctx.lineWidth = tool === "pen" ? 2 : 14;
    ctx.lineTo(x, y);
    ctx.stroke();
    persistCanvas();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!window.confirm("연습장 내용을 지울까요? 지운 내용은 복구할 수 없습니다.")) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      localStorage.removeItem(storageKey);
      notifyLearningDataChanged();
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-[calc(100vw-3rem)] select-none overflow-hidden rounded-[var(--lh-radius-md)] border border-[var(--lh-line)] bg-[var(--lh-surface)] text-sm text-[var(--lh-ink)] shadow-[var(--lh-shadow-md)]">
      <div className="flex items-center justify-between bg-[var(--lh-surface-subtle)] border-b border-[var(--lh-line)] px-3 py-2">
        <div className="flex items-center gap-2 font-medium text-[var(--lh-ink)]">
          <PenTool className="h-3.5 w-3.5 text-[var(--lh-primary)]" />
          <span>수식 연습장</span>
          <span className="font-normal text-[10px] text-[var(--lh-ink-tertiary)]">
            {saveStatus === "saved" ? (hasLessonScope ? "현재 레슨에 임시 저장됨" : "임시 저장됨") : saveStatus === "error" ? "저장 실패" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setIsMinimized(!isMinimized)} className="p-1 text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] cursor-pointer" title="접기" aria-label="연습장 접기">
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClose} className="p-1 text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)] cursor-pointer" title="닫기" aria-label="연습장 닫기">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-2 space-y-2 bg-[var(--lh-surface)]">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={() => setIsDrawing(false)}
            onMouseLeave={() => setIsDrawing(false)}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={() => setIsDrawing(false)}
            className="rounded border border-[var(--lh-line)] bg-[var(--lh-surface)] cursor-crosshair touch-none"
            aria-label="수식 계산 연습장"
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setTool("pen")} className={`flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition cursor-pointer ${tool === "pen" ? "bg-[var(--lh-primary)] text-white border-[var(--lh-primary)] font-medium" : "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] font-normal"}`}>
                <PenTool className="h-3 w-3" /><span>펜</span>
              </button>
              <button type="button" onClick={() => setTool("eraser")} className={`flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition cursor-pointer ${tool === "eraser" ? "bg-[var(--lh-primary)] text-white border-[var(--lh-primary)] font-medium" : "bg-[var(--lh-surface)] border-[var(--lh-line)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] font-normal"}`}>
                <Eraser className="h-3 w-3" /><span>지우개</span>
              </button>
            </div>
            <button type="button" onClick={clearCanvas} className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--lh-ink-secondary)] hover:text-[var(--lh-primary)] transition cursor-pointer">
              <RotateCcw className="h-3 w-3" /><span>전체 지우기</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
