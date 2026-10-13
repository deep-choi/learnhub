import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  outputDir: "test-results/playwright",
  workers: 1,
  timeout: 60_000,
  webServer: {
    command: "npx tsx tests/browser/server.ts",
    url: "http://127.0.0.1:3013/healthz",
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://127.0.0.1:3013" },
});
