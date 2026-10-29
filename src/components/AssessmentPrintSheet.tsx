import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { AssessmentQuestion } from "../domain/assessment";
import { RichLessonRenderer } from "./notion/RichLessonRenderer";

export type PrintMode = "questions" | "answers";

interface AssessmentPrintSheetProps {
  courseTitle: string;
  questions: AssessmentQuestion[];
  mode: PrintMode;
  onDone: () => void;
}


/**
 * 문제를 시험지 모양으로 인쇄합니다. 브라우저 인쇄 창에서 "PDF로 저장"을 고르면 PDF가 됩니다.
 * 인쇄하는 동안에는 앱 화면을 숨기고 이 시트만 보이게 합니다(index.css의 body.lh-printing).
 */
export const AssessmentPrintSheet: React.FC<AssessmentPrintSheetProps> = ({ courseTitle, questions, mode, onDone }) => {
  const date = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const concepts = [...new Set(questions.map((q) => q.conceptName))];
  const mcCount = questions.filter((q) => q.type === "multiple_choice").length;
  const essayCount = questions.length - mcCount;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const title = document.title;
    // 저장되는 PDF 파일 이름이 문서 제목을 따라갑니다.
    document.title = `${courseTitle} ${mode === "answers" ? "시험지(정답 포함)" : "시험지"} ${new Date().toISOString().slice(0, 10)}`;
    document.body.classList.add("lh-printing");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove("lh-printing");
      document.title = title;
      done.current();
    };
    window.addEventListener("afterprint", finish);
    // 수식 렌더링이 끝난 뒤 인쇄 창을 엽니다. afterprint가 오지 않는 브라우저는 화면으로 돌아올 때 정리합니다.
    const timer = window.setTimeout(() => {
      window.print();
      window.addEventListener("focus", finish, { once: true });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
      window.removeEventListener("focus", finish);
      document.body.classList.remove("lh-printing");
      document.title = title;
    };
  }, [courseTitle, mode]);

  return createPortal(
    <div id="lh-print-root" aria-hidden="true">
      <header className="lh-print-header">
        <div>
          <p className="lh-print-kicker">LearnHub 확인 문제</p>
          <h1>{courseTitle}</h1>
          <p className="lh-print-meta">
            {date} · {questions.length}문항{mcCount && essayCount ? ` (객관식 ${mcCount} · 서술형 ${essayCount})` : ""}
          </p>
          <p className="lh-print-meta">범위 · {concepts.join(", ")}</p>
        </div>
        <div className="lh-print-fields">
          <span>이름 <i /></span>
          <span>점수 <i /> / {questions.length}</span>
        </div>
      </header>

      <ol className="lh-print-questions">
        {questions.map((q, index) => (
          <li key={q.id} className="lh-print-question">
            <div className="lh-print-stem">
              <span className="lh-print-number">{index + 1}.</span>
              <div><RichLessonRenderer content={q.question} /></div>
            </div>
            {q.type === "multiple_choice" ? (
              <ol className="lh-print-options">
                {q.options?.map((option, i) => (
                  <li key={option}><span>{i + 1})</span><RichLessonRenderer content={option} /></li>
                ))}
              </ol>
            ) : (
              <div className="lh-print-lines" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i} />)}</div>
            )}
          </li>
        ))}
      </ol>

      {mode === "answers" && (
        <section className="lh-print-answers">
          <h2>정답과 해설</h2>
          {questions.map((q, index) => {
            const choice = q.options?.indexOf(q.answer) ?? -1;
            return (
              <div key={q.id} className="lh-print-answer">
                <p className="lh-print-answer-title">
                  {index + 1}. {q.type === "multiple_choice" && choice >= 0 ? `정답 ${choice + 1}번` : "모범 답안"}
                  <span> · {q.conceptName}</span>
                </p>
                {q.type === "essay" && <RichLessonRenderer content={q.answer} />}
                {q.type === "essay" && q.criteria.length > 0 && (
                  <p className="lh-print-criteria">채점 기준 · {q.criteria.join(" / ")}</p>
                )}
                <div className="lh-print-explanation"><RichLessonRenderer content={q.explanation} /></div>
              </div>
            );
          })}
        </section>
      )}
    </div>,
    document.body,
  );
};
