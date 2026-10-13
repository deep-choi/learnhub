import { STUDY_LIMITS } from "../domain/study";
import { authorizedFetch } from "./authClient";
export const STUDY_ACCEPT =
  ".pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.ogg,.webm";
export async function studyPost(
  path: string,
  body: unknown,
  signal?: AbortSignal,
) {
  const response = await authorizedFetch(`/api/ai/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 401)
    window.dispatchEvent(new CustomEvent("learnhub:request-auth"));
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data.error || "요청을 완료하지 못했습니다. 다시 시도해 주세요.",
    );
  return data;
}
async function mediaText(file: File, signal?: AbortSignal) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const types: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    webm: "audio/webm",
  };
  const data = await studyPost(
    "study-import",
    { mimeType: types[ext], data: btoa(binary) },
    signal,
  );
  return data.text as string;
}
export async function extractStudyFile(
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  if (!file.size || file.size > STUDY_LIMITS.fileBytes)
    throw new Error("파일은 4MB까지 첨부할 수 있습니다.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  let text = "";
  if (["txt", "md", "csv"].includes(ext || "")) text = await file.text();
  else if (ext === "docx" || ext === "pptx") {
    const { unzipSync, strFromU8 } = await import("fflate");
    let total = 0;
    const parts = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => {
        if (
          !/^(word\/document\.xml|ppt\/slides\/slide\d+\.xml)$/.test(entry.name)
        )
          return false;
        total += entry.originalSize;
        if (total > 4_000_000)
          throw new Error("문서의 압축 해제 용량이 너무 큽니다.");
        return true;
      },
    });
    text = Object.keys(parts)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name, i) => {
        const doc = new DOMParser().parseFromString(
          strFromU8(parts[name]),
          "application/xml",
        );
        if (doc.getElementsByTagName("parsererror").length)
          throw new Error("문서를 읽을 수 없습니다.");
        return (
          `[${ext === "pptx" ? "슬라이드" : "문서"} ${i + 1}]\n` +
          Array.from(doc.getElementsByTagNameNS("*", "p"))
            .map((p) =>
              Array.from(p.getElementsByTagNameNS("*", "t"))
                .map((t) => t.textContent || "")
                .join(""),
            )
            .join("\n")
        );
      })
      .join("\n\n");
  } else if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 200)
        throw new Error("PDF는 200쪽까지 첨부할 수 있습니다.");
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(
          `[페이지 ${i}]\n` +
            content.items
              .map((item) =>
                "str" in item
                  ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
                  : "",
              )
              .join(""),
        );
        page.cleanup();
        if (pages.join("").length > STUDY_LIMITS.sourceChars)
          throw new Error("자료가 너무 깁니다. 나누어 첨부해 주세요.");
      }
      text = pages.join("\n\n");
      if (text.replace(/\[페이지 \d+\]/g, "").trim().length < 30)
        text = await mediaText(file, signal);
    } finally {
      await task.destroy();
    }
  } else if (
    ["png", "jpg", "jpeg", "webp", "mp3", "wav", "m4a", "ogg", "webm"].includes(
      ext || "",
    )
  )
    text = await mediaText(file, signal);
  else throw new Error("지원하지 않는 파일 형식입니다.");
  if (!text?.trim()) throw new Error("읽을 수 있는 내용이 없습니다.");
  if (text.length > STUDY_LIMITS.sourceChars)
    throw new Error("자료가 너무 깁니다. 나누어 첨부해 주세요.");
  return text.trim();
}
