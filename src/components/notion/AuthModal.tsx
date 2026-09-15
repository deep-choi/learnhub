import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ShieldCheck, X } from "lucide-react";
import {
  getAuthStatus,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  requestPasswordReset,
  resendSignUpConfirmation,
  updatePassword,
} from "../../services/authClient";
import { LearnHubLogo } from "../common/LearnHubLogo";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialError?: string;
  recoveryMode?: boolean;
  onRecoveryComplete?: () => void;
}

type AuthMode = "login" | "signup" | "forgot" | "recovery";

const authErrorMessage = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : "";
  if (/invalid login credentials/iu.test(message)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (/user already registered/iu.test(message)) return "이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.";
  if (/email.*rate|rate.*email|too many requests/iu.test(message)) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (/password/iu.test(message) && /weak|least|characters/iu.test(message)) return "더 안전한 비밀번호를 입력해 주세요.";
  return message || fallback;
};

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialError, recoveryMode = false, onRecoveryComplete }) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signupConfirmationPending, setSignupConfirmationPending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const emailInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPassword("");
      setPasswordConfirmation("");
      setShowPassword(false);
      setSignupConfirmationPending(false);
      return;
    }
    setMode(recoveryMode ? "recovery" : "login");
    setErrorMessage(initialError || "");
    setSuccessMessage("");
    setIsSubmitting(false);
    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => emailInputRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      window.setTimeout(() => previousActiveElement.current?.focus(), 0);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [initialError, isOpen, onClose, recoveryMode]);

  if (!isOpen) return null;

  const resetFeedback = () => {
    setErrorMessage("");
    setSuccessMessage("");
  };

  const assertConfigured = () => {
    if (!getAuthStatus().configured) throw new Error("인증 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  };

  const handleGoogleLogin = async () => {
    resetFeedback();
    setIsSubmitting(true);
    try {
      assertConfigured();
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(authErrorMessage(error, "Google 로그인을 시작하지 못했습니다."));
      setIsSubmitting(false);
    }
  };

  const handlePasswordAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    resetFeedback();
    if (mode === "forgot") {
      setIsSubmitting(true);
      try {
        assertConfigured();
        await requestPasswordReset(email.trim());
        setSuccessMessage("비밀번호 재설정 링크를 이메일로 보냈습니다. 메일의 링크를 열어 새 비밀번호를 설정해 주세요.");
      } catch (error) {
        setErrorMessage(authErrorMessage(error, "비밀번호 재설정 메일을 보내지 못했습니다."));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    if (password.length < 8) {
      setErrorMessage("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (mode === "recovery" && password !== passwordConfirmation) {
      setErrorMessage("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setIsSubmitting(true);
    try {
      assertConfigured();
      if (mode === "recovery") {
        await updatePassword(password);
        setPassword("");
        setPasswordConfirmation("");
        setSuccessMessage("새 비밀번호로 변경했습니다.");
        onRecoveryComplete?.();
      } else if (mode === "signup") {
        await signUpWithPassword(email.trim(), password, name.trim() || undefined);
        setPassword("");
        setSignupConfirmationPending(true);
        setSuccessMessage("회원가입 요청을 완료했습니다. 확인 메일이 오면 링크를 눌러 계정을 활성화해 주세요.");
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (error) {
      setErrorMessage(authErrorMessage(error, "계정 인증을 완료하지 못했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="presentation">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 text-[var(--lh-ink)] shadow-2xl sm:p-8" role="dialog" aria-modal="true" aria-labelledby="learnhub-auth-title">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)]"><LearnHubLogo size={22} /></div>
            <div>
              <h2 id="learnhub-auth-title" className="text-xl font-medium tracking-tight">{mode === "login" ? "다시 만나서 반가워요" : mode === "signup" ? "학습을 시작해 볼까요?" : mode === "forgot" ? "비밀번호를 다시 설정할까요?" : "새 비밀번호 설정"}</h2>
              <p className="mt-1 text-xs text-[var(--lh-ink-secondary)]">학습 기록을 안전하게 이어서 사용할 수 있어요.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="인증 창 닫기" className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] cursor-pointer transition"><X className="h-4 w-4" /></button>
        </div>

        {mode !== "forgot" && mode !== "recovery" && <div className="mt-6 grid grid-cols-2 rounded-full bg-[var(--lh-surface-subtle)] p-1" role="tablist" aria-label="인증 방식">
          {(["login", "signup"] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => { setMode(item); setPassword(""); setPasswordConfirmation(""); resetFeedback(); }} className={`min-h-10 rounded-full text-sm font-medium transition cursor-pointer ${mode === item ? "bg-[var(--lh-surface)] text-[var(--lh-ink)] shadow-sm" : "text-[var(--lh-ink-secondary)] hover:text-[var(--lh-ink)]"}`}>
              {item === "login" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>}

        {mode === "forgot" && <button type="button" onClick={() => { setMode("login"); resetFeedback(); }} className="mt-5 text-xs font-medium text-[var(--lh-primary)] underline">← 로그인으로 돌아가기</button>}

        {errorMessage && <p role="alert" className="mt-4 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-3 text-xs text-[var(--lh-danger)]">{errorMessage}</p>}
        {successMessage && <p role="status" className="mt-4 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] px-4 py-3 text-xs text-[var(--lh-ink)]">{successMessage}</p>}
        {signupConfirmationPending && <button type="button" disabled={isSubmitting} onClick={async () => { resetFeedback(); setIsSubmitting(true); try { await resendSignUpConfirmation(email.trim()); setSuccessMessage("가입 확인 메일을 다시 보냈습니다."); } catch (error) { setErrorMessage(error instanceof Error ? error.message : "확인 메일을 다시 보내지 못했습니다."); } finally { setIsSubmitting(false); } }} className="mt-3 text-xs font-medium text-[var(--lh-primary)] underline disabled:opacity-50">확인 메일 다시 보내기</button>}

        <form onSubmit={handlePasswordAuth} className="mt-5 space-y-4">
          {mode === "signup" && <div className="space-y-1.5"><label htmlFor="learnhub-auth-name" className="text-xs font-medium text-[var(--lh-ink-secondary)]">이름</label><input id="learnhub-auth-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="학습자 이름" className="min-h-12 w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-sm outline-none transition focus:border-[var(--lh-line-strong)]" /></div>}
          {mode !== "recovery" && <div className="space-y-1.5"><label htmlFor="learnhub-auth-email" className="text-xs font-medium text-[var(--lh-ink-secondary)]">이메일</label><input id="learnhub-auth-email" ref={emailInputRef} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required className="min-h-12 w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-sm outline-none transition focus:border-[var(--lh-line-strong)]" /></div>}
          {mode !== "forgot" && <div className="space-y-1.5"><label htmlFor="learnhub-auth-password" className="text-xs font-medium text-[var(--lh-ink-secondary)]">{mode === "recovery" ? "새 비밀번호" : "비밀번호"}</label><div className="relative"><input id="learnhub-auth-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="8자 이상" required minLength={8} className="min-h-12 w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 pr-12 text-sm outline-none transition focus:border-[var(--lh-line-strong)]" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"} className="absolute inset-y-0 right-2 flex w-10 items-center justify-center text-[var(--lh-ink-secondary)]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>}
          {mode === "recovery" && <div className="space-y-1.5"><label htmlFor="learnhub-auth-password-confirmation" className="text-xs font-medium text-[var(--lh-ink-secondary)]">새 비밀번호 확인</label><input id="learnhub-auth-password-confirmation" type={showPassword ? "text" : "password"} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" required minLength={8} className="min-h-12 w-full rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-sm outline-none transition focus:border-[var(--lh-line-strong)]" /></div>}
          {mode === "login" && <button type="button" onClick={() => { setMode("forgot"); setPassword(""); resetFeedback(); }} className="text-xs font-medium text-[var(--lh-primary)] underline">비밀번호를 잊으셨나요?</button>}
          <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] disabled:opacity-50 shadow-xs cursor-pointer">{isSubmitting ? "처리 중…" : mode === "login" ? "로그인" : mode === "signup" ? "계정 만들기" : mode === "forgot" ? "재설정 링크 보내기" : "새 비밀번호 저장"}</button>
        </form>

        {(mode === "login" || mode === "signup") && <><div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-[var(--lh-ink-tertiary)]"><span className="h-px flex-1 bg-[var(--lh-line)]" />또는<span className="h-px flex-1 bg-[var(--lh-line)]" /></div>

        <button type="button" onClick={handleGoogleLogin} disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-5 text-sm font-medium transition hover:bg-[var(--lh-surface-subtle)] disabled:opacity-50 shadow-xs cursor-pointer">
          <span aria-hidden="true" className="text-base font-medium">G</span> Google로 계속하기
        </button></>}

        <div className="mt-6 space-y-3 border-t border-[var(--lh-line)] pt-5">
          <div className="flex items-start gap-2 text-xs leading-relaxed text-[var(--lh-ink-secondary)]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lh-primary)]" /><span>로그인하면 학습 과정과 기록이 고객 계정에 연결됩니다. 비밀번호는 LearnHub가 직접 저장하지 않습니다.</span></div>
          <p className="text-center text-[11px] leading-relaxed text-[var(--lh-ink-tertiary)]">서비스 소개는 로그인 없이 볼 수 있으며, 학습 기능은 계정 로그인 후 이용할 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
};
