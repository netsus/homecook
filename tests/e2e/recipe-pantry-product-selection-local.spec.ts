import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { FoodCatalogProductData } from "../../lib/api/food-catalog-search";
import type { RecipeEditDraft } from "../../types/recipe";
import { installRecipeProductUiFixture, PRODUCT_UI_CATALOG, PRODUCT_UI_DETAIL, PRODUCT_UI_DRAFT, PRODUCT_UI_IDS } from "./helpers/recipe-product-ui-fixture";

const NEW_VERSION = "550e8400-e29b-41d4-a716-446655440112";
const PANTRY_OLD = "550e8400-e29b-41d4-a716-446655440121";
const PANTRY_NEW = "550e8400-e29b-41d4-a716-446655440122";
const PANTRY_OTHER = "550e8400-e29b-41d4-a716-446655440123";
const evidenceDir = "/tmp/mumeok-c03-p6-ui-evidence";
function product(item: FoodCatalogProductData, version: string, energy: number): FoodCatalogProductData {
  return { ...item, nutrition_version_id: version, recipe_ingredient_id: PRODUCT_UI_IDS.generic,
    nutrition: { ...item.nutrition, values: { energy_kcal: { amount: energy, known_amount: null, status: "complete", display_mode: "total" } }, calculation_status: "complete" } };
}
async function fixture(page: Page, origin: string) {
  const base = await installRecipeProductUiFixture(page, origin);
  const old = product(PRODUCT_UI_CATALOG[0], PRODUCT_UI_IDS.versionA, 150);
  const current = product(PRODUCT_UI_CATALOG[0], NEW_VERSION, 200);
  const other = product(PRODUCT_UI_CATALOG[1], PRODUCT_UI_IDS.versionB, 250);
  const draft: RecipeEditDraft = { ...PRODUCT_UI_DRAFT, ingredients: [{ ...PRODUCT_UI_DRAFT.ingredients[0],
    food_product_nutrition_version_id: NEW_VERSION, amount: 0.5, unit: "package" }] };
  const state = { generation: 3, pantryUnauthorized: false };
  const reads: string[] = []; const mutations: string[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) return route.fallback();
    if (!["GET", "HEAD"].includes(request.method())) mutations.push(`${request.method()} ${url.pathname}`);
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data, error: null } });
    if (url.pathname === "/api/v1/users/me") return ok({ id: PRODUCT_UI_IDS.owner, account_generation: state.generation,
      nickname: "팬트리 fixture", email: null, profile_image_url: null, social_provider: "google", settings: { screen_wake_lock: false } });
    if (url.pathname === `/api/v1/recipes/${PRODUCT_UI_IDS.recipe}` && request.method() === "GET") {
      return ok({ ...PRODUCT_UI_DETAIL, ingredients: [{ ...PRODUCT_UI_DETAIL.ingredients[0], ...draft.ingredients[0] }],
        edit_context: { base_recipe_revision: 1, image_object_id: null, draft } });
    }
    if (url.pathname === "/api/v1/pantry") {
      if (state.pantryUnauthorized) return route.fulfill({ status: 401, json: { success: false, data: null,
        error: { code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] } } });
      return ok({ items: [], product_items: [
        { id: PANTRY_NEW, food_product_id: current.id, food_product_nutrition_version_id: current.nutrition_version_id,
          name: current.name, brand: current.brand, created_at: "2026-10-14T00:00:00Z" },
        { id: PANTRY_OLD, food_product_id: old.id, food_product_nutrition_version_id: old.nutrition_version_id,
          name: old.name, brand: old.brand, created_at: "2026-10-13T00:00:00Z" },
        { id: PANTRY_OTHER, food_product_id: other.id, food_product_nutrition_version_id: other.nutrition_version_id,
          name: other.name, brand: other.brand, created_at: "2026-10-14T01:00:00Z" },
      ] });
    }
    if (url.pathname === "/api/v1/food-catalog/search") {
      const pantry = url.searchParams.get("pantry_item_id"); if (pantry) reads.push(pantry);
      return ok({ items: pantry === PANTRY_OLD ? [old] : pantry === PANTRY_OTHER ? [other]
        : url.searchParams.has("source_id") ? [current] : [current, other], has_next: false, next_cursor: null });
    }
    return route.fallback();
  });
  return { ...base, state, reads, mutations, draft };
}
async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.screenshot({ path: join(evidenceDir, `${name}.png`), fullPage: false, scale: "css" });
}
async function openEditor(page: Page) {
  await page.goto(`/recipe/${PRODUCT_UI_IDS.recipe}?qaFutureImpact=1`);
  await page.getByRole("button", { name: "편집", exact: true }).click();
  return page.getByRole("dialog", { name: "레시피 편집", exact: true });
}

