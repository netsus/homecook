import { defineConfig, devices } from "@playwright/test";

const DEFAULT_PLAYWRIGHT_BASE_URL = "http://127.0.0.1:3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? DEFAULT_PLAYWRIGHT_BASE_URL;
const snapshotPlatform = process.platform === "darwin" ? "darwin" : "linux";
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
        "NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES=1",
        `NEXT_PUBLIC_APP_URL=${webServerUrl.origin}`,
        `corepack pnpm exec next dev --hostname ${webServerHost} --port ${webServerPort}`,
      ].join(" "),
    url: baseURL,
    reuseExistingServer: shouldReuseExistingServer,
    timeout: 120_000,
  },
});
