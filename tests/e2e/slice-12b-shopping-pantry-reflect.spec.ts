import { expect, test, type Page, type Request } from "@playwright/test";

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
        is_checked: true,
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

function pantryDialog(page: Page) {
  return page.getByRole("dialog", { name: "팬트리에 추가할까요?" });
}

function parseJsonRequestBody(request: Request): unknown {
  const postData = request.postData();
  return postData ? JSON.parse(postData) : undefined;
}

function waitForCompleteRequest(page: Page) {
  return page.waitForRequest(
    (request) =>
      request.url().endsWith(`/api/v1/shopping/lists/${SHOPPING_LIST_ID}/complete`) &&
      request.method() === "POST"
  );
}

test.describe("slice 12b: shopping pantry reflect", () => {
  test.describe("pantry reflection popup", () => {
    test("should show popup when clicking complete button", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({ is_completed: false });
      await installShoppingDetailRoute(page, listDetail);

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      const completeButton = page.getByRole("button", { name: "장보기 완료" });
      await completeButton.click();

      // Should show pantry popup
      await expect(page.getByText("팬트리에 추가할까요?")).toBeVisible();
      await expect(page.getByText("모두 추가")).toBeVisible();
      await expect(page.getByText("선택 추가")).toBeVisible();
      await expect(page.getByText("추가 안 함")).toBeVisible();
    });

    test("should complete with all items when 모두 추가 is selected", async ({ page }) => {
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
                meals_updated: 2,
                pantry_added: 2,
                pantry_added_item_ids: ["item-1", "item-2"],
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await page.getByRole("button", { name: "장보기 완료" }).click();

      // Popup should appear
      await expect(page.getByText("팬트리에 추가할까요?")).toBeVisible();

      // "모두 추가" is selected by default, click confirm
      const confirmButton = pantryDialog(page).getByRole("button", {
        name: "완료",
        exact: true,
      });
      const completeRequestPromise = waitForCompleteRequest(page);
      await confirmButton.click();
      const completeRequest = await completeRequestPromise;

      // Should call API with undefined body (no add_to_pantry_item_ids field)
      expect(parseJsonRequestBody(completeRequest)).toBeUndefined();

      // Should show success message
      await expect(page.getByText(/장보기를 완료했어요.*2개 식사.*팬트리 2개 추가/)).toBeVisible();
    });

    test("should complete with no pantry items when 추가 안 함 is selected", async ({ page }) => {
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
                meals_updated: 2,
                pantry_added: 0,
                pantry_added_item_ids: [],
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await page.getByRole("button", { name: "장보기 완료" }).click();

      // Popup should appear
      await expect(page.getByText("팬트리에 추가할까요?")).toBeVisible();

      // Click "추가 안 함"
      await page.getByText("추가 안 함").click();

      // Click confirm
      const confirmButton = pantryDialog(page).getByRole("button", {
        name: "완료",
        exact: true,
      });
      const completeRequestPromise = waitForCompleteRequest(page);
      await confirmButton.click();
      const completeRequest = await completeRequestPromise;

      // Should call API with empty array
      expect(parseJsonRequestBody(completeRequest)).toEqual({ add_to_pantry_item_ids: [] });

      // Should show success message without pantry count
      await expect(page.getByText(/장보기를 완료했어요.*2개 식사/)).toBeVisible();
      await expect(page.getByText(/팬트리.*추가/)).not.toBeVisible();
    });

    test("should complete with selected items when 선택 추가 is chosen", async ({ page }) => {
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
                meals_updated: 2,
                pantry_added: 1,
                pantry_added_item_ids: ["item-1"],
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await page.getByRole("button", { name: "장보기 완료" }).click();

      // Popup should appear
      await expect(page.getByText("팬트리에 추가할까요?")).toBeVisible();

      // Click "선택 추가"
      await page.getByText("선택 추가").click();

      // Should show item list
      const dialog = pantryDialog(page);
      await expect(dialog.getByRole("button", { name: /양파/ })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /대파/ })).toBeVisible();

      // Uncheck item-2 (대파)
      const dapaButton = dialog.getByRole("button", { name: /대파/ });
      await dapaButton.click();

      // Should show "1개 선택됨"
      await expect(page.getByText("1개 선택됨")).toBeVisible();

      // Click confirm
      const confirmButton = dialog.getByRole("button", {
        name: "완료",
        exact: true,
      });
      const completeRequestPromise = waitForCompleteRequest(page);
      await confirmButton.click();
      const completeRequest = await completeRequestPromise;

      // Should call API with only item-1
      expect(parseJsonRequestBody(completeRequest)).toEqual({
        add_to_pantry_item_ids: ["item-1"],
      });

      // Should show success message
      await expect(page.getByText(/장보기를 완료했어요.*2개 식사.*팬트리 1개 추가/)).toBeVisible();
    });

    test("should cancel popup without completing", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail({ is_completed: false });
      await installShoppingDetailRoute(page, listDetail);

      let completeRequestCalled = false;

      // Mock complete API
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/complete`,
        async (route) => {
          completeRequestCalled = true;
          await route.continue();
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      await page.getByRole("button", { name: "장보기 완료" }).click();

      // Popup should appear
      await expect(page.getByText("팬트리에 추가할까요?")).toBeVisible();

      // Click cancel
      const cancelButton = page.getByRole("button", { name: "취소" });
      await cancelButton.click();

      // Popup should disappear
      await expect(page.getByText("팬트리에 추가할까요?")).not.toBeVisible();

      // API should not be called
      expect(completeRequestCalled).toBe(false);

      // Complete button should still be visible
      await expect(page.getByRole("button", { name: "장보기 완료" })).toBeVisible();
    });

    test("should only show checked and not-excluded items in popup", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const mixedList = buildShoppingListDetail({
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: true,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            display_text: "대파 1단",
            amounts_json: [{ amount: 1, unit: "단" }],
            is_checked: false, // unchecked → should not appear
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 100,
          },
          {
            id: "item-3",
            ingredient_id: "ing-3",
            display_text: "간장 2큰술",
            amounts_json: [{ amount: 2, unit: "큰술" }],
            is_checked: true,
            is_pantry_excluded: true, // excluded → should not appear
            added_to_pantry: false,
            sort_order: 200,
          },
        ],
      });

      await installShoppingDetailRoute(page, mixedList);

      await page.goto(SHOPPING_DETAIL_URL);

      await page.getByRole("button", { name: "장보기 완료" }).click();

      // Popup should appear
      await expect(page.getByText("팬트리에 추가할까요?")).toBeVisible();

      // Should show "(1개)" for eligible items
      await expect(page.getByText(/체크한 모든 재료를 팬트리에 추가해요 \(1개\)/)).toBeVisible();

      // Click "선택 추가" to see item list
      await page.getByText("선택 추가").click();

      // Only item-1 should be visible
      const dialog = pantryDialog(page);
      await expect(dialog.getByRole("button", { name: /양파/ })).toBeVisible();

      // item-2 (unchecked) and item-3 (excluded) should not be visible
      await expect(dialog.getByRole("button", { name: /대파/ })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: /간장/ })).toHaveCount(0);
    });
  });

  test.describe("pantry reflection visual feedback", () => {
    test("should show 'pantry added' indicator after completion", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      let listCompleted = false;

      await page.route(`**/api/v1/shopping/lists/${SHOPPING_LIST_ID}`, async (route) => {
        if (route.request().method() !== "GET") {
          await route.continue();
          return;
        }

        const listData = buildShoppingListDetail({
          is_completed: listCompleted,
          completed_at: listCompleted ? "2026-04-27T10:00:00.000Z" : null,
          items: [
            {
              id: "item-1",
              ingredient_id: "ing-1",
              display_text: "양파 2개",
              amounts_json: [{ amount: 2, unit: "개" }],
              is_checked: true,
              is_pantry_excluded: false,
              added_to_pantry: listCompleted, // marked as added after completion
              sort_order: 0,
            },
          ],
        });

        await route.fulfill({
          json: {
            success: true,
            data: listData,
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

          await route.fulfill({
            json: {
              success: true,
              data: {
                completed: true,
                meals_updated: 1,
                pantry_added: 1,
                pantry_added_item_ids: ["item-1"],
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      // Before completion
      await expect(page.getByText("양파")).toBeVisible();
      await expect(page.getByText("팬트리 반영 완료")).not.toBeVisible();

      // Click complete
      await page.getByRole("button", { name: "장보기 완료" }).click();

      // Popup should appear
      await expect(page.getByText("팬트리에 추가할까요?")).toBeVisible();

      // Confirm with default "모두 추가"
      const confirmButton = pantryDialog(page).getByRole("button", {
        name: "완료",
        exact: true,
      });
      await confirmButton.click();

      // Should show success message
      await expect(page.getByText(/장보기를 완료했어요.*1개 식사.*팬트리 1개 추가/)).toBeVisible();

      // Should show "팬트리 반영 완료" indicator
      await expect(page.getByText("팬트리 반영 완료")).toBeVisible();
    });
  });
});
