import { ReviewQuestion } from "../types/learning";

export type ReviewQuestionWithContext = ReviewQuestion & {
  courseId?: string;
  lessonId?: string;
};

const normalize = (value: string | undefined) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");

const isSameReview = (left: ReviewQuestionWithContext, right: ReviewQuestionWithContext) => {
  const sameCourse = left.courseId && right.courseId
    ? left.courseId === right.courseId
    : left.courseTitle === right.courseTitle;
  return sameCourse && left.conceptId === right.conceptId && normalize(left.question) === normalize(right.question);
};

export const isReviewDue = (review: ReviewQuestionWithContext, now = new Date()) => {
  const dueAt = Date.parse(review.dueAt);
  return Number.isFinite(dueAt) && dueAt <= now.getTime();
};

export const getDueReviewItems = (
  reviews: ReviewQuestionWithContext[],
  now = new Date(),
): ReviewQuestionWithContext[] =>
  reviews
    .filter((review) => isReviewDue(review, now))
    .sort((a, b) => {
      const aDue = Date.parse(a.dueAt);
      const bDue = Date.parse(b.dueAt);
      if (!Number.isFinite(aDue) && !Number.isFinite(bDue)) return 0;
      if (!Number.isFinite(aDue)) return 1;
      if (!Number.isFinite(bDue)) return -1;
      return aDue - bDue;
    });

export const mergeReviewItems = (
  existing: ReviewQuestionWithContext[],
  incoming: ReviewQuestionWithContext[],
): ReviewQuestionWithContext[] => {
  const merged: ReviewQuestionWithContext[] = [];

  for (const item of [...existing, ...incoming]) {
    const duplicateIndex = merged.findIndex(
      (candidate) => candidate.id === item.id || isSameReview(candidate, item),
    );

    if (duplicateIndex === -1) {
      merged.push(item);
      continue;
    }

    const previous = merged[duplicateIndex];
    merged[duplicateIndex] = {
      ...previous,
      ...item,
      id: previous.id,
      dueAt: previous.dueAt,
      courseId: item.courseId || previous.courseId,
      lessonId: item.lessonId || previous.lessonId,
    };
  }

  return merged;
};

export const rescheduleReviewItem = (
  review: ReviewQuestionWithContext,
  now = new Date(),
  delayMs = 24 * 60 * 60 * 1000,
): ReviewQuestionWithContext => ({
  ...review,
  dueAt: new Date(now.getTime() + delayMs).toISOString(),
});

export const isValidMultipleChoice = (options: unknown, answer: string) => {
  if (!Array.isArray(options) || options.length < 2) return false;
  if (options.some((option) => typeof option !== "string" || !option.trim())) return false;

  const trimmedOptions = options.map((option) => option.trim());
  const uniqueOptions = new Set(trimmedOptions);
  return uniqueOptions.size === trimmedOptions.length && trimmedOptions.filter((option) => option === answer.trim()).length === 1;
};
