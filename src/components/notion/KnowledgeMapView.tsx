import React from "react";
import { ArrowRight, AlertTriangle, CheckCircle2, Circle, Compass, GitCommit, HelpCircle } from "lucide-react";
import { Course, LessonMeta } from "../../types/learning";
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
    <div className="mx-auto w-full max-w-[760px] py-10 px-4 text-[#2F3437]">
      {/* Header */}
      <div className="space-y-3 border-b border-[#E9E9E7] pb-6">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🗺️</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#191919]">
              수학 예시 지식 지도 & 결손 역추적
            </h1>
            <p className="text-xs text-[#787774]">
              현재 지도는 수학 예시 데이터입니다. 실제 과목에 연결된 레슨만 열 수 있으며, 다른 과목의 학습 경로를 가정하지 않습니다.
            </p>
          </div>
        </div>

        {/* Prescription Box for Deficient Concept */}
        <div className="rounded-md border border-[#191919] bg-[#FBFBFA] p-4 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-[#191919]">
            <AlertTriangle className="h-4 w-4 text-[#191919]" />
            <span>AI 결손 역추적 진단 결과</span>
          </div>
          <p className="text-[#787774] leading-relaxed">
              현재 수학 예시의 <strong>[고등 순간변화율(45%)]</strong>에서 정체되어 있습니다. AI 분석 결과, 상위 공식 미분법으로 넘어가기 전
            중등 <strong>[일차함수의 기울기]</strong>와 고등 <strong>[평균변화율]</strong>의 인과 연결을 재확인해야 완전히 극복됩니다.
          </p>
          <button
            onClick={() => handleJumpToLesson("course-high-math-01", "순간변화율과 접선의 기울기")}
            className="inline-flex items-center gap-1 font-semibold text-[#191919] hover:underline pt-1"
          >
            취약 개념 [순간변화율] 집중 소크라틱 레슨으로 즉시 이동 ⏎
          </button>
        </div>
      </div>

      {/* Roadmap Tree */}
      <div className="mt-8 space-y-8">
        {roadmapStages.map((stage, sIdx) => (
          <div key={sIdx} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#191919] text-[10px] font-bold text-white">
                {sIdx + 1}
              </span>
              <h2 className="text-sm font-bold text-[#191919]">{stage.stage}</h2>
            </div>

            <div className="ml-2.5 border-l border-[#E9E9E7] pl-5 space-y-2.5">
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
                    className={`rounded-md border p-3.5 text-xs transition flex items-center justify-between cursor-pointer ${
                      isDeficient
                        ? "border-[#191919] bg-white shadow-xs hover:bg-[#FBFBFA]"
                        : isLocked
                        ? "border-[#E9E9E7] bg-[#FBFBFA] opacity-60 hover:opacity-100 hover:border-[#787774]"
                        : "border-[#E9E9E7] bg-[#FBFBFA] hover:border-[#191919] hover:bg-white"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {isMastered && <CheckCircle2 className="h-4 w-4 text-[#191919]" />}
                        {isDeficient && <AlertTriangle className="h-4 w-4 text-[#191919]" />}
                        {node.status === "developing" && <Circle className="h-4 w-4 text-[#787774]" />}
                        {isLocked && <Circle className="h-4 w-4 text-[#D3D3D0]" />}

                        <span className="font-bold text-[#191919]">{node.name}</span>
                        {isLocked && (
                          <span className="rounded-sm bg-[#F7F6F3] border border-[#E9E9E7] px-1.5 py-0.2 text-[9px] text-[#787774]">
                            잠김
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#787774] pl-6">
                         {!findMappedLesson(stage.courseId, node.name)
                           ? "수학 예시 지표 • 현재 과목 레슨 연결 없음"
                           : isLocked
                           ? "이전 개념 완료 권장 • 클릭 시 열기 ➔"
                           : `수학 예시 지표: ${node.level} • 클릭 시 레슨 열기 ➔`}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 font-mono">
                        <div className="h-1.5 w-16 bg-[#E9E9E7] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#191919]"
                            style={{ width: `${node.pct}%` }}
                          />
                        </div>
                        <span className="font-bold text-xs">{node.pct}%</span>
                      </div>

                      {isDeficient && (
                        <span className="rounded-sm bg-[#191919] px-2 py-0.5 text-[10px] font-bold text-white">
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
