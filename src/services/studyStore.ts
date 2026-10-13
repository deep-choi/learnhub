import {
  emptyStudyLibrary,
  isStudyLibrary,
  type StudyLibrary,
} from "../domain/study";
import { LEARNHUB_STORAGE_KEYS, notifyLearningDataChanged } from "./storage";
export function getStudyLibrary(): StudyLibrary {
  try {
    const value = JSON.parse(
      localStorage.getItem(LEARNHUB_STORAGE_KEYS.STUDY_LIBRARY) || "null",
    );
    return isStudyLibrary(value) ? value : emptyStudyLibrary();
  } catch {
    return emptyStudyLibrary();
  }
}
export function updateStudyLibrary(
  update: (library: StudyLibrary) => StudyLibrary,
): StudyLibrary {
  const next = update(getStudyLibrary());
  if (!isStudyLibrary(next))
    throw new Error("자료함 용량을 초과했습니다. 자료를 정리해 주세요.");
  try {
    localStorage.setItem(
      LEARNHUB_STORAGE_KEYS.STUDY_LIBRARY,
      JSON.stringify(next),
    );
  } catch {
    throw new Error("저장 공간이 부족합니다.");
  }
  notifyLearningDataChanged();
  window.dispatchEvent(new Event("learnhub:study-changed"));
  return next;
}
