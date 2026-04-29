import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

async function mockCookingReadyRoutes(
  page: Page,
  options: { empty?: boolean } = {},
) {
  await page.route("**/api/v1/cooking/ready", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          date_range: { start: "2026-04-27", end: "2026-05-03" },
          recipes: options.empty
            ? []
            : [
                {
                  recipe_id: "recipe-1",
                  recipe_title: "김치찌개",
                  recipe_thumbnail_url: null,
                  meal_ids: ["meal-1", "meal-2"],
                  total_servings: 4,
                },
                {
                  recipe_id: "recipe-2",
                  recipe_title: "된장찌개",
                  recipe_thumbnail_url: null,
                  meal_ids: ["meal-3"],
                  total_servings: 2,
                },
              ],
        },
        error: null,
      },
    });
  });
}

async function mockSessionCreateRoute(
  page: Page,
  options: { conflict?: boolean } = {},
) {
  await page.route("**/api/v1/cooking/sessions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    if (options.conflict) {
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          data: null,
          error: {
            code: "CONFLICT",
            message: "이미 다른 상태로 변경된 식사가 있어요.",
            fields: [],
          },
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: "session-abc",
          recipe_id: "recipe-1",
          status: "in_progress",
          cooking_servings: 4,
          meals: [
            { meal_id: "meal-1", is_cooked: false },
            { meal_id: "meal-2", is_cooked: false },
          ],
        },
        error: null,
      },
    });
  });
}

async function mockPlannerRoutes(page: Page) {
  const columns = [
    { id: "col-breakfast", name: "아침", sort_order: 0 },
    { id: "col-lunch", name: "점심", sort_order: 1 },
    { id: "col-snack", name: "간식", sort_order: 2 },
    { id: "col-dinner", name: "저녁", sort_order: 3 },
  ];
  const meals = [
    {
      id: "meal-1",
      recipe_id: "recipe-1",
      recipe_title: "김치찌개",
      recipe_thumbnail_url: null,
      plan_date: "",
      column_id: "col-breakfast",
      planned_servings: 2,
      status: "shopping_done" as const,
      is_leftover: false,
    },
  ];

  await page.route("**/api/v1/planner?*", async (route) => {
    const url = new URL(route.request().url());
    const startDate = url.searchParams.get("start_date") ?? "";

    for (const meal of meals) {
      meal.plan_date = startDate;
    }

    await route.fulfill({
      json: {
        success: true,
        data: { columns, meals },
        error: null,
      },
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Slice 14 cook session start", () => {
  test("authenticated user sees ready recipe list on /cooking/ready", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookingReadyRoutes(page);

    await page.goto("/cooking/ready");

    await expect(
      page.getByRole("heading", { name: "요리하기" }),
    ).toBeVisible();
    await expect(page.getByText("김치찌개")).toBeVisible();
    await expect(page.getByText("된장찌개")).toBeVisible();
    await expect(page.getByText("4인분")).toBeVisible();
    await expect(page.getByText("2인분")).toBeVisible();
  });

  test("guest user sees login gate on /cooking/ready", async ({ page }) => {
    await setAuthOverride(page, "guest");

    await page.goto("/cooking/ready");

    await expect(
      page.getByText("이 화면은 로그인이 필요해요"),
    ).toBeVisible();
  });

  test("empty state shows when no recipes are ready", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookingReadyRoutes(page, { empty: true });

    await page.goto("/cooking/ready");

    await expect(
      page.getByText("장보기 완료된 레시피가 없어요"),
    ).toBeVisible();
  });

  test("clicking 요리하기 creates session and navigates to cook-mode", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookingReadyRoutes(page);
    await mockSessionCreateRoute(page);

    await page.goto("/cooking/ready");

    await expect(page.getByText("김치찌개")).toBeVisible();

    const startButtons = page.getByTestId("start-session-button");
    await startButtons.first().click();

    await expect(page).toHaveURL(/\/cooking\/sessions\/session-abc\/cook-mode/);
  });

  test("409 conflict shows error toast and refreshes", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookingReadyRoutes(page);
    await mockSessionCreateRoute(page, { conflict: true });

    await page.goto("/cooking/ready");

    await expect(page.getByText("김치찌개")).toBeVisible();

    const startButtons = page.getByTestId("start-session-button");
    await startButtons.first().click();

    await expect(page.getByTestId("session-error-toast")).toBeVisible();
  });

  test("back button navigates to planner", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookingReadyRoutes(page);

    await page.goto("/cooking/ready");

    await expect(
      page.getByRole("heading", { name: "요리하기" }),
    ).toBeVisible();

    await page.getByLabel("뒤로가기").click();

    await expect(page).toHaveURL(/\/planner/);
  });

  test("planner 요리하기 CTA button links to /cooking/ready", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockPlannerRoutes(page);
    await mockCookingReadyRoutes(page);

    await page.goto("/planner");

    await expect(page.getByText("김치찌개")).toBeVisible();

    const cookButton = page.getByRole("link", { name: "요리하기" });
    await expect(cookButton).toBeVisible();
    await expect(cookButton).toHaveAttribute("href", "/cooking/ready");
  });
});
