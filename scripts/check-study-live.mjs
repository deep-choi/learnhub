// Run against a local development server; prints no credentials or source contents.
const base = process.env.STUDY_BASE_URL || "http://localhost:3012";
const source = {
  id: "live-source",
  title: "기초 생물",
  text: "세포는 생물의 기본 단위입니다. 세포막은 세포 안과 밖을 구분합니다. 핵에는 유전 정보가 있습니다.",
  kind: "file",
  updatedAt: new Date().toISOString(),
};
const note = {
  ...source,
  id: "note:live-note",
  title: "내 메모",
  kind: "note",
  text: "세포는 돌의 기본 단위입니다.",
};
for (const action of [
  "chat",
  "summary",
  "explain",
  "correction",
  "flashcards",
  "quiz",
  "visual",
  "slides",
  "video",
]) {
  const response = await fetch(`${base}/api/ai/study`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      question:
        action === "correction"
          ? "교재를 근거로 내 메모를 교정해 줘."
          : "주어진 자료로 세포를 공부하고 싶어.",
      sources: action === "correction" ? [source, note] : [source],
      history: [],
    }),
  });
  const value = await response.json();
  console.log(
    JSON.stringify({
      action,
      status: response.status,
      citations: value.citations?.length,
      items:
        value.cards?.length ||
        value.questions?.length ||
        value.slides?.length ||
        value.corrections?.length,
      error: value.error,
    }),
  );
  if (!response.ok) process.exitCode = 1;
}
for (const [route, body] of [
  ["study-url", { url: "https://www.example.com" }],
  ["study-research", { query: "세포의 구조를 공부할 수 있는 공공 교육 자료" }],
]) {
  const response = await fetch(`${base}/api/ai/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  console.log(
    JSON.stringify({
      route,
      status: response.status,
      chars: data.text?.length,
      sources: data.sources?.length,
      error: data.error,
    }),
  );
  if (!response.ok) process.exitCode = 1;
}
