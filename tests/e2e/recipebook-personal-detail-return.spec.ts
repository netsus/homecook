import { expect, test } from "@playwright/test";
import {
  installAccountLibraryVisualRoutes,
  installRecipeDetailRoutes,
  RECIPE_ID,
  setE2EAuthOverride,
} from "./helpers/mock-routes";

test("personal book opens recipe details and returns to the remaining page after deletion", async ({ page }, testInfo) => {
  test.skip(!["mobile-chrome", "desktop-chrome"].includes(testInfo.project.name));
  const base = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
  if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Recipe book fixture requires loopback preview");
  await page.setViewportSize(testInfo.project.name === "mobile-chrome" ? { width: 375, height: 812 } : { width: 1440, height: 1000 });
  // All browser API calls are fixtures; omitted endpoints cannot reach real data.
  await page.route("**/api/v1/**", (route) => route.fulfill({ status: 501, json: { success: false, data: null, error: { code: "QA_FIXTURE_MISSING", message: "Missing fixture", fields: [] } } }));
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  await installRecipeDetailRoutes(page, { recipeDetail: {
    title: "내 개인 김치찌개", revision: 12,
    edit_context: { base_recipe_revision: 12, image_object_id: null, draft: {
      title: "내 개인 김치찌개", description: null, base_servings: 2, ingredients: [], steps: [],
    } },
  } });
  let deleted = false;
  let deleteCalls = 0;
  const allItems = [
    { recipe_id: RECIPE_ID, title: "내 개인 김치찌개", thumbnail_url: null, tags: [], base_servings: 2, added_at: "2026-09-27T00:00:00.000Z" },
    { recipe_id: "remaining-recipe", title: "남겨 둔 레시피", thumbnail_url: null, tags: [], base_servings: 1, added_at: "2026-09-26T00:00:00.000Z" },
  ];
  await page.route("**/api/v1/recipe-books/book-my/recipes**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const recipeId = path.split("/").at(-1);
    const data = recipeId === "recipes"
      ? { items: deleted ? allItems.slice(1) : allItems, has_next: false, next_cursor: null }
      : { ...allItems.find((item) => item.recipe_id === recipeId), ingredients: [], steps: [] };
    return route.fulfill({ json: { success: true, data, error: null } });
  });
  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deleted = true;
    deleteCalls += 1;
    await route.fulfill({ json: { success: true, data: { deleted: true }, error: null } });
  });

  await page.goto(`/mypage/recipe-books/book-my?type=my_added&name=${encodeURIComponent("내가 추가한 레시피")}&readerMode=book&readerRecipe=${RECIPE_ID}`);
  const detailLink = page.getByRole("link", { name: "레시피 상세", exact: true });
  await expect(detailLink).toBeVisible();
  const detailHref = await detailLink.getAttribute("href");
  const returnTo = new URL(detailHref!, base).searchParams.get("returnTo")!;
  expect(new URL(returnTo, base).searchParams.get("readerRecipe")).toBe(RECIPE_ID);
  expect(new URL(returnTo, base).searchParams.get("readerMode")).toBe("book");
  await page.screenshot({ path: testInfo.outputPath("book-detail-entry.png"), fullPage: true, scale: "css" });
  await detailLink.click();
  await expect(page).toHaveURL(new RegExp(`/recipe/${RECIPE_ID}\\?`));
  // The loopback QA feature flag enables owner controls without production state.
  const detailUrl = new URL(page.url());
  detailUrl.searchParams.set("qaFutureImpact", "1");
  await page.goto(detailUrl.toString());
  const management = page.getByRole("region", { name: "레시피 관리", exact: true }).filter({ has: page.getByRole("button", { name: "삭제", exact: true }) });
  await expect(management.getByRole("link", { name: "마이 · 내가 추가한 레시피" })).toBeVisible();
  await management.screenshot({ path: testInfo.outputPath("recipe-owner-management.png"), scale: "css" });
  await page.screenshot({ path: testInfo.outputPath("recipe-owner-management-viewport.png"), fullPage: false, scale: "css" });
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "정말 레시피를 삭제할까요?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page).toHaveURL(/\/mypage\/recipe-books\/book-my\?/);
  await expect(page.getByTestId("recipe-item-remaining-recipe")).toBeVisible();
  await expect(page.getByTestId(`recipe-item-${RECIPE_ID}`)).toHaveCount(0);
  expect(deleteCalls).toBe(1);
  expect(new URL(page.url()).searchParams.get("readerMode")).toBe("book");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("book-return-after-delete.png"), fullPage: true, scale: "css" });
});
