import { expect, test } from "@playwright/test";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";
const session = "550e8400-e29b-41d4-a716-446655440801";
const recipeId = "550e8400-e29b-41d4-a716-446655440802";
const ingredientId = "550e8400-e29b-41d4-a716-446655440803";
const assumptions = ["mix_tags_imply_no_heat", "all_declared_inputs_retained", "unreported_drainage_leftovers_container_added_media_unknown"];
const recipe = { id: recipeId, title: "선택 전체무게 확인 요리", cooking_servings: 2,
  ingredients: [{ ingredient_id: ingredientId, standard_name: "채소", amount: 300, unit: "g", display_text: "채소 300g", ingredient_type: "QUANT", scalable: true }],
  steps: [{ step_number: 1, instruction: "채소 300g을 섞어요.", cooking_method: { code: "MIX", label: "섞기", color_key: "green" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null }] };
test.beforeEach(async ({ page }) => {
  const url = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local fixture only");
  await setE2EAuthOverride(page);
  await page.route("**/api/v1/**", route => route.fulfill({ status: 501, json: { success: false, data: null, error: { code: "QA_ONLY", message: "QA", fields: [] } } }));
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", route => route.fulfill({ json: { success: true, error: null,
    data: { session_id: session, contract_version: "snapshot_v2", mode: "standalone", status: "in_progress", recipe, pantry_candidates: [], weight_evidence_enabled: true,
      weight_prediction: { source: "conditional_estimate", predicted_g: 300, model_version: "bounded-weight-v2", reason_codes: [], assumption_codes: assumptions } } } }));
});
for (const width of [320, 375, 1280, 1440]) {
  test(`optional whole-weight report stays blank and retryable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: { body: unknown; key: string | undefined }[] = [];
    let releaseRetryResponse = () => {};
    await page.route("**/api/v1/cooking/session-attempts/*/complete", async route => {
      writes.push({ body: route.request().postDataJSON(), key: route.request().headers()["idempotency-key"] });
      if (writes.length === 2) await new Promise<void>(resolve => { releaseRetryResponse = resolve; });
      return route.fulfill({ status: 409, json: { success: false, data: null, error: { code: "CONFLICT", message: "선택 실측을 다시 확인해 주세요.", fields: [] } } });
    });
    await page.goto(`/cooking/session-attempts/${session}/cook-mode`);
    await expect(page.getByTestId("snapshot-v2-cook-mode")).toBeVisible();
    await page.getByRole("button", { name: "요리 완료", exact: true }).click();
    const number = page.getByRole("spinbutton");
    await expect(number).toHaveCount(1);
    await expect(number).toHaveValue("");
    await expect(number).not.toHaveAttribute("required");
    await expect(page.getByText(/약 300g.*실측값이 아니에요/)).toBeVisible();
    await expect(page.getByText(/가열 없는 섞기 단계와 적힌 재료가 모두 남는다는 가정/)).toBeVisible();
    await expect(page.getByText(/용기 무게를 빼고, 먹을 국물은 포함/)).toBeVisible();
    await expect(page.getByRole("button", { name: "완료 저장", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`weight-${width}-blank.png`) });
    await number.fill("200");
    await page.getByRole("button", { name: "완료 저장", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("선택 실측을 다시 확인해 주세요.");
    await expect(number).toHaveValue("200");
    await page.screenshot({ path: testInfo.outputPath(`weight-${width}-retry.png`) });
    const retryResponse = page.waitForResponse(response => response.url().endsWith(`/session-attempts/${session}/complete`));
    await page.getByRole("button", { name: "완료 저장", exact: true }).click();
    await expect.poll(() => writes.length).toBe(2);
    await expect(number).toBeDisabled();
    releaseRetryResponse();
    await retryResponse;
    await expect(number).toBeEnabled();
    await expect(page.getByRole("alert")).toBeFocused();
    expect(writes[0]).toEqual(writes[1]);
    expect(writes[0].body).toEqual({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 200, weight_input_source: "reported_measured" });
    await number.fill("");
    await expect(number).toHaveValue("");
    await page.getByRole("button", { name: "완료 저장", exact: true }).click();
    await expect.poll(() => writes.length).toBe(3);
    expect(writes[2].body).toEqual({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
    expect(writes[2].key).not.toBe(writes[0].key);
  });
}

for (const width of [320, 375, 1280, 1440]) {
  test(`meal detail reads its frozen whole-weight evidence at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installAccountLibraryVisualRoutes(page);
    const date = "2026-10-13";
    const column = "550e8400-e29b-41d4-a716-446655440804";
    const nutrition = { calculation_status: "complete", calories_kcal: 500, carbohydrate_g: 50, protein_g: 25, fat_g: 10, sodium_mg: 500 };
    const entry = { id: "550e8400-e29b-41d4-a716-446655440805", revision: 1, consumed_at: null, consumed_local_date: date, timezone_name_snapshot: "Asia/Seoul",
      meal_plan_column_id: column, slot_name_snapshot: "아침", source: { type: "cooked_batch", id: session }, quantity: { amount: 100, unit: "g" }, display_name: "저장된 요리", display_brand: null,
      nutrition: { ...nutrition, weight_basis: { schema_version: "cooked-weight-basis-v1", batch_id: session, recipe_content_snapshot_id: null, finished_weight_g: 200,
        source: "conditional_estimate", model_version: "historical-frozen-model", prediction_id: null, observation_id: null, batch_revision: 1 }, weight_assumption_codes: assumptions }, created_at: `${date}T00:00:00Z`, updated_at: `${date}T00:00:00Z` };
    await page.route("**/api/v1/meal-log?*", route => {
      const day = new URL(route.request().url()).searchParams.get("date"); const entries = day === date ? [entry] : [];
      return route.fulfill({ json: { success: true, error: null, data: { date: day, active_columns: [{ id: column, name: "아침", sort_order: 0 }],
        active_sections: [{ meal_plan_column_id: column, slot_name_snapshot: "아침", sort_order: 0, entries, subtotal: nutrition, incomplete_count: 0 }], deleted_column_sections: [], entries, day_total: { ...nutrition, incomplete_count: 0 } } } });
    });
    let liveBatchReads = 0;
    await page.route("**/api/v1/cooked-batches**", route => { liveBatchReads += 1; return route.fulfill({ status: 501, json: { success: false, data: null, error: { code: "QA_ONLY", message: "현재 배치 읽기 불가", fields: [] } } }); });
    await page.goto(`/planner?segment=log&date=${date}`);
    await page.getByRole("button", { name: "아침의 저장된 요리 식사 기록 상세", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "식사 기록 상세", exact: true });
    const basis = dialog.getByRole("region", { name: "기록 당시 전체무게 근거", exact: true });
    await basis.scrollIntoViewIfNeeded();
    await expect(basis).toContainText("200g"); await expect(basis).toContainText("조건별 추정"); await expect(basis).toContainText("가열 없는 섞기 단계");
    await expect(dialog.getByText("100g", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("region", { name: "기록한 음식 영양정보", exact: true })).toContainText("500");
    expect(liveBatchReads).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`meal-weight-${width}.png`) });
  });
}
