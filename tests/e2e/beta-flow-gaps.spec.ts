import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  installAccountLibraryVisualRoutes,
  installPantryShoppingVisualRoutes,
  installRecipeDetailRoutes,
  installMenuAddVisualRoutes,
  installPlannerWeekRoutes,
  MANUAL_CREATE_VISUAL_PATH,
  RECIPE_PATH,
  setE2EAuthOverride,
} from "./helpers/mock-routes";
import type { SnapshotV2CookModeData } from "../../types/cooking";
import type { FoodProductData } from "../../types/food-product";
import type { FoodCatalogProductData, FoodCatalogSearchItem } from "../../lib/api/food-catalog-search";
import type { RecipeEditDraft } from "../../types/recipe";

// Local QA only. Every app API response below is a fixture, not production evidence.
// New scenarios (for example recipe editing) should install their own routes after
// installBetaFlowFixtures, so an omitted API never reaches a real data source.
async function installBetaFlowFixtures(page: Page) {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) {
    throw new Error("beta-flow-gaps fixtures require a loopback QA server");
  }
  await page.route("**/api/v1/**", async (route) => {
    await route.fulfill({
      status: 501,
      json: { success: false, data: null, error: { code: "QA_FIXTURE_MISSING", message: "로컬 QA 응답이 없는 경로예요.", fields: [] } },
    });
  });
  await setE2EAuthOverride(page);
  await installAccountLibraryVisualRoutes(page);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const directory = join(process.cwd(), ".artifacts", "beta-flow-gaps", testInfo.project.name);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${name}.png`);
  // A viewport capture shows fixed dialogs where the user actually sees them;
  // a full-page capture can place them at the underlying page's scroll offset.
  const hasDialog = await page.getByRole("dialog").count() > 0;
  await page.screenshot({ path, fullPage: !hasDialog, animations: "disabled", scale: "css" });
  await testInfo.attach(name, { path, contentType: "image/png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function installTerminalCooking(page: Page, status: "completed" | "cancelled") {
  const data: SnapshotV2CookModeData = {
    session_id: "qa-terminal-session",
    contract_version: "snapshot_v2",
    mode: "planner",
    status,
    recipe: {
      id: "qa-kimchi-recipe", title: "QA 김치찌개", cooking_servings: 2,
      ingredients: [{ ingredient_id: "qa-kimchi", standard_name: "김치", amount: 200, unit: "g", display_text: "김치 200g", ingredient_type: "QUANT", scalable: true }],
      steps: [{ step_number: 1, instruction: "김치를 냄비에 넣고 끓여요.", cooking_method: { code: "BOIL", label: "끓이기", color_key: "orange" }, ingredients_used: [], heat_level: "medium", duration_seconds: 600, duration_text: "10분" }],
    },
    pantry_candidates: [],
  };
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", (route) => route.fulfill({ json: { success: true, data, error: null } }));
}

const soySauce: FoodProductData = {
  id: "qa-soy-sauce", name: "QA 양조간장", brand: "QA", visibility: "public", source_type: "public_dataset", editable: false,
  nutrition_version_id: "qa-soy-sauce-nutrition", basis_relations: [],
  nutrition: { basis: { amount: 100, unit: "ml" }, values: {}, calculation_status: "unavailable", calculation_quality: null, warnings: [], sources: [] },
};

const ONION = "30000000-0000-4000-8000-000000000001";
const TOFU = "30000000-0000-4000-8000-000000000002";
const SOY = "30000000-0000-4000-8000-000000000003";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const BATCH = "50000000-0000-4000-8000-000000000001";
const COLUMN = "20000000-0000-4000-8000-000000000001";
const DATE = "2026-09-22";
const approvedProduct: FoodCatalogProductData = {
  ...soySauce, type: "food_product", id: PRODUCT, recipe_ingredient_id: SOY,
  nutrition_version_id: "60000000-0000-4000-8000-000000000001",
  nutrition: { ...soySauce.nutrition, basis: { amount: 15, unit: "ml" } },
};
const catalog: FoodCatalogSearchItem[] = [
  { type: "ingredient", id: ONION, standard_name: "QA 양파", category: "채소", default_unit: "g" },
  { type: "ingredient", id: TOFU, standard_name: "QA 두부", category: "두류", default_unit: "g" },
  approvedProduct,
  { ...approvedProduct, id: "40000000-0000-4000-8000-000000000002", name: "QA 미연결 제품", recipe_ingredient_id: null },
];
function success(data: unknown) { return { success: true, data, error: null }; }

async function installRecipeCatalog(page: Page) {
  await page.route("**/api/v1/food-catalog/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    const items = catalog.filter((item) => (item.type === "ingredient" ? item.standard_name : `${item.brand} ${item.name}`).includes(query));
    await route.fulfill({ json: success({ items, has_next: false, next_cursor: null }) });
  });
}

async function installRecentMealLog(page: Page) {
  await installPlannerWeekRoutes(page);
  const zero = { calculation_status: "complete", calories_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, sodium_mg: 0 };
  await page.route("**/api/v1/meal-log?**", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") ?? DATE;
    await route.fulfill({ json: success({
      date, active_columns: [{ id: COLUMN, name: "아침", sort_order: 0 }],
      active_sections: [{ meal_plan_column_id: COLUMN, slot_name_snapshot: "아침", sort_order: 0, entries: [], subtotal: zero, incomplete_count: 0 }],
      deleted_column_sections: [], entries: [], day_total: { ...zero, incomplete_count: 0 },
    }) });
  });
  await page.route("**/api/v1/meal-log/recent?**", (route) => route.fulfill({ json: success({ items: [
    { source: { type: "cooked_batch", id: BATCH }, display_name: "최근 QA 카레", display_brand: null, last_quantity: { amount: 100, unit: "g" }, frequency: 2 },
    { source: { type: "ingredient", id: ONION }, display_name: "최근 QA 양파", display_brand: null, last_quantity: { amount: 0.25, unit: "kg" }, frequency: 3 },
    { source: { type: "food_product", id: PRODUCT }, display_name: "최근 QA 두유", display_brand: "QA", last_quantity: { amount: 1, unit: "package" }, frequency: 4 },
  ], has_next: false, next_cursor: null }) }));
  await page.route("**/api/v1/cooked-batches?**", (route) => route.fulfill({ json: success({ items: [{
    id: BATCH, recipe_id: TOFU, recipe_title: "QA 카레", recipe_thumbnail_url: null, status: "leftover", cooked_at: "2026-09-21T09:00:00.000Z",
    cooking_servings: 2, finished_weight_g: 800, remaining_weight_g: 500, weight_status: "known", batch_status: "available", depleted_reason: null,
    revision: 1, nutrition_calculation_status: "complete", current_unweighed_closure_event_id: null,
  }], has_next: false, next_cursor: null }) }));
  const exactReads: Array<{ type: string | null; id: string | null }> = [];
  await page.route("**/api/v1/food-catalog/search?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    exactReads.push({ type: params.get("source_type"), id: params.get("source_id") });
    const product: FoodCatalogSearchItem = {
      ...approvedProduct, name: "QA 두유", nutrition: { ...soySauce.nutrition, basis: { amount: 100, unit: "g" } },
      basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 200, unit: "g" } }],
    };
    const items = params.get("source_id") === ONION ? [catalog[0]] : params.get("source_id") === PRODUCT ? [product] : [];
    await route.fulfill({ json: success({ items, has_next: false, next_cursor: null }) });
  });
  return exactReads;
}

test.describe("beta flow gaps — local fixture UI", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!["desktop-chrome", "mobile-chrome"].includes(testInfo.project.name), "This bounded QA uses 390px mobile and 1280px desktop.");
    await page.setViewportSize(testInfo.project.name === "mobile-chrome" ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await installBetaFlowFixtures(page);
  });

  test("D07 completed and cancelled cooking sessions have safe next actions", async ({ page }, testInfo) => {
    const mutations: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/v1/cooking/") && request.method() !== "GET") mutations.push(request.url());
    });
    await installTerminalCooking(page, "completed");
    await page.goto("/cooking/session-attempts/qa-terminal-session/cook-mode?returnTo=%2Fabout");
    const actions = page.getByRole("navigation", { name: "요리 후 다음 행동" });
    await expect(actions.getByRole("link", { name: "먹은 음식 기록하기" })).toHaveAttribute("href", "/planner?segment=log");
    await expect(actions.getByRole("link", { name: "남은요리 보기" })).toHaveAttribute("href", "/leftovers");
    await expect(actions.getByRole("link", { name: "돌아가기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "요리 완료", exact: true })).toHaveCount(0);
    await capture(page, testInfo, "d07-completed");
    await actions.getByRole("link", { name: "돌아가기" }).click();
    await expect(page).toHaveURL(/\/about$/);

    await installTerminalCooking(page, "cancelled");
    await page.goto("/cooking/session-attempts/qa-terminal-session/cook-mode?returnTo=%2Fabout");
    await expect(page.getByText("취소된 요리 기록이에요. 읽기 전용으로 볼 수 있어요.")).toBeVisible();
    await expect(actions.getByRole("link", { name: "먹은 음식 기록하기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "취소", exact: true })).toHaveCount(0);
    await capture(page, testInfo, "d07-cancelled");
    await actions.getByRole("link", { name: "돌아가기" }).click();
    await expect(page).toHaveURL(/\/about$/);
    expect(mutations).toEqual([]);
  });

  test("D05 product search failure stays visible and retry restores results", async ({ page }, testInfo) => {
    await installPantryShoppingVisualRoutes(page);
    await page.route("**/api/v1/ingredients**", (route) => route.fulfill({ json: { success: true, data: { items: [] }, error: null } }));
    let productRequests = 0;
    await page.route("**/api/v1/food-products?**", async (route) => {
      expect(new URL(route.request().url()).searchParams.get("q")).toBe("간장");
      productRequests += 1;
      await route.fulfill(productRequests === 1
        ? { status: 503, json: { success: false, data: null, error: { code: "QA_PRODUCT_LOOKUP_FAILED", message: "로컬 QA 제품 검색 실패", fields: [] } } }
        : { json: { success: true, data: { items: [soySauce], has_next: false, next_cursor: null }, error: null } });
    });
    await page.goto("/pantry");
    await page.getByRole("button", { name: /^재료 추가(?:하기)?$/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "재료 추가", exact: true });
    await dialog.getByRole("textbox", { name: "재료명 검색" }).fill("간장");
    await expect(dialog.getByText("재료·제품 목록을 불러오지 못했어요")).toBeVisible();
    await expect(dialog.getByText("검색 결과가 없어요")).toHaveCount(0);
    await capture(page, testInfo, "d05-product-error");
    await dialog.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(dialog.getByText(soySauce.name, { exact: true })).toBeVisible();
    await expect(dialog.getByText("재료·제품 목록을 불러오지 못했어요")).toHaveCount(0);
    expect(productRequests).toBe(2);
    await capture(page, testInfo, "d05-product-recovered");
  });

  test("about describes the available import and food-record flows", async ({ page }, testInfo) => {
    await page.goto("/about");
    const available = page.getByRole("button", { name: "지금 어떤 기능을 사용할 수 있나요?" });
    await available.click();
    const answer = page.getByRole("region", { name: "지금 어떤 기능을 사용할 수 있나요?" });
    await expect(answer).toContainText("YouTube");
    await expect(answer).toContainText("식사 기록");
    await expect(answer).not.toContainText(/준비 중|가입.*차단|로그인.*차단/);
    await page.getByRole("button", { name: "식사 기록과 영양정보", exact: true }).click();
    const guide = page.getByRole("region", { name: "식사 기록과 영양정보", exact: true });
    await expect(guide).toContainText("따로 기록");
    await expect(guide.getByRole("link", { name: "식사 기록 열기" })).toHaveAttribute("href", "/planner?segment=log");
    await capture(page, testInfo, "about-available-flows");
  });

  test("D01 personal recipe ingredients keep names and support replace add delete", async ({ page }, testInfo) => {
    const draft: RecipeEditDraft = {
      title: "QA 개인 양파요리", description: null, base_servings: 2,
      ingredients: [{ ingredient_id: ONION, amount: 100, unit: "g", ingredient_type: "QUANT", display_text: null, component_label: null, scalable: true, food_product_id: null, food_product_nutrition_version_id: null }],
      steps: [],
    };
    await installRecipeDetailRoutes(page, { recipeDetail: {
      revision: 12, title: draft.title,
      ingredients: [{ id: "qa-original-onion", ingredient_id: ONION, standard_name: "QA 양파", amount: 100, unit: "g", ingredient_type: "QUANT", display_text: null, scalable: true, sort_order: 0 }],
      edit_context: { base_recipe_revision: 12, draft, image_object_id: null },
    } });
    await installRecipeCatalog(page);
    await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
    await page.getByRole("button", { name: "편집", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "레시피 편집", exact: true });
    await expect(editor.getByText("QA 양파", { exact: true })).toBeVisible();
    await capture(page, testInfo, "d01-original-ingredient-name");
    await editor.getByRole("spinbutton", { name: "재료 1 수량", exact: true }).fill("250");
    await editor.getByRole("button", { name: "교체", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "제품·재료 선택" });
    await picker.getByRole("checkbox", { name: "QA 두부", exact: true }).check();
    await picker.getByRole("button", { name: "이 재료로 교체" }).click();
    await expect(editor.getByText("QA 두부", { exact: true })).toBeVisible();
    await expect(editor.getByRole("spinbutton", { name: "재료 1 수량", exact: true })).toHaveValue("250");
    await expect(editor.getByText("QA 양파", { exact: true })).toHaveCount(0);
    await editor.getByRole("button", { name: "+ 재료 추가하기", exact: true }).click();
    await expect(picker.getByRole("checkbox", { name: "QA · QA 미연결 제품" })).toBeDisabled();
    await picker.getByRole("checkbox", { name: "QA · QA 양조간장" }).check();
    await picker.getByRole("button", { name: "선택한 재료 1개 추가" }).click();
    await expect(editor.getByText("QA · QA 양조간장", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "QA 두부 삭제", exact: true }).click();
    await expect(editor.getByText("QA 두부", { exact: true })).toHaveCount(0);
    await expect(editor.getByRole("spinbutton", { name: "재료 1 수량", exact: true })).toHaveValue("15");
    await expect(editor.getByRole("textbox", { name: "단위", exact: true })).toHaveAttribute("readonly", "");
    await capture(page, testInfo, "d01-replaced-added-deleted");
  });

  test("D02 manual recipe uses an approved product and keeps its unit", async ({ page }, testInfo) => {
    await installMenuAddVisualRoutes(page);
    await installRecipeCatalog(page);
    await page.goto(MANUAL_CREATE_VISUAL_PATH);
    await page.getByPlaceholder("예: 김치찌개").fill("QA 직접 등록 요리");
    await page.getByRole("button", { name: "+ 재료 추가하기", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "제품·재료 선택" });
    await expect(picker.getByRole("checkbox", { name: "QA · QA 미연결 제품" })).toBeDisabled();
    await picker.getByRole("checkbox", { name: "QA · QA 양조간장" }).check();
    await capture(page, testInfo, "d02-product-picker");
    await picker.getByRole("button", { name: "선택한 재료 1개 추가" }).click();
    await expect(page.getByRole("spinbutton", { name: "QA · QA 양조간장 수량", exact: true })).toHaveValue("15");
    await expect(page.getByRole("button", { name: "QA · QA 양조간장 g", exact: true })).toHaveCount(0);
    await capture(page, testInfo, "d02-product-added");
  });

  test("D03 D04 recent foods appear by source and convert only approved units", async ({ page }, testInfo) => {
    const exactReads = await installRecentMealLog(page);
    await page.goto(`/planner?segment=log&date=${DATE}`);
    const day = page.locator(`[data-planner-date="${DATE}"]`);
    await day.getByRole("button", { name: "아침에 먹은 음식 추가" }).click();
    const dialog = page.getByRole("dialog", { name: "먹은 음식 추가" });
    await expect(dialog.getByRole("button", { name: /최근 QA 카레/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /최근 QA 양파/ })).toHaveCount(0);
    await capture(page, testInfo, "d04-recent-cooked");
    await dialog.getByRole("tab", { name: "제품·재료", exact: true }).click();
    await expect(dialog.getByRole("button", { name: /최근 QA 카레/ })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /최근 QA 양파/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /최근 QA 두유/ })).toBeVisible();
    await dialog.getByRole("button", { name: /최근 QA 양파/ }).click();
    await expect(dialog.getByRole("spinbutton", { name: "실제 양" })).toHaveValue("0.25");
    await expect(dialog.getByRole("button", { name: "기록 저장" })).toBeDisabled();
    await dialog.getByRole("combobox", { name: "단위", exact: true }).selectOption("g");
    await expect(dialog.getByRole("spinbutton", { name: "실제 양" })).toHaveValue("250");
    await expect(dialog.getByRole("button", { name: "기록 저장" })).toBeEnabled();
    await capture(page, testInfo, "d03-recent-ingredient-converted");
    await dialog.getByRole("button", { name: /최근 QA 두유/ }).click();
    await expect(dialog.getByRole("combobox", { name: "단위", exact: true })).toHaveValue("package");
    await dialog.getByRole("combobox", { name: "단위", exact: true }).selectOption("g");
    await expect(dialog.getByRole("spinbutton", { name: "실제 양" })).toHaveValue("200");
    await expect(dialog.getByRole("combobox", { name: "단위", exact: true }).locator("option")).toHaveText(["g", "팩"]);
    expect(exactReads).toContainEqual({ type: "ingredient", id: ONION });
    expect(exactReads).toContainEqual({ type: "food_product", id: PRODUCT });
    await capture(page, testInfo, "d03-recent-product-converted");
  });
});
