import { expect, test } from "@playwright/test";

const googleEmail = process.env.E2E_GOOGLE_EMAIL;
const googlePassword = process.env.E2E_GOOGLE_PASSWORD;

test.describe("Slice 01 live Google OAuth", () => {
  test.skip(
    !googleEmail || !googlePassword,
    "E2E_GOOGLE_EMAIL and E2E_GOOGLE_PASSWORD are required for live OAuth",
  );

  test("@live-oauth returns to recipe detail after Google login", async ({ page }) => {
    await page.goto("/recipe/mock-kimchi-jjigae");
    await page.getByRole("button", { name: "플래너에 추가" }).click();
    await page.getByRole("button", { name: "Google로 시작하기" }).click();

    await page.waitForURL(/accounts\.google\.com|google\.com/);

    const emailInput = page
      .locator('input[type="email"], input[name="identifier"]')
      .first();

    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(googleEmail ?? "");
      await page.getByRole("button", { name: /next|다음/i }).click();
    }

    const passwordInput = page
      .locator('input[type="password"]')
      .first();
    await passwordInput.waitFor({ state: "visible", timeout: 20_000 });
    await passwordInput.fill(googlePassword ?? "");
    await page.getByRole("button", { name: /next|다음/i }).click();

    await page.waitForURL(/\/recipe\/mock-kimchi-jjigae/);
    await expect(
      page.getByText(/로그인 완료\..*액션 위치로 돌아왔어요\./),
    ).toBeVisible();
  });
});
