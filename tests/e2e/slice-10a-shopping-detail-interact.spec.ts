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
        display_text: "간장 2큰술",
        amounts_json: [{ amount: 2, unit: "큰술" }],
        is_checked: false,
        is_pantry_excluded: true,
        added_to_pantry: false,
        sort_order: 200,
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

test.describe("slice 10a: shopping detail interact", () => {
  test.describe("loading state", () => {
    test("should show loading state while fetching detail", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      // Install route that never resolves
      await page.route(`**/api/v1/shopping/lists/${SHOPPING_LIST_ID}`, () => {
        // Don't fulfill, keep pending
      });

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(
        page.getByText("장보기 리스트를 불러오고 있어요...")
      ).toBeVisible();
    });
  });

  test.describe("error state", () => {
    test("should show error state when API fails", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      await page.route(`**/api/v1/shopping/lists/${SHOPPING_LIST_ID}`, async (route) => {
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

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(
        page.getByText("장보기 리스트를 불러올 수 없어요")
      ).toBeVisible();
      await expect(page.getByText("다시 시도")).toBeVisible();
    });

    test("should redirect to login when unauthorized", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      await page.route(`**/api/v1/shopping/lists/${SHOPPING_LIST_ID}`, async (route) => {
        await route.fulfill({
          status: 401,
          json: {
            success: false,
            data: null,
            error: {
              code: "UNAUTHORIZED",
              message: "로그인이 필요해요.",
              fields: [],
            },
          },
        });
      });

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page).toHaveURL(/\/login\?next=/);
    });
  });

  test.describe("empty state", () => {
    test("should show empty state when all items are excluded", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const emptyList = buildShoppingListDetail({
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: true,
            added_to_pantry: false,
            sort_order: 0,
          },
        ],
      });

      await installShoppingDetailRoute(page, emptyList);

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("팬트리에 이미 있어서")).toBeVisible();
      await expect(page.getByText("장볼 재료가 없어요")).toBeVisible();
      await expect(page.getByText(/팬트리 제외 항목 \(1개\)/)).toBeVisible();
    });
  });

  test.describe("happy path", () => {
    test("should render list detail with purchase and excluded sections", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      await page.goto(SHOPPING_DETAIL_URL);

      // Check title and date range
      await expect(page.getByText("4월 12일 장보기")).toBeVisible();
      await expect(page.getByText("4월 12일 ~ 20일")).toBeVisible();

      // Check purchase section
      await expect(page.getByText(/구매할 재료 \(2개\)/)).toBeVisible();

      // Check excluded section
      await expect(page.getByText(/팬트리 제외 항목 \(1개\)/)).toBeVisible();
    });

    test("should toggle item check status", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      let patchCalled = false;
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/item-1`,
        async (route) => {
          if (route.request().method() !== "PATCH") {
            await route.continue();
            return;
          }
          patchCalled = true;
          await route.fulfill({
            json: {
              success: true,
              data: {
                ...listDetail.items[0],
                is_checked: true,
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      const checkbox = page.getByRole("checkbox", { name: /양파.*구매 완료 표시/ });
      await checkbox.click();

      await page.waitForTimeout(200);
      expect(patchCalled).toBe(true);
    });

    test("should move item to excluded section", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      let patchCalled = false;
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/item-1`,
        async (route) => {
          if (route.request().method() !== "PATCH") {
            await route.continue();
            return;
          }
          patchCalled = true;
          await route.fulfill({
            json: {
              success: true,
              data: {
                ...listDetail.items[0],
                is_pantry_excluded: true,
                is_checked: false, // exclude→uncheck rule
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      const excludeButton = page.getByRole("button", { name: /양파.*팬트리 제외/ });
      await excludeButton.click();

      await page.waitForTimeout(200);
      expect(patchCalled).toBe(true);
    });

    test("should restore item from excluded section", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      let patchCalled = false;
      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/item-3`,
        async (route) => {
          if (route.request().method() !== "PATCH") {
            await route.continue();
            return;
          }
          patchCalled = true;
          await route.fulfill({
            json: {
              success: true,
              data: {
                ...listDetail.items[2],
                is_pantry_excluded: false,
              },
              error: null,
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      const restoreButton = page.getByRole("button", { name: /간장.*팬트리 되살리기/ });
      await restoreButton.click();

      await page.waitForTimeout(200);
      expect(patchCalled).toBe(true);
    });
  });

  test.describe("read-only mode", () => {
    test("should show read-only notice for completed list", async ({ page }) => {
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
      await expect(page.getByText(/✓ 완료됨 \(4월 13일\)/)).toBeVisible();
      await expect(page.getByText(/구매한 재료 \(2개\)/)).toBeVisible();
    });

    test("should not show action buttons in read-only mode", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const completedList = buildShoppingListDetail({
        is_completed: true,
        completed_at: "2026-04-13T00:00:00.000Z",
      });

      await installShoppingDetailRoute(page, completedList);

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText(/구매한 재료 \(2개\)/)).toBeVisible();

      // Action buttons should not be present
      await expect(page.getByRole("button", { name: /팬트리 제외/ })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /되살리기/ })).not.toBeVisible();
    });

    test("should disable checkboxes in read-only mode", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const completedList = buildShoppingListDetail({
        is_completed: true,
        completed_at: "2026-04-13T00:00:00.000Z",
      });

      await installShoppingDetailRoute(page, completedList);

      await page.goto(SHOPPING_DETAIL_URL);

      const checkbox = page.getByRole("checkbox", { name: /양파.*구매 완료 표시/ });
      await expect(checkbox).toBeDisabled();
    });
  });

  test.describe("conflict handling", () => {
    test("should handle 409 conflict when updating completed list", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      page.on("dialog", async (dialog) => {
        expect(dialog.message()).toBe("완료된 장보기 기록은 수정할 수 없어요.");
        await dialog.accept();
      });

      await page.route(
        `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/item-1`,
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
                message: "완료된 장보기 기록은 수정할 수 없어요.",
                fields: [],
              },
            },
          });
        }
      );

      await page.goto(SHOPPING_DETAIL_URL);

      const checkbox = page.getByRole("checkbox", { name: /양파.*구매 완료 표시/ });
      await checkbox.click();

      await page.waitForTimeout(300);
    });
  });
});
