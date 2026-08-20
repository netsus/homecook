import { execFileSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

const initialWorktreeStatus = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { encoding: "utf8" },
).trim();
if (initialWorktreeStatus === "") {
  process.env.HOMECOOK_PLAYWRIGHT_CLEAN_HEAD = execFileSync(
    "git",
    ["rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  process.env.HOMECOOK_PLAYWRIGHT_CLEAN_TREE = execFileSync(
    "git",
    ["rev-parse", "HEAD^{tree}"],
    { encoding: "utf8" },
  ).trim();
}

const DEFAULT_PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_PLAYWRIGHT_BASE_URL;
const snapshotPlatform =
  process.env.PLAYWRIGHT_SNAPSHOT_PLATFORM ??
  (process.platform === "darwin" ? "darwin" : "linux");
const webServerUrl = new URL(baseURL);
const webServerHost = webServerUrl.hostname;
const webServerPort =
  webServerUrl.port.length > 0
    ? Number.parseInt(webServerUrl.port, 10)
    : webServerUrl.protocol === "https:"
      ? 443
      : 80;
const shouldReuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["line"], ["html", { open: "never" }]],
  snapshotPathTemplate:
    `{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-${snapshotPlatform}{ext}`,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
      },
    },
    {
      name: "mobile-ios-small",
      use: {
        ...devices["iPhone SE"],
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command:
      [
        "HOMECOOK_ENABLE_QA_FIXTURES=1",
        "HOMECOOK_AUTH_AUTHORITY=local",
        "HOMECOOK_DATA_AUTHORITY=local",
        "NEXT_PUBLIC_AUTH_SUPABASE_URL=http://127.0.0.1:54321",
        "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY=qa-local-publishable-key",
        "AUTH_SUPABASE_EXPECTED_ISSUER=http://127.0.0.1:54321/auth/v1",
        "AUTH_SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json",
        "LOCAL_SUPABASE_INTERNAL_URL=http://127.0.0.1:54321",
        "DATA_SUPABASE_URL=http://127.0.0.1:54321",
        "DATA_SUPABASE_PUBLISHABLE_KEY=qa-local-publishable-key",
        // Deterministic loopback-only fixtures; these values are not real secrets.
        "DATA_SUPABASE_SECRET_KEY=qa-test-only-not-a-real-data-secret",
        "HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1=qa-test-only-attestation-hmac-key-0001",
        "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1=qa-test-only-generation-hmac-key-0001",
        "NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1",
        "NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS=kakao,naver,google",
        "NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER=custom:naver",
        `NEXT_PUBLIC_APP_URL=${webServerUrl.origin}`,
        `corepack pnpm exec next dev --turbopack --hostname ${webServerHost} --port ${webServerPort}`,
      ].join(" "),
    url: baseURL,
    reuseExistingServer: shouldReuseExistingServer,
    timeout: 120_000,
  },
});
