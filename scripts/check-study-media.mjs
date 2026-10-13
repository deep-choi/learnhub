import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const base = process.env.STUDY_BASE_URL || "http://localhost:3012";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
let image;
try {
  const page = await browser.newPage();
  await page.setContent(
    '<p style="font:32px sans-serif;padding:20px">세포는 생물의 기본 단위입니다.</p>',
  );
  image = await page.locator("p").screenshot();
} finally {
  await browser.close();
}
for (const [mimeType, bytes] of [
  ["image/png", image],
  ["audio/wav", await readFile("test-results/study-voice.wav")],
]) {
  const response = await fetch(`${base}/api/ai/study-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mimeType, data: bytes.toString("base64") }),
  });
  const data = await response.json();
  const matched =
    typeof data.text === "string" &&
    data.text.includes("세포") &&
    data.text.includes("생물");
  console.log(
    JSON.stringify({
      mimeType,
      status: response.status,
      matched,
      error: data.error,
    }),
  );
  if (!response.ok || !matched) process.exitCode = 1;
}
