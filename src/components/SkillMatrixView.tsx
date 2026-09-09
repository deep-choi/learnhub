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
      <section className="space-y-2 border-b border-[#E9E9E7] pb-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-[#787774]">
          <span>🌱 나의 실력 현황</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[#191919]">
          내 실력 그래프 & 맞춤 추천
        </h1>
        <p className="text-sm text-[#787774]">
          내가 남긴 학습 기록과 개념별 참고 지표를 한눈에 보고, 다음에 무엇을 배우면 좋을지 확인하세요.
        </p>

        {/* 4 Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-[#E9E9E7] bg-white p-4">
            <span className="block text-[11px] font-medium text-[#787774]">완료 레슨 예상 시간 합계</span>
            <span className="mt-1 block text-2xl font-bold text-[#191919]">{progress.totalMinutesLearned}분</span>
            <span className="mt-0.5 block text-[11px] text-[#9B9A97]">실제 집중 시간 아님</span>
          </div>
          <div className="rounded-md border border-[#E9E9E7] bg-white p-4">
            <span className="block text-[11px] font-medium text-[#787774]">완료한 공부</span>
            <span className="mt-1 block text-2xl font-bold text-[#191919]">{progress.completedLessonsCount}개</span>
            <span className="mt-0.5 block text-[11px] text-[#9B9A97]">스스로 끝낸 단원</span>
          </div>
          <div className="rounded-md border border-[#E9E9E7] bg-white p-4">
            <span className="block text-[11px] font-medium text-[#787774]">학습 기록 기반 참고 지표 (80%+)</span>
            <span className="mt-1 block text-2xl font-bold text-[#191919]">{highIndicatorSkills.length}개</span>
            <span className="mt-0.5 block text-[11px] text-[#9B9A97]">검증된 숙달을 의미하지 않음</span>
          </div>
          <div className="rounded-md border border-[#E9E9E7] bg-white p-4">
            <span className="block text-[11px] font-medium text-[#787774]">다시 볼 개념</span>
            <span className="mt-1 block text-2xl font-bold text-[#191919]">{weakSkills.length}개</span>
            <span className="mt-0.5 block text-[11px] text-[#9B9A97]">한 번 더 복습</span>
          </div>
        </div>
      </section>

      {/* 2. AI Next Best Action */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#191919]">
          <Compass className="h-4 w-4 text-[#191919]" />
          <span>✦ AI 추천 다음 공부</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {weakSkills.length > 0 ? (
            <div className="rounded-lg border border-[#E9E9E7] bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-2 py-0.5 text-[10px] font-bold text-[#191919]">
                  복습 추천
                </span>
                <span className="font-mono text-xs font-semibold text-[#787774]">
                  실력 {weakSkills[0].understanding}%
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#191919]">
                  {weakSkills[0].conceptName}
                </h3>
                <p className="text-xs leading-relaxed text-[#787774] mt-1">
                  이 개념을 한 번 더 다져두면 다음 단계 공부가 훨씬 쉬워집니다.
                </p>
              </div>
              <div className="pt-1">
                <button
                  onClick={() => handleJumpToConcept(weakSkills[0].conceptId, weakSkills[0].conceptName)}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-[#191919] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#37352F] transition cursor-pointer"
                >
                  <span>이 개념 복습하기</span>
                  <ArrowRight className="h-3 w-3" />
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
              <div className="rounded-lg border border-[#E9E9E7] bg-white p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-sm bg-[#191919] px-2 py-0.5 text-[10px] font-bold text-white">
                    이어서 학습
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#787774]">미완료 레슨</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#191919]">{nextLesson.lesson.title}</h3>
                  <p className="text-xs leading-relaxed text-[#787774] mt-1">
                    저장된 과목 목록의 첫 미완료 레슨입니다. 아래 수치는 학습 기록 기반 참고 지표입니다.
                  </p>
                </div>
                <div className="pt-1">
                  <button
                    onClick={() =>
                      onSelectView({
                        type: "lesson",
                        course: nextLesson.course,
                        lesson: nextLesson.lesson,
                        chapterTitle: nextLesson.chapterTitle,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-sm border border-[#E9E9E7] bg-white px-3 py-1.5 text-xs font-semibold text-[#191919] hover:bg-[#F7F6F3] transition cursor-pointer"
                  >
                    <span>레슨 열기</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* 3. Concept Understanding Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#191919]">개념별 실력 현황</span>
            <span className="rounded-sm bg-[#F7F6F3] px-1.5 py-0.5 text-[11px] font-medium text-[#787774]">
              {skills.length}개 개념 공부함 (클릭하면 바로 이동)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[#E9E9E7] bg-white">
          <table className="min-w-[620px] w-full text-left text-xs">
            <thead className="border-b border-[#E9E9E7] bg-[#F7F6F3] text-[11px] font-semibold text-[#787774]">
              <tr>
                <th className="px-4 py-2.5">개념명 및 과목</th>
                <th className="px-4 py-2.5">내 실력 (%)</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">상태</th>
                <th className="hidden px-4 py-2.5 md:table-cell">문제 풀이</th>
                <th className="px-4 py-2.5 text-right">최근 공부</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E9E7]">
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
                    className="group transition hover:bg-[#F7F6F3] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#191919]"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-[#191919] group-hover:underline">
                        {skill.conceptName}
                      </div>
                      <div className="text-[11px] text-[#787774]">{skill.courseTitle}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-[#E9E9E7]">
                          <div
                            className={`h-full ${
                              isMaster
                                ? "bg-[#191919]"
                                : isDeveloping
                                ? "bg-[#787774]"
                                : "bg-[#9B9A97]"
                            }`}
                            style={{ width: `${skill.understanding}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-[#191919]">
                          {skill.understanding}%
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 sm:table-cell">
                      {isMaster && (
                          <span className="inline-block rounded-sm bg-[#191919] px-2 py-0.5 text-[10px] font-semibold text-white">
                           ● 참고 지표 높음
                        </span>
                      )}
                      {isDeveloping && (
                        <span className="inline-block rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-2 py-0.5 text-[10px] font-medium text-[#2F3437]">
                          ◐ 성장 중
                        </span>
                      )}
                      {isWeak && (
                        <span className="inline-block rounded-sm bg-white border border-[#D3D3D0] px-2 py-0.5 text-[10px] font-bold text-[#191919]">
                          ○ 복습 추천
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3.5 font-mono text-[#787774] md:table-cell">
                      맞힘 {skill.correctCount} / 틀림 {skill.wrongCount} (복습 {skill.reviewCount}회)
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <span className="text-[11px] text-[#787774] mr-2">
                        {new Date(skill.lastStudiedAt).toLocaleDateString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </span>
                      <span className="inline-block rounded-xs border border-[#E9E9E7] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#191919] group-hover:bg-[#191919] group-hover:text-white transition">
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
