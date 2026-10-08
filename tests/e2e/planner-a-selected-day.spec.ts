import { test, expect } from "@playwright/test";
import { installAccountLibraryVisualRoutes, installPlannerWeekRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

for (const width of [375, 1280]) {
  test(`reveals the selected week after switching from plan to log at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 812 });
    await setE2EAuthOverride(page, "guest");
    await page.goto("/planner?date=2026-10-08");
    const nav = page.getByRole("navigation", { name: width < 1024 ? "플래너 하단 탭" : "데스크탑 주요 메뉴", exact: true });
    await expect(page.getByTestId("meal-log-week-date-rail")).toHaveCount(0);
    await nav.getByRole("link", { name: "식사 기록", exact: true }).click();
    const rail = page.getByTestId("meal-log-week-date-rail");
    const selected = rail.getByRole("radio", { checked: true });
    await expect(selected).toHaveAttribute("aria-label", /10\/8/);
    // AX visibility ignores clipped pages; verify the selected date's actual painted position.
    await expect.poll(() => selected.evaluate(node => {
      const rail = node.closest('[data-testid="meal-log-week-date-rail"]')!;
      const bounds = rail.getBoundingClientRect();
      const date = node.getBoundingClientRect();
      return date.left >= bounds.left && date.right <= bounds.right;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`log-week-revealed-${width}.png`) });
    // Simulate a completed horizontal gesture; mounting must not disable subsequent swipes.
    await rail.evaluate(node => {
      node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      node.scrollLeft += node.clientWidth;
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
      node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    await expect(page).toHaveURL(/date=2026-10-15/);
    await expect(selected).toHaveAttribute("aria-label", /10\/15/);
    await expect(selected).toBeInViewport({ ratio: 1 });
    await nav.getByRole("link", { name: "요리 계획", exact: true }).click();
    await nav.getByRole("link", { name: "식사 기록", exact: true }).click();
    await expect(selected).toHaveAttribute("aria-label", /10\/15/);
    await expect(selected).toBeInViewport({ ratio: 1 });
  });

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

for (const width of [320, 375, 1280]) {
  test(`selecting either end of a week preserves rail alignment ${width}px`, async ({page}, info) => {
    await page.setViewportSize({width,height:812});
    await setE2EAuthOverride(page, "guest");
    await page.goto("/planner?segment=log&date=2026-10-08");
    const rail=page.getByTestId("meal-log-week-date-rail");
    const monday=rail.getByRole("radio",{name:"10/5 월요일 선택",exact:true});
    const sunday=rail.getByRole("radio",{name:"10/11 일요일 선택",exact:true});
    await expect(monday).toBeInViewport({ratio:1});
    await expect(sunday).toBeInViewport({ratio:1});
    const initial=await rail.evaluate(node=>node.scrollLeft);
    for(const target of [sunday,monday,sunday]) {
      await target.click();
      await expect(target).toHaveAttribute("aria-checked","true");
      await expect.poll(()=>rail.evaluate(node=>node.scrollLeft)).toBeCloseTo(initial,0);
      const insets=await rail.evaluate(node=>{
        const bounds=node.getBoundingClientRect();
        const dates=[...node.querySelectorAll('[role="radio"]')].filter(n=>n.closest('ol')?.getAttribute('aria-hidden')!=="true");
        return {left:dates[0].getBoundingClientRect().left-bounds.left,right:bounds.right-dates[6].getBoundingClientRect().right};
      });
      expect(insets.left).toBeGreaterThanOrEqual(4);
      expect(Math.abs(insets.left-insets.right)).toBeLessThan(2);
    }
    await page.screenshot({path:info.outputPath(`stable-week-ends-${width}.png`)});
  });
}
