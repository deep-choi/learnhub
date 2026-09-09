import React, { useRef, useState, useEffect } from "react";
import { Eraser, PenTool, RotateCcw, X, Minimize2 } from "lucide-react";

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
    ctx.strokeStyle = tool === "pen" ? "#191919" : "#FFFFFF";
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
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 shadow-2xl rounded-lg border border-[#E9E9E7] bg-white overflow-hidden text-xs text-[#2F3437] select-none">
      <div className="flex items-center justify-between bg-[#F7F6F3] border-b border-[#E9E9E7] px-3 py-2">
        <div className="flex items-center gap-1.5 font-bold text-[11px] text-[#191919]">
          <PenTool className="h-3.5 w-3.5" />
          <span>수식 계산 연습장</span>
          <span className="font-normal text-[10px] text-[#9B9A97]">
            {saveStatus === "saved" ? (hasLessonScope ? "이 브라우저에 저장됨" : "이 브라우저에 임시 저장됨") : saveStatus === "error" ? "저장 실패" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setIsMinimized(!isMinimized)} className="p-1 text-[#787774] hover:text-[#191919]" title="접기" aria-label="연습장 접기">
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClose} className="p-1 text-[#787774] hover:text-[#191919]" title="닫기" aria-label="연습장 닫기">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-2 space-y-2 bg-white">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={() => setIsDrawing(false)}
            onMouseLeave={() => setIsDrawing(false)}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={() => setIsDrawing(false)}
            className="rounded border border-[#E9E9E7] bg-white cursor-crosshair touch-none"
            aria-label="수식 계산 연습장"
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setTool("pen")} className={`flex items-center gap-1 px-2.5 py-1 rounded-sm border text-[11px] transition ${tool === "pen" ? "bg-[#191919] text-white border-[#191919] font-semibold" : "bg-white border-[#E9E9E7] text-[#787774] hover:bg-[#F7F6F3]"}`}>
                <PenTool className="h-3 w-3" /><span>펜</span>
              </button>
              <button type="button" onClick={() => setTool("eraser")} className={`flex items-center gap-1 px-2.5 py-1 rounded-sm border text-[11px] transition ${tool === "eraser" ? "bg-[#191919] text-white border-[#191919] font-semibold" : "bg-white border-[#E9E9E7] text-[#787774] hover:bg-[#F7F6F3]"}`}>
                <Eraser className="h-3 w-3" /><span>지우개</span>
              </button>
            </div>
            <button type="button" onClick={clearCanvas} className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#787774] hover:text-[#191919] transition">
              <RotateCcw className="h-3 w-3" /><span>전체 지우기</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
