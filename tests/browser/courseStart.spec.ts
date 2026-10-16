import { test, expect, type Page } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" }, viewport: { width: 1100, height: 850 } });

const course = {
  courseTitle: "생활 속 증발", domain: "과학", learningType: "concept", learningTypeExplanation: "관찰한 현상을 설명합니다.", summary: "수건이 마르는 이유를 설명합니다.",
  chapters: [{ title: "물의 변화", description: "일상에서 관찰합니다.", lessons: [
    { title: "젖은 수건이 마르는 이유", description: "증발로 수건이 마르는 이유를 설명하고 물웅덩이에 적용한다.", estimatedMinutes: 10, conceptId: "evaporation", conceptName: "증발", prerequisites: [], relatedConcepts: [] },
    { title: "바람과 증발", description: "바람이 있는 조건과 없는 조건을 비교한다.", estimatedMinutes: 10, conceptId: "wind", conceptName: "바람과 증발", prerequisites: ["증발"], relatedConcepts: [] },
  ] }],
};
const opening = "젖은 수건은 끓이지 않아도 마르죠. 수건에 있던 물은 어디로 갔을까요? 물 표면에서 일부 물 분자가 공기 중으로 떠나는 현상을 증발이라고 해요.";
const lesson = { title: "젖은 수건이 마르는 이유", steps: [
  { type: "concept", title: "증발", content: opening },
  { type: "example", title: "물웅덩이", content: "비가 그친 뒤 물웅덩이도 조금씩 마릅니다. 물이 공기 중으로 이동하는 증발이 일어나기 때문이에요. 수건이 마르는 현상과 같은 원리로 설명할 수 있어요." },
  { type: "practice", title: "직접 설명하기", content: "책상에 남은 물방울이 점점 작아지는 이유를 자기 말로 설명해 보세요. 물이 어디로 이동하는지와 증발이라는 개념을 연결했는지 스스로 확인해 보세요." },
  { type: "summary", title: "다시 떠올리기", content: "자료를 보지 않고 젖은 수건이 마르는 이유를 설명해 보세요. 물 표면에서 공기 중으로 이동하는 변화를 떠올리면 됩니다. 다음에는 바람이 불 때의 조건을 비교해 볼 거예요." },
] };

async function mockLearning(page: Page, failFirst = false) {
  const requests: Record<string, any>[] = [];
  let generations = 0;
  await page.route("**/api/ai/setup-question", route => route.fulfill({ json: { question: "우주와 별, 우리 몸, 생활 속 현상 중 무엇이 궁금하세요?" } }));
  await page.route("**/api/ai/interpret-setup", route => {
    const request = route.request().postDataJSON();
    return route.fulfill({ json: { setup: { level: "beginner", levelEvidence: `${request.levelEvidence}\n학습자 답변: ${request.answer}` }, feedback: "수건이 마르는 현상부터 살펴볼게요." } });
  });
  for (const endpoint of ["analyze-subject", "preview-course"]) await page.route(`**/api/ai/${endpoint}`, route => {
    generations++;
    if (failFirst && generations === 1) return route.fulfill({ status: 503, json: { error: "temporary" } });
    return route.fulfill({ json: course });
  });
  await page.route("**/api/ai/generate-lesson", route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: lesson });
  });
  return { requests, generations: () => generations };
}

async function chooseTopic(page: Page) {
  await page.locator("textarea").fill("과학을 배우고 싶어요. 생활 현상이 궁금해요.");
  await page.locator("textarea").press("Enter");
  await expect(page.getByText("우주와 별, 우리 몸, 생활 속 현상 중 무엇이 궁금하세요?", { exact: true })).toBeVisible();
}

test("finishing setup enters the first lesson and restored chat resumes the same course", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const mocked = await mockLearning(page);
  await page.goto("/tests/browser/courseStart.html");
  await chooseTopic(page);
  await page.locator("textarea").fill("생활 속 현상이요. 빨래는 왜 마르나요?");
  await page.locator("textarea").press("Enter");
  await expect(page.getByText(opening, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("first-lesson.png"), fullPage: true });
  await expect(page.getByRole("button", { name: "이 과정으로 시작하기" })).toHaveCount(0);
  await expect(page.getByText(/단계로 갈게요/)).toHaveCount(0);
  expect(mocked.requests.at(-1)?.learningContext.levelEvidence).toContain("생활 현상이 궁금해요");
  expect(mocked.requests.at(-1)?.learningContext.levelEvidence).toContain("빨래는 왜 마르나요");
  expect(mocked.requests.at(-1)?.learningContext.lessonDescription).toContain("물웅덩이에 적용");
  await page.getByRole("button", { name: "전체 과정", exact: true }).click();
  await expect(page.getByRole("heading", { name: course.courseTitle })).toBeVisible();
  await page.getByRole("button", { name: "대화로 돌아가기" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "수업 이어가기" })).toBeVisible();
  const generated = mocked.generations();
  await page.getByRole("button", { name: "수업 이어가기" }).click();
  await expect(page.getByText(opening, { exact: true })).toBeVisible();
  expect(mocked.generations()).toBe(generated);
  expect(await page.evaluate(() => localStorage.getItem("fixture-start-count"))).toBe("1");
  expect(errors).toEqual([]);
});

test("skip goes directly to teaching and failed course generation can be retried", async ({ page }) => {
  await mockLearning(page, true);
  await page.goto("/tests/browser/courseStart.html");
  await chooseTopic(page);
  await page.getByRole("button", { name: "바로 배울게요" }).click();
  await expect(page.getByRole("alert")).toContainText("과정을 만들지 못했어요");
  await page.getByRole("button", { name: "다시 시도하기", exact: true }).click();
  await expect(page.getByText(opening, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("fixture-start-count"))).toBe("1");
});

test("guest setup hands off through login and reuses the prepared course", async ({ page }, testInfo) => {
  const mocked = await mockLearning(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/browser/courseStart.html?guest=1");
  await page.locator("textarea").fill("생활 속 과학을 배우고 싶어요");
  await page.locator("textarea").press("Enter");
  await page.getByRole("button", { name: "처음이에요", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "테스트 로그인" })).toBeVisible();
  const generated = mocked.generations();
  await page.getByRole("button", { name: "테스트 로그인 완료" }).click();
  await expect(page.getByText(opening, { exact: true })).toBeVisible();
  expect(mocked.requests.at(-1)?.learningContext.levelEvidence).toContain("생활 속 과학");
  expect(mocked.requests.at(-1)?.learningContext.levelEvidence).toContain("경험에 대한 자기 보고");
  await page.screenshot({ path: testInfo.outputPath("first-lesson-mobile.png"), fullPage: true });
  expect(mocked.generations()).toBe(generated);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a failed automatic save stays recoverable without another generation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const mocked = await mockLearning(page);
  await page.goto("/tests/browser/courseStart.html?failSave=1");
  await chooseTopic(page);
  await page.getByRole("button", { name: "바로 배울게요" }).click();
  await expect(page.getByRole("alert")).toContainText("수업을 저장하지 못했어요");
  const generated = mocked.generations();
  await page.getByRole("button", { name: "다시 시도하기", exact: true }).click();
  await expect(page.getByText(opening, { exact: true })).toBeVisible();
  expect(mocked.generations()).toBe(generated);
  expect(await page.evaluate(() => localStorage.getItem("fixture-start-count"))).toBe("1");
  expect(errors).toEqual([]);
});
