import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const PLAN_DATE = "2026-04-18";
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const SLOT_NAME = "아침";
const MENU_ADD_URL = `/menu-add?date=${PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(SLOT_NAME)}`;

interface RecipeCardItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[];
  base_servings: number;
  view_count: number;
  like_count: number;
  save_count: number;
  source_type: "system" | "youtube" | "manual";
}

interface MealCreateData {
  id: string;
  recipe_id: string;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  status: "registered";
  is_leftover: boolean;
  leftover_dish_id: string | null;
}

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      value,
      url: E2E_APP_ORIGIN,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

function parseLoginReturnToAction(loginUrl: string) {
  const login = new URL(loginUrl);
  const next = login.searchParams.get("next");
  expect(next).toBeTruthy();

  return new URL(next!, E2E_APP_ORIGIN);
}

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1024) < 1024;
}

function visibleByTestId(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

function visibleButtonText(page: Page, text: string) {
  return page.locator(`button:has-text("${text}")`).filter({ visible: true }).first();
}

function visibleText(page: Page, text: string) {
  return page.getByText(text).filter({ visible: true }).first();
}

function visibleSearchInput(page: Page) {
  return page.locator('input[aria-label="레시피 검색"]').filter({ visible: true }).first();
}

function visibleSearchButton(page: Page) {
  return page.locator('button[aria-label="검색"]').filter({ visible: true }).first();
}

async function openMobileSearchPicker(page: Page) {
  if (!isMobileViewport(page)) return;

  await visibleByTestId(page, "menu-add-option-search").click();
  await expect(page.getByRole("heading", { name: "검색으로 추가" })).toBeVisible();
}

async function expectServingsDialog(page: Page) {
  if (isMobileViewport(page)) {
    await expect(page.getByRole("dialog", { name: "플래너에 추가" })).toBeVisible();
    return;
  }

  await expect(visibleText(page, "계획 인분 입력")).toBeVisible();
}

async function clickServingsConfirm(page: Page) {
  const label = isMobileViewport(page) ? "추가하기" : "추가";
  await page.getByRole("button", { exact: true, name: label }).click();
}

function buildRecipe(overrides: Partial<RecipeCardItem> = {}): RecipeCardItem {
  return {
    id: "recipe-1",
    title: "김치찌개",
    thumbnail_url: null,
    tags: ["한식", "찌개"],
    base_servings: 2,
    view_count: 100,
    like_count: 10,
    save_count: 5,
    source_type: "system",
    ...overrides,
  };
}

async function installRecipeSearchRoute(page: Page, recipes: RecipeCardItem[]) {
  await page.route("**/api/v1/recipes?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: recipes,
          next_cursor: null,
          has_next: false,
        },
        error: null,
      },
    });
  });
}

async function installMealCreateRoute(page: Page, createdMeal: MealCreateData) {
  await page.route("**/api/v1/meals", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: createdMeal,
        error: null,
      },
      status: 201,
    });
  });
}

