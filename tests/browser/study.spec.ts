import { test, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
test.use({
  launchOptions: {
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  },
  viewport: { width: 1100, height: 850 },
});
test("source attachment, cited answer, correction, quiz, restore and compact mobile composer", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/ai/study", async (route) => {
    const b = route.request().postDataJSON();
    const source = b.sources.find((s: any) => s.kind === "file");
    const note = b.sources.find((s: any) => s.kind === "note");
    const result: any = {
      title: "세포 학습",
      reply: "세포는 생물의 기본 단위입니다. [1]",
      citations: source
        ? [{ sourceId: source.id, quote: "세포는 생물의 기본 단위입니다." }]
        : [],
    };
    if (b.action === "correction")
      result.corrections = [
        {
          sourceId: note.id,
          before: "세포는 돌의 기본 단위입니다.",
          after: "세포는 생물의 기본 단위입니다.",
          reason: "교재와 일치하도록 수정했습니다.",
        },
      ];
    if (b.action === "quiz")
      result.questions = [
        {
          question: "생물의 기본 단위는?",
          options: ["세포", "돌", "물", "모래"],
          answer: 0,
          explanation: "교재의 정의입니다.",
        },
      ];
    if (b.action === "flashcards")
      result.cards = [{ front: "기본 단위는?", back: "세포" }];
    if (["visual", "slides", "video"].includes(b.action))
      result.slides = [
        {
          title: "세포",
          body: "세포는 생물의 기본 단위입니다.",
          points: ["구조", "기능"],
        },
        { title: "요약", body: "생물은 세포로 이루어집니다.", points: [] },
      ];
    if (b.action === "visual") result.diagram = {
      nodes: [{ id: "a", label: "전체", items: ["1", "2"], kept: ["1", "2"] }, { id: "b", label: "짝수", items: ["~~1~~", "2"], kept: ["2"] }],
      edges: [{ from: "a", to: "b", label: "짝수만" }],
    };
    await route.fulfill({ json: result });
  });
  await page.goto(
    `${process.env.STUDY_BASE_URL || "http://127.0.0.1:3013"}/tests/browser/study.html`,
  );
  await page.getByLabel("자료 첨부", { exact: true }).setInputFiles({
    name: "생물.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "세포는 생물의 기본 단위입니다. 세포에는 여러 구조가 있습니다.",
    ),
  });
  await expect(
    page.getByRole("button", { name: "생물.txt 연결 해제" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "자료·결과 보기" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "자료·결과 보기" }).click();
  await expect(page.getByText("[1] 생물.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "자료·메모", exact: true }).click();
  await page.getByRole("button", { name: "내 메모", exact: true }).click();
  await page.getByRole("checkbox", { name: "나의 생물 메모 참고" }).check();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "학습 도구", exact: true }).click();
  await page.getByRole("button", { name: "교정", exact: true }).click();
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await page.getByRole("button", { name: "메모에 반영" }).click();
  await expect(page.getByRole("button", { name: "되돌리기" })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ai_learnhub_learning_notes_v1")!)[0]
          .body,
    ),
  ).toBe("세포는 생물의 기본 단위입니다.");
  await page.getByRole("button", { name: "되돌리기" }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ai_learnhub_learning_notes_v1")!)[0]
          .body,
    ),
  ).toBe("세포는 돌의 기본 단위입니다.");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  for (const action of [
    "퀴즈",
    "암기 카드",
    "설명 그림",
    "슬라이드",
    "설명 영상",
  ]) {
    await page.getByRole("button", { name: "학습 도구", exact: true }).click();
    await page.getByRole("button", { name: action, exact: true }).click();
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (action === "퀴즈") {
      await page.getByRole("button", { name: "돌", exact: true }).click();
      await expect(page.getByText("0 / 1 정답")).toBeVisible();
      await page.getByRole("button", { name: "닫기", exact: true }).click();
      await page.reload();
      await page.getByRole("button", { name: "자료·결과 보기" }).last().click();
      await expect(page.getByText("0 / 1 정답")).toBeVisible();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ai_learnhub_mistakes_v2")!)[0].wrongAnswer)).toBe("돌");
      await page.goto("/tests/browser/study.html?archive=1");
      await page.getByRole("button", { name: "다시 풀기 ➔", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByText("0 / 1 정답")).toBeVisible();
      await page.getByRole("button", { name: "다시 풀기", exact: true }).click();
      await page.getByRole("button", { name: "세포", exact: true }).click();
      await expect(page.getByText("1 / 1 정답")).toBeVisible();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ai_learnhub_mistakes_v2")!)[0].isResolved)).toBe(true);
      await page.getByRole("button", { name: "닫기", exact: true }).click();
      await page.goto("/tests/browser/study.html");
      await page.getByRole("button", { name: "자료·결과 보기" }).last().click();
    }
    if (action === "암기 카드") {
      await page.getByRole("button", { name: "답 보기" }).click();
      await expect(page.getByRole("button", { name: "질문 보기" })).toHaveText(
        "세포",
      );
    }
    if (action === "설명 그림") {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "PNG 저장" }).click();
      expect((await download).suggestedFilename()).toMatch(/\.png$/);
    }
    if (action === "슬라이드") {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "슬라이드 저장" }).click();
      expect((await download).suggestedFilename()).toMatch(/\.html$/);
    }
    if (action === "설명 영상") {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "WebM 저장" }).click();
      expect((await download).suggestedFilename()).toMatch(/\.webm$/);
    }
    await page.getByRole("button", { name: "닫기", exact: true }).click();
  }
  await page.reload();
  await expect(
    page.getByRole("button", { name: "생물.txt 연결 해제" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "자료·결과 보기" }),
  ).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/study-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "자료·메모", exact: true }).click();
  await page.getByRole("button", { name: "자료함", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "생물.txt 참고" }),
  ).toBeChecked();
  await page.screenshot({
    path: "test-results/study-library.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("note correction updates the open editor and undo without reentering the lesson", async ({ page }) => {
  await page.route("**/api/ai/study", async route => {
    const source = route.request().postDataJSON().sources.find((s: any) => s.kind === "note");
    await route.fulfill({ json: { title: "메모 교정", reply: "기본 단위는 세포입니다.", citations: [], corrections: [{ sourceId: source.id, before: "세포는 돌의 기본 단위입니다.", after: "세포는 생물의 기본 단위입니다.", reason: "개념 교정" }] } });
  });
  await page.goto("/tests/browser/study.html?notes=1");
  const editor = page.getByRole("textbox", { name: "세포 메모", exact: true });
  await expect(editor).toHaveValue("세포는 돌의 기본 단위입니다.");
  await page.getByRole("button", { name: "자료·메모", exact: true }).click();
  await page.getByRole("button", { name: "내 메모", exact: true }).click();
  await page.getByRole("checkbox", { name: "나의 생물 메모 참고" }).check();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "학습 도구", exact: true }).click();
  await page.getByRole("button", { name: "교정", exact: true }).click();
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await page.getByRole("button", { name: "메모에 반영", exact: true }).click();
  await expect(editor).toHaveValue("세포는 생물의 기본 단위입니다.");
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(editor).toHaveValue("세포는 돌의 기본 단위입니다.");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await editor.fill("내가 작성 중인 문장");
  await page.evaluate(async () => {
    const modulePath = "/src/services/noteStore.ts";
    const { listNotes, saveNote } = await import(modulePath);
    saveNote({ id: listNotes()[0].id, body: "다른 곳에서 수정한 메모" });
  });
  await expect(page.getByRole("button", { name: "최신 메모 불러오기", exact: true })).toBeVisible();
  await expect(editor).toHaveValue("내가 작성 중인 문장");
  await page.getByRole("button", { name: "최신 메모 불러오기", exact: true }).click();
  await expect(editor).toHaveValue("다른 곳에서 수정한 메모");
});

