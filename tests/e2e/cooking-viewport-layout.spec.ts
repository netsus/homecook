import { expect, test } from "@playwright/test";
import { COOK_MODE_VISUAL_PATH, STANDALONE_COOK_MODE_VISUAL_PATH, installCookingVisualRoutes, installMealDetailRoutes, MEAL_VISUAL_PATH, setE2EAuthOverride } from "./helpers/mock-routes";

const step = (index: number) => ({ step_number: index + 1, instruction: `조리 순서 ${index + 1}: 재료를 잘 섞어 주세요.`, cooking_method: { code: "MIX", label: "섞기", color_key: "blue" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null });
const recipe = (steps = 1) => ({ id: "layout-recipe", title: "화면 높이 확인 요리", cooking_servings: 2, ingredients: [{ ingredient_id: "tofu", standard_name: "두부", amount: 100, unit: "g", ingredient_type: "QUANT", scalable: true, display_text: "두부 100g" }], steps: Array.from({ length: steps }, (_, i) => step(i)) });

test.beforeEach(async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === "desktop-chrome" ? { width: 1280, height: 900 } : { width: 375, height: 812 });
  await setE2EAuthOverride(page);
});

test("all legacy cooking entry routes keep their notification bell hidden", async ({ page }, testInfo) => {
  await installCookingVisualRoutes(page);
  for (const [index, path] of [COOK_MODE_VISUAL_PATH, STANDALONE_COOK_MODE_VISUAL_PATH].entries()) {
    await page.goto(path);
    await expect(page.getByTestId("cook-mode-whole-board").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /YouTube 추출 알림/ })).toHaveCount(0);
    if (testInfo.project.name !== "desktop-chrome") {
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
      const content = page.getByRole("main", { name: "요리 내용" });
      await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const lastStep = content.locator(".cook-whole-step").last();
      const button = page.getByRole("button", { name: "요리 완료", exact: true });
      const last = await lastStep.boundingBox(), footer = await button.boundingBox();
      expect(last!.y + last!.height).toBeLessThanOrEqual(footer!.y);
    }
    await page.screenshot({ path: testInfo.outputPath(`legacy-cook-${index}.png`) });
  }
});

test("snapshot cooking uses one content scroller and keeps the last step above its actions", async ({ page }, testInfo) => {
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", route => route.fulfill({ json: { success: true, error: null, data: {
    session_id: "layout-active", contract_version: "snapshot_v2", mode: "standalone", status: "in_progress", recipe: recipe(20), pantry_candidates: [],
  } } }));
  await page.goto("/cooking/session-attempts/layout-active/cook-mode");
  await expect(page.getByTestId("snapshot-v2-cook-mode")).toBeVisible();
  const main = page.getByRole("main", { name: "요리 내용" });
  await expect(page.getByRole("button", { name: /YouTube 추출 알림/ })).toHaveCount(0);
  const heights = testInfo.project.name === "desktop-chrome" ? [900] : [812, 420];
  for (const height of heights) {
    await page.setViewportSize({ width: testInfo.project.name === "desktop-chrome" ? 1280 : 375, height });
    await main.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    expect(await main.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    const last = await main.locator(".cook-whole-step").last().boundingBox();
    const footer = await page.getByRole("button", { name: "요리 완료", exact: true }).boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(footer!.y);
    await page.screenshot({ path: testInfo.outputPath(`snapshot-active-${height}.png`) });
  }
});

test("completed snapshots drop action-bar padding while keeping all content reachable", async ({ page }, testInfo) => {
  await page.route("**/api/v1/cooking/session-attempts/*/cook-mode", route => route.fulfill({ json: { success: true, error: null, data: {
    session_id: "layout-complete", contract_version: "snapshot_v2", mode: "planner", status: "completed", recipe: recipe(), pantry_candidates: [],
  } } }));
  await page.goto("/cooking/session-attempts/layout-complete/cook-mode");
  await expect(page.getByText("완료된 요리 기록이에요. 읽기 전용으로 볼 수 있어요.")).toBeVisible();
  const main = page.getByRole("main", { name: "요리 내용" });
  expect(await main.evaluate(el => getComputedStyle(el).paddingBottom)).toBe("16px");
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await expect(page.getByRole("button", { name: /YouTube 추출 알림/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "요리 완료", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "돌아가기", exact: true }).scrollIntoViewIfNeeded();
  await main.locator(".cook-whole-step").last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("snapshot-completed.png") });
});

test("short saved meal recipes need no blank scroll and longer content clears the bottom tabs", async ({ page }, testInfo) => {
  await page.route("**/api/v1/meals/*/recipe-snapshot", route => route.fulfill({ json: { success: true, error: null, data: {
    meal_id: "layout-meal", recipe_id: "layout-recipe", snapshot_id: "layout-snapshot", title: "계획 내용 확인", planned_servings: 2,
    ingredients: recipe().ingredients, steps: recipe().steps,
  } } }));
  await page.goto("/meal/layout-meal/recipe");
  const last = page.getByRole("link", { name: "최신 레시피 보기" });
  await expect(last).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  if (testInfo.project.name !== "desktop-chrome") {
    await page.setViewportSize({ width: 375, height: 420 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const link = await last.boundingBox(), nav = await page.getByRole("navigation", { name: "하단 탭", exact: true }).boundingBox();
    expect(link!.y + link!.height).toBeLessThanOrEqual(nav!.y);
  }
  await page.screenshot({ path: testInfo.outputPath("saved-meal-bottom-clearance.png") });
});

test("meal details scroll their content rather than an empty outer page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chrome", "The meal desktop layout uses normal document scrolling.");
  await installMealDetailRoutes(page);
  await page.goto(MEAL_VISUAL_PATH);
  const content = page.getByTestId("meal-screen-scroll-area");
  await expect(content).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await expect(page.getByRole("button", { name: /YouTube 추출 알림/ })).toHaveCount(0);
  await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: testInfo.outputPath("meal-content-scroll.png") });
});

test("meal back navigation keeps a directly opened non-current planning date", async ({ page }, testInfo) => {
  await installMealDetailRoutes(page);
  // No returnTo or preceding planner history: this exercises the date-aware fallback.
  await page.goto("/planner/2026-11-19/col-dinner");
  await page.getByRole("button", {
    name: testInfo.project.name === "desktop-chrome" ? "플래너로 돌아가기" : "뒤로 가기",
    exact: true,
  }).click();
  await expect.poll(() => {
    const url = new URL(page.url());
    return { path: url.pathname, date: url.searchParams.get("date") };
  }).toEqual({ path: "/planner", date: "2026-11-19" });
});
