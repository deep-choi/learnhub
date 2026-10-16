import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, User, X } from "lucide-react";
import {
  getAuthStatus,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  requestPasswordReset,
  resendSignUpConfirmation,
  updatePassword,
} from "../../services/authClient";
import { AUTH_SERVER_UNREACHABLE_MESSAGE } from "../../services/firebaseClient";

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
  const name = error instanceof Error ? error.name : "";
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  // fetch() failures surface with browser-specific wording; the SDK wraps them as AuthRetryableFetchError.
  if (name === "AuthRetryableFetchError" || code === "auth/network-request-failed" || /failed to fetch|networkerror|load failed|network request failed/iu.test(message)) return AUTH_SERVER_UNREACHABLE_MESSAGE;
  if (/email not confirmed/iu.test(message)) return "이메일 인증이 아직 끝나지 않았습니다. 가입할 때 받은 메일의 링크를 눌러 주세요.";
  if (/error sending .*email|sending.*(confirmation|recovery|magic)/iu.test(message)) return "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도하거나 서비스 관리자에게 알려 주세요.";
  if (["auth/operation-not-allowed", "auth/admin-restricted-operation"].includes(code) || /signups? not allowed|signup is disabled/iu.test(message)) return "이 로그인 방식이 아직 준비되지 않았습니다. 서비스 관리자에게 알려 주세요.";
  if (code === "auth/invalid-email" || /email address .*invalid|invalid email/iu.test(message)) return "이메일 주소 형식을 확인해 주세요.";
  if (code === "auth/unauthorized-domain") return "이 웹사이트가 Firebase 로그인 허용 도메인에 등록되지 않았습니다.";
  if (code === "auth/popup-blocked") return "브라우저에서 로그인 팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-login-credentials"].includes(code) || /invalid login credentials/iu.test(message)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (["auth/email-already-in-use", "auth/account-exists-with-different-credential"].includes(code) || /user already registered/iu.test(message)) return "이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.";
  if (code === "auth/too-many-requests" || /email.*rate|rate.*email|too many requests/iu.test(message)) return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (code === "auth/weak-password" || (/password/iu.test(message) && /weak|least|characters/iu.test(message))) return "더 안전한 비밀번호를 입력해 주세요.";
  return message || fallback;
};

const GoogleIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.81 12.23c0-.71-.06-1.4-.18-2.05h-9.41v3.87h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.97-4.3 2.97-7.35Z" />
    <path fill="#34A853" d="M12.22 22c2.7 0 4.96-.89 6.62-2.42l-3.23-2.51c-.9.6-2.04.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.29v2.59A10 10 0 0 0 12.22 22Z" />
    <path fill="#FBBC05" d="M6.63 13.91a6.02 6.02 0 0 1 0-3.82V7.5H3.29a10 10 0 0 0 0 9l3.34-2.59Z" />
    <path fill="#EA4335" d="M12.22 5.97c1.47 0 2.79.51 3.83 1.5l2.86-2.87A9.61 9.61 0 0 0 12.22 2a10 10 0 0 0-8.93 5.5l3.34 2.59c.79-2.36 2.99-4.12 5.59-4.12Z" />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialError, recoveryMode = false, onRecoveryComplete }) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
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
      setAgeConfirmed(false);
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
    if (mode === "signup" && !ageConfirmed) {
      setErrorMessage("만 14세 이상인지 확인해 주세요. 만 14세 미만은 보호자가 가입해 주세요.");
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
      if (mode === "login" && error instanceof Error && /email not confirmed/iu.test(error.message)) setSignupConfirmationPending(true);
      setErrorMessage(authErrorMessage(error, "계정 인증을 완료하지 못했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setPassword("");
    setPasswordConfirmation("");
    resetFeedback();
  };

  const inputClass = "w-full rounded-xl border border-transparent bg-[var(--lh-surface-subtle)] py-2.5 pl-11 pr-4 text-sm outline-none transition-colors focus:border-[var(--lh-primary)] sm:py-3";
  const labelClass = "ml-1 text-[13px] font-medium uppercase leading-5 tracking-wider text-[var(--lh-ink-secondary)]";
  const iconClass = "absolute left-4 top-1/2 -translate-y-1/2 text-[var(--lh-ink-tertiary)]";
  const isEntry = mode === "login" || mode === "signup";
  const title = mode === "forgot" ? "비밀번호 재설정" : mode === "recovery" ? "새 비밀번호 설정" : "로그인 또는 회원가입";
  const subtitle = mode === "forgot" ? "가입한 이메일로 재설정 링크를 보내드려요." : mode === "recovery" ? "새로 사용할 비밀번호를 입력해 주세요." : "기록을 저장하고 어디서든 이어서 사용하세요.";
  const submitLabel = mode === "login" ? "로그인" : mode === "signup" ? "회원가입 완료" : mode === "forgot" ? "재설정 링크 보내기" : "새 비밀번호 저장";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-3 backdrop-blur-[2px] sm:p-6"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose(); }}
    >
      <div className="max-h-[calc(100dvh-24px)] w-full max-w-[440px] overflow-y-auto rounded-[24px] border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 text-[var(--lh-ink)] shadow-[0_24px_80px_rgba(15,15,15,0.18)] sm:max-h-[calc(100dvh-48px)] sm:p-8" role="dialog" aria-modal="true" aria-labelledby="learnhub-auth-title">
        <section className="relative w-full">
          <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="인증 창 닫기" className="absolute -right-1 -top-1 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[var(--lh-ink-secondary)] transition-colors hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)] disabled:cursor-not-allowed disabled:opacity-50"><X size={19} /></button>
          <div className="mb-8 text-left">
            <h1 id="learnhub-auth-title" className="pr-10 text-[26px] font-medium leading-9 tracking-[-0.02em]">{title}</h1>
            <p className="mt-3 text-base leading-6 text-[var(--lh-ink-secondary)]">{subtitle}</p>
          </div>

          {mode === "forgot" && <button type="button" onClick={() => switchMode("login")} className="mb-4 cursor-pointer text-[13px] font-medium text-[var(--lh-primary)] underline">← 로그인으로 돌아가기</button>}

          <div className="space-y-7">
            <form onSubmit={handlePasswordAuth} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <label htmlFor="learnhub-auth-name" className={labelClass}>이름</label>
                  <div className="relative">
                    <User size={16} className={iconClass} />
                    <input id="learnhub-auth-name" type="text" placeholder="홍길동" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={inputClass} />
                  </div>
                </div>
              )}

              {mode !== "recovery" && (
                <div className="space-y-2">
                  <label htmlFor="learnhub-auth-email" className={labelClass}>이메일</label>
                  <div className="relative">
                    <Mail size={16} className={iconClass} />
                    <input id="learnhub-auth-email" ref={emailInputRef} type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className={inputClass} />
                  </div>
                </div>
              )}

              {mode !== "forgot" && (
                <div className="space-y-2">
                  <label htmlFor="learnhub-auth-password" className={labelClass}>{mode === "recovery" ? "새 비밀번호" : "비밀번호"}</label>
                  <div className="relative">
                    <Lock size={16} className={iconClass} />
                    <input id="learnhub-auth-password" type={showPassword ? "text" : "password"} placeholder="8자 이상" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} className={`${inputClass} pr-12`} />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"} className="absolute inset-y-0 right-2 flex w-10 cursor-pointer items-center justify-center text-[var(--lh-ink-tertiary)] hover:text-[var(--lh-ink)]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                </div>
              )}

              {mode === "recovery" && (
                <div className="space-y-2">
                  <label htmlFor="learnhub-auth-password-confirmation" className={labelClass}>새 비밀번호 확인</label>
                  <div className="relative">
                    <Lock size={16} className={iconClass} />
                    <input id="learnhub-auth-password-confirmation" type={showPassword ? "text" : "password"} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" required minLength={8} className={inputClass} />
                  </div>
                </div>
              )}

              {mode === "signup" && (
                <div className="space-y-1.5 pt-1">
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--lh-ink)]">
                    <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--lh-primary)]" />
                    <span>만 14세 이상입니다.</span>
                  </label>
                  <p className="pl-6.5 text-[13px] leading-5 text-[var(--lh-ink-tertiary)]">만 14세 미만은 법정대리인(보호자)의 동의가 필요해요. 보호자가 직접 가입한 뒤 함께 이용해 주세요.</p>
                </div>
              )}

              {mode === "login" && (
                <div className="flex justify-end">
                  <button type="button" onClick={() => switchMode("forgot")} className="cursor-pointer text-[13px] font-medium text-[var(--lh-ink-secondary)] transition-colors hover:text-[var(--lh-primary)]">비밀번호를 잊으셨나요?</button>
                </div>
              )}

              {errorMessage && <p role="alert" className="ml-1 text-[13px] font-medium leading-5 text-[var(--lh-danger)]">{errorMessage}</p>}
              {successMessage && <p role="status" className="ml-1 text-[13px] font-medium leading-5 text-[var(--lh-ink)]">{successMessage}</p>}
              {signupConfirmationPending && (
                <button type="button" disabled={isSubmitting} onClick={async () => { resetFeedback(); setIsSubmitting(true); try { await resendSignUpConfirmation(email.trim()); setSuccessMessage("가입 확인 메일을 다시 보냈습니다."); } catch (error) { setErrorMessage(authErrorMessage(error, "확인 메일을 다시 보내지 못했습니다.")); } finally { setIsSubmitting(false); } }} className="ml-1 cursor-pointer text-[13px] font-medium text-[var(--lh-primary)] underline disabled:opacity-50">확인 메일 다시 보내기</button>
              )}

              <button type="submit" disabled={isSubmitting} className="group mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-[var(--lh-primary)] py-3 text-sm font-medium text-white transition-all hover:bg-[var(--lh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-70 sm:mt-4 sm:py-3.5">
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : (<>{submitLabel}<ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></>)}
              </button>

              {isEntry && (
                <div className="flex items-center justify-center gap-1.5 pt-1 text-sm leading-5 text-[var(--lh-ink-secondary)]">
                  <span>{mode === "login" ? "아직 계정이 없으신가요?" : "이미 계정이 있으신가요?"}</span>
                  <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")} disabled={isSubmitting} className="cursor-pointer font-medium text-[var(--lh-primary)] transition-colors hover:text-[var(--lh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">{mode === "login" ? "회원가입" : "로그인"}</button>
                </div>
              )}
            </form>

            {isEntry && (
              <div className="space-y-5">
                <div className="relative flex items-center">
                  <div className="h-px flex-1 bg-[var(--lh-line)]" />
                  <span className="px-3 text-[13px] font-medium leading-5 text-[var(--lh-ink-tertiary)]">또는</span>
                  <div className="h-px flex-1 bg-[var(--lh-line)]" />
                </div>
                <button type="button" onClick={handleGoogleLogin} disabled={isSubmitting} className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[var(--lh-line)] bg-[var(--lh-surface)] px-4 text-[15px] font-medium leading-5 shadow-[0_1px_2px_rgba(15,15,15,0.04)] transition-colors hover:border-[var(--lh-line-strong)] hover:bg-[var(--lh-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60 sm:h-12">
                  <GoogleIcon />
                  <span>Google로 계속하기</span>
                </button>
                <p className="text-center text-xs leading-5 text-[var(--lh-ink-tertiary)]">Google로 처음 가입하면 만 14세 이상임을 확인한 것으로 봅니다.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
