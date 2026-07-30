import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const PINNED_TITLE = "삭제 전 두부찌개";

async function setAuthenticated(page: Page) {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(key, "authenticated");
    },
    { key: E2E_AUTH_OVERRIDE_KEY },
  );
}

async function installPinnedHistoryRoutes(page: Page) {
  await page.route("**/api/v1/planner?*", async (route) => {
    const url = new URL(route.request().url());
    const planDate = url.searchParams.get("start_date") ?? "2026-07-29";

    await route.fulfill({
      json: {
        success: true,
        data: {
          columns: [{ id: "column-dinner", name: "저녁", sort_order: 0 }],
          meals: [
            {
              id: "meal-pinned",
              recipe_id: "recipe-deleted",
              recipe_title: PINNED_TITLE,
              recipe_thumbnail_url: null,
              plan_date: planDate,
              column_id: "column-dinner",
              planned_servings: 2,
              status: "cook_done",
              is_leftover: false,
              shopping_list_id: null,
              shopping_list_title: null,
            },
          ],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/cooking/sessions/*/cook-mode", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: "session-pinned",
          recipe: {
            id: "recipe-deleted",
            title: PINNED_TITLE,
            cooking_servings: 2,
            ingredients: [
              {
                ingredient_id: "ingredient-tofu",
                standard_name: "두부",
                amount: 1,
                unit: "모",
                display_text: "두부 1모",
                ingredient_type: "QUANT",
                scalable: true,
              },
            ],
            steps: [
              {
                step_number: 1,
                instruction: "두부를 넣고 5분간 끓여주세요.",
                cooking_method: {
                  code: "boil",
                  label: "끓이기",
                  color_key: "boil",
                },
                ingredients_used: [
                  { ingredient_id: "ingredient-tofu", amount: 1, unit: "모" },
                ],
                heat_level: "medium",
                duration_seconds: 300,
                duration_text: null,
              },
            ],
          },
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/leftovers?*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            {
              id: "leftover-pinned",
              recipe_id: "recipe-deleted",
              recipe_title: PINNED_TITLE,
              recipe_thumbnail_url: null,
              status: "leftover",
              cooked_at: "2026-07-29T09:00:00.000Z",
              eaten_at: null,
              stale_reviewed_at: null,
              cooking_servings: 2,
              source_meal_label: "저녁",
              source_planned_servings: 2,
            },
          ],
        },
        error: null,
      },
    });
  });
}

test("recipe-snapshot-authority-foundation renders server-projected pinned history without snapshot metadata", async ({
  page,
}) => {
  await setAuthenticated(page);
  await installPinnedHistoryRoutes(page);

  await page.goto("/planner");
  await expect(page.getByText(PINNED_TITLE, { exact: true }).filter({ visible: true }).first())
    .toBeVisible();

  await page.goto("/cooking/sessions/session-pinned/cook-mode");
  await expect(page.getByTestId("cook-mode-title")).toContainText(PINNED_TITLE);
  await expect(
    page.getByTestId("ingredient-item").filter({ hasText: /두부\s*1모/u }),
  ).toBeVisible();
  await expect(page.getByText("두부를 넣고 5분간 끓여주세요.")).toBeVisible();

  await page.goto("/leftovers");
  await expect(
    page.getByTestId("leftover-card").filter({ hasText: PINNED_TITLE }),
  ).toBeVisible();

  await expect(page.locator("body")).not.toContainText(
    /recipe_content_snapshot|snapshot_v2|legacy_backfill/u,
  );
});
