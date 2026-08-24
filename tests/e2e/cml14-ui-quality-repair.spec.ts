import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  installCookingVisualRoutes,
  installDiscoveryRoutes,
  installLeftoversVisualRoutes,
  installMenuAddVisualRoutes,
  installPlannerWeekRoutes,
  installRecipeDetailRoutes,
  LEFTOVERS_VISUAL_PATH,
  MANUAL_CREATE_VISUAL_PATH,
  RECIPE_PATH,
  setE2EAuthOverride,
  STANDALONE_COOK_MODE_VISUAL_PATH,
} from "./helpers/mock-routes";

async function expectNoSeriousOrCriticalAxe(
  page: Page,
  ignoredRuleIds: string[] = [],
) {
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations
    .filter(
      (violation) =>
        !ignoredRuleIds.includes(violation.id) &&
        (violation.impact === "serious" || violation.impact === "critical"),
    )
    .map((violation) => ({
      help: violation.help,
      id: violation.id,
      nodes: violation.nodes.map((node) => ({
        failureSummary: node.failureSummary,
        html: node.html,
        target: node.target,
      })),
    }));

  expect(blockers).toEqual([]);
}

async function expectMinimumTouchTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();

  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

test.describe("#14 Stage 4 UI quality repair", () => {
  test("HOME and RECIPE_DETAIL have no serious accessibility blocker", async ({ page }, testInfo) => {
    await installDiscoveryRoutes(page);
    await installRecipeDetailRoutes(page);

    await page.goto("/");
    await expect(page.getByPlaceholder("레시피 제목 검색")).toBeVisible();
    await expectNoSeriousOrCriticalAxe(page);

    if (isMobile(page)) {
      await expectMinimumTouchTarget(
        page.getByTestId("mobile-profile-summary-button"),
      );
    }
    await page.screenshot({ path: testInfo.outputPath("HOME.png") });

    await page.goto(RECIPE_PATH);
    await expect(page.getByRole("heading", { name: "집밥 김치찌개" })).toBeVisible();
    await expectNoSeriousOrCriticalAxe(page);
    await page.screenshot({ path: testInfo.outputPath("RECIPE_DETAIL.png") });
  });

  test("MANUAL_RECIPE_CREATE, PLANNER_WEEK, and MEAL_LOG have no serious accessibility blocker", async ({
    page,
  }, testInfo) => {
    await setE2EAuthOverride(page);
    await installMenuAddVisualRoutes(page);
    await installPlannerWeekRoutes(page);

    await page.goto(MANUAL_CREATE_VISUAL_PATH);
    const saveButton = page.getByRole("button", { name: "저장" });
    await expect(saveButton).toBeVisible();
    await expectNoSeriousOrCriticalAxe(page);
    await saveButton.hover();
    await expectNoSeriousOrCriticalAxe(page);
    await page.mouse.move(0, 0);
    if (isMobile(page)) {
      await expectMinimumTouchTarget(page.getByRole("button", { name: "뒤로 가기" }));
    }
    await page.screenshot({ path: testInfo.outputPath("MANUAL_RECIPE_CREATE.png") });

    await page.goto("/planner");
    await expect(page.getByRole("heading", { name: "플래너", exact: true })).toBeVisible();
    await expectNoSeriousOrCriticalAxe(page);
    if (isMobile(page)) {
      await expectMinimumTouchTarget(
        page.getByTestId("mobile-profile-summary-button"),
      );
    }
    await page.screenshot({ path: testInfo.outputPath("PLANNER_WEEK.png") });

    await page.goto("/planner?segment=log");
    await expect(page.getByRole("tab", { name: "식사 기록" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expectNoSeriousOrCriticalAxe(page);
    if (isMobile(page)) {
      await expectMinimumTouchTarget(
        page.getByTestId("mobile-profile-summary-button"),
      );
    }
    await page.screenshot({ path: testInfo.outputPath("MEAL_LOG.png") });
  });

  test("COOK_MODE and LEFTOVERS expose keyboard and touch access without serious blockers", async ({
    page,
  }, testInfo) => {
    await setE2EAuthOverride(page);
    await installCookingVisualRoutes(page);
    await installLeftoversVisualRoutes(page, { ateItems: [], leftoverItems: [] });

    await page.goto(STANDALONE_COOK_MODE_VISUAL_PATH);
    await expect(page.getByTestId("standalone-cook-mode-title")).toBeVisible();
    await expectNoSeriousOrCriticalAxe(page, ["color-contrast"]);

    if (isMobile(page)) {
      const scrollRegion = page.getByRole("main", { name: "요리 내용" });
      await scrollRegion.focus();
      await expect(scrollRegion).toBeFocused();
      await expect(scrollRegion).toHaveAttribute("tabindex", "0");
      await scrollRegion.blur();
    }
    await page.screenshot({ path: testInfo.outputPath("COOK_MODE.png") });

    await page.goto(LEFTOVERS_VISUAL_PATH);
    await expect(
      page.getByRole("heading", { name: /^남은 요리/u }).first(),
    ).toBeVisible();
    await expectNoSeriousOrCriticalAxe(page, ["color-contrast"]);

    if (isMobile(page)) {
      await expectMinimumTouchTarget(page.getByRole("link", { name: "뒤로 가기" }));
      await expectMinimumTouchTarget(page.getByRole("link", { name: "다먹은 요리" }));
    }
    await page.screenshot({ path: testInfo.outputPath("LEFTOVERS.png") });
  });
});
