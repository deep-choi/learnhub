import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_AI_SELECTION } from "../../src/domain/aiModels";

async function mockAdmin(page: Page, denied = false) {
  let settings = { revision: 0, aiPaused: false, limitsEnabled: true, requestLimit: 100, outputTokenLimit: 100000, globalRequestLimit: 10000, globalOutputTokenLimit: 1000000, disabledModels: [] as string[] };
  let report = { id: "report-1", userId: "learner", category: "wrong_answer", description: "예제 정답이 설명과 다릅니다.", courseId: "course-1", lessonId: "lesson-1", createdAt: "2026-10-21T01:00:00Z", status: "received", note: "", revision: 0 };
  await page.route("**/api/admin/**", async route => {
    expect(route.request().headers().authorization).toBe("Bearer fixture-admin");
    if (denied) return route.fulfill({ status: 403, json: { code: "ADMIN_REQUIRED", error: "관리자 권한이 없는 계정입니다." } });
    const url = new URL(route.request().url()); const method = route.request().method();
    let json: unknown;
    if (url.pathname.endsWith("/session")) json = { uid: "fixture-owner" };
    else if (url.pathname.endsWith("/settings")) {
      if (method === "PUT") settings = { ...route.request().postDataJSON(), revision: settings.revision + 1 };
      json = { settings, models: [{ id: DEFAULT_AI_SELECTION.model, provider: "gemini", label: "Gemini 3.8 Flash" }] };
    } else if (url.pathname.endsWith("/overview")) json = { day: "2026-10-21", totalUsers: 12, admittedRequests: 42, reservedOutputTokens: 64000, completedRequests: 40, failedRequests: 2, actualTokens: 48000, meanDurationMs: 3500, recentFailures: [] };
    else if (url.pathname.endsWith("/users")) json = { items: [{ uid: "learner", email: "learner@example.com", requestsToday: 7, reservedTokensToday: 1000, aiBlocked: false, lastSignInAt: null, snapshotUpdatedAt: null, snapshotRevision: null }], nextCursor: null };
    else if (url.pathname.endsWith("/reports")) json = { items: [report], nextCursor: null };
    else if (url.pathname.endsWith("/reports/learner/report-1")) { report = { ...report, ...route.request().postDataJSON(), revision: report.revision + 1 }; json = { ok: true }; }
    else if (url.pathname.endsWith("/billing")) json = { connected: false, payments: [], refunds: [] };
    else if (url.pathname.endsWith("/audit")) json = { items: [] };
    else return route.fulfill({ status: 404, json: { error: "unknown fixture route" } });
    await route.fulfill({ json });
  });
  return { settings: () => settings, report: () => report };
}

test("operator saves settings, processes a report, and sees billing disconnected", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const state = await mockAdmin(page);
  await page.goto("/tests/browser/admin.html");
  await expect(page.getByText("42회", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("admin-overview.png"), fullPage: true });
  await page.getByRole("button", { name: "AI 운영", exact: true }).click();
  await page.getByLabel("AI 생성 일시 중지").check();
  await page.getByLabel("사용자당 요청 수", { exact: true }).fill("25");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.getByText("운영 설정을 적용했습니다.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("사용자당 요청 수", { exact: true })).toHaveValue("25");
  expect(state.settings().aiPaused).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("admin-settings.png"), fullPage: true });
  await page.getByRole("button", { name: "신고", exact: true }).click();
  await page.getByLabel("처리 상태").selectOption("resolved");
  await page.getByLabel("운영 메모").fill("설명과 정답을 확인하여 수정했습니다.");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("처리 완료", { exact: true }).first()).toBeVisible();
  expect(state.report().status).toBe("resolved");
  await page.getByRole("button", { name: "결제·환불", exact: true }).click();
  await expect(page.getByText("결제 연동 전", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /환불 실행/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("admin-billing.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("the real /admin entry renders the login gate without a configured session", async ({ page }) => {
  await page.route("**/api/public-config", route => route.fulfill({ status: 503, json: { code: "PUBLIC_CONFIG_NOT_CONFIGURED" } }));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "LearnHub 관리자" })).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "LearnHub 관리자" })).toBeVisible();
});

test("ordinary users cannot see the console", async ({ page }) => {
  await mockAdmin(page, true); await page.goto("/tests/browser/admin.html");
  await expect(page.getByText("관리자 권한이 없는 계정입니다.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "관리자 메뉴" })).toHaveCount(0);
});

test("mobile navigation fits and failed saves do not claim success", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockAdmin(page);
  await page.goto("/tests/browser/admin.html");
  await page.getByRole("button", { name: "AI 운영", exact: true }).click();
  await expect(page.getByLabel("사용자당 요청 수", { exact: true })).toBeVisible();
  await page.route("**/api/admin/settings", route => route.request().method() === "PUT" ? route.fulfill({ status: 409, json: { code: "SETTINGS_CONFLICT", error: "다른 창에서 설정이 변경되었습니다." } }) : route.fallback());
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.getByRole("alert")).toHaveText("다른 창에서 설정이 변경되었습니다.");
  await expect(page.getByText("운영 설정을 적용했습니다.")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("admin-mobile.png"), fullPage: true });
});
