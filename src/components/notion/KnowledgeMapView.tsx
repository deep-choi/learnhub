import React from "react";
import { ArrowRight, AlertTriangle, CheckCircle2, Circle, Network } from "lucide-react";
import { Course } from "../../types/learning";
import { NotionPageView } from "./Sidebar";

interface KnowledgeMapViewProps {
  courses: Course[];
  onSelectView: (view: NotionPageView) => void;
}

export const KnowledgeMapView: React.FC<KnowledgeMapViewProps> = ({ courses, onSelectView }) => {
  const roadmapStages = [
    {
      stage: "초등학교 수학 (수와 연산)",
      courseId: "course-elem-math-01",
      nodes: [
        { id: "elem-1", name: "단위분수의 개념", level: "완전 습득", pct: 98, status: "mastered", lessonIdx: 0 },
        { id: "elem-2", name: "분수의 통분과 공통분모", level: "완전 습득", pct: 94, status: "mastered", lessonIdx: 0 },
      ],
    },
    {
      stage: "중학교 수학 (대수와 함수)",
      courseId: "course-mid-math-01",
      nodes: [
        { id: "mid-1", name: "양팔 저울과 등식의 성질", level: "완전 습득", pct: 90, status: "mastered", lessonIdx: 0 },
        { id: "mid-2", name: "일차방정식과 논리적 이항", level: "발전 중", pct: 78, status: "developing", lessonIdx: 0 },
        { id: "mid-3", name: "일차함수의 기울기 (Δy/Δx)", level: "발전 중", pct: 72, status: "developing", lessonIdx: 1 },
      ],
    },
    {
      stage: "고등학교 수학 (미적분학)",
      courseId: "course-high-math-01",
      nodes: [
        { id: "high-1", name: "함수의 극한과 연속", level: "완전 습득", pct: 88, status: "mastered", lessonIdx: 0 },
        { id: "high-2", name: "순간변화율과 접선의 기울기", level: "결손 발생 (취약)", pct: 45, status: "deficient", lessonIdx: 1 },
        { id: "high-3", name: "도함수의 정의와 미분법", level: "진입 대기", pct: 0, status: "locked", lessonIdx: 0 },
      ],
    },
    {
      stage: "대학 고등수학 (선형대수학)",
      courseId: "course-univ-math-01",
      nodes: [
        { id: "univ-1", name: "선형 변환과 행렬식", level: "탐색 중", pct: 30, status: "developing", lessonIdx: 0 },
        { id: "univ-2", name: "고유값과 고유벡터 (Av = λv)", level: "기초 단계", pct: 20, status: "developing", lessonIdx: 0 },
      ],
    },
  ];

  const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();

  const findMappedLesson = (courseId: string, nodeName: string) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    const allLessons = course.chapters.flatMap((c) =>
      c.lessons.map((l) => ({ lesson: l, chapterTitle: c.title }))
    );
    const normalizedNode = normalize(nodeName);
    return allLessons.find(({ lesson }) => {
      const title = normalize(lesson.title);
      const concept = normalize(lesson.conceptName);
      return title.includes(normalizedNode) || normalizedNode.includes(title) || concept.includes(normalizedNode) || normalizedNode.includes(concept);
    });
  };

  const handleJumpToLesson = (courseId: string, nodeName: string) => {
    const course = courses.find((c) => c.id === courseId);
    const target = findMappedLesson(courseId, nodeName);
    if (course && target) {
      onSelectView({
        type: "lesson",
        course,
        lesson: target.lesson,
        chapterTitle: target.chapterTitle,
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[880px] px-5 py-12 text-[var(--lh-ink)] sm:px-8">
      {/* Header */}
      <div className="space-y-3 border-b border-[var(--lh-line)] pb-6">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-white shadow-xs">
            <Network className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-3xl font-medium tracking-[-0.03em] text-[var(--lh-ink)] sm:text-4xl">
              수학 지식 지도
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-[var(--lh-ink-secondary)] font-normal">
              현재 지도는 수학 예시 데이터입니다. 실제 과목에 연결된 레슨만 열 수 있으며, 다른 과목의 학습 경로를 가정하지 않습니다.
            </p>
          </div>
        </div>

        {/* Prescription Box for Deficient Concept: Chunky M3 Card */}
        <div className="rounded-3xl border border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] p-6 text-sm space-y-3 shadow-xs">
          <div className="flex items-center gap-2 font-medium text-[var(--lh-ink)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--lh-secondary-subtle)] border border-[var(--lh-secondary-border)] shadow-xs">
              <AlertTriangle className="h-4 w-4 text-[var(--lh-secondary)]" />
            </span>
            <span className="text-base font-medium text-[var(--lh-secondary-text)]">다시 확인할 개념</span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--lh-ink-secondary)] leading-relaxed font-normal">
            현재 수학 예시의 <strong className="text-[var(--lh-secondary)] font-medium">[고등 순간변화율(45%)]</strong>에서 정체되어 있습니다. AI 분석 결과, 상위 공식 미분법으로 넘어가기 전
            중등 <strong className="text-[var(--lh-ink)] font-medium">[일차함수의 기울기]</strong>와 고등 <strong className="text-[var(--lh-ink)] font-medium">[평균변화율]</strong>의 인과 연결을 재확인해야 완전히 극복됩니다.
          </p>
          <div className="pt-1">
            <button
              onClick={() => handleJumpToLesson("course-high-math-01", "순간변화율과 접선의 기울기")}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--lh-primary)] hover:bg-[var(--lh-primary-hover)] px-5 py-2 text-xs font-medium text-white shadow-xs transition cursor-pointer"
            >
              <span>순간변화율 레슨 열기</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Roadmap Tree */}
      <div className="mt-8 space-y-10">
        {roadmapStages.map((stage, sIdx) => (
          <div key={sIdx} className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--lh-primary)] text-xs font-medium text-white shadow-xs">
                {sIdx + 1}
              </span>
              <h2 className="text-base font-medium tracking-tight text-[var(--lh-ink)]">{stage.stage}</h2>
            </div>

            <div className="ml-3.5 border-l-2 border-[var(--lh-line)] pl-5 space-y-3">
              {stage.nodes.map((node) => {
                const isDeficient = node.status === "deficient";
                const isMastered = node.status === "mastered";
                const isLocked = node.status === "locked";

                return (
                  <div
                    key={node.id}
                    onClick={() => {
                      if (!findMappedLesson(stage.courseId, node.name)) return;
                      if (isLocked) {
                        const proceed = window.confirm(
                          `[${node.name}]은(는) 이전 단계 개념을 먼저 완료하면 더 쉽게 이해할 수 있습니다. 그래도 바로 학습을 시작하시겠습니까?`
                        );
                        if (!proceed) return;
                      }
                      handleJumpToLesson(stage.courseId, node.name);
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === "Enter" || event.key === " ") && findMappedLesson(stage.courseId, node.name)) {
                        event.preventDefault();
                        handleJumpToLesson(stage.courseId, node.name);
                      }
                    }}
                    tabIndex={findMappedLesson(stage.courseId, node.name) ? 0 : undefined}
                    role={findMappedLesson(stage.courseId, node.name) ? "button" : undefined}
                    aria-disabled={!findMappedLesson(stage.courseId, node.name)}
                    className={`flex min-h-20 cursor-pointer flex-col items-start justify-between gap-3 rounded-2xl border p-4 sm:p-5 text-sm transition shadow-xs sm:flex-row sm:items-center ${
                      isDeficient
                        ? "border-[var(--lh-secondary-border)] bg-[var(--lh-secondary-subtle)] shadow-xs hover:border-[var(--lh-secondary)]"
                        : isLocked
                        ? "border-[var(--lh-line)] bg-[var(--lh-surface-subtle)] opacity-60 hover:opacity-100 hover:border-[var(--lh-ink-secondary)]"
                        : "border-[var(--lh-line)] bg-[var(--lh-surface)] hover:border-[var(--lh-primary-border)] hover:bg-[var(--lh-surface-subtle)]"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {isMastered && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {isDeficient && <AlertTriangle className="h-4 w-4 text-[var(--lh-secondary)]" />}
                        {node.status === "developing" && <Circle className="h-4 w-4 text-[var(--lh-primary)]" />}
                        {isLocked && <Circle className="h-4 w-4 text-[var(--lh-line)]" />}

                        <span className="font-medium text-sm text-[var(--lh-ink)]">{node.name}</span>
                        {isLocked && (
                          <span className="rounded-full bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--lh-ink-secondary)]">
                            잠김
                          </span>
                        )}
                      </div>
                      <div className="pl-6 text-xs leading-relaxed text-[var(--lh-ink-secondary)] font-normal">
                         {!findMappedLesson(stage.courseId, node.name)
                           ? "수학 예시 지표 • 현재 과목 레슨 연결 없음"
                           : isLocked
                           ? "이전 개념 완료 권장 • 클릭 시 열기 ➔"
                           : `수학 예시 지표: ${node.level} • 클릭 시 레슨 열기 ➔`}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 font-mono">
                        <div className="h-2 w-20 bg-[var(--lh-surface-subtle)] border border-[var(--lh-line)] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isDeficient ? "bg-[var(--lh-secondary)]" : "bg-[var(--lh-primary)]"}`}
                            style={{ width: `${node.pct}%` }}
                          />
                        </div>
                        <span className="font-medium text-xs text-[var(--lh-ink)]">{node.pct}%</span>
                      </div>

                      {isDeficient && (
                        <span className="rounded-full bg-[var(--lh-secondary)] px-3 py-1 text-[11px] font-medium text-white shadow-xs">
                          보충 필수
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
