import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

const evidenceDir = join(process.cwd(), "ui/designs/evidence/auth-provider-memory-linking/after");

test.beforeEach(async ({ page }, testInfo) => {
  const viewportByProject = {
    "desktop-chrome": { width: 1440, height: 1000 },
    "mobile-chrome": { width: 390, height: 844 },
    "mobile-ios-small": { width: 320, height: 568 },
  } as const;
  await page.setViewportSize(viewportByProject[testInfo.project.name as keyof typeof viewportByProject]);
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

test("captures deterministic recent-provider, safe-error, and linked-provider evidence", async ({ page }) => {
  const width = page.viewportSize()?.width ?? 1280;
  await page.addInitScript(() => localStorage.setItem("homecook:last-auth-provider:v1", "google"));
  await page.goto("/login");
  await page.getByRole("button", { name: "네이버로 시작하기" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const action of await page.getByRole("dialog").getByRole("button").all()) {
    expect((await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: join(evidenceDir, `LOGIN-dialog-${width}.png`), fullPage: true });

  await page.goto("/login?authError=account_conflict");
  await expect(page.getByTestId("login-web-card")).toContainText("현재 계정으로 로그인할 수 없어요");
  await page.screenshot({ path: join(evidenceDir, `LOGIN-safe-error-${width}.png`), fullPage: true });

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
  await page.screenshot({ path: join(evidenceDir, `MYPAGE-linked-error-${width}.png`), fullPage: true });
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
  await page.getByRole("alertdialog").getByRole("button", { name: "계정 삭제" }).click();
  await expect(page).toHaveURL("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("homecook:last-auth-provider:v1"))).toBeNull();
  await expect.poll(() => page.evaluate(() => document.cookie.includes("homecook-last-auth-provider="))).toBe(false);
});
