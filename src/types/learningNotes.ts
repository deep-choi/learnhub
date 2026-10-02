/** 개념·레슨에 연결되는 마크다운 메모. 계정 동기화되는 학습 데이터다. */
export interface LearningNote {
  id: string;
  title: string;
  /** 마크다운 본문. 비어 있어도 된다. */
  body: string;
  /** 메모가 붙은 개념(지도 노드 id). 레슨 메모는 레슨의 개념으로 자동 채워진다. */
  conceptId?: string;
  courseId?: string;
  lessonId?: string;
  /** 본문의 `[[개념]]`이 가리키는 개념 id(중복 없음). 지도에서 찾지 못한 이름은 담지 않는다. */
  links: string[];
  createdAt: string;
  updatedAt: string;
}

/** `saveNote` 입력. `id`가 있으면 그 메모를 고치고, 없으면 새로 만든다. */
export interface NoteInput {
  id?: string;
  /** 비우면 본문 첫 줄로 만든다. */
  title?: string;
  body: string;
  conceptId?: string;
  courseId?: string;
  lessonId?: string;
}

export type SaveNoteFailure = "too_large" | "too_many" | "not_found" | "invalid" | "storage";
export type SaveNoteResult = { ok: true; note: LearningNote } | { ok: false; reason: SaveNoteFailure };

export interface NoteLinkResolution {
  /** 지도에서 찾은 개념 id(중복 없음) */
  links: string[];
  /** 지도에 없는 `[[이름]]` */
  unresolved: string[];
}
