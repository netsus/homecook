import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3117";
const target = new URL(baseURL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !["http:", "https:"].includes(target.protocol)) throw new Error("R2 preview evidence requires an explicit loopback server");
const runId = process.env.HOMECOOK_R2_EVIDENCE_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
process.env.HOMECOOK_R2_EVIDENCE_RUN_ID = runId;
const evidenceRoot = `.omx/artifacts/r2-stage4/preview-browser/runs/${runId}`;
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "marketing-round2.spec.ts", fullyParallel: false, workers: 1,
  timeout: 120_000, expect: { timeout: 10_000 }, retries: 0,
  outputDir: `${evidenceRoot}/results`,
  reporter: [["line"], ["json", { outputFile: `${evidenceRoot}/report.json` }]],
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure", screenshot: "only-on-failure" },
  // The caller owns starting/stopping this dedicated preview. Never reuse another task's process implicitly.
});
