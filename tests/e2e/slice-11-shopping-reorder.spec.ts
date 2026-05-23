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
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

function buildShoppingListDetail(
  overrides: Partial<ShoppingListDetail> = {},
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
  listDetail: ShoppingListDetail,
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

async function expectNoMovementControls(page: Page) {
  await expect(page.getByRole("button", { name: /위로 이동|아래로 이동/ })).toHaveCount(
    0,
  );
  await expect(page.getByText("순서 변경")).toHaveCount(0);
}

test.describe("slice 11: shopping item movement controls removed", () => {
  test("does not render item up/down controls on the web shopping screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setAuthOverride(page, "authenticated");
    await installShoppingDetailRoute(page, buildShoppingListDetail());

    let reorderCalled = false;
    await page.route(
      `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/items/reorder`,
      async (route) => {
        reorderCalled = true;
        await route.fulfill({ json: { success: true, data: { updated: 0 }, error: null } });
      },
    );

    await page.goto(SHOPPING_DETAIL_URL);

    await expect(page.getByText("4월 12일 장보기")).toBeVisible();
    await expectNoMovementControls(page);
    await page.waitForTimeout(200);
    expect(reorderCalled).toBe(false);
  });

  test("does not render item up/down controls on the app shopping screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setAuthOverride(page, "authenticated");
    await installShoppingDetailRoute(page, buildShoppingListDetail());

    await page.goto(SHOPPING_DETAIL_URL);

    await expect(page.getByText("4월 12일 장보기")).toBeVisible();
    await expectNoMovementControls(page);
  });

  test("keeps completed lists read-only without reorder controls", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installShoppingDetailRoute(
      page,
      buildShoppingListDetail({
        is_completed: true,
        completed_at: "2026-04-13T00:00:00.000Z",
      }),
    );

    await page.goto(SHOPPING_DETAIL_URL);

    await expect(
      page.getByText("완료된 장보기 기록은 수정할 수 없어요"),
    ).toBeVisible();
    await expectNoMovementControls(page);
  });
});
