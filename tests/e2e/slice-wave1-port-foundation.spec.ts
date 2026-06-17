import { expect, test } from "@playwright/test";

import { installDiscoveryRoutes } from "./helpers/mock-routes";

function isMobileViewport(page: { viewportSize: () => { width: number } | null }) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

test.describe("wave1 port foundation", () => {
  test("shared home primitives do not create page-level horizontal overflow", async ({
    page,
  }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await expect(
      page.locator('input[placeholder="레시피 제목 검색"]:visible').first(),
    ).toBeVisible();

    if (isMobileViewport(page)) {
      await expect(page.getByRole("navigation", { name: "홈 하단 탭" })).toBeVisible();
    } else {
      await expect(
        page.getByRole("navigation", { name: "데스크탑 주요 메뉴" }),
      ).toBeVisible();
    }

    const pageHasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 4;
    });

    expect(pageHasHorizontalOverflow).toBe(false);
  });
});
