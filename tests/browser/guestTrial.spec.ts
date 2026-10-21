import { test, expect } from "@playwright/test";

test.use({ launchOptions: { executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" } });

test("learning requests use all ten guest replies before requesting authentication", async ({ page }) => {
  let turns = 0;
  let previews = 0;
  await page.route("**/api/ai/preview-course", route => { previews++; return route.fulfill({ status: 500 }); });
  await page.route("**/api/ai/guest-tutor-chat", route => {
    turns++;
    return turns <= 10
      ? route.fulfill({ json: { reply: `체험 답변 ${turns}`, learningIntent: { subject: "영어" }, trial: { remaining: 10 - turns, limit: 10 } } })
      : route.fulfill({ status: 402, json: { code: "GUEST_TRIAL_EXHAUSTED", error: "체험을 모두 사용했어요." } });
  });
  await page.goto("/tests/browser/courseStart.html?guest=1&chat=1");
  for (let turn = 1; turn <= 10; turn++) {
    await page.locator("textarea").fill(`영어를 배우고 싶어요 ${turn}`);
    await page.locator("textarea").press("Enter");
    await expect(page.getByText(`체험 답변 ${turn}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(previews).toBe(0);
  await page.locator("textarea").fill("계속 알려주세요");
  await page.locator("textarea").press("Enter");
  await expect(page.getByRole("dialog", { name: "체험 종료 로그인" })).toBeVisible();
  expect(turns).toBe(11);
});

test("shared daily limits preserve the personal remaining count and never open login", async ({ page }) => {
  let turns = 0;
  await page.route("**/api/ai/guest-tutor-chat", route => {
    turns++;
    return turns === 1
      ? route.fulfill({ json: { reply: "첫 답변", trial: { remaining: 9, limit: 10 } } })
      : turns === 2
        ? route.fulfill({ status: 429, json: { code: "GUEST_TRIAL_UNAVAILABLE", error: "지금은 체험 이용이 많아요." } })
        : route.fulfill({ json: { reply: "다시 답변", trial: { remaining: 8, limit: 10 } } });
  });
  await page.goto("/tests/browser/courseStart.html?guest=1&chat=1");
  for (const [question, reply] of [["안녕", "첫 답변"], ["질문 하나", "지금은 체험 이용이 많아요."], ["다시 질문", "다시 답변"]]) {
    await page.locator("textarea").fill(question);
    await page.locator("textarea").press("Enter");
    await expect(page.getByText(reply, { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (turns === 2) await expect(page.getByText("로그인 없이 체험 중이에요 · 9회 남았어요", { exact: true })).toBeVisible();
  }
});
