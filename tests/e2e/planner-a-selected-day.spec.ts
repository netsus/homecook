import { test, expect } from "@playwright/test";
import { installAccountLibraryVisualRoutes, installPlannerWeekRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

for (const width of [375, 1280]) {
  test(`Planner A selects one day and preserves add context at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    await setE2EAuthOverride(page);
    await installAccountLibraryVisualRoutes(page);
    await installPlannerWeekRoutes(page);
    await page.goto("/planner?date=2026-05-18");
    const overview = page.getByRole("region", { name: "한 주 요리계획" });
    await expect(overview.getByRole("button", { name: /선택$/ })).toHaveCount(7);
    await expect(page.getByTestId("planner-day-card-2026-05-18")).toBeVisible();
    await expect(page.locator('[data-testid^="planner-day-card-"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`planner-a-${width}.png`), fullPage: false });
    await overview.getByRole("button", { name: "5/19 화 선택" }).click();
    await expect(page).toHaveURL(/date=2026-05-19/);
    const selected = page.getByTestId("planner-day-card-2026-05-19");
    if (width === 375) {
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expect.poll(() => selected.boundingBox().then(box => box?.y ?? 999)).toBeLessThan(406);
    }
    await expect(selected.getByRole("link", { name: "된장찌개", exact: true })).toHaveAttribute("href", /mealId=planner-meal-2/);
    await expect(selected.getByRole("heading", { name: "점심" }).getByRole("link")).not.toHaveAttribute("href", /mealId=/);
    await expect(selected.getByRole("button", { name: /식사 추가$/ })).toHaveCount(3);
    await selected.getByRole("button", { name: "5/19 저녁 식사 추가" }).click();
    const sheet = page.getByRole("dialog", { name: "식사 추가", exact: true });
    await expect(sheet.getByText("5/19 저녁", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "팬트리에서 찾기" })).toBeVisible();
    await sheet.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page).toHaveURL(/date=2026-05-19/);
    await page.goBack();
    await expect(page.getByTestId("planner-day-card-2026-05-18")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
