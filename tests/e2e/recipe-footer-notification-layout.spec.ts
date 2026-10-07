import { expect, test } from "@playwright/test";
import { installDiscoveryRoutes, installRecipeDetailRoutes, RECIPE_PATH, setE2EAuthOverride } from "./helpers/mock-routes";
import { MOCK_RECIPE_DETAIL } from "../../lib/mock/recipes";

test.beforeEach(async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === "desktop-chrome"
    ? { width: 1440, height: 1000 } : { width: 375, height: 812 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
});

test("recipe management scrolls with content and the last ingredient clears the two-action footer", async ({ page }, testInfo) => {
  await installRecipeDetailRoutes(page, { recipeDetail: {
    edit_context: { base_recipe_revision: 1, image_object_id: null,
      draft: { title: "내 레시피", description: null, base_servings: 2, ingredients: [], steps: [] } },
  } });
  await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
  const management = page.getByRole("region", { name: "레시피 관리" });
  await expect(management.getByRole("button", { name: "편집", exact: true })).toBeVisible();
  await expect(page.locator("[data-youtube-extraction-trigger]")).toHaveCount(0);
  await management.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobile = (page.viewportSize()?.width ?? 0) < 1024;
  if (mobile) {
    const footer = page.getByRole("region", { name: "레시피 주요 작업" });
    await expect(footer.getByRole("button")).toHaveCount(2);
    await expect(footer.getByRole("button", { name: "편집" })).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastIngredient = page.getByText(MOCK_RECIPE_DETAIL.ingredients.at(-1)!.standard_name, { exact: true }).last();
    const ingredientBounds = await lastIngredient.boundingBox();
    const footerBounds = await footer.boundingBox();
    const managementBounds = await management.boundingBox();
    expect(ingredientBounds).not.toBeNull();
    expect(ingredientBounds!.y + ingredientBounds!.height).toBeLessThan(footerBounds!.y);
    expect(managementBounds!.y + managementBounds!.height).toBeLessThanOrEqual(footerBounds!.y);
    expect(footerBounds!.height).toBeLessThan(160);
  } else {
    await expect(page.locator(".web-recipe-bottom-cta").getByRole("button", { name: "편집" })).toHaveCount(0);
    await expect(page.locator(".web-recipe-rail").getByRole("button", { name: "편집" })).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath("recipe-management-footer.png") });
});

test("home bell belongs to the header and scrolls away", async ({ page }, testInfo) => {
  await page.goto("/");
  const bell = page.locator("[data-youtube-extraction-trigger]").filter({ visible: true });
  await expect(bell).toBeVisible();
  expect(await bell.evaluate((element) => Boolean(element.closest("header")))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("home-header-bell.png") });
  await page.evaluate(() => window.scrollTo(0, 650));
  await expect.poll(async () => (await bell.boundingBox())?.y ?? 0).toBeLessThan(0);
  await page.screenshot({ path: testInfo.outputPath("home-scrolled-no-floating-bell.png") });
});

test("saved meal recipe shows its stored quantities without overflow or a floating bell", async ({ page }, testInfo) => {
  await page.route("**/api/v1/meals/*/recipe-snapshot", (route) => route.fulfill({ json: {
    success: true, error: null, data: {
      meal_id: "saved-meal", recipe_id: "saved-recipe", snapshot_id: "saved-snapshot", title: "변경 전 두부찌개", planned_servings: 2,
      ingredients: [{ ingredient_id: "x", standard_name: "신김치", amount: 300, unit: "g", ingredient_type: "QUANT", scalable: true, display_text: null }],
      steps: [{ step_number: 1, instruction: "재료를 넣고 끓여 주세요.", component_label: null, cooking_method: { code: "", label: "", color_key: "" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null }],
    },
  } }));
  await page.goto("/meal/saved-meal/recipe");
  await expect(page.getByRole("heading", { name: "변경 전 두부찌개" })).toBeVisible();
  await expect(page.getByText("신김치", { exact: true })).toBeVisible();
  await expect(page.getByText("300g", { exact: true })).toBeVisible();
  await expect(page.getByText("재료를 넣고 끓여 주세요.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-youtube-extraction-trigger]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("saved-meal-recipe.png"), fullPage: true });
});
