import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

const evidenceDir = join(process.cwd(), "ui/designs/evidence/auth-provider-memory-linking/after");

test("recent provider dialog cancels without OAuth and restores focus", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("homecook:last-auth-provider:v1", "google"));
  await page.goto("/login");
  const naver = page.getByRole("button", { name: "네이버로 시작하기" });
  await naver.click();
  await expect(page.getByRole("dialog", { name: "다른 로그인 방법으로 계속할까요?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(naver).toBeFocused();
});

test("captures deterministic recent-provider, safe-error, and linked-provider evidence", async ({ page }) => {
  const width = page.viewportSize()?.width ?? 1280;
  await page.addInitScript(() => localStorage.setItem("homecook:last-auth-provider:v1", "google"));
  await page.goto("/login");
  await page.getByRole("button", { name: "네이버로 시작하기" }).click();
  await page.screenshot({ path: join(evidenceDir, `LOGIN-dialog-${width}.png`), fullPage: true });

  await page.goto("/login?authError=account_conflict");
  await expect(page.getByTestId("login-web-card")).toContainText("현재 계정으로 로그인할 수 없어요");
  await page.screenshot({ path: join(evidenceDir, `LOGIN-safe-error-${width}.png`), fullPage: true });

  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  await page.goto("/settings?linkedProviders=google&linkError=link_conflict");
  await expect(page.getByRole("region", { name: "연결된 로그인 방법" })).toBeVisible();
  await expect(page.getByText("Google 연결됨")).toBeVisible();
  await page.screenshot({ path: join(evidenceDir, `MYPAGE-linked-error-${width}.png`), fullPage: true });
});
