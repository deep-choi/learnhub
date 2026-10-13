import https from "node:https";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import { safeWebUrl, STUDY_LIMITS } from "../src/domain/study";

export function publicStudyAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
/** Resolve every redirect and pin the connection to the checked IP (no DNS rebinding). */
export async function readStudyUrl(
  raw: string,
  redirects = 0,
): Promise<{ title: string; text?: string; pdf?: string; url: string }> {
  const safe = safeWebUrl(raw);
  if (!safe || redirects > 3)
    throw new Error("공개 HTTPS 주소를 확인해 주세요.");
  const url = new URL(safe);
  const addresses = await lookup(url.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((a) => !publicStudyAddress(a.address))
  )
    throw new Error("이 주소는 가져올 수 없습니다.");
  const ip = addresses[0];
  const result = await new Promise<{
    status: number;
    location?: string;
    type: string;
    data: Buffer;
  }>((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "LearnHub/1.0",
          Accept: "text/html,text/plain,application/pdf",
        },
        lookup: ((_host: any, options: any, callback: any) =>
          options?.all
            ? callback(null, [ip])
            : callback(null, ip.address, ip.family)) as any,
      },
      (res) => {
        const status = res.statusCode || 500;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({
            status,
            location: res.headers.location,
            type: "",
            data: Buffer.alloc(0),
          });
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error("페이지를 가져오지 못했습니다."));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > STUDY_LIMITS.fileBytes) {
            req.destroy(new Error("웹 자료가 너무 큽니다."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status,
            type: res.headers["content-type"] || "",
            data: Buffer.concat(chunks),
          }),
        );
        res.on("error", reject);
      },
    );
    const timeout = setTimeout(
      () => req.destroy(new Error("페이지 응답 시간이 초과되었습니다.")),
      10_000,
    );
    req.on("error", reject);
    req.on("close", () => clearTimeout(timeout));
  });
  if (result.status >= 300 && result.status < 400) {
    if (!result.location) throw new Error("이동할 페이지가 없습니다.");
    return readStudyUrl(new URL(result.location, url).href, redirects + 1);
  }
  if (result.type.includes("application/pdf"))
    return {
      title: decodeURIComponent(
        url.pathname.split("/").pop() || "document.pdf",
      ).slice(0, 200),
      pdf: result.data.toString("base64"),
      url: safe,
    };
  if (!/text\/(html|plain)|application\/xhtml\+xml/i.test(result.type))
    throw new Error("이 링크의 문서 형식은 지원하지 않습니다.");
  const declaredCharset =
    /charset=["']?([^\s;"'>]+)/i.exec(result.type)?.[1] ||
    /charset=["']?([^\s;"'>]+)/i.exec(
      result.data.subarray(0, 4096).toString("ascii"),
    )?.[1] ||
    "utf-8";
  let html: string;
  try {
    html = new TextDecoder(declaredCharset).decode(result.data);
  } catch {
    html = result.data.toString("utf8");
  }
  const $ = load(html);
  $("script,style,noscript,iframe,nav,footer,header,svg,form").remove();
  $("br").replaceWith("\n");
  $("p,div,section,h1,h2,h3,h4,li,tr").append("\n");
  const title = ($("title").first().text().trim() || url.hostname).slice(
    0,
    200,
  );
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  const text = result.type.includes("text/plain")
    ? html
    : root
        .text()
        .replace(/[\t ]+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();
  if (text.length < 40)
    throw new Error("읽을 수 있는 본문이 없습니다. 파일로 첨부해 주세요.");
  if (text.length > STUDY_LIMITS.sourceChars)
    throw new Error("본문이 너무 깁니다. 필요한 부분을 파일로 첨부해 주세요.");
  return { title, text, url: safe };
}
