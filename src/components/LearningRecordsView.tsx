import React, { useState } from "react";
import { BarChart3, FileWarning, History, LineChart } from "lucide-react";
import { Course, ReviewQuestion, UserProgress, UserSkill } from "../types/learning";
import { INITIAL_COURSES } from "../data/initialData";
import { getLearningAnalyticsSummary } from "../services/learningAnalytics";
import { SkillMatrixView } from "./SkillMatrixView";
import { MistakeArchiveView } from "./notion/MistakeArchiveView";
import { AccountSyncPanel } from "./AccountSyncPanel";
import { NotionPageView } from "./notion/Sidebar";

interface LearningRecordsViewProps {
  skills: UserSkill[];
  progress: UserProgress;
  courses: Course[];
  reviews: ReviewQuestion[];
  onSelectView: (view: NotionPageView) => void;
  onDataChanged?: () => void;
}

type RecordsTab = "summary" | "skills" | "mistakes";

export const LearningRecordsView: React.FC<LearningRecordsViewProps> = ({
  skills,
  progress,
  courses,
  reviews,
  onSelectView,
  onDataChanged,
}) => {
  const [activeTab, setActiveTab] = useState<RecordsTab>("summary");
  const summary = getLearningAnalyticsSummary();
  const sampleCourseIds = new Set(INITIAL_COURSES.map((course) => course.id));
  const learnerCourses = courses.filter((course) => !sampleCourseIds.has(course.id));
  const learnerSkills = skills.filter((skill) => !sampleCourseIds.has(skill.courseId));
  const learnerReviews = reviews.filter((review) => !review.courseId || !sampleCourseIds.has(review.courseId));
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
    <div className="mx-auto w-full max-w-[760px] space-y-6 px-4 py-10 pb-16">
      <header className="space-y-2 border-b border-[#E9E9E7] pb-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-[#787774]">
          <History className="h-3.5 w-3.5" />
          <span>이 기기에 저장된 기록</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#191919]">학습 기록</h1>
        <p className="text-sm leading-relaxed text-[#787774]">
          완료한 공부와 다시 볼 기록을 한곳에서 확인합니다. 읽기 완료는 숙달이나 학습 효과를 뜻하지 않습니다.
        </p>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-[#E9E9E7] pb-2" role="tablist" aria-label="학습 기록 보기">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#191919] ${
              activeTab === tab.id
                ? "bg-[#191919] text-white"
                : "text-[#787774] hover:bg-[#F7F6F3] hover:text-[#191919]"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "summary" && (
        <section className="space-y-4" role="tabpanel">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="완료한 레슨" value={completedLessons} />
            <Metric label="진행 중인 과목" value={inProgressCourses} />
            <Metric label="다시 볼 개념" value={weakSkillCount} />
            <Metric label="예정된 복습" value={learnerReviews.length} />
            <Metric label="완료 레슨 예상 시간 합계" value={completedEstimatedMinutes} suffix="분" />
          </div>
          <div className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-4 text-xs leading-relaxed text-[#787774]">
            예상 시간 합계는 완료 레슨의 추정 소요 시간입니다. 실제 집중 시간, 정답률, 학습 효과는 이 화면에서 측정하지 않습니다.
          </div>
          <details className="rounded-lg border border-[#E9E9E7] bg-white p-4">
            <summary className="cursor-pointer text-xs font-semibold text-[#787774]">
              진단용 사용 기록 · 이 기기에만 저장 · 샘플 제외
            </summary>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="첫 레슨 방문" value={summary.firstLessonStarts} />
              <Metric label="첫 레슨 완료" value={summary.firstLessonCompletions} />
              <Metric label="이어서 학습 방문" value={summary.resumeVisits} />
              <Metric label="복습 화면 방문" value={summary.reviewVisits} />
              <Metric label="새 과목 생성" value={summary.courseCreations} />
              <Metric label="전체 레슨 방문" value={summary.lessonStarts} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#9B9A97]">
              제품 흐름 점검을 위한 로컬 행동 집계이며, 사용자 성과나 개선률로 해석하지 않습니다.
            </p>
          </details>
          <details className="rounded-lg border border-[#E9E9E7] bg-white p-4">
            <summary className="cursor-pointer text-xs font-semibold text-[#787774]">
              데이터 백업 및 계정 준비
            </summary>
            <div className="mt-4">
              <AccountSyncPanel onDataChanged={onDataChanged} />
            </div>
          </details>
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

const Metric: React.FC<{ label: string; value: number; suffix?: string }> = ({ label, value, suffix }) => (
  <div className="rounded-lg border border-[#E9E9E7] bg-white p-4">
    <span className="block text-[11px] font-semibold text-[#787774]">{label}</span>
    <span className="mt-1 block font-mono text-2xl font-bold text-[#191919]">{value}{suffix ? ` ${suffix}` : ""}</span>
  </div>
);
