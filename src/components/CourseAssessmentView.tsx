import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Printer, RotateCcw, Sparkles } from "lucide-react";
import type { Course } from "../types/learning";
import { StorageService } from "../services/storage";
import { assessmentRequest, loadAssessment, recordAssessmentGrade, saveAssessment } from "../services/assessment";
import { assessmentScore, batchTypes, buildAssessmentSources, courseIsComplete, validateAssessmentGrades, validateAssessmentQuestions,
  type AssessmentConfig, type AssessmentGrade, type AssessmentQuestion, type AssessmentSession, type AssessmentType } from "../domain/assessment";
import { RichLessonRenderer } from "./notion/RichLessonRenderer";
import { AssessmentPrintSheet, type PrintMode } from "./AssessmentPrintSheet";

const primary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--lh-primary)] px-6 text-sm font-medium text-white transition hover:bg-[var(--lh-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--lh-line)] bg-[var(--lh-surface)] px-5 text-sm transition hover:bg-[var(--lh-surface-subtle)] disabled:opacity-40 cursor-pointer";
const labels = { correct: "정답", partial: "부분 정답", incorrect: "다시 학습 필요", unknown: "채점 보류" };
const typeLabels = { mixed: "혼합", multiple_choice: "객관식", essay: "서술형" };

interface CourseAssessmentViewProps {
  course: Course;
  onBack: () => void;
  onReviewLesson: (lessonId: string) => void;
  onDataChanged: () => void;
  /** 학습 기록에서 고른 레슨만으로 문제를 만듭니다. 주면 과목을 다 마치지 않아도 풀 수 있습니다. */
  practiceLessonIds?: string[];
  /** 저장된 풀이가 있어도 문제 설정 화면부터 엽니다. */
  startInSetup?: boolean;
  /** 설정 화면에서 시험지 인쇄를 주 버튼으로 보여 줍니다. */
  preferPrint?: boolean;
  backLabel?: string;
}

