import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 375, height: 812 }, { width: 375, height: 650 }, { width: 320, height: 568 }]) {
  test.describe(`planner bottom clearance ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    for (const segment of ["plan", "log"]) {
      test(`${segment} ends just above the bottom tabs without a blank scrolling tail`, async ({ page, baseURL }) => {
        await page.context().addCookies([{ name: "homecook.e2e-auth-override", value: "guest", url: baseURL! }]);
        await page.addInitScript(() => localStorage.setItem("homecook.e2e-auth-override", "guest"));
        await page.goto(`/planner?date=2026-09-06&segment=${segment}`);
        const last = segment === "plan"
          ? page.locator('[data-testid^="planner-day-card-"]').last()
          : page.locator('#planner-log-panel [data-planner-date]').last();
        await expect(last).toBeAttached();
        await expect.poll(async () => {
          await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
          const card = await last.boundingBox();
          const tabs = await page.locator('[data-slot="bottom-tab-container"]').boundingBox();
          return card && tabs ? tabs.y - (card.y + card.height) : -1;
        }).toBeGreaterThanOrEqual(8);
        await expect.poll(async () => {
          await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
          const card = await last.boundingBox();
          const tabs = await page.locator('[data-slot="bottom-tab-container"]').boundingBox();
          return card && tabs ? tabs.y - (card.y + card.height) : Infinity;
        }).toBeLessThanOrEqual(20);
      });
    }
  });
}