test("PDF, Word, slides and blocked URL imports preserve source text", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3013/tests/browser/study.html");
  const upload = page.getByLabel("자료 첨부", { exact: true });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content =
    "BT /F1 16 Tf 40 700 Td (Cells are the basic units of living organisms.) Tj ET";
  objects.push(
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await upload.setInputFiles({
    name: "cells.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(pdf),
  });
  await expect(
    page.getByRole("button", { name: "cells.pdf 연결 해제" }),
  ).toBeVisible();
  const docx = zipSync({
    "word/document.xml": strToU8(
      '<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>세포 교재 문서입니다.</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  await upload.setInputFiles({
    name: "cells.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(docx),
  });
  await expect(
    page.getByRole("button", { name: "cells.docx 연결 해제" }),
  ).toBeVisible();
  const pptx = zipSync({
    "ppt/slides/slide1.xml": strToU8(
      '<p:sld xmlns:p="slide" xmlns:a="draw"><a:p><a:r><a:t>세포막의 역할</a:t></a:r></a:p></p:sld>',
    ),
  });
  await upload.setInputFiles({
    name: "cells.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: Buffer.from(pptx),
  });
  await expect(
    page.getByRole("button", { name: "cells.pptx 연결 해제" }),
  ).toBeVisible();
  const sources = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("ai_learnhub_study_library_v1")!).sources,
  );
  expect(sources.find((s: any) => s.title === "cells.pdf").text).toContain(
    "Cells are the basic units",
  );
  expect(sources.find((s: any) => s.title === "cells.docx").text).toContain(
    "세포 교재",
  );
  expect(sources.find((s: any) => s.title === "cells.pptx").text).toContain(
    "세포막",
  );
  await upload.setInputFiles({
    name: "bad.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("alert")).toContainText("지원하지 않는 파일");
  expect(
    (
      await page.request.post("/api/ai/study-url", {
        data: { url: "https://127.0.0.1/" },
      })
    ).status(),
  ).toBe(400);
});

test("voice shares chat history, can be interrupted, and stops on close", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).__recognitions = [];
    (window as any).__spoken = [];
    (window as any).SpeechRecognition = class {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: any;
      onend: any;
      onerror: any;
      start() {
        (window as any).__recognitions.push(this);
      }
      abort() {}
    };
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        cancel: () => {},
        speak: (utterance: any) => {
          (window as any).__spoken.push(utterance);
        },
      },
      configurable: true,
    });
  });
  const requests: any[] = [];
  await page.route("**/api/ai/tutor-chat", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: { reply: "세포는 생물의 기본 단위입니다.", suggestionChips: [] },
    });
  });
  await page.goto("http://127.0.0.1:3013/tests/browser/study.html");
  await page.getByRole("textbox").fill("세포를 설명해 줘");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(
    page.getByText("세포는 생물의 기본 단위입니다.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "음성 대화", exact: true }).click();
  await expect(page.getByText("듣는 중", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const rec = (window as any).__recognitions.at(-1);
    const r: any = [{ transcript: "방금 설명한 내용을 더 쉽게 말해 줘" }];
    r.isFinal = true;
    rec.onresult({ results: [r] });
    rec.onend();
  });
  await expect(
    page.getByRole("button", { name: "말하기", exact: true }),
  ).toBeVisible();
  expect(
    requests.at(-1).history.some((m: any) => m.text.includes("세포")),
  ).toBe(true);
  await page.getByRole("button", { name: "말하기", exact: true }).click();
  await expect(page.getByText("듣는 중", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "음성 대화 종료" }).click();
  await expect(
    page.getByRole("button", { name: "음성 대화", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(
    () => (window as any).__recognitions.length,
  );
  await page.evaluate(() => (window as any).__spoken.at(-1).onend());
  expect(await page.evaluate(() => (window as any).__recognitions.length)).toBe(
    before,
  );
});
