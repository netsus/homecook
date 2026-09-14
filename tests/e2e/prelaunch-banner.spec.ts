import { expect, test } from "@playwright/test";

for (const route of ["/", "/about", "/planner", "/planner?segment=log"]) {
  test(`prelaunch notice is not shown in the service chrome: ${route}`, async ({ page }) => {
    await page.goto(route);
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const navigation = page.locator(".web-topnav").first();
      await expect(navigation).toBeVisible();
      const notice = navigation.getByLabel("서비스 준비 안내", { exact: true });
      await expect(notice).toHaveCount(0);
    }
    const notice = page.getByLabel("서비스 준비 안내", { exact: true });
    await expect(notice).toHaveCount(0);
  });
}
