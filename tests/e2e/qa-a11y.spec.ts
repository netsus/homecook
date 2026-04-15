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

async function readTypographyMetrics(
  locator: import("@playwright/test").Locator,
) {
  await expect(locator).toBeVisible();

  return locator.evaluate((element) => {
    const style = window.getComputedStyle(element as HTMLElement);

    return {
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
    };
  });
}

async function expectMatchingControlTypography(
  reference: import("@playwright/test").Locator,
  candidate: import("@playwright/test").Locator,
) {
  const [referenceMetrics, candidateMetrics] = await Promise.all([
    readTypographyMetrics(reference),
    readTypographyMetrics(candidate),
  ]);

  expect(candidateMetrics.fontSize).toBe(referenceMetrics.fontSize);
  expect(candidateMetrics.fontWeight).toBe(referenceMetrics.fontWeight);
  expect(candidateMetrics.letterSpacing).toBe(referenceMetrics.letterSpacing);
}

async function expectSingleLineControlLabel(
  locator: import("@playwright/test").Locator,
) {
  await expect(locator).toBeVisible();

  const metrics = await locator.evaluate((element) => {
    const target = element as HTMLElement;
    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();

    return {
      height: rect.height,
      whiteSpace: style.whiteSpace,
      writingMode: style.writingMode,
    };
  });

  expect(metrics.whiteSpace).toBe("nowrap");
  expect(metrics.writingMode).toBe("horizontal-tb");
  expect(metrics.height).toBeLessThanOrEqual(52);
}

async function expectCompactToolbarControl(
  locator: import("@playwright/test").Locator,
) {
  await expect(locator).toBeVisible();

  const metrics = await locator.evaluate((element) => {
    const target = element as HTMLElement;
    const style = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();

    return {
      height: rect.height,
      whiteSpace: style.whiteSpace,
    };
  });

  expect(metrics.whiteSpace).toBe("nowrap");
  expect(metrics.height).toBeLessThanOrEqual(48);
}

test.describe("QA accessibility smoke", () => {
  test("home and recipe detail are axe-clean", async ({ page }) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "집밥을 바로 골라보세요" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await expectReadableTouchTarget(
      page.getByRole("button", { name: "재료로 검색" }),
    );
    await expectMatchingControlTypography(
      page.getByRole("button", { name: "재료로 검색" }),
      page.getByRole("button", { name: /정렬 기준/i }),
    );
    await expectCompactToolbarControl(
      page.getByRole("button", { name: /정렬 기준/i }),
    );
    await expectReadableTouchTarget(
      page.getByRole("button", { name: /정렬 기준/i }),
    );
    await page.getByRole("button", { name: /정렬 기준/i }).click();
    await expect(
      page.getByRole("option", { name: "플래너 등록순" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await expectReadableTouchTarget(
      page.getByRole("option", { name: "플래너 등록순" }),
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
    await expectSingleLineControlLabel(
      page.getByRole("button", { name: "초기화" }),
    );
    await expectSingleLineControlLabel(
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
