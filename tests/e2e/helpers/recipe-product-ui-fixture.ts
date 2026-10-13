import type { Page } from "@playwright/test";
import type { FoodCatalogProductData } from "../../../lib/api/food-catalog-search";
import type { RecipeDetail, RecipeEditDraft } from "../../../types/recipe";

export const PRODUCT_UI_IDS = {
  recipe: "550e8400-e29b-41d4-a716-446655440070",
  owner: "550e8400-e29b-41d4-a716-446655440071",
  rowA: "550e8400-e29b-41d4-a716-446655440081",
  rowB: "550e8400-e29b-41d4-a716-446655440082",
  productA: "550e8400-e29b-41d4-a716-446655440091",
  versionA: "550e8400-e29b-41d4-a716-446655440092",
  productB: "550e8400-e29b-41d4-a716-446655440093",
  versionB: "550e8400-e29b-41d4-a716-446655440094",
  generic: "550e8400-e29b-41d4-a716-446655440095",
};
export const PRODUCT_UI_MESSAGE = "지금은 선택한 제품 재료를 저장할 수 없어요. 입력 내용을 유지한 채 다시 시도해 주세요.";
export const PRODUCT_UI_CATALOG: FoodCatalogProductData[] = [
  { type: "food_product", id: PRODUCT_UI_IDS.productA, nutrition_version_id: PRODUCT_UI_IDS.versionA,
    name: "양조간장", brand: "원문 업체 A", recipe_ingredient_id: null, source_type: "public_dataset", visibility: "public", editable: false,
    basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } }],
    nutrition: { basis: { amount: 100, unit: "g" }, values: {}, calculation_status: "unavailable", calculation_quality: null, warnings: [], sources: [] } },
  { type: "food_product", id: PRODUCT_UI_IDS.productB, nutrition_version_id: PRODUCT_UI_IDS.versionB,
    name: "양조간장", brand: "원문 업체 B", recipe_ingredient_id: null, source_type: "public_dataset", visibility: "public", editable: false,
    basis_relations: [],
    nutrition: { basis: { amount: 100, unit: "g" }, values: {}, calculation_status: "unavailable", calculation_quality: null, warnings: [], sources: [] } },
];
export const PRODUCT_UI_DRAFT: RecipeEditDraft = {
  title: "제품 고정 간장 요리", description: null, base_servings: 1,
  ingredients: [{ row_key: PRODUCT_UI_IDS.rowA, source_kind: "food_product", ingredient_id: null,
    food_product_id: PRODUCT_UI_IDS.productA, food_product_nutrition_version_id: PRODUCT_UI_IDS.versionA,
    amount: 30, unit: "g", ingredient_type: "QUANT", scalable: true, display_text: "원문 업체 A · 양조간장", component_label: null }],
  steps: [{ step_number: 1, instruction: "원문 업체 A 양조간장 10g을 넣어요.", cooking_method_id: PRODUCT_UI_IDS.generic,
    cooking_method_ids: [PRODUCT_UI_IDS.generic], ingredients_used: [{ row_key: PRODUCT_UI_IDS.rowA, ingredient_id: null, amount: 10, unit: "g", cut_size: null }],
    component_label: null, heat_level: null, duration_seconds: null, duration_text: null }],
};

export const PRODUCT_UI_DETAIL: RecipeDetail = {
  id: PRODUCT_UI_IDS.recipe, title: PRODUCT_UI_DRAFT.title, description: null, base_servings: 1,
  thumbnail_url: null, source_type: "manual", visibility: "private", source: null, tags: [], revision: 1,
  view_count: 0, like_count: 0, save_count: 0, plan_count: 0, cook_count: 0, user_status: { is_liked: false, is_saved: false, saved_book_ids: [] },
  ingredients: [{ ...PRODUCT_UI_DRAFT.ingredients[0], id: PRODUCT_UI_IDS.rowA, standard_name: "원문 업체 A 양조간장", sort_order: 1 }],
  steps: [{ id: "step-1", step_number: 1, instruction: PRODUCT_UI_DRAFT.steps[0].instruction,
    ingredients_used: PRODUCT_UI_DRAFT.steps[0].ingredients_used, heat_level: null, duration_seconds: null, duration_text: null,
    cooking_method: { id: PRODUCT_UI_IDS.generic, code: "prep", label: "준비", color_key: "gray" } }],
  nutrition: { basis: { amount: 1, unit: "serving" }, values: {}, calculation_status: "unavailable", calculation_quality: null,
    availability_reason: "missing", warnings: ["RECIPE_NUTRITION_SNAPSHOT_MISSING"], sources: [] },
  edit_context: { base_recipe_revision: 1, image_object_id: null, draft: PRODUCT_UI_DRAFT },
};

