import React, { useState } from "react";
import { BarChart3, FileWarning, History, LineChart } from "lucide-react";
import { Course, ReviewQuestion, UserProgress, UserSkill } from "../types/learning";
import { SkillMatrixView } from "./SkillMatrixView";
import { MistakeArchiveView } from "./notion/MistakeArchiveView";
import { NotionPageView } from "./notion/Sidebar";

interface LearningRecordsViewProps {
  skills: UserSkill[];
  progress: UserProgress;
  courses: Course[];
  reviews: ReviewQuestion[];
  onSelectView: (view: NotionPageView) => void;
}

type RecordsTab = "summary" | "skills" | "mistakes";

export const LearningRecordsView: React.FC<LearningRecordsViewProps> = ({
  skills,
  progress,
  courses,
  reviews,
  onSelectView,
}) => {
  const [activeTab, setActiveTab] = useState<RecordsTab>("summary");
  const learnerCourses = courses;
  const learnerSkills = skills;
  const learnerReviews = reviews;
  const completedLessons = learnerCourses.reduce(
    (count, course) => count + course.chapters.flatMap((chapter) => chapter.lessons).filter((lesson) => lesson.isCompleted).length,
    0,
  );
  const completedEstimatedMinutes = learnerCourses.reduce(
    (total, course) => total + course.chapters.flatMap((chapter) => chapter.lessons)
      .filter((lesson) => lesson.isCompleted)
      .reduce((minutes, lesson) => minutes + lesson.estimatedMinutes, 0),
    0,
  );
  const inProgressCourses = learnerCourses.filter((course) => {
    const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
    const completed = lessons.filter((lesson) => lesson.isCompleted).length;
    return completed > 0 && completed < lessons.length;
  }).length;
  const weakSkillCount = learnerSkills.filter((skill) => skill.understanding < 60).length;

  const tabs: Array<{ id: RecordsTab; label: string; icon: React.ReactNode }> = [
    { id: "summary", label: "요약", icon: <LineChart className="h-3.5 w-3.5" /> },
    { id: "skills", label: "개념 기록", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: "mistakes", label: "오답 기록", icon: <FileWarning className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 space-y-8 pb-24 text-sm text-[var(--lh-ink)]">
      <header className="space-y-3 border-b border-[var(--lh-line)] pb-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--lh-primary)]">
          <History className="h-4 w-4" />
          <span>내 학습 기록</span>
        </div>
        <h1 className="text-3xl font-medium tracking-[-0.03em] text-[var(--lh-ink)] sm:text-4xl">
          학습 기록
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--lh-ink-secondary)] font-normal">
          완료한 공부와 다시 볼 기록을 한곳에서 확인합니다. 읽기 완료는 숙달이나 학습 효과를 뜻하지 않습니다.
        </p>
      </header>

      {/* M3 Segmented Pill Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--lh-line)] pb-3" role="tablist" aria-label="학습 기록 보기">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-medium transition cursor-pointer shadow-xs ${
              activeTab === tab.id
                ? "bg-[var(--lh-primary)] text-white"
                : "border border-[var(--lh-line)] bg-[var(--lh-surface)] text-[var(--lh-ink-secondary)] hover:bg-[var(--lh-surface-subtle)] hover:text-[var(--lh-ink)]"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "summary" && (
        <section className="space-y-5" role="tabpanel">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="완료한 레슨" value={completedLessons} />
            <Metric label="진행 중인 과목" value={inProgressCourses} />
            <Metric label="다시 볼 개념" value={weakSkillCount} highlight={weakSkillCount > 0} />
            <Metric label="예정된 복습" value={learnerReviews.length} />
            <Metric label="완료 레슨 예상 시간 합계" value={completedEstimatedMinutes} suffix="분" />
          </div>
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] p-5 text-xs leading-relaxed text-[var(--lh-ink-secondary)] font-normal">
            예상 시간 합계는 완료 레슨의 추정 소요 시간입니다. 실제 집중 시간, 정답률, 학습 효과는 이 화면에서 측정하지 않습니다.
          </div>
        </section>
      )}

      {activeTab === "skills" && (
        <section role="tabpanel">
          <SkillMatrixView
            skills={learnerSkills}
            progress={progress}
            courses={courses}
            onSelectView={onSelectView}
          />
        </section>
      )}

      {activeTab === "mistakes" && (
        <section role="tabpanel">
          <MistakeArchiveView courses={learnerCourses} onSelectView={onSelectView} />
        </section>
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number; suffix?: string; highlight?: boolean }> = ({ label, value, suffix, highlight }) => (
  <div className={`rounded-2xl border bg-[var(--lh-surface)] p-5 shadow-xs flex flex-col justify-between ${
    highlight ? "border-[var(--lh-secondary-border)]" : "border-[var(--lh-line)]"
  }`}>
    <span className={`block text-xs font-medium uppercase tracking-wider ${
      highlight ? "text-[var(--lh-secondary-text)]" : "text-[var(--lh-ink-tertiary)]"
    }`}>{label}</span>
    <span className={`mt-2 block font-mono text-2xl font-medium tracking-tight ${
      highlight ? "text-[var(--lh-secondary)]" : "text-[var(--lh-ink)]"
    }`}>{value}{suffix ? ` ${suffix}` : ""}</span>
  </div>
);
