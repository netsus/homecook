import { expect, test, type Page } from "@playwright/test";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";
import { installEmptyYoutubeNotificationRoutes } from "./helpers/youtube-background-extraction";

const date = "2026-10-06";
const columnId = "20000000-0000-4000-8000-000000000001";
const recipeId = "30000000-0000-4000-8000-000000000001";
const batchId = "40000000-0000-4000-8000-000000000001";
const entryId = "10000000-0000-4000-8000-000000000001";
const columns = [{ id: columnId, name: "아침", sort_order: 0 }];
const success = (data: unknown) => ({ success: true, data, error: null });
const nutrient = (amount: number) => ({ amount, known_amount: amount, status: "complete", display_mode: "total" });
const nutrition = { calculation_status: "complete", calories_kcal: 250, carbohydrate_g: 20, protein_g: 20, fat_g: 10, sodium_mg: 300 };
const recipe = { id: recipeId, title: "김치찌개", thumbnail_url: null, tags: [], base_servings: 2, source_type: "system", view_count: 4, like_count: 0, save_count: 0 };
const detail = { ...recipe, steps: [], ingredients: [{ id: "ingredient-rice", standard_name: "쌀", ingredient_type: "QUANT", amount: 200, unit: "g", scalable: true }], nutrition: { basis: { amount: 1, unit: "serving" }, base_servings: 2, values: { energy_kcal: nutrient(500) }, scalable_values: { energy_kcal: 400 }, fixed_values: { energy_kcal: 100 }, calculation_status: "complete", calculation_quality: "direct", availability_reason: null, warnings: [], sources: [] } };
const batch = { id: batchId, recipe_id: recipeId, recipe_title: "김치찌개", recipe_thumbnail_url: null, status: "leftover", cooked_at: `${date}T00:00:00Z`, cooking_servings: 2, finished_weight_g: 800, remaining_weight_g: 600, weight_status: "known", weight_source: "estimated", batch_status: "available", depleted_reason: null, revision: 1, nutrition_calculation_status: "complete", current_unweighed_closure_event_id: null };

