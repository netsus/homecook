import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const SHOPPING_LIST_ID = "550e8400-e29b-41d4-a716-446655440001";
const SHOPPING_DETAIL_URL = `/shopping/lists/${SHOPPING_LIST_ID}`;

interface ShoppingListDetail {
  id: string;
  title: string;
  date_range_start: string;
  date_range_end: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  recipes: Array<{
    recipe_id: string;
    recipe_name: string;
    recipe_thumbnail: string | null;
    shopping_servings: number;
    planned_servings_total: number;
  }>;
  items: Array<{
    id: string;
    ingredient_id: string;
    display_text: string;
    amounts_json: Array<{ amount: number; unit: string }>;
    is_checked: boolean;
    is_pantry_excluded: boolean;
    added_to_pantry: boolean;
    sort_order: number;
  }>;
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

function buildShoppingListDetail(
  overrides: Partial<ShoppingListDetail> = {}
): ShoppingListDetail {
  return {
    id: SHOPPING_LIST_ID,
    title: "4월 12일 장보기",
    date_range_start: "2026-04-12",
    date_range_end: "2026-04-20",
    is_completed: false,
    completed_at: null,
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    recipes: [
      {
        recipe_id: "recipe-1",
        recipe_name: "김치찌개",
        recipe_thumbnail: null,
        shopping_servings: 4,
        planned_servings_total: 4,
      },
    ],
    items: [
      {
        id: "item-1",
        ingredient_id: "ing-1",
        display_text: "양파 2개",
        amounts_json: [{ amount: 2, unit: "개" }],
        is_checked: false,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 0,
      },
      {
        id: "item-2",
        ingredient_id: "ing-2",
        display_text: "대파 1단",
        amounts_json: [{ amount: 1, unit: "단" }],
        is_checked: true,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 100,
      },
    ],
    ...overrides,
  };
}

async function installShoppingDetailRoute(
  page: Page,
  listDetail: ShoppingListDetail
) {
  await page.route(`**/api/v1/shopping/lists/${SHOPPING_LIST_ID}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: listDetail,
        error: null,
      },
    });
  });
}

async function confirmDefaultPantryReflection(page: Page) {
  const dialog = page.getByRole("dialog", { name: "팬트리에 추가할까요?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "완료", exact: true }).click();
}

async function installPlannerRoute(
  page: Page,
  getStatus: () => "registered" | "shopping_done"
) {
  await page.route("**/api/v1/planner?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    const requestUrl = new URL(route.request().url());
    const planDate = requestUrl.searchParams.get("start_date") ?? "2026-04-12";

    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [
            {
              id: "breakfast",
              name: "아침",
              sort_order: 0,
            },
          ],
          meals: [
            {
              id: "meal-1",
              recipe_id: "recipe-1",
              recipe_title: "김치찌개",
              recipe_thumbnail_url: null,
              plan_date: planDate,
              column_id: "breakfast",
              planned_servings: 4,
              status: getStatus(),
              is_leftover: false,
            },
          ],
        },
        error: null,
      },
    });
  });
}

test.describe("slice 12a: shopping complete", () => {
  test.describe("complete button visibility", () => {
    test("should show complete button for incomplete lists", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({ is_completed: false });
      await installShoppingDetailRoute(page, listDetail);

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();
      await expect(page.getByRole("button", { name: "장보기 완료" })).toBeVisible();
    });

    test("should hide complete button for completed lists", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({
        is_completed: true,
        completed_at: "2026-04-27T10:00:00.000Z",
      });
      await installShoppingDetailRoute(page, listDetail);

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();
      await expect(page.getByText(/완료됨/)).toBeVisible();
      await expect(page.getByRole("button", { name: "장보기 완료" })).not.toBeVisible();
    });
  });

  test.describe("complete flow", () => {
    test("should complete shopping list successfully", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({ is_completed: false });
      await installShoppingDetailRoute(page, listDetail);

      // Mock complete API
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/complete`,
        async (route) => {
          if (route.request().method() !== "POST") {
            await route.continue();
            return;
          }
          await route.fulfill({
            json: {
              success: true,
              data: {
                completed: true,
                meals_updated: 3,
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      const completeButton = page.getByRole("button", { name: "장보기 완료" });
      await expect(completeButton).toBeVisible();

      await completeButton.click();
      await confirmDefaultPantryReflection(page);

      // Should show success message
      await expect(page.getByText(/장보기를 완료했어요.*3개 식사/)).toBeVisible();

      // Button should disappear
      await expect(page.getByRole("button", { name: "장보기 완료" })).not.toBeVisible();

      // Should show completed badge
      await expect(page.getByText(/완료됨/)).toBeVisible();
    });

    test("should show shopping_done status in planner after completion", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      let listCompleted = false;
      let plannerMealStatus: "registered" | "shopping_done" = "registered";

      await page.route(`**/api/v1/shopping/lists/${SHOPPING_LIST_ID}`, async (route) => {
        if (route.request().method() !== "GET") {
          await route.continue();
          return;
        }

        await route.fulfill({
          json: {
            success: true,
            data: buildShoppingListDetail({
              is_completed: listCompleted,
              completed_at: listCompleted ? "2026-04-27T10:00:00.000Z" : null,
            }),
            error: null,
          },
        });
      });

      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/complete`,
        async (route) => {
          if (route.request().method() !== "POST") {
            await route.continue();
            return;
          }

          listCompleted = true;
          plannerMealStatus = "shopping_done";

          await route.fulfill({
            json: {
              success: true,
              data: {
                completed: true,
                meals_updated: 1,
              },
              error: null,
            },
          });
        }
      );
      await installPlannerRoute(page, () => plannerMealStatus);

      await page.goto(SHOPPING_DETAIL_URL);

      await page.getByRole("button", { name: "장보기 완료" }).click();
      await confirmDefaultPantryReflection(page);

      await expect(page.getByText(/장보기를 완료했어요.*1개 식사/)).toBeVisible();
      await expect(page.getByRole("button", { name: "장보기 완료" })).not.toBeVisible();

      await page.goto("/planner");

      await expect(page.getByText("김치찌개")).toBeVisible();
      await expect(page.locator('[aria-label="장보기 완료"]')).toBeVisible();
    });

    test("should handle 401 error by redirecting to login", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({ is_completed: false });
      await installShoppingDetailRoute(page, listDetail);

      // Mock complete API with 401
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/complete`,
        async (route) => {
          await route.fulfill({
            status: 401,
            json: {
              success: false,
              data: null,
              error: {
                code: "UNAUTHORIZED",
                message: "로그인이 필요해요",
                fields: [],
              },
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      const completeButton = page.getByRole("button", { name: "장보기 완료" });
      await completeButton.click();
      await confirmDefaultPantryReflection(page);

      // Should redirect to login with return URL
      await page.waitForURL(`**/login?next=/shopping/lists/${SHOPPING_LIST_ID}`);
    });

    test("should handle 409 conflict error", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({ is_completed: false });
      await installShoppingDetailRoute(page, listDetail);

      // Mock complete API with 409
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/complete`,
        async (route) => {
          await route.fulfill({
            status: 409,
            json: {
              success: false,
              data: null,
              error: {
                code: "CONFLICT",
                message: "이미 완료된 장보기 기록이에요",
                fields: [],
              },
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      const completeButton = page.getByRole("button", { name: "장보기 완료" });
      await completeButton.click();
      await confirmDefaultPantryReflection(page);

      // Should show error message
      await expect(page.getByText("이미 완료된 장보기 기록이에요")).toBeVisible();
    });

    test("should handle generic API error", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({ is_completed: false });
      await installShoppingDetailRoute(page, listDetail);

      // Mock complete API with 500
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/complete`,
        async (route) => {
          await route.fulfill({
            status: 500,
            json: {
              success: false,
              data: null,
              error: {
                code: "INTERNAL_ERROR",
                message: "서버 오류가 발생했어요",
                fields: [],
              },
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      const completeButton = page.getByRole("button", { name: "장보기 완료" });
      await completeButton.click();
      await confirmDefaultPantryReflection(page);

      // Should show error message
      await expect(page.getByText("서버 오류가 발생했어요")).toBeVisible();
    });
  });

  test.describe("read-only UI after completion", () => {
    test("should disable check/exclude/reorder controls for completed lists", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({
        is_completed: true,
        completed_at: "2026-04-27T10:00:00.000Z",
      });
      await installShoppingDetailRoute(page, listDetail);

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      // Check controls should be disabled
      const checkboxes = page.getByRole("checkbox");
      const firstCheckbox = checkboxes.first();
      await expect(firstCheckbox).toBeDisabled();

      // Exclude buttons should not be visible
      await expect(page.getByRole("button", { name: /팬트리 제외/ })).not.toBeVisible();

      // Reorder buttons should not be visible
      await expect(page.getByRole("button", { name: /위로 이동/ })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /아래로 이동/ })).not.toBeVisible();

      // Read-only notice should be visible
      await expect(page.getByText(/완료된 장보기 기록은 수정할 수 없어요/)).toBeVisible();
    });
  });
});
