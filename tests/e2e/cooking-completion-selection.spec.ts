import { expect, test } from "@playwright/test";
import { installAccountLibraryVisualRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

for (const mode of ["planner", "standalone"] as const) {
  test(`${mode} completion selects exact pantry rows without a weight form`, async ({ page }, testInfo) => {
    test.skip(!["mobile-chrome", "desktop-chrome"].includes(testInfo.project.name));
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
    if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Completion fixtures require loopback preview");
    await page.setViewportSize(testInfo.project.name === "mobile-chrome" ? { width: 375, height: 812 } : { width: 1440, height: 1000 });
    await page.route("**/api/v1/**", (route) => route.fulfill({ status: 501, json: { success: false, data: null, error: { code: "QA_FIXTURE_MISSING", message: "Missing fixture", fields: [] } } }));
    await setE2EAuthOverride(page);
    await installAccountLibraryVisualRoutes(page);
    const sessionId = "51000000-0000-4000-8000-000000000001";
    const recipeId = "52000000-0000-4000-8000-000000000001";
    const ingredientId = "53000000-0000-4000-8000-000000000001";
    const candidate = (index: number, name: string, brand: string | null) => ({
      pantry_item_id: `54000000-0000-4000-8000-00000000000${index}`,
      ingredient_id: ingredientId, item_type: "food_product", standard_name: "두부",
      food_product_id: `55000000-0000-4000-8000-00000000000${index}`,
      food_product_nutrition_version_id: `56000000-0000-4000-8000-00000000000${index}`, name, brand,
    });
    const candidates = [candidate(1, "단단한 두부", "브랜드 A"), candidate(2, "부드러운 두부", "브랜드 B")];
    const snapshot = {
      session_id: sessionId, contract_version: "snapshot_v2", mode, status: "in_progress",
      recipe: { id: recipeId, title: "두부 요리", cooking_servings: 2,
        ingredients: [{ ingredient_id: ingredientId, standard_name: "두부", amount: 600, unit: "g", display_text: "두부 600g", ingredient_type: "QUANT", scalable: true }],
        steps: [{ step_number: 1, instruction: "두부를 구워요", cooking_method: { code: "grill", label: "굽기", color_key: "brown" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null }],
      }, pantry_candidates: candidates,
    };
    let pantryReads = 0;
    let pantryUpdated = false;
    let sessionCreates = 0;
    await page.route(`**/api/v1/cooking/session-attempts/${sessionId}/cook-mode`, (route) => { ++pantryReads; return route.fulfill({ json: { success: true, data: { ...snapshot, pantry_candidates: pantryUpdated ? candidates : [] }, error: null } }); });
    if (mode === "standalone") {
      await page.route(`**/api/v1/recipes/${recipeId}`, route => route.fulfill({ json: { success: true, data: { id: recipeId, revision: 4 }, error: null } }));
      await page.route("**/api/v1/cooking/session-attempts", async route => {
        ++sessionCreates;
        expect(route.request().postDataJSON()).toEqual({ mode: "standalone", recipe_id: recipeId, expected_recipe_revision: 4, cooking_servings: 2 });
        await route.fulfill({ json: { success: true, data: { session_id: sessionId, contract_version: "snapshot_v2", mode, status: "in_progress", content_summary: { recipe_id: recipeId, title: "두부 요리", cooking_servings: 2 } }, error: null } });
      });
    }
    const submissions: unknown[] = [];
    await page.route(`**/api/v1/cooking/session-attempts/${sessionId}/complete`, async (route) => {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({ json: { success: true, error: null, data: {
        session_id: sessionId, contract_version: "snapshot_v2", mode, status: "completed", meals_updated: mode === "planner" ? 1 : 0, pantry_removed: 1, cook_count: 1,
        cooked_batch: { id: "57000000-0000-4000-8000-000000000001", recipe_id: recipeId, recipe_title: "두부 요리", recipe_thumbnail_url: null,
          status: "leftover", cooked_at: "2026-09-27T00:00:00Z", cooking_servings: 2, finished_weight_g: 450, remaining_weight_g: 450,
          weight_status: "known", weight_source: "estimated", batch_status: "available", depleted_reason: null, revision: 1, nutrition_calculation_status: "complete", current_unweighed_closure_event_id: null },
      } } });
    });
    await page.goto(mode === "standalone" ? `/cooking/recipes/${recipeId}/cook-mode?servings=2` : `/cooking/session-attempts/${sessionId}/cook-mode`);
    await expect(page).toHaveURL(new RegExp(`/cooking/session-attempts/${sessionId}/cook-mode`));
    await expect(page.getByRole("button", { name: "요리 완료", exact: true })).toBeVisible();
    const readsBeforeCompletion = pantryReads;
    pantryUpdated = true;
    await page.getByRole("button", { name: "요리 완료", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "요리 완료", exact: true });
    await expect(sheet).toBeVisible();
    expect(pantryReads).toBeGreaterThan(readsBeforeCompletion);
    if (mode === "standalone") expect(sessionCreates).toBe(1);
    await expect(sheet.getByRole("radio")).toHaveCount(0);
    await expect(sheet.getByRole("spinbutton")).toHaveCount(0);
    await expect(sheet.getByText("단단한 두부", { exact: true })).toHaveCount(1);
    await expect(sheet.getByText("두부", { exact: true })).toHaveCount(0);
    await sheet.getByRole("checkbox", { name: "팬트리 항목 전체 선택" }).click();
    await sheet.getByRole("checkbox", { name: "부드러운 두부 브랜드 B 선택" }).uncheck();
    await expect(sheet.getByTestId("consumed-bulk-toggle")).toHaveAttribute("aria-checked", "mixed");
    await sheet.getByRole("checkbox", { name: "팬트리 항목 전체 선택" }).click();
    await sheet.getByRole("checkbox", { name: "팬트리 항목 전체 해제" }).click();
    await sheet.getByRole("checkbox", { name: "단단한 두부 브랜드 A 선택" }).check();
    await expect(sheet.getByTestId("cooked-batch-completion-actions").getByRole("button")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath(`${mode}-completion.png`), scale: "css" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await sheet.getByRole("button", { name: "완료 저장" }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toEqual({ consumed_pantry_item_ids: [candidates[0].pantry_item_id], weight_action: "weigh_later", finished_weight_g: null });
    await expect(page.getByRole("link", { name: "식사 기록하기" })).toBeVisible();
  });
}
