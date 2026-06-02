import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const PLAN_DATE = "2026-04-18";
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const SLOT_NAME = "아침";
const MENU_ADD_URL = `/menu-add?date=${PLAN_DATE}&columnId=${COLUMN_ID}&slot=${encodeURIComponent(SLOT_NAME)}`;

interface RecipeBookSummary {
  id: string;
  name: string;
  book_type: "my_added" | "saved" | "liked" | "custom";
  recipe_count: number;
  sort_order: number;
}

interface RecipeBookRecipeItem {
  recipe_id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[];
  added_at: string;
}

interface PantryMatchRecipeItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  match_score: number;
  matched_ingredients: number;
  total_ingredients: number;
  missing_ingredients: Array<{
    id: string;
    standard_name: string;
  }>;
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

function buildRecipeBook(overrides: Partial<RecipeBookSummary> = {}): RecipeBookSummary {
  return {
    id: "book-1",
    name: "저장한 레시피",
    book_type: "saved",
    recipe_count: 5,
    sort_order: 1,
    ...overrides,
  };
}

function buildBookRecipe(overrides: Partial<RecipeBookRecipeItem> = {}): RecipeBookRecipeItem {
  return {
    recipe_id: "recipe-1",
    title: "김치찌개",
    thumbnail_url: null,
    tags: ["한식", "찌개"],
    added_at: "2026-04-18T00:00:00Z",
    ...overrides,
  };
}

function buildPantryRecipe(
  overrides: Partial<PantryMatchRecipeItem> = {},
): PantryMatchRecipeItem {
  return {
    id: "recipe-1",
    title: "김치찌개",
    thumbnail_url: null,
    match_score: 0.8,
    matched_ingredients: 4,
    total_ingredients: 5,
    missing_ingredients: [{ id: "ing-1", standard_name: "두부" }],
    ...overrides,
  };
}

async function installRecipeBooksRoute(page: Page, books: RecipeBookSummary[]) {
  await page.route("**/api/v1/recipe-books", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          books,
        },
        error: null,
      },
    });
  });
}

async function installRecipeBookRecipesRoute(
  page: Page,
  bookId: string,
  recipes: RecipeBookRecipeItem[],
) {
  await page.route(`**/api/v1/recipe-books/${bookId}/recipes*`, async (route) => {
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

async function installPantryMatchRoute(page: Page, recipes: PantryMatchRecipeItem[]) {
  await page.route("**/api/v1/recipes/pantry-match*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: recipes,
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

async function installMealListRoute(page: Page) {
  await page.route("**/api/v1/meals?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [],
        },
        error: null,
      },
    });
  });
}

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1024) < 1024;
}

function visibleButtonText(page: Page, text: string) {
  return page.locator(`button:has-text("${text}")`).filter({ visible: true }).first();
}

function visibleText(page: Page, text: string) {
  return page.getByText(text).filter({ visible: true }).first();
}

async function expectRecipeBookSelector(page: Page) {
  if (isMobileViewport(page)) {
    await expect(page.getByRole("heading", { name: "레시피북에서 추가" })).toBeVisible();
    return;
  }

  await expect(page.getByRole("dialog", { name: "레시피북 선택" })).toBeVisible();
}

async function clickFirstBook(page: Page) {
  if (isMobileViewport(page)) {
    await page.getByRole("button", { name: /저장한 레시피/ }).first().click();
    return;
  }

  await visibleButtonText(page, "선택").click();
}

