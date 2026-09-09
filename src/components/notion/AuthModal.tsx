import React, { useState } from "react";
import { X, CheckCircle2, ShieldCheck, Smartphone } from "lucide-react";
import { StorageService } from "../../services/storage";
import { UserAccount } from "../../types/learning";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserAccount) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen) return null;

  const handleCreateLocalProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const user = StorageService.createLocalProfile(name);
      onLoginSuccess(user);
      onClose();
    } catch {
      setErrorMessage("이 기기에 프로필을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-xl border border-[#E9E9E7] bg-white p-6 shadow-2xl text-[#2F3437] animate-fade-in space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E9E9E7] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🌱</span>
            <div>
              <h2 className="text-lg font-bold text-[#191919]">이 기기에서 LearnHub 시작하기</h2>
              <p className="text-xs text-[#787774] mt-0.5">
                현재는 실제 계정이나 클라우드 동기화 없이 이 기기에만 저장됩니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Free Experience Guarantee Banner */}
        <div className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-3 text-xs text-[#787774] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[#191919]">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#191919]" />
              <span>로그인 없이도 모든 학습을 무료로 체험할 수 있어요</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[#787774]">
              학습 기록은 이 브라우저의 로컬 저장소에만 남습니다. 실제 계정 보관이 필요하면 별도 인증 연동이 필요합니다.
            </p>
          </div>

          {errorMessage && (
            <p role="alert" className="rounded-md border border-[#F0B8B8] bg-[#FFF7F7] px-3 py-2 text-[11px] text-[#9B1C1C]">
              {errorMessage}
            </p>
          )}

        <form onSubmit={handleCreateLocalProfile} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#787774] mb-1">이름 또는 닉네임 (선택)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 김민준"
              className="w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-xs text-[#191919] placeholder-[#9B9A97] focus:border-[#191919] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#191919] py-2.5 text-xs font-semibold text-white hover:bg-[#37352F] transition cursor-pointer"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span>이 기기에 로컬 프로필 만들기 ⏎</span>
          </button>
        </form>

        {/* Privacy & AI Data Assurance */}
        <div className="border-t border-[#E9E9E7] pt-3 text-[10px] text-[#9B9A97] space-y-1">
          <div className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            <span className="font-semibold text-[#787774]">로컬 저장 안내</span>
          </div>
          <p className="leading-relaxed">
            이 프로필 설정에서는 닉네임 외 개인정보를 수집하거나 저장하지 않습니다. 이 프로필은 보안 계정이 아니며 현재 기기에서만 사용됩니다.
          </p>
        </div>

        {/* Continue as Guest button */}
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-[#787774] hover:text-[#191919] hover:underline cursor-pointer"
          >
            로그인 없이 게스트로 계속 공부하기 ➔
          </button>
        </div>
      </div>
    </div>
  );
};