async function install(page: Page, width: number) {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3200");
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Local fixture UI only");
  await page.setViewportSize({ width, height: 812 });
  await page.addInitScript(({ width }) => {
    // Synthetic viewport resize exercises layout response, not a real iPhone keyboard.
    const viewport = Object.assign(new EventTarget(), { height: 812, width, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  }, { width });
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
  await installEmptyYoutubeNotificationRoutes(page);
  await page.route("**/api/v1/users/me/action-notifications?*", route => route.fulfill({ json: success({ items: [], next_cursor: null, has_next: false, unread_count: 0 }) }));
  await page.route("**/api/v1/planner/columns", route => route.fulfill({ json: success({ columns }) }));
  await page.route("**/api/v1/planner/nutrition?*", route => route.fulfill({ json: success({ days: [] }) }));
  await page.route("**/api/v1/recipes/pantry-match*", route => route.fulfill({ json: success({ items: [{ ...recipe, match_score: 0.8, matched_ingredients: 4, total_ingredients: 5, missing_ingredients: [{ id: "salt", standard_name: "소금" }] }] }) }));
  await page.route("**/api/v1/recipes?*", route => route.fulfill({ json: success({ items: [recipe], next_cursor: null, has_next: false }) }));
  await page.route(`**/api/v1/recipes/${recipeId}?view=preview`, route => route.fulfill({ json: success(detail) }));
}

for (const width of [375, 1280]) {
  test(`plan add sheet preserves pantry/search context and retry key ${width}px`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await install(page, width);
    let saved = false;
    const attempts: Array<{ key: string | undefined; body: Record<string, unknown> }> = [];
    await page.route("**/api/v1/planner?*", route => route.fulfill({ json: success({ columns, meals: saved ? [{ id: "50000000-0000-4000-8000-000000000001", recipe_id: recipeId, recipe_title: "김치찌개", recipe_thumbnail_url: null, plan_date: date, column_id: columnId, planned_servings: 3, status: "registered", is_leftover: false, shopping_list_id: null, shopping_list_title: null }] : [] }) }));
    await page.route("**/api/v1/meals", async route => {
      const body = route.request().postDataJSON();
      attempts.push({ key: route.request().headers()["idempotency-key"], body });
      if (attempts.length === 1) return route.fulfill({ status: 503, json: { success: false, data: null, error: { code: "SERVICE_UNAVAILABLE", message: "잠시 후 다시 시도해 주세요.", fields: [] } } });
      saved = true;
      return route.fulfill({ status: 201, json: success({ ...body, id: "50000000-0000-4000-8000-000000000001", status: "registered", is_leftover: false, leftover_dish_id: null, recipe_nutrition_snapshot_id: null }) });
    });
    await page.goto(`/planner?date=${date}`);
    const add = page.getByRole("button", { name: /10\/6 아침 식사 추가/ });
    await add.click();
    const options = page.getByRole("dialog", { name: "식사 추가" });
    await expect(options).toContainText("10/6 아침");
    for (const source of ["search", "recipebook", "pantry", "youtube", "manual"]) await expect(options.getByTestId(`meal-add-option-${source}`)).toBeVisible();
    await page.screenshot({ path: info.outputPath("plan-source-options.png") });
    await options.getByRole("button", { name: "팬트리에서 찾기" }).click();
    await page.getByRole("button", { name: "김치찌개 선택" }).click();
    const quantity = page.getByRole("dialog", { name: "계획에 추가" });
    await expect(quantity).toContainText("10/6 아침");
    await expect(quantity).toContainText("500 kcal");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await quantity.getByRole("button", { name: "인분 늘리기" }).click();
    await expect(quantity).toContainText("700 kcal");
    await quantity.getByText("재료 1개 보기").click();
    await expect(quantity).toContainText("쌀 300g");
    await page.screenshot({ path: info.outputPath("plan-pantry-quantity.png") });
    await quantity.getByRole("button", { name: "레시피 바꾸기" }).click();
    await expect(page.getByRole("dialog", { name: "팬트리 기반 추천" })).toBeVisible();
    await page.getByRole("button", { name: "김치찌개 선택" }).click();
    await expect(quantity.getByLabel("3인분")).toBeVisible();
    await quantity.getByRole("button", { name: "닫기", exact: true }).click();
    await quantity.getByRole("button", { name: "변경사항 버리기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await add.click();
    await page.getByTestId("meal-add-option-search").click();
    const search = page.getByRole("textbox", { name: "레시피 검색" });
    await search.fill("김치");
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await page.getByRole("button", { name: "김치찌개 선택" }).click();
    await quantity.getByRole("button", { name: "레시피 바꾸기" }).click();
    await expect(search).toHaveValue("김치");
    await page.getByRole("button", { name: "김치찌개 선택" }).click();
    await quantity.getByRole("button", { name: "인분 늘리기" }).click();
    await quantity.getByRole("button", { name: "추가하기", exact: true }).click();
    await expect(quantity.getByRole("alert")).toContainText("잠시 후");
    await expect(quantity.getByLabel("3인분")).toBeVisible();
    await quantity.getByRole("button", { name: "추가하기", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId(`planner-day-card-${date}`)).toContainText("김치찌개");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]!.body).toMatchObject({ plan_date: date, column_id: columnId, planned_servings: 3 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test(`meal add source amount preview and bounded keyboard viewport ${width}px`, async ({ page }, info) => {
    test.setTimeout(90_000);
    await install(page, width);
    let entry: Record<string, unknown> | null = null;
    const posts: Record<string, unknown>[] = [];
    const previews: string[] = [];
    await page.route("**/api/v1/planner?*", route => route.fulfill({ json: success({ columns, meals: [] }) }));
    await page.route("**/api/v1/meal-log?*", route => {
      const requested = new URL(route.request().url()).searchParams.get("date")!;
      const entries = requested === date && entry ? [entry] : [];
      return route.fulfill({ json: success({ date: requested, active_columns: columns, active_sections: [{ meal_plan_column_id: columnId, slot_name_snapshot: "아침", sort_order: 0, entries, subtotal: nutrition, incomplete_count: 0 }], deleted_column_sections: [], entries, day_total: { ...nutrition, incomplete_count: 0 } }) });
    });
    await page.route("**/api/v1/meal-log/recent?*", route => route.fulfill({ json: success({ items: [], next_cursor: null, has_next: false }) }));
    await page.route("**/api/v1/cooked-batches*", route => route.fulfill({ json: success({ items: [batch], next_cursor: null, has_next: false }) }));
    await page.route("**/api/v1/meal-log/nutrition-preview?*", route => {
      const params = new URL(route.request().url()).searchParams;
      previews.push(params.get("amount")!);
      return route.fulfill({ json: success({ source: { type: params.get("source_type"), id: params.get("source_id") }, quantity: { amount: Number(params.get("amount")), unit: params.get("unit") }, nutrition }) });
    });
    await page.route("**/api/v1/meal-log/entries", route => {
      const body = route.request().postDataJSON(); posts.push(body);
      entry = { id: entryId, revision: 1, consumed_at: null, consumed_local_date: date, timezone_name_snapshot: "Asia/Seoul", meal_plan_column_id: columnId, slot_name_snapshot: "아침", source: body.source, quantity: body.quantity, display_name: "김치찌개", display_brand: null, nutrition, created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z` };
      return route.fulfill({ status: 201, json: success({ entry }) });
    });
    await page.goto(`/planner?segment=log&date=${date}`);
    await page.getByRole("button", { name: "아침에 먹은 음식 추가" }).click();
    const sheet = page.getByRole("dialog", { name: "먹은 음식 추가" });
    await expect(sheet).toContainText("10월 6일 아침");
    await expect(sheet.getByRole("tab", { name: "최근", exact: true })).toHaveAttribute("aria-selected", "true");
    await sheet.getByRole("tab", { name: "요리한 음식", exact: true }).click();
    await page.screenshot({ path: info.outputPath("meal-picker.png") });
    await sheet.getByRole("button", { name: /김치찌개/ }).click();
    await expect(sheet.getByRole("tab")).toHaveCount(0);
    await expect(sheet.locator('input[type="date"], select')).toHaveCount(0);
    const amount = sheet.getByRole("textbox", { name: "먹은 양" });
    await amount.fill("250");
    await expect(sheet.getByRole("region", { name: "입력한 양의 영양 미리보기" })).toContainText("250g 기준");
    await expect(sheet).toContainText("350g");
    await expect(sheet.getByRole("img")).toHaveCSS("height", "4px");
    await expect.poll(() => sheet.boundingBox().then(box => box?.y ?? 0)).toBeGreaterThan(32);
    await page.screenshot({ path: info.outputPath("meal-amount-preview.png") });
    await amount.focus();
    await page.evaluate(() => { Object.assign(window.visualViewport!, { height: 420 }); window.visualViewport!.dispatchEvent(new Event("resize")); });
    await expect.poll(() => sheet.boundingBox().then(box => (box?.y ?? 0) + (box?.height ?? 0))).toBeLessThanOrEqual(420);
    if (width < 768) expect(await amount.evaluate(node => getComputedStyle(node).fontSize)).toBe("16px");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await sheet.getByRole("button", { name: "기록 저장" }).scrollIntoViewIfNeeded();
    await expect(sheet.getByRole("button", { name: "기록 저장" })).toBeInViewport();
    await page.screenshot({ path: info.outputPath("meal-synthetic-keyboard.png") });
    await page.evaluate(() => { Object.assign(window.visualViewport!, { height: 812 }); window.visualViewport!.dispatchEvent(new Event("resize")); });
    await sheet.getByRole("button", { name: "기록 저장" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator(`[data-planner-date="${date}"]`)).toContainText("김치찌개");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ consumed_local_date: date, meal_plan_column_id: columnId, quantity: { amount: 250, unit: "g" }, source: { type: "cooked_batch", id: batchId } });
    expect(previews).toContain("250");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
