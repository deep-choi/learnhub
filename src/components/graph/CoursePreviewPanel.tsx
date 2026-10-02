import React, { useMemo } from "react";
import type { Course } from "../../types/learning";
import { GraphCanvas } from "./GraphCanvas";
import { previewGraph } from "./courseFromPayload";
import type { CurriculumConceptLinks } from "./graphTypes";

interface CoursePreviewPanelProps {
  course: Course;
  links: CurriculumConceptLinks;
  /** 지도 아래에 한 줄로 덧붙일 안내 (예: 이번 학습에서 확인할 것) */
  note?: string;
}

/** 과목 만들기 미리보기 공통 화면: 개념 지도 + 과목 소개 + 단원 구성. 로그인 전·후가 같은 모습이 되게 합니다. */
export const CoursePreviewPanel: React.FC<CoursePreviewPanelProps> = ({ course, links, note }) => {
  const graph = useMemo(() => previewGraph(course, links), [course, links]);
  const lessonCount = course.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);

  return (
    <div className="space-y-5">
      <GraphCanvas
        graph={graph}
        variant="full"
        ariaLabel={`‘${course.title}’ 개념 지도. 개념 ${graph.nodes.length}개. 구성은 아래 목록으로도 볼 수 있어요.`}
        className="h-[40vh] min-h-[260px] rounded-2xl border border-[var(--lh-line)]"
      />
      <div className="space-y-1">
        <h3 className="text-base font-medium text-[var(--lh-ink)]">{course.title}</h3>
        <p className="text-sm leading-6 text-[var(--lh-ink-secondary)]">{course.summary}</p>
        <p className="text-xs text-[var(--lh-ink-tertiary)]">챕터 {course.chapters.length}개 · 레슨 {lessonCount}개 · 개념 {graph.nodes.length}개</p>
        {note && <p className="pt-1 text-xs leading-5 text-[var(--lh-ink-secondary)]">{note}</p>}
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {course.chapters.map((chapter, index) => (
          <li key={chapter.id} className="rounded-2xl border border-[var(--lh-line)] p-3.5">
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--lh-ink)]">
              <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lh-primary)] text-[10px] font-medium text-white">{index + 1}</span>
              {chapter.title}
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-9 text-xs text-[var(--lh-ink-secondary)]">
              {chapter.lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
};