export const CourseAssessmentView: React.FC<CourseAssessmentViewProps> = ({ course, onBack, onReviewLesson, onDataChanged, practiceLessonIds, startInSetup = false, preferPrint = false, backLabel = "과목으로 돌아가기" }) => {
  const owner = StorageService.getUser().id;
  const practice = Boolean(practiceLessonIds);
  const canGenerate = practiceLessonIds ? practiceLessonIds.length > 0 : courseIsComplete(course);
  const [initial] = useState(() => {
    try { return { session: loadAssessment(owner, course.id, practice), error: "" }; }
    catch { return { session: null, error: "이전에 저장한 문제를 읽지 못했어요. 새 문제를 만들어 주세요." }; }
  });
  const [session, setSession] = useState<AssessmentSession | null>(initial.session);
  const [config, setConfig] = useState<AssessmentConfig>(initial.session?.config || { count: 10, type: "mixed" });
  const [setup, setSetup] = useState(startInSetup || !initial.session);
  const [printMode, setPrintMode] = useState<PrintMode | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(initial.error);
  const [saveError, setSaveError] = useState(false);
  const [showUnanswered, setShowUnanswered] = useState(false);
  const request = useRef<AbortController | null>(null);
  const generated = useRef<{ key: string; questions: AssessmentQuestion[] }>({ key: "", questions: [] });
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [session?.index, session?.stage, setup]);
  const persist = (next: AssessmentSession) => {
    setSession(next);
    setSaveError(!saveAssessment(owner, next));
  };
  const startRequest = () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setError("");
    return controller;
  };
  const createSession = (questions: AssessmentQuestion[]): AssessmentSession => ({
    version: 1, id: crypto.randomUUID(), courseId: course.id, config, questions, answers: {}, grades: {}, index: 0, stage: "solving", createdAt: new Date().toISOString(),
    ...(practiceLessonIds ? { lessonIds: practiceLessonIds } : {}),
  });
  const generate = async (printAfter?: PrintMode) => {
    if (busy || !canGenerate) return;
    const controller = startRequest();
    const key = JSON.stringify(config);
    if (generated.current.key !== key) generated.current = { key, questions: [] };
    const sources = buildAssessmentSources(course, (id) => StorageService.getCachedLessonContent(id), practiceLessonIds);
    try {
      while (generated.current.questions.length < config.count) {
        const offset = generated.current.questions.length;
        setBusy(`문제를 준비하고 있어요 · ${offset} / ${config.count}`);
        const previous = generated.current.questions.map((q) => q.question);
        const payload = await assessmentRequest("generate-assessment", { courseTitle: course.title, config, sources, offset, previous }, controller.signal);
        if (controller.signal.aborted) return;
        const errors = validateAssessmentQuestions(payload, sources, batchTypes(config, offset), previous);
        if (errors.length) throw new Error("문제를 확인하지 못했어요. 다시 시도하면 이어서 준비합니다.");
        generated.current.questions.push(...(payload.questions as AssessmentQuestion[]).map((q, i) => ({ ...q, id: `q${offset + i + 1}` })));
      }
      persist(createSession(generated.current.questions));
      generated.current = { key: "", questions: [] };
      setSetup(false); setShowUnanswered(false);
      if (printAfter) setPrintMode(printAfter);
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "문제를 준비하지 못했어요."); }
    finally { if (!controller.signal.aborted) setBusy(""); }
  };
  const grade = async () => {
    if (!session || busy) return;
    const unanswered = session.questions.filter((q) => !session.answers[q.id]?.trim());
    if (unanswered.length) { setShowUnanswered(true); persist({ ...session, index: session.questions.findIndex((q) => q.id === unanswered[0].id) }); return; }
    const controller = startRequest();
    let next: AssessmentSession = { ...session, grades: { ...session.grades }, stage: "results" };
    const saveGrade = (q: AssessmentQuestion, result: AssessmentGrade) => {
      next.grades[q.id] = result;
      recordAssessmentGrade(course, next.id, q, next.answers[q.id], result);
    };
    try {
      setBusy("답안을 확인하고 있어요...");
      for (const q of next.questions) {
        if (q.type !== "multiple_choice" || (next.grades[q.id] && next.grades[q.id].status !== "unknown")) continue;
        saveGrade(q, { questionId: q.id, status: next.answers[q.id] === q.answer ? "correct" : "incorrect", feedback: q.explanation, missingPoints: [] });
      }
      persist({ ...next, grades: { ...next.grades } });
      const essays = next.questions.filter((q) => q.type === "essay" && (!next.grades[q.id] || next.grades[q.id].status === "unknown"));
      for (let offset = 0; offset < essays.length; offset += 3) {
        setBusy(`서술형 답안을 확인하고 있어요 · ${offset} / ${essays.length}`);
        const batch = essays.slice(offset, offset + 3);
        const payload = await assessmentRequest("grade-assessment", { items: batch.map((q) => ({ question: q, answer: next.answers[q.id] })) }, controller.signal);
        if (controller.signal.aborted) return;
        if (validateAssessmentGrades(payload, batch.map((q) => q.id)).length) throw new Error("채점 결과를 확인하지 못했어요. 답안은 그대로 남아 있습니다.");
        for (const result of payload.grades as AssessmentGrade[]) saveGrade(batch.find((q) => q.id === result.questionId)!, result);
        persist({ ...next, grades: { ...next.grades } });
      }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "답안을 확인하지 못했어요."); }
    finally { if (!controller.signal.aborted) { setBusy(""); onDataChanged(); } }
  };
  const cancel = () => { request.current?.abort(); setBusy(""); };
  const question = session?.questions[session.index];
  const answered = session?.questions.filter((q) => session.answers[q.id]?.trim()).length || 0;
  const score = session ? assessmentScore(session.questions, session.grades) : null;
  const retryQuestions = session?.questions.filter((q) => session.grades[q.id]?.status !== "correct") || [];
  const weakConcepts = session ? [...new Set(retryQuestions.filter((q) => ["partial", "incorrect"].includes(session.grades[q.id]?.status)).map((q) => q.conceptName))] : [];
  const strongConcepts = session ? [...new Set(session.questions.filter((q) => session.grades[q.id]?.status === "correct" && !retryQuestions.some((item) => item.conceptId === q.conceptId)).map((q) => q.conceptName))] : [];

  return <div className="mx-auto w-full max-w-3xl space-y-7 px-4 py-7 pb-24 sm:px-6" aria-busy={!!busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button className={secondary} onClick={() => { cancel(); onBack(); }}><ArrowLeft size={16} />{backLabel}</button>
      <div className="flex flex-wrap items-center gap-2">
        {session && !saveError && <span className="text-xs text-[var(--lh-ink-secondary)]">이 기기에 자동 저장됨</span>}
        {session && !setup && <>
          <button className={secondary} disabled={!!busy} onClick={() => setPrintMode("questions")}><Printer size={16} />시험지 PDF</button>
          <button className={secondary} disabled={!!busy} onClick={() => setPrintMode("answers")}>정답 포함</button>
        </>}
      </div>
    </div>
    {error && <p role="alert" className="rounded-2xl border border-[var(--lh-line)] p-4 text-sm text-[var(--lh-danger)]">{error}</p>}
    {saveError && <div role="alert" className="rounded-2xl border border-[var(--lh-line)] p-4 text-sm text-[var(--lh-danger)]">답안을 기기에 저장하지 못했어요. 이 화면을 나가면 최근 답안을 잃을 수 있습니다. <button className="underline" onClick={() => session && persist(session)}>다시 저장</button></div>}
    {setup ? <>
      <div className="space-y-3 pt-3">
        <span className="text-sm text-[var(--lh-ink-secondary)]">{course.title}</span>
        <h1 ref={heading} tabIndex={-1} className="text-3xl font-medium tracking-tight outline-none">어떤 문제로 확인할까요?</h1>
        <p className="text-sm leading-relaxed text-[var(--lh-ink-secondary)]">{practiceLessonIds ? `고른 개념 ${practiceLessonIds.length}개에서 문제를 만들어요. ` : ""}배운 내용을 떠올려 보세요. 시간 제한 없이, 내 속도로 풀면 돼요.</p>
      </div>
      {session && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--lh-primary-subtle)] p-4">
        <p className="text-sm">{session.stage === "results" ? "지난 풀이 결과가 있어요." : `${session.questions.length}문제 중 ${answered}문제에 답했어요.`}</p>
        <button className={secondary} disabled={!!busy} onClick={() => { setSetup(false); setError(""); }}>{session.stage === "results" ? "결과 보기" : "이어서 풀기"}</button>
      </div>}
      {!canGenerate ? <p className="rounded-2xl border border-[var(--lh-line)] p-5">{practice ? "문제를 만들 개념을 하나 이상 골라 주세요." : "모든 레슨을 마치면 종합 문제를 풀 수 있어요."}</p> : <div className="space-y-8 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 sm:p-8">
        <fieldset disabled={!!busy} className="space-y-3"><legend className="mb-3 text-sm font-medium">문제 수</legend>
          <div className="grid grid-cols-3 gap-2">{([5, 10, 20] as const).map((count) => <button key={count} aria-pressed={config.count === count} onClick={() => setConfig({ ...config, count })} className={`${secondary} ${config.count === count ? "!border-[var(--lh-primary)] !bg-[var(--lh-primary-subtle)] text-[var(--lh-primary)]" : ""}`}>{count}개</button>)}</div>
        </fieldset>
        <fieldset disabled={!!busy}><legend className="mb-3 text-sm font-medium">문제 유형</legend>
          <div className="grid grid-cols-3 gap-2">{(["mixed", "multiple_choice", "essay"] as AssessmentType[]).map((type) => <button key={type} aria-pressed={config.type === type} onClick={() => setConfig({ ...config, type })} className={`${secondary} ${config.type === type ? "!border-[var(--lh-primary)] !bg-[var(--lh-primary-subtle)] text-[var(--lh-primary)]" : ""}`}>{typeLabels[type]}</button>)}</div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--lh-ink-secondary)]">{config.type === "mixed" ? `객관식 ${Math.ceil(config.count / 2)}개 + 서술형 ${Math.floor(config.count / 2)}개` : config.type === "essay" ? "내 말로 짧게 설명해요. 핵심을 이해했다면 다른 표현도 괜찮아요." : "4개의 보기 중 알맞은 답을 골라요."}</p>
        </fieldset>
        {busy ? <button className={`${primary} w-full`} disabled><Loader2 size={18} className="animate-spin" />{busy}</button> : <div className={`flex gap-2 ${preferPrint ? "flex-col-reverse" : "flex-col"}`}>
          <button className={`${preferPrint ? secondary : primary} w-full`} onClick={() => generate()}><Sparkles size={18} />{config.count}문제 바로 풀기</button>
          <button className={`${preferPrint ? primary : secondary} w-full`} onClick={() => generate("questions")}><Printer size={16} />시험지로 만들어 PDF 저장</button>
        </div>}
        {session && <p className="text-center text-xs text-[var(--lh-ink-secondary)]">새 문제를 만들면 이전 풀이 대신 새 풀이가 저장됩니다.</p>}
      </div>}
    </> : session?.stage === "solving" && question ? <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm"><span>{session.index + 1} / {session.questions.length} 문제</span><span className="text-[var(--lh-ink-secondary)]">{answered}개 답변 완료</span></div>
        <div role="progressbar" aria-label="답변 진행률" aria-valuenow={answered} aria-valuemin={0} aria-valuemax={session.questions.length} className="h-1.5 overflow-hidden rounded-full bg-[var(--lh-surface-strong)]"><div className="h-full rounded-full bg-[var(--lh-primary)] transition-all" style={{ width: `${answered / session.questions.length * 100}%` }} /></div>
      </div>
      <section className="space-y-6 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 sm:p-8">
        <span className="text-xs text-[var(--lh-primary)]">{typeLabels[question.type]}</span>
        <h1 ref={heading} tabIndex={-1} className="text-xl font-medium leading-relaxed outline-none"><RichLessonRenderer content={question.question} /></h1>
        {question.type === "multiple_choice" ? <fieldset className="space-y-3"><legend className="sr-only">답 선택</legend>{question.options?.map((option, i) => <label key={option} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition ${session.answers[question.id] === option ? "border-[var(--lh-primary)] bg-[var(--lh-primary-subtle)]" : "border-[var(--lh-line)] hover:bg-[var(--lh-surface-subtle)]"}`}>
          <input type="radio" name={question.id} className="mt-1 accent-[var(--lh-primary)]" checked={session.answers[question.id] === option} onChange={() => persist({ ...session, answers: { ...session.answers, [question.id]: option } })} />
          <span className="min-w-0 flex-1"><span className="mr-2 text-[var(--lh-ink-tertiary)]">{i + 1}.</span>{option}</span>
        </label>)}</fieldset> : <div className="space-y-2"><label htmlFor="assessment-answer" className="text-sm text-[var(--lh-ink-secondary)]">생각한 이유나 풀이 과정을 적어주세요.</label><textarea id="assessment-answer" rows={6} maxLength={2000} value={session.answers[question.id] || ""} onChange={(e) => persist({ ...session, answers: { ...session.answers, [question.id]: e.target.value } })} placeholder="완벽한 문장보다 내 생각을 편하게 써보세요." className="w-full resize-y rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-4 text-base leading-relaxed focus:outline-2 focus:outline-[var(--lh-primary)]" /><p className="text-right text-xs text-[var(--lh-ink-tertiary)]">{session.answers[question.id]?.length || 0} / 2000</p></div>}
      </section>
      {showUnanswered && answered < session.questions.length && <p role="status" className="text-sm text-[var(--lh-primary)]">아직 {session.questions.length - answered}문제가 남았어요. 답하지 않은 문제로 이동했어요.</p>}
      <div className="flex items-center justify-between gap-3"><button className={secondary} disabled={session.index === 0} onClick={() => persist({ ...session, index: session.index - 1 })}><ArrowLeft size={16} />이전</button>
        {session.index < session.questions.length - 1 ? <button className={primary} onClick={() => persist({ ...session, index: session.index + 1 })}>다음 문제<ArrowRight size={16} /></button> : <button className={primary} onClick={grade}>답안 제출하기<Check size={16} /></button>}
      </div>
      <details className="rounded-2xl border border-[var(--lh-line)] p-4"><summary className="cursor-pointer text-sm">전체 문제 보기 · {session.questions.length - answered}개 미응답</summary><nav aria-label="문제 이동" className="mt-4 flex flex-wrap gap-2">{session.questions.map((q, i) => <button key={q.id} aria-label={`${i + 1}번 ${session.answers[q.id]?.trim() ? "답변 완료" : "미응답"}`} aria-current={i === session.index ? "step" : undefined} className={`min-h-11 min-w-11 rounded-xl border text-sm ${i === session.index ? "border-[var(--lh-primary)]" : "border-[var(--lh-line)]"} ${session.answers[q.id]?.trim() ? "bg-[var(--lh-primary-subtle)]" : ""}`} onClick={() => persist({ ...session, index: i })}>{i + 1}</button>)}</nav></details>
      <button className="text-sm text-[var(--lh-ink-secondary)] underline" onClick={onBack}>나중에 이어서 풀기</button>
    </> : session && score ? <>
      <div className="space-y-3 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-[var(--lh-primary)]" /><h1 ref={heading} tabIndex={-1} className="text-3xl font-medium outline-none">{busy ? "배운 내용을 확인하고 있어요" : score.pending ? "확인한 결과를 먼저 볼까요?" : "한 번 더, 내 지식이 되었어요"}</h1><p className="text-sm text-[var(--lh-ink-secondary)]">{course.title}</p></div>
      <div className="space-y-5 rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-6 text-center">
        <p className="text-sm text-[var(--lh-ink-secondary)]">{score.pending ? `채점된 ${score.scored}문제 기준 점수` : "이번 문제 점수"}</p><p className="text-5xl font-medium text-[var(--lh-primary)]">{score.percent === null ? "—" : `${score.percent}점`}</p>
        <p className="text-xs text-[var(--lh-ink-secondary)]">정답 {score.correct}개 · 부분 정답 {Object.values(session.grades).filter((g: AssessmentGrade) => g.status === "partial").length}개 · 부분 정답은 문항 배점의 절반을 반영해요.</p>
        <div className="flex justify-center gap-6 text-sm">{(["multiple_choice", "essay"] as const).map((type) => { const qs = session.questions.filter((q) => q.type === type); const s = assessmentScore(qs, session.grades); return qs.length ? <span key={type}>{typeLabels[type]} · 정답 {s.correct}/{qs.length}{s.pending ? ` · 보류 ${s.pending}` : ""}</span> : null; })}</div>
      </div>
      {busy ? <p role="status" className="flex items-center justify-center gap-2 text-sm"><Loader2 size={18} className="animate-spin" />{busy}</p> : score.pending > 0 && <div className="space-y-3 rounded-2xl bg-[var(--lh-surface-subtle)] p-5"><p className="text-sm">{score.pending}문제는 아직 채점을 마치지 못했어요. 오답으로 처리하지 않았습니다.</p><button className={secondary} onClick={grade}><RotateCcw size={16} />남은 답안 다시 채점하기</button></div>}
      {(strongConcepts.length > 0 || weakConcepts.length > 0) && <div className="space-y-3 text-sm">{strongConcepts.length > 0 && <p><span className="text-[var(--lh-primary)]">잘 이해했어요</span> · {strongConcepts.join(", ")}</p>}{weakConcepts.length > 0 && <p><span className="text-[var(--lh-ink-secondary)]">한 번 더 보면 좋아요</span> · {weakConcepts.join(", ")}</p>}</div>}
      <div className="flex flex-wrap gap-3">{retryQuestions.length > 0 && <button className={primary} disabled={!!busy} onClick={() => { persist(createSession(retryQuestions)); setShowUnanswered(false); setError(""); }}><RotateCcw size={16} />{score.pending ? "다시 확인할 문제 풀기" : "틀린 문제 다시 풀기"} · {retryQuestions.length}개</button>}<button className={retryQuestions.length ? secondary : primary} disabled={!!busy} onClick={() => { setSetup(true); setError(""); }}>새 문제 풀기</button></div>
      <div className="space-y-3">{session.questions.map((q, i) => { const g = session.grades[q.id]; return <details key={q.id} className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5"><summary className="cursor-pointer text-sm leading-relaxed"><span className="mr-2 text-[var(--lh-ink-secondary)]">{i + 1}.</span>{q.question}<span className="ml-3 text-[var(--lh-primary)]">{g ? labels[g.status] : "채점 대기"}</span></summary><div className="mt-5 space-y-4 text-sm leading-relaxed"><div><p className="mb-1 text-xs text-[var(--lh-ink-secondary)]">내 답안</p><p className="whitespace-pre-wrap">{session.answers[q.id]}</p></div><div><p className="mb-1 text-xs text-[var(--lh-ink-secondary)]">{q.type === "essay" ? "모범 답안" : "정답"}</p><RichLessonRenderer content={q.answer} /></div>{g && <p>{g.feedback}</p>}{!!g?.missingPoints.length && <div className="rounded-xl bg-[var(--lh-surface-subtle)] p-3"><p className="mb-1 font-medium">이 부분을 보완해보세요</p><ul className="list-disc space-y-1 pl-5">{g.missingPoints.map((p) => <li key={p}>{p}</li>)}</ul></div>}<RichLessonRenderer content={q.explanation} /><button className={secondary} onClick={() => { cancel(); onReviewLesson(q.lessonId); }}>관련 레슨 복습하기<ArrowRight size={16} /></button></div></details>; })}</div>
    </> : null}
    {busy && <button className="mx-auto block text-sm text-[var(--lh-ink-secondary)] underline" onClick={cancel}>잠시 멈추기</button>}
    {printMode && session && <AssessmentPrintSheet courseTitle={course.title} questions={session.questions} mode={printMode} onDone={() => setPrintMode(null)} />}
  </div>;
}
