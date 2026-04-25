import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const RECIPE_ID = "mock-kimchi-jjigae";
const RECIPE_TITLE = "집밥 김치찌개";
const RECIPE_PATH = `/recipe/${RECIPE_ID}`;

interface PlannerColumn {
  id: string;
  name: string;
  sort_order: number;
}

interface PlannerMeal {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  status: "registered" | "shopping_done" | "cook_done";
  is_leftover: boolean;
}

const PLANNER_COLUMNS: PlannerColumn[] = [
  { id: "column-breakfast", name: "아침", sort_order: 0 },
  { id: "column-lunch", name: "점심", sort_order: 1 },
  { id: "column-snack", name: "간식", sort_order: 2 },
  { id: "column-dinner", name: "저녁", sort_order: 3 },
];

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

function buildRecipeDetail() {
  return {
    id: RECIPE_ID,
    title: RECIPE_TITLE,
    description: "신김치와 돼지고기만 있으면 금방 끓일 수 있는 가장 기본적인 집밥 김치찌개예요.",
    thumbnail_url: null,
    base_servings: 2,
    tags: ["한식", "찌개"],
    source_type: "system",
    source: null,
    view_count: 1285,
    like_count: 203,
    save_count: 89,
    plan_count: 52,
    cook_count: 34,
    ingredients: [],
    steps: [],
    user_status: {
      is_liked: false,
      is_saved: false,
      saved_book_ids: [],
    },
  };
}

