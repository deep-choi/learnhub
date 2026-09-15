import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("temporary deployments default to noindex and runtime canonical metadata", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const server = fs.readFileSync("server.ts", "utf8");
  const envExample = fs.readFileSync(".env.example", "utf8");
  const firebaseFunction = fs.readFileSync("functions/index.cjs", "utf8");
  const firebase = JSON.parse(fs.readFileSync("firebase.json", "utf8")) as {
    hosting: {
      rewrites: Array<{ source: string; function?: { functionId: string; region: string } }>;
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
  };

  assert.match(html, /name="robots" content="noindex, nofollow"/u);
  assert.match(html, /https:\/\/learnhub-1de94\.web\.app\//u);
  assert.match(html, /learnhub-runtime-seo/u);
  assert.match(server, /RENDER_EXTERNAL_URL/u);
  assert.match(server, /app\.get\("\/robots\.txt"/u);
  assert.match(server, /app\.get\("\/sitemap\.xml"/u);
  assert.match(server, /rel="canonical"/u);
  assert.match(server, /X-Frame-Options/u);
  assert.match(server, /Permissions-Policy/u);
  assert.match(server, /event: "http_request"/u);
  assert.match(envExample, /SEO_INDEXABLE="false"/u);
  const apiRewrite = firebase.hosting.rewrites.find((rewrite) => rewrite.source === "/api/**");
  assert.deepEqual(apiRewrite?.function, { functionId: "learnhubApi", region: "asia-northeast3" });
  assert.match(firebaseFunction, /minInstances: 0/u);
  assert.match(firebaseFunction, /maxInstances: 1/u);
  assert.match(firebaseFunction, /invoker: "public"/u);
  assert.match(firebaseFunction, /defineSecret\("GEMINI_API_KEY"\)/u);
  const securityHeaders = firebase.hosting.headers[0].headers.map((header) => header.key);
  assert.ok(securityHeaders.includes("X-Frame-Options"));
  assert.ok(securityHeaders.includes("Permissions-Policy"));
});
