import React from "react";
import type { Course, UserSkill, UserProgress } from "../types/learning";
import type { NotionPageView } from "./notion/Sidebar";
import { ArrowRight } from "lucide-react";

interface SkillMatrixViewProps {
  skills: UserSkill[];
  progress: UserProgress;
  courses?: Course[];
  onSelectView?: (view: NotionPageView) => void;
}

export const SkillMatrixView: React.FC<SkillMatrixViewProps> = ({ skills, progress, courses = [], onSelectView }) => {
  const sorted = [...skills].sort((a, b) => b.wrongCount - a.wrongCount || b.lastStudiedAt.localeCompare(a.lastStudiedAt));
  const lessons = courses.flatMap(course => course.chapters.flatMap(chapter => chapter.lessons.map(lesson => ({ course, lesson, chapterTitle: chapter.title }))));
  const next = lessons.find(item => !item.lesson.isCompleted);
  const open = (skill: UserSkill) => {
    const match = lessons.find(item => item.course.id === skill.courseId && (item.lesson.conceptId === skill.conceptId || item.lesson.conceptName === skill.conceptName));
    if (match) onSelectView?.({ type: "lesson", ...match });
  };
  return <div className="space-y-6 pb-10">
    <h2 className="text-xl font-medium">개념별 학습 현황</h2>
    <div className="grid grid-cols-3 gap-3">
      {[{ label: "완료한 레슨", value: progress.completedLessonsCount }, { label: "공부한 개념", value: skills.length }, { label: "푼 문제", value: skills.reduce((sum, s) => sum + s.correctCount + s.wrongCount, 0) }].map(item => <div key={item.label} className="rounded-2xl border border-[var(--lh-line)] p-4"><p className="text-xs text-[var(--lh-ink-secondary)]">{item.label}</p><p className="mt-2 text-2xl">{item.value}</p></div>)}
    </div>
    {next && onSelectView && <button onClick={() => onSelectView({ type: "lesson", ...next })} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] p-5 text-left"><span><span className="block text-xs text-[var(--lh-ink-secondary)]">이어서 학습</span><span className="mt-1 block font-medium">{next.lesson.title}</span></span><ArrowRight size={18} /></button>}
    <div className="space-y-3">
      {sorted.map(skill => <button key={`${skill.courseId}:${skill.conceptId}`} onClick={() => open(skill)} className="flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 text-left">
        <span><span className="block font-medium">{skill.conceptName}</span><span className="mt-1 block text-xs text-[var(--lh-ink-secondary)]">{skill.courseTitle}</span></span>
        <span className="flex flex-wrap items-center gap-4 text-sm"><span>정답 {skill.correctCount} · 오답 {skill.wrongCount}</span>{skill.reviewCount > 0 && <span>복습 {skill.reviewCount}회</span>}<span className="text-xs text-[var(--lh-ink-secondary)]">{new Date(skill.lastStudiedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</span><ArrowRight size={16} /></span>
      </button>)}
      {!skills.length && <p className="py-8 text-center text-sm text-[var(--lh-ink-secondary)]">아직 학습 기록이 없습니다.</p>}
    </div>
  </div>;
};
