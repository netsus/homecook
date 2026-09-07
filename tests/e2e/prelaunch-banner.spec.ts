import { expect, test } from "@playwright/test";

for (const route of ["/", "/about", "/planner", "/planner?segment=log"]) {
  test(`prelaunch notice is unobscured at page top: ${route}`, async ({ page }) => {
    await page.goto(route);
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const navigation = page.locator(".web-topnav").first();
      await expect(navigation).toBeVisible();
      const notice = navigation.getByLabel("서비스 준비 안내", { exact: true });
      await expect(notice).toBeVisible();
      await expect.poll(async () => {
        const navBox = await navigation.boundingBox();
        const noticeBox = await notice.boundingBox();
        return navBox && noticeBox
          ? Math.abs(noticeBox.y - (navBox.y + 72))
          : Number.POSITIVE_INFINITY;
      }).toBeLessThanOrEqual(1);
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
