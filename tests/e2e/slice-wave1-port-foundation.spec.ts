import { expect, test } from "@playwright/test";

import { installDiscoveryRoutes } from "./helpers/mock-routes";

test.describe("wave1 port foundation", () => {
  test("shared home primitives do not create page-level horizontal overflow", async ({
    page,
  }) => {
    await installDiscoveryRoutes(page);

    await page.goto("/");
    await expect(page.getByPlaceholder("김치볶음밥, 된장찌개...")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "하단 탭" })).toBeVisible();

    const pageHasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 4;
    });

    expect(pageHasHorizontalOverflow).toBe(false);
  });
});
