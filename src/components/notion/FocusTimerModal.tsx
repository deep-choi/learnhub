import React, { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, X, Timer } from "lucide-react";

interface FocusTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FocusTimerModal: React.FC<FocusTimerModalProps> = ({ isOpen, onClose }) => {
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
      alert("25분 몰입 세션이 완료되었습니다! 5분간 휴식하며 뇌의 사유를 정리하세요.");
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-timer-title"
        className="w-full max-w-sm rounded-lg border border-[#E9E9E7] bg-white p-6 shadow-2xl text-center space-y-6 text-[#2F3437]"
      >
        <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#191919]">
            <Timer className="h-4 w-4" />
            <span id="focus-timer-title">25분 사유 몰입 타이머</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="타이머 최소화 (닫아도 계속 실행)"
            title="최소화 · 닫아도 타이머는 계속 실행됩니다"
            className="text-[#787774] hover:text-[#191919]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <div className="font-mono text-5xl font-extrabold tracking-tight text-[#191919]">
            {formattedTime}
          </div>
           <p className="text-xs text-[#787774]">잡념 없이 텍스트와 수식에만 완전히 몰입하세요. 닫아도 계속 실행됩니다.</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className="flex items-center gap-1.5 rounded-md bg-[#191919] px-5 py-2.5 text-xs font-medium text-white hover:bg-[#37352F] transition"
          >
            {isRunning ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span>일시정지</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>몰입 시작</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              setIsRunning(false);
              setTimeLeft(25 * 60);
            }}
            className="flex items-center gap-1 rounded-md border border-[#E9E9E7] bg-white px-3 py-2.5 text-xs text-[#787774] hover:bg-[#F7F6F3] transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>리셋</span>
          </button>
        </div>
      </div>
    </div>
  );
};