export async function installRecipeProductUiFixture(page: Page, origin: string) {
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  const blockedOrigins: string[] = [];
  const unmatchedApis: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.context().addCookies([{ name: "homecook.e2e-auth-override", value: "authenticated", url: origin, sameSite: "Lax" }]);
  await page.addInitScript(() => localStorage.setItem("homecook.e2e-auth-override", "authenticated"));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      blockedOrigins.push(url.origin);
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    const path = url.pathname;
    const method = request.method();
    const ok = async (data: unknown) => route.fulfill({ json: { success: true, data, error: null } });
    const unavailable = async (manual = false) => route.fulfill({ status: 422, json: { success: false, data: null,
      error: { code: manual ? "VALIDATION_ERROR" : "RECIPE_PRODUCT_UNAVAILABLE", message: PRODUCT_UI_MESSAGE,
        fields: manual ? [{ field: "ingredients", reason: "product_reference_unavailable" }] : [] } } });
    if (path === "/api/v1/users/me") return ok({ id: PRODUCT_UI_IDS.owner, account_generation: 3, nickname: "제품 UI 확인", email: null,
      profile_image_url: null, social_provider: "kakao", settings: { screen_wake_lock: false } });
    if (path === "/api/v1/food-catalog/search") return ok({ items: PRODUCT_UI_CATALOG, has_next: false, next_cursor: null });
    if (path === "/api/v1/cooking-methods") return ok({ methods: [{ id: PRODUCT_UI_IDS.generic, code: "prep", label: "준비", color_key: "gray", is_system: true }] });
    if (path.includes("tag-suggestions")) return ok({ suggested_tags: [], tags: [] });
    if (path === `/api/v1/recipes/${PRODUCT_UI_IDS.recipe}` && method === "GET") return ok(PRODUCT_UI_DETAIL);
    if (path.endsWith("/future-plan-impact")) return ok({ impact_token: "fixture-impact", expires_at: "2027-01-01T00:00:00Z",
      proposed_content_hash: "a".repeat(64), future_meal_count: 1, date_range: { from: "2026-10-13", to: "2026-10-13" },
      incomplete_shopping_list_count: 0, completed_shopping_list_count: 0, active_cooking_claim_count: 0, replace_all_allowed: true });
    if ((path === "/api/v1/recipes" && method === "POST") || (path === `/api/v1/recipes/${PRODUCT_UI_IDS.recipe}` && method === "PATCH")) {
      const body: unknown = request.postDataJSON();
      writes.push({ path, method, body });
      return unavailable(path === "/api/v1/recipes" && !(body && typeof body === "object" && "draft" in body));
    }
    if (path.endsWith("/cook-mode")) return ok({ session_id: "product-ui-session", recipe: {
      id: PRODUCT_UI_IDS.recipe, title: PRODUCT_UI_DRAFT.title, cooking_servings: 1,
      ingredients: [
        { ...PRODUCT_UI_DETAIL.ingredients[0], standard_name: "원문 업체 A 양조간장" },
        { ...PRODUCT_UI_DETAIL.ingredients[0], row_key: PRODUCT_UI_IDS.rowB, food_product_id: PRODUCT_UI_IDS.productB,
          food_product_nutrition_version_id: PRODUCT_UI_IDS.versionB, standard_name: "원문 업체 B 양조간장", display_text: "원문 업체 B · 양조간장" },
        { ingredient_id: PRODUCT_UI_IDS.generic, standard_name: "일반 소금", amount: 2, unit: "g", display_text: null, ingredient_type: "QUANT", scalable: true },
      ], steps: PRODUCT_UI_DETAIL.steps,
    } });
    if (path.endsWith("/complete")) {
      writes.push({ path, method, body: request.postDataJSON() });
      return ok({ session_id: "product-ui-session", status: "completed", pantry_removed: 1, meals_updated: 0, cook_count: 1, leftover_dish_id: "fixture-leftover" });
    }
    unmatchedApis.push(`${method} ${path}`);
    await route.fulfill({ json: { success: true, data: { items: [], has_next: false, next_cursor: null, unread_count: 0 }, error: null } });
  });
  return { writes, blockedOrigins, unmatchedApis, pageErrors };
}
