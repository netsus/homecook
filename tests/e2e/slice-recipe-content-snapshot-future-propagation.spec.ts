import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installCookingVisualRoutes, installMealDetailRoutes, installRecipeDetailRoutes, MEAL_VISUAL_PATH, RECIPE_PATH, setE2EAuthOverride } from "./helpers/mock-routes";

const evidence = resolve("ui/designs/evidence/recipe-content-snapshot-future-propagation");
const immutableSnapshotRecipe = {
  id: "recipe-qa",
  title: "고정된 김치찌개",
  cooking_servings: 2,
  ingredients: [{ ingredient_id: "ingredient-kimchi", standard_name: "김치", amount: 200, unit: "g", display_text: "김치 200g", ingredient_type: "QUANT", scalable: true }],
  steps: [{ step_number: 1, instruction: "김치를 냄비에 넣고 10분간 끓여요.", cooking_method: { code: "BOIL", label: "끓이기", color_key: "orange" }, ingredients_used: [], heat_level: "medium", duration_seconds: 600, duration_text: "10분" }],
};
async function capture(page: Page, width: 390 | 320, name: string) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 568 });
  const path = resolve(evidence, name);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ fullPage: false, path });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
}

test.describe("recipe-content-snapshot-future-propagation", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "This spec sets the exact 390px/320px evidence viewports itself.");
    await setE2EAuthOverride(page);
  });

  test("captures impact dialog at 390px and 320px", async ({ page }) => {
    await installRecipeDetailRoutes(page);
    await page.route("**/api/v1/recipes/*/future-plan-impact", async (route) => route.fulfill({ json: { success: true, data: { impact_token: "qa-impact-token", expires_at: "2026-08-04T01:00:00.000Z", proposed_content_hash: "a".repeat(64), future_meal_count: 3, date_range: { from: "2026-08-04", to: "2026-08-10" }, incomplete_shopping_list_count: 2, completed_shopping_list_count: 1, active_cooking_claim_count: 1, replace_all_allowed: false }, error: null } }));
    await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
    const opener = page.getByRole("button", { name: "변경사항 저장" });
    await opener.click();
    await expect(page.getByRole("dialog", { name: "미래 계획 반영 확인" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "미래 계획 반영 확인" })).toBeVisible();
    await capture(page, 390, "RECIPE_DETAIL-impact-mobile-default.png");
    await capture(page, 320, "RECIPE_DETAIL-impact-mobile-narrow.png");
    const radios = page.getByRole("radio");
    await expect(radios).toHaveCount(2);
    const keep = page.getByRole("radio", { name: /기존 계획 유지/ });
    const cancel = page.getByRole("button", { name: "취소" });
    await cancel.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(keep).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    const dialogBottom = await page.getByRole("dialog").evaluate((element) => element.getBoundingClientRect().bottom);
    expect(dialogBottom).toBeLessThanOrEqual(568);
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
  });

  test("keeps stale saves open and moves focus to the exact recheck action", async ({ page }) => {
    await installRecipeDetailRoutes(page);
    await page.route("**/api/v1/recipes/*/future-plan-impact", async (route) => route.fulfill({ json: { success: true, data: { impact_token: "qa-impact-token", expires_at: "2026-08-04T01:00:00.000Z", proposed_content_hash: "a".repeat(64), future_meal_count: 1, date_range: { from: "2026-08-04", to: "2026-08-04" }, incomplete_shopping_list_count: 1, completed_shopping_list_count: 1, active_cooking_claim_count: 0, replace_all_allowed: true }, error: null } }));
    await page.route("**/api/v1/recipes/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      await route.fulfill({ status: 409, json: { success: false, data: null, error: { code: "RECIPE_IMPACT_STALE", message: "최신 영향을 확인해 주세요.", fields: [] } } });
    });
    await page.goto(`${RECIPE_PATH}?qaFutureImpact=1`);
    await page.getByRole("button", { name: "변경사항 저장" }).click();
    await page.getByRole("radio", { name: /기존 계획 유지/ }).click();
    await page.getByRole("button", { name: "저장" }).click();
    const recheck = page.getByRole("button", { name: "최신 영향 다시 확인" });
    await expect(recheck).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`${RECIPE_PATH.replaceAll("/", "\\/")}\\?qaFutureImpact=1$`));
  });

  test("captures planner pending before navigation without a shell redesign", async ({ page }) => {
    await installMealDetailRoutes(page);
    await installCookingVisualRoutes(page);
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    await page.route("**/api/v1/cooking/sessions", async (route) => {
      await gate;
      await route.fulfill({ status: 201, json: { success: true, data: { session_id: "cook-session-visual", recipe_id: "recipe-kimchi-rice", cooking_servings: 2, status: "in_progress", meals: [] }, error: null } });
    });
    await page.goto(MEAL_VISUAL_PATH);
    const cook = page.getByRole("button", { name: /요리하기/ }).first();
    await expect(cook).toBeVisible();
    await cook.click();
    await expect(cook).toBeDisabled();
    await expect(page.getByText("요리 세션 생성 중…")).toBeVisible();
    await expect(page).toHaveURL(new RegExp("/planner/"));
    await capture(page, 390, "PLANNER_WEEK-start-mobile-default.png");
    release();
    await expect(page).toHaveURL(/\/cooking\/sessions\/cook-session-visual\/cook-mode/);
    await expect(page.getByTestId("cook-mode-whole-board")).toBeVisible();
    await expect(page.getByTestId("snapshot-v2-cook-mode")).toHaveCount(0);
    await capture(page, 390, "COOK_MODE-dispatch-legacy-success-mobile-default.png");
  });

  test("keeps the narrow planner CTA reachable and shows start errors in place", async ({ page }) => {
    await installMealDetailRoutes(page);
    await installCookingVisualRoutes(page);
    await page.route("**/api/v1/cooking/sessions", async (route) => route.fulfill({ status: 500, json: { success: false, data: null, error: { code: "INTERNAL_ERROR", message: "시작 실패", fields: [] } } }));
    await page.goto(MEAL_VISUAL_PATH);
    await page.setViewportSize({ width: 320, height: 568 });
    const cook = page.getByRole("button", { name: /요리하기/ }).first();
    await expect(cook).toBeVisible();
    await cook.click();
    await expect(page.getByRole("alert").filter({ hasText: "요리 세션을 만들지 못했어요" })).toBeVisible();
    await capture(page, 320, "PLANNER_WEEK-start-mobile-narrow.png");
  });

  test("reads snapshot_v2 through its isolated route", async ({ page }) => {
    await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => route.fulfill({ json: { success: true, data: { session_id: "snapshot-qa", contract_version: "snapshot_v2", mode: "planner", status: "completed", recipe: immutableSnapshotRecipe, pantry_candidates: [] }, error: null } }));
    await page.goto("/cooking/session-attempts/snapshot-qa/cook-mode");
    await expect(page.getByText("완료된 요리 기록이에요")).toBeVisible();
    await expect(page.getByTestId("cook-mode-ingredient-ingredient-kimchi").getByText("김치", { exact: true })).toBeVisible();
    await expect(page.getByText("김치를 냄비에 넣고 10분간 끓여요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "요리 완료" })).toHaveCount(0);
    await capture(page, 390, "COOK_MODE-dispatch-mobile-default.png");
    await capture(page, 320, "COOK_MODE-dispatch-mobile-narrow.png");
  });

  test("distinguishes a successful snapshot-v2 dispatch from legacy cook mode", async ({ page }) => {
    await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => route.fulfill({ json: { success: true, data: { session_id: "snapshot-active", contract_version: "snapshot_v2", mode: "standalone", status: "in_progress", recipe: immutableSnapshotRecipe, pantry_candidates: [] }, error: null } }));
    await page.goto("/cooking/session-attempts/snapshot-active/cook-mode");
    await expect(page.getByTestId("snapshot-v2-cook-mode")).toBeVisible();
    await expect(page.getByText("2인분 · 고정된 레시피")).toBeVisible();
    await expect(page.getByRole("button", { name: "취소" })).toBeVisible();
    await capture(page, 390, "COOK_MODE-dispatch-snapshot-success-mobile-default.png");
  });

  test("fails closed for snapshot-v2 loading and read errors while creation remains off", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", async (route) => {
      await gate;
      await route.fulfill({ status: 500, json: { success: false, data: null, error: { code: "INTERNAL_ERROR", message: "read failed", fields: [] } } });
    });
    await page.goto("/cooking/session-attempts/snapshot-qa/cook-mode");
    await expect(page.getByRole("status")).toContainText("고정된 레시피를 불러오고 있어요");
    await expect(page.getByTestId("snapshot-v2-cook-mode-loading").locator(".cook-whole-board-mobile")).toBeVisible();
    await capture(page, 390, "COOK_MODE-dispatch-loading-mobile-default.png");
    release();
    await expect(page.locator("main[role='alert']")).toContainText("요리 기록을 불러오지 못했어요");
    await capture(page, 320, "COOK_MODE-dispatch-error-mobile-narrow.png");
  });
});