for (const width of [320, 375, 1440]) {
  test.describe(`P6 pantry selection ${width}px`, () => {
    test.beforeEach(async ({ page }, info) => {
      test.skip(info.project.name !== "desktop-chrome", "Exact widths are set in the fixture.");
      await page.setViewportSize({ width, height: width === 320 ? 568 : width === 375 ? 812 : 900 });
    });
    test("selects the owned older version, requires quantity, and applies only after existing save preview", async ({ page, baseURL }) => {
      const data = await fixture(page, new URL(baseURL!).origin);
      const editor = await openEditor(page);
      await editor.getByRole("button", { name: "교체", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "제품·재료 선택", exact: true });
      await picker.getByRole("button", { name: "내 팬트리에서 선택" }).click();
      await expect(picker.getByRole("checkbox", { name: /보유 정보 2/ })).toBeVisible();
      await picker.getByRole("checkbox", { name: /보유 정보 2/ }).click();
      await expect(picker.getByText("선택한 고정 정보: 100g · 150kcal")).toBeVisible();
      await expect(picker.getByText("기존 고정 정보: 100g · 200kcal")).toBeVisible();
      await expect(picker).not.toContainText(PRODUCT_UI_IDS.versionA);
      await capture(page, `p6-older-version-${width}`);
      await picker.locator('[aria-label="선택할 제품의 영양 기준"]').scrollIntoViewIfNeeded();
      await capture(page, `p6-older-version-comparison-${width}`);
      await picker.getByRole("button", { name: "이 재료로 교체" }).click();
      const amount = editor.getByRole("textbox", { name: "재료 1 수량" });
      await expect(amount).toHaveValue("");
      await expect(editor.getByRole("button", { name: "변경사항 저장" })).toBeDisabled();
      expect(data.mutations).toEqual([]);
      await amount.fill("30");
      await editor.getByRole("button", { name: "변경사항 저장" }).click();
      const impact = page.getByRole("dialog", { name: "미래 계획 반영 확인" });
      await expect(impact).toBeVisible();
      expect(data.mutations).toEqual([`POST /api/v1/recipes/${PRODUCT_UI_IDS.recipe}/future-plan-impact`]);
      expect(data.writes).toEqual([]);
      await impact.getByRole("radio", { name: /기존 계획 유지/ }).click();
      await impact.getByRole("button", { name: "저장", exact: true }).click();
      await expect(impact.getByRole("alert")).toBeVisible();
      expect(data.writes).toHaveLength(1);
      const body = data.writes[0].body as { draft: RecipeEditDraft };
      expect(body.draft.ingredients[0]).toMatchObject({ row_key: PRODUCT_UI_IDS.rowA, ingredient_id: null,
        food_product_id: PRODUCT_UI_IDS.productA, food_product_nutrition_version_id: PRODUCT_UI_IDS.versionA, amount: 30, unit: "g" });
      expect(body.draft.ingredients[0]).not.toHaveProperty("pantry_item_id");
      expect(body.draft.steps[0].instruction).toBe(PRODUCT_UI_DRAFT.steps[0].instruction);
      expect(data.reads.filter(id => id === PANTRY_OLD)).toHaveLength(2);
      expect(data.mutations).toEqual([`POST /api/v1/recipes/${PRODUCT_UI_IDS.recipe}/future-plan-impact`, `PATCH /api/v1/recipes/${PRODUCT_UI_IDS.recipe}`]);
      expect(data.pageErrors).toEqual([]); expect(data.blockedOrigins).toEqual([]);
    });
    test("shows an approved substitute hint and cancellation leaves the original fixed quantity", async ({ page, baseURL }) => {
      const data = await fixture(page, new URL(baseURL!).origin);
      const editor = await openEditor(page);
      await editor.getByRole("button", { name: "교체", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "제품·재료 선택", exact: true });
      await picker.getByRole("button", { name: "내 팬트리에서 선택" }).click();
      await picker.getByRole("checkbox", { name: /원문 업체 B · 양조간장/ }).click();
      await expect(picker.getByText("승인된 재료 연결의 대체 후보")).toBeVisible();
      await capture(page, `p6-substitute-${width}`);
      await picker.locator('[aria-label="선택할 제품의 영양 기준"]').scrollIntoViewIfNeeded();
      await capture(page, `p6-substitute-comparison-${width}`);
      await picker.getByRole("button", { name: "닫기", exact: true }).click();
      await expect(editor.getByRole("textbox", { name: "재료 1 수량" })).toHaveValue("0.5");
      await expect(editor.getByRole("combobox", { name: "재료 1 단위" })).toHaveValue("package");
      expect(data.mutations).toEqual([]); expect(data.writes).toEqual([]); expect(data.pageErrors).toEqual([]);
    });
    test("returns from a 401 to the generation-bound pantry read without automatic write or preview", async ({ page, baseURL }) => {
      const data = await fixture(page, new URL(baseURL!).origin);
      const editor = await openEditor(page);
      await editor.getByRole("textbox", { name: "레시피 제목" }).fill("로그인 전 작성한 제품 초안");
      await editor.getByRole("button", { name: "교체", exact: true }).click();
      data.state.pantryUnauthorized = true;
      const picker = page.getByRole("dialog", { name: "제품·재료 선택", exact: true });
      await picker.getByRole("button", { name: "내 팬트리에서 선택" }).click();
      await picker.getByRole("button", { name: "로그인하고 이어서 선택" }).click();
      const gate = page.getByRole("dialog", { name: "로그인이 필요한 작업이에요" });
      await expect(gate).toContainText("자동으로 저장하지 않아요");
      await gate.getByRole("button", { name: "로그인", exact: true }).click();
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem("homecook.pending-recipe-action"))).not.toBeNull();
      data.state.pantryUnauthorized = false;
      await page.goto(`/recipe/${PRODUCT_UI_IDS.recipe}?qaFutureImpact=1`);
      const resumed = page.getByRole("dialog", { name: "제품·재료 선택", exact: true });
      await expect(resumed).toBeVisible();
      await expect(resumed.getByRole("button", { name: "내 팬트리에서 선택" })).toHaveAttribute("aria-pressed", "true");
      await expect(resumed.getByRole("checkbox", { name: /보유 정보 2/ })).toBeVisible();
      await capture(page, `p6-401-resume-${width}`);
      await resumed.getByRole("button", { name: "닫기", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "레시피 제목" })).toHaveValue("로그인 전 작성한 제품 초안");
      await expect(page.getByRole("textbox", { name: "재료 1 수량" })).toHaveValue("0.5");
      expect(data.mutations).toEqual([]); expect(data.writes).toEqual([]); expect(data.pageErrors).toEqual([]); expect(data.blockedOrigins).toEqual([]);
    });
  });
}