async function installRecipeDetailRoute(page: Page) {
  await page.route(`**/api/v1/recipes/${RECIPE_ID}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: buildRecipeDetail(),
        error: null,
      },
    });
  });
}

interface MockPlannerOptions {
  mealsToReturn?: PlannerMeal[];
}

async function installPlannerRoutes(page: Page, options: MockPlannerOptions = {}) {
  const meals = options.mealsToReturn ?? [];

  await page.route("**/api/v1/planner?*", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? "2026-04-14";

    const dateMeals = meals.map((meal) => ({
      ...meal,
      plan_date: meal.plan_date || startDate,
    }));

    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: PLANNER_COLUMNS,
          meals: dateMeals,
        },
        error: null,
      },
    });
  });
}

async function installCreateMealRoute(
  page: Page,
  {
    planDate,
    columnId,
    plannedServings,
  }: {
    planDate: string;
    columnId: string;
    plannedServings: number;
  },
) {
  await page.route("**/api/v1/meals", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          id: "meal-new-1",
          recipe_id: RECIPE_ID,
          plan_date: planDate,
          column_id: columnId,
          planned_servings: plannedServings,
          status: "registered",
          is_leftover: false,
          leftover_dish_id: null,
        },
        error: null,
      },
    });
  });
}

// accept-playwright-live-split:
// CI runs the tests below using mocked API routes only (QA fixture mode).
// Live OAuth / real Supabase paths are manual-only and listed in acceptance.md under "Manual Only".
// This separation follows the same pattern as slice-01-live-oauth.spec.ts.

test.describe("Slice 06 recipe-to-planner", () => {
  // accept-playwright-flow + accept-screen-contract:
  // Authenticated user opens planner add sheet, selects date/column/servings,
  // submits, sees success toast, navigates to PLANNER_WEEK, sees the meal.
  test("authenticated user can add recipe to planner and see it in PLANNER_WEEK", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installRecipeDetailRoute(page);

    // Planner data for sheet column loading (no meals initially)
    await installPlannerRoutes(page);

    const today = new Date();
    const planDate = formatLocalDate(today);

    await installCreateMealRoute(page, {
      planDate,
      columnId: "column-breakfast",
      plannedServings: 2,
    });

    await page.goto(RECIPE_PATH);

    // Recipe detail loads
    await expect(page.getByRole("heading", { name: RECIPE_TITLE })).toBeVisible();

    // Open planner add sheet
    await page.getByRole("button", { name: "플래너에 추가" }).click();

    // Sheet is visible with columns
    const dialog = page.getByRole("dialog", { name: "플래너에 추가" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "아침" })).toBeVisible();

    // First date is pre-selected; select breakfast column explicitly
    await dialog.getByRole("button", { name: "아침" }).click();

    // Submit
    await dialog.getByRole("button", { name: "플래너에 추가" }).click();

    // Sheet closes, success toast appears with date + meal slot name (D3)
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(/\d+월 \d+일 아침에 추가됐어요/)).toBeVisible();

    // accept-screen-contract: navigate to PLANNER_WEEK, verify meal is visible
    // Re-install planner routes with the created meal so planner shows it
    await installPlannerRoutes(page, {
      mealsToReturn: [
        {
          id: "meal-new-1",
          recipe_id: RECIPE_ID,
          recipe_title: RECIPE_TITLE,
          recipe_thumbnail_url: null,
          plan_date: planDate,
          column_id: "column-breakfast",
          planned_servings: 2,
          status: "registered",
          is_leftover: false,
        },
      ],
    });

    await page.goto("/planner");

    await expect(page.getByRole("heading", { name: "식단 플래너" })).toBeVisible();
    await expect(page.getByText(RECIPE_TITLE)).toBeVisible();
  });

  // accept-unauthorized (Playwright-level smoke):
  // Guest tapping 플래너에 추가 on RECIPE_DETAIL triggers login gate.
  test("guest tapping 플래너에 추가 opens the login gate", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await installRecipeDetailRoute(page);

    await page.goto(RECIPE_PATH);

    await expect(page.getByRole("heading", { name: RECIPE_TITLE })).toBeVisible();

    await page.getByRole("button", { name: "플래너에 추가" }).click();

    const loginDialog = page.getByRole("dialog");
    await expect(loginDialog).toBeVisible();
    await expect(loginDialog.getByText(/로그인이 필요한 작업이에요/)).toBeVisible();
  });

  // accept-loading (Playwright-level smoke):
  // Sheet shows skeleton while planner columns are loading.
  test("sheet shows loading skeleton while planner columns are fetching", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installRecipeDetailRoute(page);

    // Delay planner response to observe loading state
    let resolvePlanner!: () => void;
    const plannerBlocker = new Promise<void>((resolve) => {
      resolvePlanner = resolve;
    });

    await page.route("**/api/v1/planner?*", async (route) => {
      await plannerBlocker;
      await route.fulfill({
        json: {
          success: true,
          data: { columns: PLANNER_COLUMNS, meals: [] },
          error: null,
        },
      });
    });

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "플래너에 추가" }).click();

    // Loading skeleton should be visible
    await expect(page.getByLabel("플래너 정보 불러오는 중")).toBeVisible();

    // Unblock so page can clean up
    resolvePlanner();
  });

  // accept-error (Playwright-level smoke):
  // POST /meals failure shows error message inside sheet, sheet stays open.
  test("shows error inside sheet when meal creation fails", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installRecipeDetailRoute(page);
    await installPlannerRoutes(page);

    await page.route("**/api/v1/meals", async (route) => {
      await route.fulfill({
        status: 422,
        json: {
          success: false,
          data: null,
          error: {
            code: "VALIDATION_ERROR",
            message: "플래너 추가에 실패했어요. 다시 시도해주세요.",
            fields: [],
          },
        },
      });
    });

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "플래너에 추가" }).click();

    const dialog = page.getByRole("dialog", { name: "플래너에 추가" });
    await expect(dialog.getByRole("button", { name: "아침" })).toBeVisible();
    await dialog.getByRole("button", { name: "아침" }).click();
    await dialog.getByRole("button", { name: "플래너에 추가" }).click();

    // Error appears inside dialog, dialog stays open
    await expect(dialog.getByText(/플래너 추가에 실패했어요/)).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});