test.describe("Slice 08a meal add search — MENU_ADD + RECIPE_SEARCH_PICKER", () => {
  // ── Unauthorized gate ──────────────────────────────────────────────────────

  test("redirects to /login when unauthorized", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto(MENU_ADD_URL);

    await page.waitForURL(/\/login/);
    const currentUrl = page.url();
    expect(currentUrl).toContain("/login?next=");
    expect(decodeURIComponent(currentUrl)).toContain("/menu-add");
  });

  // ── Search flow ────────────────────────────────────────────────────────────

  test("displays search input and source buttons", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await page.goto(MENU_ADD_URL);

    await expect(page.getByRole("heading", { name: "식사 추가" })).toBeVisible();
    await expect(visibleButtonText(page, "유튜브")).toBeEnabled();
    await expect(visibleButtonText(page, "레시피북")).toBeEnabled();
    await expect(visibleButtonText(page, "남은요리")).toBeEnabled();
    await expect(visibleButtonText(page, "팬트리")).toBeEnabled();

    if (isMobileViewport(page)) {
      await visibleByTestId(page, "menu-add-option-search").click();
      await expect(visibleSearchInput(page)).toBeVisible();
    } else {
      await expect(visibleSearchInput(page)).toBeVisible();
    }
  });

  test("shows empty state when search returns no results", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installRecipeSearchRoute(page, []);
    await page.goto(MENU_ADD_URL);
    await openMobileSearchPicker(page);

    const searchInput = visibleSearchInput(page);
    await searchInput.fill("존재하지않는레시피");
    await visibleSearchButton(page).click();

    await expect(visibleText(page, "검색 결과가 없어요")).toBeVisible();
  });

  test("displays search results and allows recipe selection", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const recipes = [
      buildRecipe({ id: "r1", title: "김치찌개" }),
      buildRecipe({ id: "r2", title: "김치볶음밥" }),
    ];
    await installRecipeSearchRoute(page, recipes);
    await page.goto(MENU_ADD_URL);
    await openMobileSearchPicker(page);

    const searchInput = visibleSearchInput(page);
    await searchInput.fill("김치");
    await visibleSearchButton(page).click();

    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await expect(visibleText(page, "김치볶음밥")).toBeVisible();
  });

  // ── Servings modal ─────────────────────────────────────────────────────────

  test("opens servings modal on recipe select and allows cancel", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const recipes = [buildRecipe({ id: "r1", title: "김치찌개", base_servings: 2 })];
    await installRecipeSearchRoute(page, recipes);
    await page.goto(MENU_ADD_URL);
    await openMobileSearchPicker(page);

    const searchInput = visibleSearchInput(page);
    await searchInput.fill("김치");
    await visibleSearchButton(page).click();

    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await visibleButtonText(page, "선택").click();

    await expectServingsDialog(page);
    if (isMobileViewport(page)) {
      await expect(visibleText(page, "기본 2인분 · 선택 2인분")).toBeVisible();
    } else {
      await expect(visibleText(page, "김치찌개 — 기본 2인분")).toBeVisible();
    }

    await visibleButtonText(page, "취소").click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  // ── Meal creation ──────────────────────────────────────────────────────────

  test("creates meal and navigates back to MEAL_SCREEN", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const recipes = [buildRecipe({ id: "r1", title: "김치찌개", base_servings: 2 })];
    await installRecipeSearchRoute(page, recipes);

    const createdMeal: MealCreateData = {
      id: "meal-123",
      recipe_id: "r1",
      plan_date: PLAN_DATE,
      column_id: COLUMN_ID,
      planned_servings: 3,
      status: "registered",
      is_leftover: false,
      leftover_dish_id: null,
    };
    await installMealCreateRoute(page, createdMeal);

    await page.goto(MENU_ADD_URL);
    await openMobileSearchPicker(page);

    const searchInput = visibleSearchInput(page);
    await searchInput.fill("김치");
    await visibleSearchButton(page).click();

    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await visibleButtonText(page, "선택").click();

    await expectServingsDialog(page);

    // Increase servings to 3
    await page.locator('button[aria-label="인분 늘리기"]').filter({ visible: true }).first().click();

    await clickServingsConfirm(page);

    // Should navigate back to MEAL_SCREEN
    await page.waitForURL(new RegExp(`/planner/${PLAN_DATE}/${COLUMN_ID}`));
  });

  // ── Return-to-action ───────────────────────────────────────────────────────

  test("preserves return URL after login", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto(MENU_ADD_URL);

    await page.waitForURL(/\/login/);
    const returnToAction = parseLoginReturnToAction(page.url());
    expect(returnToAction.pathname).toBe("/menu-add");
    expect(returnToAction.searchParams.get("date")).toBe(PLAN_DATE);
    expect(returnToAction.searchParams.get("columnId")).toBe(COLUMN_ID);
    expect(returnToAction.searchParams.get("slot")).toBe(SLOT_NAME);
  });
});
