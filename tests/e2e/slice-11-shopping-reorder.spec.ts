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
        is_checked: false,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 100,
      },
      {
        id: "item-3",
        ingredient_id: "ing-3",
        display_text: "당근 3개",
        amounts_json: [{ amount: 3, unit: "개" }],
        is_checked: false,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 200,
      },
      {
        id: "item-4",
        ingredient_id: "ing-4",
        display_text: "간장 2큰술",
        amounts_json: [{ amount: 2, unit: "큰술" }],
        is_checked: false,
        is_pantry_excluded: true,
        added_to_pantry: false,
        sort_order: 300,
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

test.describe("slice 11: shopping reorder", () => {
  test.describe("reorder button visibility", () => {
    test("should show reorder buttons for incomplete list", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      // Check that reorder buttons are visible for purchase items
      const moveUpButton = page.getByRole("button", { name: /대파.*위로 이동/ });
      const moveDownButton = page.getByRole("button", { name: /양파.*아래로 이동/ });
      await expect(moveUpButton).toBeVisible();
      await expect(moveDownButton).toBeVisible();
    });

    test("should not show reorder buttons for completed list", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const completedList = buildShoppingListDetail({
        is_completed: true,
        completed_at: "2026-04-13T00:00:00.000Z",
      });

      await installShoppingDetailRoute(page, completedList);

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(
        page.getByText("완료된 장보기 기록은 수정할 수 없어요")
      ).toBeVisible();

      // Reorder buttons should not be present
      const moveButtons = page.getByRole("button", { name: /이동/ });
      await expect(moveButtons).not.toBeVisible();
    });
  });

  test.describe("reorder happy path", () => {
    test("should call reorder API when clicking move button", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      let reorderCalled = false;
      let reorderBody: { orders?: Array<{ item_id: string; sort_order: number }> } | null = null as { orders?: Array<{ item_id: string; sort_order: number }> } | null;
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/reorder`,
        async (route) => {
          if (route.request().method() !== "PATCH") {
            await route.continue();
            return;
          }
          reorderCalled = true;
          reorderBody = JSON.parse(route.request().postData() ?? "{}") as { orders?: Array<{ item_id: string; sort_order: number }> };
          await route.fulfill({
            json: {
              success: true,
              data: {
                updated: reorderBody.orders?.length ?? 0,
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      // Click move down button on first item
      const moveDownButton = page.getByRole("button", { name: /양파.*아래로 이동/ });
      await moveDownButton.click();

      await page.waitForTimeout(500);

      expect(reorderCalled).toBe(true);
      expect(reorderBody).not.toBeNull();
      expect(reorderBody?.orders).toEqual([
        { item_id: "item-2", sort_order: 0 },
        { item_id: "item-1", sort_order: 10 },
        { item_id: "item-3", sort_order: 20 },
        { item_id: "item-4", sort_order: 30 },
      ]);
    });
  });

  test.describe("reorder error handling", () => {
    test("should show error toast when reorder fails", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/reorder`,
        async (route) => {
          if (route.request().method() !== "PATCH") {
            await route.continue();
            return;
          }
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
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      // Click move down button
      const moveDownButton = page.getByRole("button", { name: /양파.*아래로 이동/ });
      await moveDownButton.click();

      await page.waitForTimeout(500);

      // Error toast should appear
      await expect(page.getByText("서버 오류가 발생했어요.")).toBeVisible();
    });

    test("should show conflict error when reordering completed list", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/reorder`,
        async (route) => {
          if (route.request().method() !== "PATCH") {
            await route.continue();
            return;
          }
          await route.fulfill({
            status: 409,
            json: {
              success: false,
              data: null,
              error: {
                code: "CONFLICT",
                message: "완료된 장보기 기록은 수정할 수 없어요",
                fields: [],
              },
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      // Click move down button
      const moveDownButton = page.getByRole("button", { name: /양파.*아래로 이동/ });
      await moveDownButton.click();

      await page.waitForTimeout(500);

      // Conflict error should appear
      await expect(page.getByText("완료된 장보기 기록은 수정할 수 없어요")).toBeVisible();
    });

    test("should rollback order on reorder failure", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/reorder`,
        async (route) => {
          if (route.request().method() !== "PATCH") {
            await route.continue();
            return;
          }
          await route.fulfill({
            status: 500,
            json: {
              success: false,
              data: null,
              error: {
                code: "INTERNAL_ERROR",
                message: "순서 변경에 실패했어요",
                fields: [],
              },
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      // Get initial order
      const purchaseSection = page.locator("text=/구매할 재료/").locator("..");
      const itemsBefore = await purchaseSection.locator('[role="checkbox"]').all();
      const firstItemText = await itemsBefore[0].getAttribute("aria-label");

      // Click move down button
      const moveDownButton = page.getByRole("button", { name: /양파.*아래로 이동/ });
      await moveDownButton.click();

      await page.waitForTimeout(500);

      // Error should appear and order should be rolled back
      await expect(page.getByText("순서 변경에 실패했어요")).toBeVisible();

      // Check that order is restored (first item is still first)
      const itemsAfter = await purchaseSection.locator('[role="checkbox"]').all();
      const firstItemTextAfter = await itemsAfter[0].getAttribute("aria-label");
      expect(firstItemTextAfter).toBe(firstItemText);
    });
  });

  test.describe("read-only mode", () => {
    test("should not allow reorder in completed list", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const completedList = buildShoppingListDetail({
        is_completed: true,
        completed_at: "2026-04-13T00:00:00.000Z",
      });

      await installShoppingDetailRoute(page, completedList);

      let reorderCalled = false;
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/reorder`,
        async (route) => {
          reorderCalled = true;
          await route.fulfill({
            status: 409,
            json: {
              success: false,
              data: null,
              error: {
                code: "CONFLICT",
                message: "완료된 장보기 기록은 수정할 수 없어요",
                fields: [],
              },
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(
        page.getByText("완료된 장보기 기록은 수정할 수 없어요")
      ).toBeVisible();

      // Reorder buttons should not be visible
      const moveButtons = page.getByRole("button", { name: /이동/ });
      await expect(moveButtons).not.toBeVisible();

      // Reorder API should not be called
      await page.waitForTimeout(500);
      expect(reorderCalled).toBe(false);
    });
  });
});
