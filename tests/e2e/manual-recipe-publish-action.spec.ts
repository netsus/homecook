import { expect, test } from "@playwright/test";
import { installDiscoveryRoutes, installRecipeDetailRoutes, RECIPE_ID, RECIPE_PATH, setE2EAuthOverride } from "./helpers/mock-routes";
import type { RecipeDetail } from "../../types/recipe";

function ownerRecipe(originId: string | null): Partial<RecipeDetail> {
  return { source_type: "manual", visibility: "private", origin_recipe_id: originId,
    edit_context: { base_recipe_revision: 1, image_object_id: null,
      draft: { title: "내 두부찌개", description: null, base_servings: 2, ingredients: [], steps: [] } } };
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
});

test("an authored private original reports publication only after a successful explicit request", async ({ page }, testInfo) => {
  const recipeDetail = ownerRecipe(null);
  await installRecipeDetailRoutes(page, { recipeDetail });
  let attempts = 0;
  let release!: () => void;
  await page.route(`**/api/v1/recipes/${RECIPE_ID}/publish`, async (route) => {
    expect(route.request().method()).toBe("POST");
    attempts += 1;
    if (attempts === 1) {
      await new Promise<void>((resolve) => { release = resolve; });
      await route.fulfill({ status: 503, json: { success: false, data: null, error: { code: "INTERNAL_ERROR", message: "공개 등록이 완료되지 않았어요.", fields: [] } } });
    } else {
      recipeDetail.visibility = "public";
      await route.fulfill({ json: { success: true, data: { id: RECIPE_ID, visibility: "public" }, error: null } });
    }
  });
  await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
  const action = page.getByRole("button", { name: "공개하여 검색·공유하기" });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page.getByRole("button", { name: "공개 준비 중…" })).toBeDisabled();
  expect(attempts).toBe(1);
  await expect(page.getByText("공개했어요. 홈에서 검색하고 링크로 공유할 수 있어요.")).toHaveCount(0);
  release();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(attempts).toBe(1);
  await action.click();
  await expect(page.getByText("공개 레시피", { exact: true })).toBeVisible();
  await expect(action).toHaveCount(0);
  expect(attempts).toBe(2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("manual-recipe-published-375.png") });
});

test("a personal fork never offers publishing the source as an authored original", async ({ page }, testInfo) => {
  await installRecipeDetailRoutes(page, { recipeDetail: ownerRecipe("00000000-0000-4000-8000-000000000002") });
  await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
  await expect(page.getByRole("button", { name: "편집", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "공개하여 검색·공유하기" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("personal-fork-no-publish-375.png") });
});
