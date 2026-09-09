import React from "react";
import { StorageService } from "../services/storage";
import { UserAccount } from "../types/learning";
import { User, RefreshCw, Shield, LogOut, Smartphone } from "lucide-react";

interface ProfileViewProps {
  onResetData: () => void;
  userAccount?: UserAccount;
  onLogout?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onResetData, userAccount, onLogout }) => {
  const handleReset = () => {
    if (confirm("이 기기의 LearnHub 학습 데이터(과목·진도·실력·복습·오답·레슨 캐시)만 초기화하시겠습니까? 로컬 프로필과 레슨 메모는 유지됩니다.")) {
      StorageService.resetData();
      onResetData();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16 text-[#2F3437]">
      {/* Profile Header */}
      <section className="rounded-lg border border-[#E9E9E7] bg-white p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[#191919] flex items-center justify-center text-white text-base font-bold">
            L
          </div>
          <div>
            <h1 className="text-base font-bold text-[#191919]">
              학습자 사유 프로필
            </h1>
            <p className="text-xs text-[#787774]">
              여러 분야를 배우는 일반 성인을 위한 자율 학습 및 메타인지 기록
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-[#E9E9E7] text-xs">
          <div className="bg-[#FBFBFA] p-3 rounded-md border border-[#E9E9E7] space-y-0.5">
            <span className="text-[10px] text-[#787774]">AI 엔진 연동</span>
            <div className="font-semibold text-[#191919] flex items-center gap-1">
              <Shield className="w-3 h-3" /> Gemini 3.6 Flash
            </div>
          </div>

          <div className="bg-[#FBFBFA] p-3 rounded-md border border-[#E9E9E7] space-y-0.5">
            <span className="text-[10px] text-[#787774]">데이터 저장 방식</span>
            <div className="font-semibold text-[#191919]">
              Local Second Brain
            </div>
          </div>

          <div className="bg-[#FBFBFA] p-3 rounded-md border border-[#E9E9E7] space-y-0.5">
              <span className="text-[10px] text-[#787774]">기본 샘플 과목</span>
            <div className="font-semibold text-[#191919]">
              수학 예시 · 여러 분야 확장 가능
            </div>
          </div>
        </div>

        <div className="rounded-md border border-[#E9E9E7] bg-[#FBFBFA] p-3 text-xs text-[#787774]">
          <div className="flex items-center gap-1.5 font-semibold text-[#191919]">
            <Smartphone className="h-3.5 w-3.5" />
            <span>현재는 이 기기의 로컬 학습판입니다</span>
          </div>
          <p className="mt-1 leading-relaxed">
            학습 기록과 레슨 캐시는 이 브라우저에만 저장됩니다. 실제 계정, 보안 인증, 클라우드 동기화 또는 기기 간 복원은 제공되지 않습니다.
          </p>
        </div>

        {userAccount && (
          <div className="flex items-center justify-between border-t border-[#E9E9E7] pt-3 text-xs">
            <div className="flex items-center gap-2 text-[#787774]">
              <User className="h-3.5 w-3.5" />
              <span>{userAccount.name} · {userAccount.isGuest ? "게스트" : "이 기기 프로필"}</span>
            </div>
            {!userAccount.isGuest && onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1 rounded-md border border-[#E9E9E7] px-2.5 py-1.5 font-semibold text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919]"
              >
                <LogOut className="h-3.5 w-3.5" />
                로그아웃
              </button>
            )}
          </div>
        )}
      </section>

      {/* Reset Data */}
      <section className="rounded-lg border border-[#E9E9E7] bg-white p-6 space-y-3">
        <h2 className="text-xs font-bold text-[#191919]">데이터 초기화</h2>
        <p className="text-xs text-[#787774]">
          LearnHub의 과목·진도·실력·복습·오답·레슨 캐시만 기본 상태로 재설정합니다. 로컬 프로필, 레슨 메모, 다른 앱의 저장값은 유지됩니다.
        </p>

        <button
          onClick={handleReset}
          className="bg-white hover:bg-[#F7F6F3] text-[#191919] border border-[#E9E9E7] font-medium px-3.5 py-2 rounded-md text-xs inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>LearnHub 학습 데이터 초기화</span>
        </button>
      </section>
    </div>
  );
};
