import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

import { captureEvidenceScreenshot } from "./helpers/evidence-capture";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

const evidenceDir = join(process.cwd(), "ui/designs/evidence/auth-provider-memory-linking/after");
const runtimeSignals = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }, testInfo) => {
  const signals: string[] = [];
  runtimeSignals.set(page, signals);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") signals.push(`console ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => signals.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => signals.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.status() >= 400) signals.push(`http ${response.status()}: ${response.url()}`);
  });
  const viewportByProject = {
    "desktop-chrome": { width: 1440, height: 1000 },
    "mobile-chrome": { width: 390, height: 844 },
    "mobile-ios-small": { width: 320, height: 568 },
  } as const;
  await page.setViewportSize(viewportByProject[testInfo.project.name as keyof typeof viewportByProject]);
});

test.afterEach(async ({ page }, testInfo) => {
  const path = testInfo.outputPath("runtime-signals.json");
  await writeFile(path, JSON.stringify(runtimeSignals.get(page) ?? [], null, 2));
  await testInfo.attach("runtime-signals", { path, contentType: "application/json" });
});

test("keeps connected providers visible and allows retry when linking cannot start", async ({ page }, testInfo) => {
  let attempts = 0;
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  await page.route("**/auth/flow/start", async (route) => {
    attempts += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, data: null, error: { code: "AUTH_FLOW_UNAVAILABLE", message: "잠시 후 다시 시도해 주세요.", fields: [] } }) });
  });
  await page.goto("/settings?linkedProviders=google");
  await page.getByRole("button", { name: "네이버 연결" }).click();
  await expect(page.getByRole("region", { name: "연결된 로그인 방법" }).getByRole("alert")).toContainText("연결을 시작하지 못했어요.");
  await expect(page.getByText("Google 연결됨")).toBeVisible();
  await expect(page.getByRole("button", { name: "네이버 연결" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const width = page.viewportSize()?.width ?? 1280;
  await captureEvidenceScreenshot(page, testInfo, join(evidenceDir, `SETTINGS-link-retry-${width}.png`), { fullPage: true });
  await page.getByRole("region", { name: "연결된 로그인 방법" }).screenshot({ path: testInfo.outputPath(`linked-providers-retry-region-${width}.png`) });
  await page.getByRole("button", { name: "네이버 연결" }).click();
  await expect.poll(() => attempts).toBe(2);
});

test("recent provider dialog cancels without OAuth and restores focus", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("homecook:last-auth-provider:v1", "google"));
  await page.goto("/login");
  const naver = page.getByRole("button", { name: "네이버로 시작하기" });
  await naver.click();
  const dialog = page.getByRole("dialog", { name: "다른 로그인 방법으로 계속할까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Google로 로그인" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Google로 로그인" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(naver).toBeFocused();

  await naver.click();
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(naver).toBeFocused();

  await naver.click();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(naver).toBeFocused();
  await expect(page).toHaveURL(/\/login$/);
});

test("captures deterministic recent-provider, safe-error, and linked-provider evidence", async ({ page }, testInfo) => {
  const width = page.viewportSize()?.width ?? 1280;
  await page.addInitScript(() => localStorage.setItem("homecook:last-auth-provider:v1", "google"));
  await page.goto("/login");
  const recentProviderButton = page.getByRole("button", { name: "Google로 시작하기" });
  await expect(recentProviderButton.getByText("최근 로그인")).toBeVisible();
  await expect(recentProviderButton).toHaveAttribute("data-recent-provider", "true");
  await expect(recentProviderButton).not.toHaveClass(/ring-2/);
  await captureEvidenceScreenshot(page, testInfo, join(evidenceDir, `LOGIN-recent-provider-${width}.png`), { fullPage: true });
  await page.getByRole("button", { name: "네이버로 시작하기" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const action of await page.getByRole("dialog").getByRole("button").all()) {
    expect((await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await captureEvidenceScreenshot(page, testInfo, join(evidenceDir, `LOGIN-dialog-${width}.png`), { fullPage: true });

  await page.goto("/login?authError=account_conflict");
  await expect(page.getByTestId("login-web-card")).toContainText("현재 계정으로 로그인할 수 없어요");
  await captureEvidenceScreenshot(page, testInfo, join(evidenceDir, `LOGIN-safe-error-${width}.png`), { fullPage: true });

  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  if (width >= 1024) {
    await page.goto("/mypage?linkedProviders=google&linkError=link_conflict");
    await page.getByRole("tab", { name: "환경설정" }).click();
  } else {
    await page.goto("/settings?linkedProviders=google&linkError=link_conflict");
  }
  await expect(page.getByRole("region", { name: "연결된 로그인 방법" })).toBeVisible();
  await expect(page.getByText("Google 연결됨")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await captureEvidenceScreenshot(page, testInfo, join(evidenceDir, `MYPAGE-linked-error-${width}.png`), { fullPage: true });
  await page.getByRole("region", { name: "연결된 로그인 방법" }).screenshot({ path: testInfo.outputPath(`linked-providers-region-${width}.png`) });
});

test("shows link outcomes and clears provider memory only after account deletion succeeds", async ({ page }) => {
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);

  await page.goto("/settings?linkedProviders=google,custom:naver&linkResult=linked");
  await expect(page.getByText("로그인 방법이 연결됐어요.")).toBeVisible();
  await expect(page.getByText("네이버 연결됨")).toBeVisible();

  await page.goto("/settings?linkedProviders=google&linkError=link_cancelled");
  await expect(page.getByText("연결을 취소했어요.")).toBeVisible();
  await expect(page.getByText("연결에 실패했어요. 잠시 후 다시 연결해 주세요.")).toHaveCount(0);

  await page.goto("/settings?linkedProviders=google&linkError=link_conflict");
  await expect(page.getByText("이 로그인 방법을 현재 계정에 연결하지 못했어요.")).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem("homecook:last-auth-provider:v1", "google");
    document.cookie = "homecook-last-auth-provider=google; Path=/; SameSite=Lax";
  });
  await page.getByRole("button", { name: "계정 삭제하기" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "탈퇴하기" }).click();
  await expect(page).toHaveURL("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("homecook:last-auth-provider:v1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => document.cookie.includes("homecook-last-auth-provider="))).toBe(false);
});
