import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installCookingVisualRoutes, installMealDetailRoutes, installRecipeDetailRoutes, MEAL_VISUAL_PATH, RECIPE_PATH, setE2EAuthOverride } from "./helpers/mock-routes";

const evidence = resolve("ui/designs/evidence/recipe-content-snapshot-future-propagation");
async function capture(page: Page, width: 390 | 320, name: string) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 568 });
  const path = resolve(evidence, name);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ fullPage: true, path });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
}

test.describe("recipe-content-snapshot-future-propagation", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "This spec sets the exact 390px/320px evidence viewports itself.");
    await setE2EAuthOverride(page);
  });

  test("captures impact dialog at 390px and 320px", async ({ page }) => {
    await installRecipeDetailRoutes(page);
    await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
    await expect(page.getByRole("dialog", { name: "미래 계획 반영 확인" })).toBeVisible();
    await capture(page, 390, "RECIPE_DETAIL-impact-mobile-default.png");
    await capture(page, 320, "RECIPE_DETAIL-impact-mobile-narrow.png");
    const radios = page.getByRole("radio");
    await expect(radios).toHaveCount(2);
  });

  test("captures existing planner start without shell redesign", async ({ page }) => {
    await installMealDetailRoutes(page);
    await installCookingVisualRoutes(page);
    await page.goto(MEAL_VISUAL_PATH);
    await expect(page.getByRole("button", { name: /요리하기/ }).first()).toBeVisible();
    await capture(page, 390, "PLANNER_WEEK-start-mobile-default.png");
    await capture(page, 320, "PLANNER_WEEK-start-mobile-narrow.png");
  });

  test("reads snapshot_v2 through its isolated route", async ({ page }) => {
    await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => route.fulfill({ json: { success: true, data: { session_id: "snapshot-qa", contract_version: "snapshot_v2", mode: "planner", status: "completed", recipe: { id: "recipe-qa", title: "고정된 김치찌개", cooking_servings: 2, ingredients: [], steps: [] }, pantry_candidates: [] }, error: null } }));
    await page.goto("/cooking/session-attempts/snapshot-qa/cook-mode");
    await expect(page.getByText("완료된 요리 기록이에요")).toBeVisible();
    await expect(page.getByRole("button", { name: "요리 완료" })).toHaveCount(0);
    await capture(page, 390, "COOK_MODE-dispatch-mobile-default.png");
    await capture(page, 320, "COOK_MODE-dispatch-mobile-narrow.png");
  });
});