async function clickFirstRecipe(page: Page) {
  if (isMobileViewport(page)) {
    await page.getByRole("button", { name: /김치찌개/ }).first().click();
    return;
  }

  await visibleButtonText(page, "선택").click();
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

test.describe("Slice 08b meal add books pantry — RECIPEBOOK + PANTRY paths", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-chrome",
      "Legacy Slice 08b assertions target the mobile picker; desktop parity is covered by qa-visual/qa-a11y.",
    );
  });

  // ── Unauthorized gate ──────────────────────────────────────────────────────

  test("redirects to /login when unauthorized", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto(MENU_ADD_URL);

    await page.waitForURL(/\/login/);
    const currentUrl = page.url();
    expect(currentUrl).toContain("/login?next=");
    expect(decodeURIComponent(currentUrl)).toContain("/menu-add");
  });

  // ── Source buttons enabled ─────────────────────────────────────────────────

  test("displays enabled recipe book, pantry, YouTube, and leftover buttons", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await page.goto(MENU_ADD_URL);

    await expect(page.getByRole("heading", { name: "식사 추가" })).toBeVisible();
    await expect(visibleButtonText(page, "레시피북")).toBeEnabled();
    await expect(visibleButtonText(page, "팬트리")).toBeEnabled();
    await expect(visibleButtonText(page, "유튜브")).toBeEnabled();
    await expect(visibleButtonText(page, "남은 요리")).toBeEnabled();
  });

  // ── Recipe book selector ───────────────────────────────────────────────────

  test("opens recipe book selector and displays books", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const books = [
      buildRecipeBook({ id: "b1", name: "저장한 레시피", book_type: "saved", recipe_count: 3 }),
      buildRecipeBook({ id: "b2", name: "좋아요", book_type: "liked", recipe_count: 5 }),
    ];
    await installRecipeBooksRoute(page, books);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "레시피북").click();

    await expectRecipeBookSelector(page);
    await expect(visibleText(page, "저장한 레시피")).toBeVisible();
    await expect(visibleText(page, "좋아요")).toBeVisible();
  });

  test("shows empty state when no recipe books", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installRecipeBooksRoute(page, []);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "레시피북").click();

    await expect(visibleText(page, "레시피북이 없어요")).toBeVisible();
  });

  test("returns to planner from menu-add back without keeping menu-add in history", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealListRoute(page);

    const mealScreenUrl = `/planner/${PLAN_DATE}/${COLUMN_ID}?slot=${encodeURIComponent(SLOT_NAME)}`;
    await page.goto("/planner");
    await page.goto(mealScreenUrl);
    await page.goto(MENU_ADD_URL);

    await page.getByRole("button", { name: /뒤로 가기|플래너로 돌아가기/ }).click();

    await expect(page).toHaveURL(`${E2E_APP_ORIGIN}${mealScreenUrl}`);

    await page.goBack();

    await expect(page).not.toHaveURL(/\/menu-add/);
    expect(page.url()).not.toContain("/menu-add");
  });

  // ── Recipe book detail picker ──────────────────────────────────────────────

  test("opens recipe book detail and displays recipes", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const books = [
      buildRecipeBook({ id: "b1", name: "저장한 레시피", book_type: "saved", recipe_count: 2 }),
    ];
    const recipes = [
      buildBookRecipe({ recipe_id: "r1", title: "김치찌개" }),
      buildBookRecipe({ recipe_id: "r2", title: "된장찌개" }),
    ];
    await installRecipeBooksRoute(page, books);
    await installRecipeBookRecipesRoute(page, "b1", recipes);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "레시피북").click();
    await expectRecipeBookSelector(page);
    await clickFirstBook(page);

    await expect(page.getByRole("heading", { name: "저장한 레시피" })).toBeVisible();
    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await expect(visibleText(page, "된장찌개")).toBeVisible();
  });

  test("shows empty state when recipe book has no recipes", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const books = [buildRecipeBook({ id: "b1", name: "저장한 레시피", recipe_count: 0 })];
    await installRecipeBooksRoute(page, books);
    await installRecipeBookRecipesRoute(page, "b1", []);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "레시피북").click();
    await clickFirstBook(page);

    await expect(visibleText(page, "레시피가 없어요")).toBeVisible();
  });

  test("navigates back from recipe book detail to selector", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const books = [buildRecipeBook({ id: "b1", name: "저장한 레시피" })];
    const recipes = [buildBookRecipe({ recipe_id: "r1", title: "김치찌개" })];
    await installRecipeBooksRoute(page, books);
    await installRecipeBookRecipesRoute(page, "b1", recipes);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "레시피북").click();
    await clickFirstBook(page);

    await expect(page.getByRole("heading", { name: "저장한 레시피" })).toBeVisible();

    await page.locator('button[aria-label="뒤로"]').filter({ visible: true }).first().click();

    if (isMobileViewport(page)) {
      await expect(page.getByRole("heading", { name: "레시피북에서 추가" })).toBeVisible();
    } else {
      await expect(visibleText(page, "레시피북 선택")).toBeVisible();
    }
  });

  // ── Recipe book meal creation ──────────────────────────────────────────────

  test("creates meal from recipe book and navigates back", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const books = [buildRecipeBook({ id: "b1", name: "저장한 레시피" })];
    const recipes = [buildBookRecipe({ recipe_id: "r1", title: "김치찌개" })];
    await installRecipeBooksRoute(page, books);
    await installRecipeBookRecipesRoute(page, "b1", recipes);

    const createdMeal: MealCreateData = {
      id: "meal-123",
      recipe_id: "r1",
      plan_date: PLAN_DATE,
      column_id: COLUMN_ID,
      planned_servings: 2,
      status: "registered",
      is_leftover: false,
      leftover_dish_id: null,
    };
    await installMealCreateRoute(page, createdMeal);

    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "레시피북").click();
    await clickFirstBook(page);

    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await clickFirstRecipe(page);

    await expectServingsDialog(page);
    await clickServingsConfirm(page);

    // Should navigate back to MEAL_SCREEN
    await page.waitForURL(new RegExp(`/planner/${PLAN_DATE}/${COLUMN_ID}`));
  });

  test("replaces menu-add history after recipe book meal creation", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const books = [buildRecipeBook({ id: "b1", name: "저장한 레시피" })];
    const recipes = [buildBookRecipe({ recipe_id: "r1", title: "김치찌개" })];
    await installRecipeBooksRoute(page, books);
    await installRecipeBookRecipesRoute(page, "b1", recipes);

    const createdMeal: MealCreateData = {
      id: "meal-123",
      recipe_id: "r1",
      plan_date: PLAN_DATE,
      column_id: COLUMN_ID,
      planned_servings: 2,
      status: "registered",
      is_leftover: false,
      leftover_dish_id: null,
    };
    await installMealCreateRoute(page, createdMeal);

    const mealScreenUrl = `/planner/${PLAN_DATE}/${COLUMN_ID}?slot=${encodeURIComponent(SLOT_NAME)}`;
    await page.goto(mealScreenUrl);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "레시피북").click();
    await clickFirstBook(page);
    await clickFirstRecipe(page);
    await clickServingsConfirm(page);

    await page.waitForURL(new RegExp(`/planner/${PLAN_DATE}/${COLUMN_ID}`));

    await page.goBack();

    await expect(page).toHaveURL(new RegExp(`/planner/${PLAN_DATE}/${COLUMN_ID}`));
    expect(page.url()).not.toContain("/menu-add");
  });

  test("returns from meal screen to planner on the first back tap after creation", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealListRoute(page);
    const books = [buildRecipeBook({ id: "b1", name: "저장한 레시피" })];
    const recipes = [buildBookRecipe({ recipe_id: "r1", title: "김치찌개" })];
    await installRecipeBooksRoute(page, books);
    await installRecipeBookRecipesRoute(page, "b1", recipes);

    const createdMeal: MealCreateData = {
      id: "meal-123",
      recipe_id: "r1",
      plan_date: PLAN_DATE,
      column_id: COLUMN_ID,
      planned_servings: 2,
      status: "registered",
      is_leftover: false,
      leftover_dish_id: null,
    };
    await installMealCreateRoute(page, createdMeal);

    const mealScreenUrl = `/planner/${PLAN_DATE}/${COLUMN_ID}?slot=${encodeURIComponent(SLOT_NAME)}`;
    await page.goto("/planner");
    await page.goto(mealScreenUrl);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "레시피북").click();
    await clickFirstBook(page);
    await clickFirstRecipe(page);
    await clickServingsConfirm(page);

    await page.waitForURL(new RegExp(`/planner/${PLAN_DATE}/${COLUMN_ID}`));

    await page.getByRole("button", { name: /뒤로 가기|플래너로 돌아가기/ }).click();

    await expect(page).toHaveURL(/\/planner$/);
  });

  // ── Pantry match picker ────────────────────────────────────────────────────

  test("opens pantry match picker and displays recommendations", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const recipes = [
      buildPantryRecipe({
        id: "r1",
        title: "김치찌개",
        match_score: 0.8,
        matched_ingredients: 4,
        total_ingredients: 5,
        missing_ingredients: [{ id: "ing-1", standard_name: "두부" }],
      }),
      buildPantryRecipe({
        id: "r2",
        title: "된장찌개",
        match_score: 0.6,
        matched_ingredients: 3,
        total_ingredients: 5,
        missing_ingredients: [
          { id: "ing-2", standard_name: "애호박" },
          { id: "ing-3", standard_name: "감자" },
        ],
      }),
    ];
    await installPantryMatchRoute(page, recipes);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "팬트리").click();

    await expect(visibleText(page, "팬트리 기반 추천")).toBeVisible();
    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await expect(visibleText(page, "된장찌개")).toBeVisible();
    if (isMobileViewport(page)) {
      await expect(
        page.getByTestId("pantry-match-progress-r1").filter({ visible: true }),
      ).toHaveText(/80%/);
      await expect(
        page.getByTestId("pantry-match-progress-r2").filter({ visible: true }),
      ).toHaveText(/60%/);
      await expect(
        page.getByTestId("pantry-ingredient-summary-row-r1").filter({ visible: true }),
      ).toHaveClass(/items-center/);
    } else {
      await expect(visibleText(page, "80% 일치")).toBeVisible();
      await expect(visibleText(page, "60% 일치")).toBeVisible();
      await expect(visibleText(page, "부족한 재료:")).toBeVisible();
    }
    await expect(visibleText(page, "두부")).toBeVisible();
  });

  test("shows empty state when no pantry recommendations", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installPantryMatchRoute(page, []);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "팬트리").click();

    await expect(visibleText(page, "추천 레시피가 없어요")).toBeVisible();
  });

  // ── Pantry meal creation ───────────────────────────────────────────────────

  test("creates meal from pantry match and navigates back", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const recipes = [
      buildPantryRecipe({
        id: "r1",
        title: "김치찌개",
        match_score: 0.8,
        matched_ingredients: 4,
        total_ingredients: 5,
      }),
    ];
    await installPantryMatchRoute(page, recipes);

    const createdMeal: MealCreateData = {
      id: "meal-123",
      recipe_id: "r1",
      plan_date: PLAN_DATE,
      column_id: COLUMN_ID,
      planned_servings: 2,
      status: "registered",
      is_leftover: false,
      leftover_dish_id: null,
    };
    await installMealCreateRoute(page, createdMeal);

    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "팬트리").click();

    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await clickFirstRecipe(page);

    await expectServingsDialog(page);
    await clickServingsConfirm(page);

    // Should navigate back to MEAL_SCREEN
    await page.waitForURL(new RegExp(`/planner/${PLAN_DATE}/${COLUMN_ID}`));
  });

  // ── Cancel servings modal ──────────────────────────────────────────────────

  test("allows canceling servings modal in pantry flow", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const recipes = [buildPantryRecipe({ id: "r1", title: "김치찌개" })];
    await installPantryMatchRoute(page, recipes);
    await page.goto(MENU_ADD_URL);

    await visibleButtonText(page, "팬트리").click();
    await clickFirstRecipe(page);

    await expectServingsDialog(page);

    await visibleButtonText(page, "취소").click();
    if (isMobileViewport(page)) {
      await expect(page.getByRole("dialog")).not.toBeVisible();
    } else {
      await expect(visibleText(page, "계획 인분 입력")).not.toBeVisible();
    }
  });
});
