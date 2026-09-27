import { expect, test } from "@playwright/test";
import { installDiscoveryRoutes, installRecipeDetailRoutes, RECIPE_PATH, setE2EAuthOverride } from "./helpers/mock-routes";
import { MOCK_RECIPE_DETAIL } from "../../lib/mock/recipes";

test("a recipe quantity can be cleared and replaced with a decimal without inserting zero", async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === "desktop-chrome" ? { width: 1440, height: 1000 } : { width: 375, height: 812 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installRecipeDetailRoutes(page, { recipeDetail: {
    edit_context: { base_recipe_revision: 1, image_object_id: null,
      draft: { title: "수량 수정 레시피", description: null, base_servings: 2,
        ingredients: [{ ingredient_id: MOCK_RECIPE_DETAIL.ingredients[0].ingredient_id, amount: 0, unit: "g", ingredient_type: "QUANT", scalable: true, display_text: null, component_label: null, food_product_id: null, food_product_nutrition_version_id: null }],
        steps: [] },
    },
  } });
  await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
  await page.getByRole("button", { name: "편집", exact: true }).click();
  const amount = page.getByRole("textbox", { name: "재료 1 수량" });
  await expect(amount).toHaveValue("0");
  await amount.fill("");
  await expect(amount).toHaveValue("");
  await amount.pressSequentially("12.");
  await expect(amount).toHaveValue("12.");
  await amount.pressSequentially("5");
  await expect(amount).toHaveValue("12.5");
  await amount.blur();
  await expect(amount).toHaveValue("12.5");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("decimal-quantity.png") });
});
