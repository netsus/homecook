import { expect, test } from "@playwright/test";

for (const route of ["/", "/about", "/planner", "/planner?segment=log"]) {
  test(`prelaunch notice is unobscured at page top: ${route}`, async ({ page }) => {
    await page.goto(route);
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(page.locator(".web-topnav").first()).toBeVisible();
    }
    const notice = page.getByLabel("서비스 준비 안내", { exact: true });
    await expect(notice).toBeVisible();
    await expect.poll(async () => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      return notice.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return rect.top >= 0 && hit !== null && element.contains(hit);
      });
    }).toBe(true);
  });
}
