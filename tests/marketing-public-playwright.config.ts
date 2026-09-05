import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "marketing-public-flow.spec.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: ".artifacts/beta-live-flow/public-results",
  reporter: [["line"], ["json", { outputFile: ".artifacts/beta-live-flow/public-results.json" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://app.mumeok.kr",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      args: process.env.MARKETING_PUBLIC_CONNECT_IP
        ? [`--host-resolver-rules=MAP app.mumeok.kr ${process.env.MARKETING_PUBLIC_CONNECT_IP}`]
        : [],
    },
    screenshot: "only-on-failure",
  },
});
