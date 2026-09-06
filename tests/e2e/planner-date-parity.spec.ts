import { expect, test, type Page } from "@playwright/test";

const DATE = "2026-09-06";
const rail = (page: Page) => page.locator('[data-testid="planner-week-date-rail"], [data-testid="meal-log-week-date-rail"]');

async function dateLayout(page: Page) {
  return rail(page).evaluate(element => {
    const bounds = (node: Element) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    const buttons = Array.from(element.querySelectorAll('ol:not([aria-hidden="true"]) button'));
    return {
      rail: bounds(element),
      dates: buttons.map(button => {
        const style = getComputedStyle(button);
        return {
          bounds: bounds(button),
          color: style.color,
          background: style.backgroundColor,
          radius: style.borderRadius,
          shadow: style.boxShadow,
          font: style.font,
          labelFont: button.firstElementChild ? getComputedStyle(button.firstElementChild).font : "",
          numberFont: button.children[1] ? getComputedStyle(button.children[1]).font : "",
        };
      }),
    };
  });
}

async function controlsLayout(page: Page) {
  return {
    calendar: await page.getByRole("button", { name: "달력에서 날짜 선택", exact: true }).boundingBox(),
    today: await page.getByRole("button", { name: "오늘", exact: true }).boundingBox(),
  };
}

async function switchSegment(page: Page, width: number, segment: "plan" | "log") {
  const nav = page.getByRole("navigation", { name: width < 1024 ? "플래너 하단 탭" : "데스크탑 주요 메뉴", exact: true });
  await nav.getByRole("link", { name: segment === "log" ? "식사 기록" : "요리 계획", exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("date") === DATE && (segment === "log" ? url.searchParams.get("segment") === "log" : url.searchParams.get("segment") !== "log"));
  await expect(nav.getByRole("link", { name: segment === "log" ? "식사 기록" : "요리 계획", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(rail(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "달력에서 날짜 선택", exact: true })).toContainText("9월 6일");
}

for (const width of [320, 375, 1280]) {
  test.describe(`${width}px planner date area`, () => {
    test.use({ viewport: { width, height: 812 } });

    test.beforeEach(async ({ page, baseURL }) => {
      await page.context().addCookies([{ name: "homecook.e2e-auth-override", value: "guest", url: baseURL! }]);
      await page.addInitScript(() => localStorage.setItem("homecook.e2e-auth-override", "guest"));
      await page.goto(`/planner?date=${DATE}`);
      await expect(rail(page)).toBeVisible();
      await expect(page.locator('[data-testid="planner-day-card-2026-09-06"]')).toBeInViewport({ ratio: 0.5 });
      // Wait for the planner's initial selected-day positioning before deliberately returning to the top.
      if (width < 1024) {
        await expect.poll(async () => (await rail(page).boundingBox())?.y).toBeLessThan(20);
      }
      await switchSegment(page, width, "log");
      await expect(page.locator('[data-planner-date="2026-09-06"]')).toBeInViewport({ ratio: 0.5 });
      await switchSegment(page, width, "plan");
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("calendar, today and seven dates stay in place when switching tabs", async ({ page }) => {
      const initial = await dateLayout(page);
      const controls = await controlsLayout(page);
      expect(initial.dates).toHaveLength(7);
      for (const segment of ["log", "plan"] as const) {
        await switchSegment(page, width, segment);
        await expect.poll(() => dateLayout(page)).toEqual(initial);
        await expect.poll(() => controlsLayout(page)).toEqual(controls);
      }
    });

    if (width < 1024) {
      test("sticky dates keep their position and selected date through a tab round trip", async ({ page }) => {
        await page.evaluate(() => window.scrollTo({ top: 420, behavior: "instant" }));
        await expect.poll(async () => (await rail(page).boundingBox())?.y).toBeLessThan(20);
        const initial = await dateLayout(page);
        for (const segment of ["log", "plan"] as const) {
          await switchSegment(page, width, segment);
          await expect.poll(() => dateLayout(page)).toEqual(initial);
        }
      });
    }
  });
}
