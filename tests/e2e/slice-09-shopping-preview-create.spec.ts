import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const SHOPPING_FLOW_URL = "/shopping/flow";

interface ShoppingPreviewMeal {
  id: string;
  recipe_id: string;
  recipe_name: string;
  recipe_thumbnail: string | null;
  planned_servings: number;
  created_at: string;
}

interface ShoppingListSummary {
  id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
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
    { key: E2E_AUTH_OVERRIDE_KEY, state: value }
  );
}

function buildPreviewMeal(
  overrides: Partial<ShoppingPreviewMeal> = {}
): ShoppingPreviewMeal {
  return {
    id: "meal-1",
    recipe_id: "recipe-1",
    recipe_name: "김치찌개",
    recipe_thumbnail: null,
    planned_servings: 2,
    created_at: "2026-04-26T00:00:00Z",
    ...overrides,
  };
}

async function installShoppingPreviewRoute(
  page: Page,
  meals: ShoppingPreviewMeal[]
) {
  await page.route("**/api/v1/shopping/preview", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          eligible_meals: meals,
        },
        error: null,
      },
    });
  });
}


test.describe("slice 09: shopping preview and list creation", () => {
  test.describe("loading state", () => {
    test("should show loading state while fetching preview", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      // Install route that never resolves
      await page.route("**/api/v1/shopping/preview", () => {
        // Don't fulfill, keep pending
      });

      await page.goto(SHOPPING_FLOW_URL);

      await expect(
        page.getByText("장볼 레시피를 불러오고 있어요")
      ).toBeVisible();
      await expect(page.getByText("잠시만 기다려 주세요.")).toBeVisible();
    });
  });

  test.describe("empty state", () => {
    test("should show empty state when no eligible meals", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, []);

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("장보기 대상이 없어요")).toBeVisible();
      await expect(
        page.getByText("플래너에 식사를 먼저 등록해 주세요.")
      ).toBeVisible();
      await expect(page.getByText("플래너로 돌아가기")).toBeVisible();
    });

    test("should navigate to planner when clicking back button", async ({
      page,
    }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, []);

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("플래너로 돌아가기")).toBeVisible();

      await page.getByText("플래너로 돌아가기").click();

      await expect(page).toHaveURL("/planner");
    });
  });

  test.describe("error state", () => {
    test("should show error state when API fails", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      await page.route("**/api/v1/shopping/preview", async (route) => {
        await route.fulfill({
          status: 500,
          json: {
            success: false,
            data: null,
            error: {
              code: "INTERNAL_ERROR",
              message: "서버 오류가 발생했어요.",
              fields: [],
            },
          },
        });
      });

      await page.goto(SHOPPING_FLOW_URL);

      await expect(
        page.getByText("장보기 목록을 불러오지 못했어요")
      ).toBeVisible();
      await expect(page.getByText("서버 오류가 발생했어요.")).toBeVisible();
      await expect(page.getByText("다시 시도")).toBeVisible();
    });

    test("should retry when clicking retry button", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      let callCount = 0;
      await page.route("**/api/v1/shopping/preview", async (route) => {
        callCount++;
        if (callCount === 1) {
          await route.fulfill({
            status: 500,
            json: {
              success: false,
              data: null,
              error: {
                code: "INTERNAL_ERROR",
                message: "서버 오류가 발생했어요.",
                fields: [],
              },
            },
          });
        } else {
          await route.fulfill({
            json: {
              success: true,
              data: {
                eligible_meals: [buildPreviewMeal()],
              },
              error: null,
            },
          });
        }
      });

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("다시 시도")).toBeVisible();
      await page.getByText("다시 시도").click();

      await expect(page.getByText("김치찌개")).toBeVisible();
    });
  });

  test.describe("ready state", () => {
    test("should display eligible meals with auto-selection", async ({
      page,
    }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({ id: "meal-1", recipe_name: "김치찌개" }),
        buildPreviewMeal({ id: "meal-2", recipe_name: "된장찌개" }),
      ]);

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();
      await expect(page.getByText("된장찌개")).toBeVisible();
      await expect(page.getByText("장보기 목록 만들기")).toBeEnabled();
    });

    test("should toggle meal selection", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({ id: "meal-1", recipe_name: "김치찌개" }),
      ]);

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();
      const checkbox = page.getByLabel("김치찌개 선택 해제");
      await checkbox.click();

      await expect(page.getByLabel("김치찌개 선택")).toBeVisible();
      await expect(page.getByText("장보기 목록 만들기")).toBeDisabled();

      // Re-select
      await page.getByLabel("김치찌개 선택").click();
      await expect(page.getByText("장보기 목록 만들기")).toBeEnabled();
    });

    test("should adjust shopping servings", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({
          id: "meal-1",
          recipe_name: "김치찌개",
          planned_servings: 2,
        }),
      ]);

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      // Increase servings
      const plusButton = page.getByLabel("인분 늘리기");
      await plusButton.click();
      await expect(page.getByText("3")).toBeVisible();

      await plusButton.click();
      await expect(page.getByText("4")).toBeVisible();

      // Decrease servings
      const minusButton = page.getByLabel("인분 줄이기");
      await minusButton.click();
      await expect(page.getByText("3")).toBeVisible();
    });

    test("should not allow servings below 1", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({
          id: "meal-1",
          recipe_name: "김치찌개",
          planned_servings: 1,
        }),
      ]);

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      const minusButton = page.getByLabel("인분 줄이기");
      await expect(minusButton).toBeDisabled();
    });

    test("should disable stepper when meal is deselected", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({ id: "meal-1", recipe_name: "김치찌개" }),
      ]);

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      const checkbox = page.getByLabel("김치찌개 선택 해제");
      await checkbox.click();

      const plusButton = page.getByLabel("인분 늘리기");
      const minusButton = page.getByLabel("인분 줄이기");
      await expect(plusButton).toBeDisabled();
      await expect(minusButton).toBeDisabled();
    });
  });

  test.describe("create shopping list", () => {
    test("should create list and navigate to detail", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({
          id: "meal-1",
          recipe_name: "김치찌개",
          planned_servings: 2,
        }),
      ]);

      const createdList: ShoppingListSummary = {
        id: "list-1",
        title: "장보기 목록",
        is_completed: false,
        created_at: "2026-04-26T00:00:00Z",
      };

      let requestBody: unknown = null;
      await page.route("**/api/v1/shopping/lists", async (route) => {
        requestBody = route.request().postDataJSON();
        await route.fulfill({
          json: {
            success: true,
            data: createdList,
            error: null,
          },
        });
      });

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      await page.getByText("장보기 목록 만들기").click();

      // Verify request body
      expect(requestBody).toEqual({
        meal_configs: [
          {
            meal_id: "meal-1",
            shopping_servings: 2,
          },
        ],
      });

      await expect(page).toHaveURL("/shopping/list-1");
    });

    test("should submit only selected meals", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({ id: "meal-1", recipe_name: "김치찌개" }),
        buildPreviewMeal({ id: "meal-2", recipe_name: "된장찌개" }),
      ]);

      const createdList: ShoppingListSummary = {
        id: "list-1",
        title: "장보기 목록",
        is_completed: false,
        created_at: "2026-04-26T00:00:00Z",
      };

      let requestBody: unknown = null;
      await page.route("**/api/v1/shopping/lists", async (route) => {
        requestBody = route.request().postDataJSON();
        await route.fulfill({
          json: {
            success: true,
            data: createdList,
            error: null,
          },
        });
      });

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      // Deselect second meal
      await page.getByLabel("된장찌개 선택 해제").click();

      await page.getByText("장보기 목록 만들기").click();

      // Should only submit meal-1
      expect(requestBody).toEqual({
        meal_configs: [
          {
            meal_id: "meal-1",
            shopping_servings: 2,
          },
        ],
      });
    });

    test("should submit adjusted servings", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({
          id: "meal-1",
          recipe_name: "김치찌개",
          planned_servings: 2,
        }),
      ]);

      const createdList: ShoppingListSummary = {
        id: "list-1",
        title: "장보기 목록",
        is_completed: false,
        created_at: "2026-04-26T00:00:00Z",
      };

      let requestBody: unknown = null;
      await page.route("**/api/v1/shopping/lists", async (route) => {
        requestBody = route.request().postDataJSON();
        await route.fulfill({
          json: {
            success: true,
            data: createdList,
            error: null,
          },
        });
      });

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      // Increase to 4 servings
      const plusButton = page.getByLabel("인분 늘리기");
      await plusButton.click();
      await plusButton.click();

      await page.getByText("장보기 목록 만들기").click();

      expect(requestBody).toEqual({
        meal_configs: [
          {
            meal_id: "meal-1",
            shopping_servings: 4,
          },
        ],
      });
    });

    test("should show creating state", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({ id: "meal-1", recipe_name: "김치찌개" }),
      ]);

      await page.route("**/api/v1/shopping/lists", () => {
        // Never resolve
      });

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      await page.getByText("장보기 목록 만들기").click();

      await expect(
        page.getByText("장보기 목록을 만들고 있어요")
      ).toBeVisible();
      await expect(
        page.getByText("팬트리 재료를 확인 중이에요...")
      ).toBeVisible();
    });

    test("should handle 409 conflict error", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({ id: "meal-1", recipe_name: "김치찌개" }),
      ]);

      await page.route("**/api/v1/shopping/lists", async (route) => {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            data: null,
            error: {
              code: "CONFLICT",
              message: "이미 다른 장보기 리스트에 포함된 식사가 있어요.",
              fields: [],
            },
          },
        });
      });

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      await page.getByText("장보기 목록 만들기").click();

      await expect(
        page.getByText("이미 다른 장보기 리스트에 포함된 식사가 있어요.")
      ).toBeVisible();
    });
  });

  test.describe("navigation", () => {
    test("should navigate back to planner", async ({ page }) => {
      await setAuthOverride(page, "authenticated");
      await installShoppingPreviewRoute(page, [
        buildPreviewMeal({ id: "meal-1", recipe_name: "김치찌개" }),
      ]);

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page.getByText("김치찌개")).toBeVisible();

      await page.getByLabel("뒤로 가기").click();

      await expect(page).toHaveURL("/planner");
    });
  });

  test.describe("unauthorized", () => {
    test("should redirect to login when not authenticated", async ({ page }) => {
      await setAuthOverride(page, "guest");

      await page.goto(SHOPPING_FLOW_URL);

      await expect(page).toHaveURL(/\/login\?next=/);
    });
  });
});
