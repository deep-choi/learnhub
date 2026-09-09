import React from "react";
import { Course, UserSkill, UserProgress } from "../types/learning";
import { NotionPageView } from "./notion/Sidebar";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Lightbulb,
  Sparkles,
  Target,
} from "lucide-react";

interface SkillMatrixViewProps {
  skills: UserSkill[];
  progress: UserProgress;
  courses?: Course[];
  onSelectView?: (view: NotionPageView) => void;
}

export const SkillMatrixView: React.FC<SkillMatrixViewProps> = ({
  skills,
  progress,
  courses = [],
  onSelectView,
}) => {
  // Sort skills by understanding ascending (weakest first)
  const sortedSkills = [...skills].sort((a, b) => a.understanding - b.understanding);
  const weakSkills = sortedSkills.filter((s) => s.understanding < 60);
  const highIndicatorSkills = sortedSkills.filter((s) => s.understanding >= 80);

  const handleJumpToConcept = (conceptId: string, conceptName: string) => {
    if (!onSelectView || courses.length === 0) return;

    for (const c of courses) {
      for (const ch of c.chapters) {
        const found = ch.lessons.find(
          (l) => l.conceptId === conceptId || l.conceptName === conceptName
        );
        if (found) {
          onSelectView({
            type: "lesson",
            course: c,
            lesson: found,
            chapterTitle: ch.title,
          });
          return;
        }
      }
    }

    // Do not send an unknown or ambiguous concept to an unrelated first lesson.
  };

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header */}
      <section className="space-y-2 border-b border-[var(--lh-line)] pb-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--lh-primary)]">
          <Brain className="h-4 w-4" /><span>학습 기록 기반 분석</span>
        </div>
        <h1 className="text-3xl font-medium tracking-[-0.03em] text-[var(--lh-ink)] sm:text-4xl">
          개념별 학습 현황
        </h1>
        <p className="text-sm text-[var(--lh-ink-secondary)] font-normal">
          저장된 학습 기록과 개념별 참고 지표를 확인하고 다음 학습을 선택하세요.
        </p>

        {/* 4 Cards: Chunky M3 Stat Tiles */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 shadow-xs flex flex-col justify-between">
            <span className="block text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">예상 시간</span>
            <span className="my-2 block text-2xl font-medium text-[var(--lh-ink)] sm:text-3xl">{progress.totalMinutesLearned}분</span>
            <span className="block text-[11px] text-[var(--lh-ink-secondary)] font-normal">실제 집중 시간 아님</span>
          </div>
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 shadow-xs flex flex-col justify-between">
            <span className="block text-xs font-medium uppercase tracking-wider text-[var(--lh-ink-tertiary)]">완료한 공부</span>
            <span className="my-2 block text-2xl font-medium text-[var(--lh-ink)] sm:text-3xl">{progress.completedLessonsCount}개</span>
            <span className="block text-[11px] text-[var(--lh-ink-secondary)] font-normal">스스로 끝낸 단원</span>
          </div>
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 shadow-xs flex flex-col justify-between">
            <span className="block text-xs font-medium uppercase tracking-wider text-[var(--lh-primary-text)]">참고 지표 80%+</span>
            <span className="my-2 block text-2xl font-medium text-[var(--lh-primary)] sm:text-3xl">{highIndicatorSkills.length}개</span>
            <span className="block text-[11px] text-[var(--lh-ink-secondary)] font-normal">학습 기록 기반 지표</span>
          </div>
          <div className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 shadow-xs flex flex-col justify-between">
            <span className="block text-xs font-medium uppercase tracking-wider text-[var(--lh-secondary-text)]">다시 볼 개념</span>
            <span className="my-2 block text-2xl font-medium text-[var(--lh-secondary)] sm:text-3xl">{weakSkills.length}개</span>
            <span className="block text-[11px] text-[var(--lh-ink-secondary)] font-normal">한 번 더 복습</span>
          </div>
        </div>
      </section>

      {/* 2. AI Next Best Action: Chunky M3 Recommendation Cards */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--lh-ink)]">
          <Compass className="h-4 w-4 text-[var(--lh-primary)]" />
          <span>다음 학습 제안</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {weakSkills.length > 0 ? (
            <div className="rounded-3xl border border-[var(--lh-secondary-border)] bg-[var(--lh-surface)] p-6 sm:p-7 space-y-4 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-[var(--lh-secondary-subtle)] border border-[var(--lh-secondary-border)] px-3 py-1 text-xs font-medium text-[var(--lh-secondary-text)]">
                  복습 추천
                </span>
                <span className="font-mono text-xs font-medium text-[var(--lh-secondary-text)]">
                  실력 {weakSkills[0].understanding}%
                </span>
              </div>
              <div>
                <h3 className="text-lg font-medium text-[var(--lh-ink)]">
                  {weakSkills[0].conceptName}
                </h3>
                <p className="text-xs leading-relaxed text-[var(--lh-ink-secondary)] mt-1 font-normal">
                  이 개념을 한 번 더 다져두면 다음 단계 공부가 훨씬 쉬워집니다.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => handleJumpToConcept(weakSkills[0].conceptId, weakSkills[0].conceptName)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-secondary)] px-5 text-xs font-medium text-white shadow-xs hover:bg-[var(--lh-secondary-hover)] transition cursor-pointer"
                >
                  <span>이 개념 복습하기</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}

          {(() => {
            const nextLesson = courses
              .flatMap((course) =>
                course.chapters.flatMap((chapter) =>
                  chapter.lessons
                    .filter((lesson) => !lesson.isCompleted)
                    .map((lesson) => ({ course, lesson, chapterTitle: chapter.title })),
                ),
              )[0];

            if (!nextLesson || !onSelectView) return null;
            return (
              <div className="rounded-3xl border border-[var(--lh-primary-border)] bg-[var(--lh-surface)] p-6 sm:p-7 space-y-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-3 py-1 text-xs font-medium text-[var(--lh-primary-text)] shadow-xs">
                    이어서 학습
                  </span>
                  <span className="font-mono text-xs font-medium text-[var(--lh-ink-secondary)]">미완료 레슨</span>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-[var(--lh-ink)]">{nextLesson.lesson.title}</h3>
                  <p className="text-xs leading-relaxed text-[var(--lh-ink-secondary)] mt-1 font-normal">
                    저장된 과목 목록의 첫 미완료 레슨입니다. 학습 기록 기반 참고 지표가 갱신됩니다.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() =>
                      onSelectView({
                        type: "lesson",
                        course: nextLesson.course,
                        lesson: nextLesson.lesson,
                        chapterTitle: nextLesson.chapterTitle,
                      })
                    }
                    className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--lh-primary)] px-5 text-xs font-medium text-white hover:bg-[var(--lh-primary-hover)] shadow-xs transition cursor-pointer"
                  >
                    <span>레슨 열기</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* 3. Concept Understanding Table: Chunky M3 Container */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--lh-line)] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--lh-ink)]">개념별 실력 현황</span>
            <span className="rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-2.5 py-1 text-xs font-medium text-[var(--lh-primary-text)]">
              {skills.length}개 개념 공부함
            </span>
          </div>
        </div>

        {/* Mobile View */}
        <div className="grid gap-3 md:hidden">
          {sortedSkills.map((skill) => (
            <button
              key={skill.conceptId}
              type="button"
              onClick={() => handleJumpToConcept(skill.conceptId, skill.conceptName)}
              className="rounded-2xl border border-[var(--lh-line)] bg-[var(--lh-surface)] p-5 text-left shadow-xs transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-medium text-[var(--lh-ink)]">{skill.conceptName}</h3>
                  <p className="mt-1 text-xs text-[var(--lh-ink-secondary)] font-normal">{skill.courseTitle}</p>
                </div>
                <span className="font-mono text-base font-medium text-[var(--lh-ink)]">{skill.understanding}%</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--lh-surface-subtle)]">
                <div
                  className={`h-full rounded-full ${
                    skill.understanding >= 80
                      ? "bg-[var(--lh-primary)]"
                      : skill.understanding < 60
                      ? "bg-[var(--lh-secondary)]"
                      : "bg-[var(--lh-primary)]/70"
                  }`}
                  style={{ width: `${skill.understanding}%` }}
                />
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-[var(--lh-ink-secondary)] font-normal">
                <span>맞힘 {skill.correctCount} · 틀림 {skill.wrongCount}</span>
                <span className="inline-flex items-center gap-1 font-medium text-[var(--lh-primary)]">학습 <ArrowRight className="h-3.5 w-3.5" /></span>
              </div>
            </button>
          ))}
        </div>

        {/* Desktop M3 Table */}
        <div className="hidden overflow-x-auto rounded-3xl border border-[var(--lh-line)] bg-[var(--lh-surface)] shadow-xs md:block">
          <table className="min-w-[620px] w-full text-left text-xs">
            <thead className="border-b border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] text-xs font-medium text-[var(--lh-ink-secondary)]">
              <tr>
                <th className="px-5 py-3.5">개념명 및 과목</th>
                <th className="px-5 py-3.5">내 실력 (%)</th>
                <th className="hidden px-5 py-3.5 sm:table-cell">상태</th>
                <th className="hidden px-5 py-3.5 md:table-cell">문제 풀이</th>
                <th className="px-5 py-3.5 text-right">최근 공부</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--lh-line)]">
              {sortedSkills.map((skill) => {
                const isMaster = skill.understanding >= 80;
                const isDeveloping = skill.understanding >= 60 && skill.understanding < 80;
                const isWeak = skill.understanding < 60;

                return (
                  <tr
                    key={skill.conceptId}
                    onClick={() => handleJumpToConcept(skill.conceptId, skill.conceptName)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleJumpToConcept(skill.conceptId, skill.conceptName);
                      }
                    }}
                    tabIndex={onSelectView ? 0 : undefined}
                    role={onSelectView ? "button" : undefined}
                    aria-label={onSelectView ? `${skill.conceptName} 레슨 열기` : undefined}
                    className="group transition hover:bg-[var(--lh-surface-subtle)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lh-primary)]"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-[var(--lh-ink)] group-hover:text-[var(--lh-primary)] group-hover:underline text-sm">
                        {skill.conceptName}
                      </div>
                      <div className="text-xs text-[var(--lh-ink-secondary)] font-normal mt-0.5">{skill.courseTitle}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--lh-surface-subtle)]">
                          <div
                            className={`h-full rounded-full ${
                              isMaster
                                ? "bg-[var(--lh-primary)]"
                                : isDeveloping
                                ? "bg-[var(--lh-primary)]/70"
                                : "bg-[var(--lh-secondary)]"
                            }`}
                            style={{ width: `${skill.understanding}%` }}
                          />
                        </div>
                        <span className="font-mono font-medium text-[var(--lh-ink)]">
                          {skill.understanding}%
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      {isMaster && (
                        <span className="inline-block rounded-full bg-[var(--lh-primary-subtle)] border border-[var(--lh-primary-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--lh-primary-text)] shadow-xs">
                          ● 참고 지표 높음
                        </span>
                      )}
                      {isDeveloping && (
                        <span className="inline-block rounded-full bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-2.5 py-1 text-[10px] font-medium text-[var(--lh-ink)]">
                          ◐ 성장 중
                        </span>
                      )}
                      {isWeak && (
                        <span className="inline-block rounded-full bg-[var(--lh-secondary-subtle)] border border-[var(--lh-secondary-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--lh-secondary-text)] shadow-xs">
                          ○ 복습 추천
                        </span>
                      )}
                    </td>
                    <td className="hidden px-5 py-4 font-mono text-[var(--lh-ink-secondary)] text-xs font-normal md:table-cell">
                      맞힘 {skill.correctCount} / 틀림 {skill.wrongCount} (복습 {skill.reviewCount}회)
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <span className="text-xs text-[var(--lh-ink-secondary)] font-normal mr-2">
                        {new Date(skill.lastStudiedAt).toLocaleDateString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </span>
                      <span className="inline-block rounded-full border border-[var(--lh-primary-border)] bg-[var(--lh-primary-subtle)] px-3 py-1 text-xs font-medium text-[var(--lh-primary-text)] group-hover:bg-[var(--lh-primary)] group-hover:text-white transition shadow-xs">
                        학습 ➔
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
