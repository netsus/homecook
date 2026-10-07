import { expect, test } from "@playwright/test";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";
import { installEmptyYoutubeNotificationRoutes } from "./helpers/youtube-background-extraction";

const date = "2026-10-05";
const columnId = "20000000-0000-4000-8000-000000000001";
const readyId = "10000000-0000-4000-8000-000000000001";
const registeredId = "10000000-0000-4000-8000-000000000002";
const recipeId = "30000000-0000-4000-8000-000000000001";
const wholePath = `/planner/${date}/${columnId}?slot=${encodeURIComponent("점심")}&returnTo=${encodeURIComponent(`/planner?date=${date}`)}`;
const success = (data: unknown) => ({ success: true, data, error: null });
const value = (amount: number) => ({ amount, known_amount: null, status: "complete", display_mode: "total" });

for (const width of [375, 1280]) {
  test(`planned meal detail preserves date, pinned recipe and guarded actions ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
    if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Local QA only");
    await page.setViewportSize({ width, height: 812 });
    await setE2EAuthOverride(page);
    await installAccountLibraryVisualRoutes(page);
    await installEmptyYoutubeNotificationRoutes(page);
    await page.route("**/api/v1/users/me/action-notifications?*", route => route.fulfill({ json: success({ items: [], next_cursor: null, has_next: false, unread_count: 0 }) }));
    let items = [
      { id: readyId, recipe_id: recipeId, recipe_title: "김치찌개", recipe_thumbnail_url: null, planned_servings: 2, status: "shopping_done", shopping_list_id: null, is_leftover: false, revision: 1 },
      { id: registeredId, recipe_id: recipeId, recipe_title: "계란말이", recipe_thumbnail_url: null, planned_servings: 2, status: "registered", shopping_list_id: null, is_leftover: false, revision: 1 },
    ];
    let patchCalls = 0;
    let deleteCalls = 0;
    await page.route("**/api/v1/meals?*", route => route.fulfill({ json: success({ items, product_entries: [] }) }));
    await page.route(`**/api/v1/meals/${readyId}`, async route => {
      if (route.request().method() === "PATCH") {
        patchCalls += 1;
        await route.fulfill({ status: 409, json: { success: false, data: null, error: { code: "MEAL_STATE_CONFLICT", message: "최신 계획을 다시 확인해 주세요.", fields: [] } } });
      } else if (route.request().method() === "DELETE") {
        deleteCalls += 1;
        items = items.filter(item => item.id !== readyId);
        await route.fulfill({ status: 204, body: "" });
      } else await route.fallback();
    });
    const nutrition = { basis: { amount: 1, unit: "range" }, values: { energy_kcal: value(1020), carbohydrate_g: value(110), protein_g: value(50), fat_g: value(42), sodium_mg: value(700) }, calculation_status: "complete", calculation_quality: "direct", incomplete_entry_count: 0, warnings: [], sources: [] };
    await page.route("**/api/v1/planner/nutrition?*", route => route.fulfill({ json: success({ range: { start_date: date, end_date: date }, summary: { nutrition, recipe_entry_count: items.length, product_entry_count: 0 }, days: [{ plan_date: date, nutrition, columns: [{ column_id: columnId, nutrition }] }] }) }));
    await page.route(`**/api/v1/meals/${readyId}/recipe-snapshot`, route => route.fulfill({ json: success({ meal_id: readyId, recipe_id: recipeId, title: "저장 당시 김치찌개", planned_servings: 2, ingredients: [{ ingredient_id: recipeId, standard_name: "신김치", ingredient_type: "QUANT", amount: 200, unit: "g", component_label: null }], steps: [{ step_number: 1, instruction: "저장 당시 방법으로 끓여 주세요.", component_label: null, duration_text: null, duration_seconds: null, heat_level: null }] }) }));

    await page.goto(wholePath);
    await expect(page.getByRole("button", { name: "김치찌개 요리 시작" })).toBeVisible();
    await expect(page.getByRole("button", { name: "장보기", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /이 계획에서 삭제/ })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "인분 조절" })).toHaveCount(2);
    await expect(page.getByTestId("meal-compact-nutrition")).toContainText("1,020 kcal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`whole-meal-${width}.png`) });

    await page.getByTestId("meal-screen-add-cta").click();
    const sheet = page.getByTestId("meal-screen-meal-add-sheet");
    await expect(sheet.getByRole("button", { name: /팬트리에서 찾기/ })).toBeVisible();
    await expect(sheet).toContainText("10/5 점심");
    await expect(sheet.getByTestId("meal-add-option-product")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`add-meal-${width}.png`) });
    await sheet.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page).toHaveURL(wholePath);

    await page.getByTestId(`meal-recipe-link-${readyId}`).click();
    await expect(page).toHaveURL(new RegExp(`mealId=${readyId}`));
    const focused = new URL(page.url());
    expect(focused.searchParams.get("returnTo")).toBe(wholePath);
    await expect(page.getByRole("heading", { name: "계획한 요리" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "김치찌개", exact: true })).toBeVisible();
    await expect(page.getByText("계란말이", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "김치찌개 이 계획에서 삭제" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`planned-food-${width}.png`) });

    await page.getByTestId(`meal-recipe-link-${readyId}`).click();
    await expect(page).toHaveURL(new RegExp(`/meal/${readyId}/recipe`));
    expect(new URL(new URL(page.url()).searchParams.get("returnTo")!, origin).searchParams.get("mealId")).toBe(readyId);
    await expect(page.getByRole("heading", { name: "저장 당시 김치찌개" })).toBeVisible();
    await expect(page.getByText("저장 당시 방법으로 끓여 주세요.")).toBeVisible();
    await page.getByRole("button", { name: "이전 화면" }).click();
    await expect(page).toHaveURL(focused.href);

    await page.getByRole("button", { name: "인분 증가" }).click();
    const confirmation = page.getByRole("dialog", { name: "인분 변경" });
    await expect(confirmation).toBeVisible();
    expect(patchCalls).toBe(0);
    await confirmation.getByRole("button", { name: "취소", exact: true }).click();
    expect(patchCalls).toBe(0);
    await page.getByRole("button", { name: "인분 증가" }).click();
    await page.getByTestId("serving-change-confirm").click();
    await expect(page.getByRole("article", { name: "김치찌개 식사 카드" }).getByRole("alert")).toContainText("변경 중 충돌");
    expect(patchCalls).toBe(1);
    await expect(page.getByRole("group", { name: "인분 조절" })).toContainText("2인분");

    await page.reload();
    await expect(page.getByRole("article", { name: "김치찌개 식사 카드" }).getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "김치찌개 이 계획에서 삭제" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "10월 5일 점심" });
    await expect(deleteDialog).not.toContainText("이 요리계획만 삭제하고 레시피는 남겨둬요.");
    await expect(deleteDialog.getByRole("heading", { name: "김치찌개", exact: true })).toBeVisible();
    await expect(deleteDialog.getByRole("button", { name: "삭제", exact: true })).toHaveCSS("min-height", "48px");
    await page.screenshot({ path: testInfo.outputPath(`delete-plan-${width}.png`) });
    await page.getByTestId("delete-confirm").click();
    await expect(page).toHaveURL(`/planner?date=${date}`);
    expect(deleteCalls).toBe(1);
  });
}
