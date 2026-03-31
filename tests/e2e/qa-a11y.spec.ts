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

async function expectReadableTouchTarget(
  locator: import("@playwright/test").Locator,
  {
    minimumFontSize = 14,
    minimumHeight = 44,
  }: {
    minimumFontSize?: number;
    minimumHeight?: number;
  } = {},
) {
  await expect(locator).toBeVisible();

  const metrics = await locator.evaluate((element) => {
    const target = element as HTMLElement;
    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();

    return {
      fontSize: Number.parseFloat(style.fontSize),
      height: rect.height,
    };
  });

  expect(metrics.fontSize).toBeGreaterThanOrEqual(minimumFontSize);
  expect(metrics.height).toBeGreaterThanOrEqual(minimumHeight);
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
    await expectReadableTouchTarget(
      page.getByRole("button", { name: "재료로 검색" }),
    );
    await expectReadableTouchTarget(
      page.getByRole("combobox", { name: "정렬 기준" }),
    );

    await page.goto(RECIPE_PATH);
    await expect(
      page.getByRole("heading", { name: "집밥 김치찌개" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await expectReadableTouchTarget(
      page.getByRole("button", { name: "플래너에 추가" }),
    );
    await expectReadableTouchTarget(
      page.getByRole("button", { name: /좋아요/ }),
    );
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
    await expectReadableTouchTarget(
      page.getByRole("button", { name: "적용" }),
    );
    await expectReadableTouchTarget(
      page.getByRole("button", { name: "닫기" }),
    );

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "플래너에 추가" }).click();
    await expect(
      page.getByRole("dialog", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await expectReadableTouchTarget(
      page.getByRole("button", { name: /시작하기/ }).first(),
    );
  });
});
