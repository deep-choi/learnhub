import assert from "node:assert/strict";
import test from "node:test";
import { findPreviewMessageIndex, isUsablePreviewData, toChatCoursePreview } from "../src/components/chat/previewPersist";
import { validCurricula } from "./fixtures/contentQuality";

test("a stored preview is reused only when it is still a valid curriculum", () => {
  const curriculum = validCurricula[0];
  assert.equal(isUsablePreviewData(curriculum), true);
  // preview-course 응답 모양({ curriculum, conceptLinks })도 그대로 쓸 수 있습니다.
  assert.equal(isUsablePreviewData({ preview: true, curriculum, conceptLinks: { lessons: [] } }), true);
  assert.equal(isUsablePreviewData({}), false);
  assert.equal(isUsablePreviewData(null), false);
  assert.equal(isUsablePreviewData({ chapters: [] }), false);
  assert.equal(isUsablePreviewData([curriculum]), false);
});

test("the preview intro message is found by text and subject even if screen and storage positions differ", () => {
  const stored = [
    { role: "user", text: "집밥 요리 배우고 싶어요" },
    { role: "assistant", text: "안내", learningIntent: { subject: "다른 주제" } },
    { role: "assistant", text: "안내", learningIntent: { subject: "집밥 요리" } },
    { role: "user", text: "수정할래요" },
    { role: "assistant", text: "안내", learningIntent: { subject: "집밥 요리" } },
  ];
  assert.equal(findPreviewMessageIndex(stored, "안내", "집밥 요리"), 4);
  assert.equal(findPreviewMessageIndex(stored, "안내", "다른 주제"), 1);
  assert.equal(findPreviewMessageIndex(stored, "없는 글", "집밥 요리"), -1);
});

test("the stored preview carries the final setup including the level raised by the check question", () => {
  const preview = toChatCoursePreview("집밥 요리", { a: 1 }, { level: "intermediate", experience: "some", levelEvidence: "채소 손질은 해요", goal: "취미·교양", dailyMinutes: 20 });
  assert.equal(preview.setup?.level, "intermediate");
  assert.equal(preview.setup?.levelEvidence, "채소 손질은 해요");
  assert.deepEqual(toChatCoursePreview("x", {}, undefined), { subject: "x", data: {} });
});
