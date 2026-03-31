import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  installDiscoveryRoutes,
  installRecipeDetailRoutes,
  RECIPE_PATH,
} from "./helpers/mock-routes";

async function expectNoAxeViolations(
  page: import("@playwright/test").Page,
) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("QA accessibility smoke", () => {
  test("home and recipe detail are axe-clean", async ({ page }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "오늘 만들 집밥을 바로 찾으세요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("ingredient filter and login gate dialogs are axe-clean", async ({
    page,
  }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);

    await page.goto("/");
    await page.getByRole("button", { name: "재료로 검색" }).click();
    await expect(
      page.getByRole("dialog", { name: "재료로 검색" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "플래너에 추가" }).click();
    await expect(
      page.getByRole("dialog", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
