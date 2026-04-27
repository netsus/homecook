import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const SHOPPING_LIST_ID = "550e8400-e29b-41d4-a716-446655440001";
const SHOPPING_DETAIL_URL = `/shopping/lists/${SHOPPING_LIST_ID}`;

const SHARE_TEXT_API = `**/api/v1/shopping/lists/${SHOPPING_LIST_ID}/share-text`;

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
    // Don't intercept the share-text subpath
    if (route.request().url().includes("/share-text")) {
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

test.describe("slice 10b: shopping share text", () => {
  test.describe("clipboard fallback (deterministic)", () => {
    test("should copy share text to clipboard and show success toast", async ({
      page,
    }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      const shareText = "📋 4월 12일 장보기\n\n☐ 양파 2개\n☐ 대파 1단";

      await page.route(SHARE_TEXT_API, async (route) => {
        await route.fulfill({
          json: {
            success: true,
            data: { text: shareText },
            error: null,
          },
        });
      });

      // Ensure navigator.share is unavailable so clipboard fallback is used
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "share", { value: undefined, writable: true });
      });

      await page.goto(SHOPPING_DETAIL_URL);

      // Wait for list to render
      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      // Grant clipboard permissions for Chromium
      await page.context().grantPermissions(["clipboard-write", "clipboard-read"]);

      const shareButton = page.getByRole("button", { name: "공유(텍스트)" });
      await expect(shareButton).toBeVisible();
      await shareButton.click();

      // Verify success toast appears
      await expect(page.getByText("복사되었습니다")).toBeVisible();
    });

    test("should show empty feedback when all items are pantry-excluded", async ({
      page,
    }) => {
      await setAuthOverride(page, "authenticated");

      const allExcludedList = buildShoppingListDetail({
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

      await installShoppingDetailRoute(page, allExcludedList);

      await page.goto(SHOPPING_DETAIL_URL);

      // Wait for page to render
      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      const shareButton = page.getByRole("button", { name: "공유(텍스트)" });
      await shareButton.click();

      // Verify empty feedback toast appears — API should NOT be called
      await expect(page.getByText("공유할 구매 항목이 없어요")).toBeVisible();
    });

    test("should show error toast when share-text API fails", async ({ page }) => {
      await setAuthOverride(page, "authenticated");

      const listDetail = buildShoppingListDetail();
      await installShoppingDetailRoute(page, listDetail);

      await page.route(SHARE_TEXT_API, async (route) => {
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

      await page.addInitScript(() => {
        Object.defineProperty(navigator, "share", { value: undefined, writable: true });
      });

      await page.goto(SHOPPING_DETAIL_URL);

      await expect(page.getByText("4월 12일 장보기")).toBeVisible();

      const shareButton = page.getByRole("button", { name: "공유(텍스트)" });
      await shareButton.click();

      // Verify error toast appears
      await expect(page.getByText("서버 오류가 발생했어요.")).toBeVisible();
    });
  });
});
