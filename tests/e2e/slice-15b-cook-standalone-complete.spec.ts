import { expect, test, type Page } from "@playwright/test";

import {
  installRecipeDetailRoutes,
  RECIPE_ID,
  RECIPE_PATH,
} from "./helpers/mock-routes";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

async function mockStandaloneCookModeRoute(
  page: Page,
  options: { notFound?: boolean } = {},
) {
  await page.route("**/api/v1/recipes/*/cook-mode*", async (route) => {
    if (options.notFound) {
      await route.fulfill({
        status: 404,
        json: {
          success: false,
          data: null,
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "레시피를 찾을 수 없어요.",
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
          recipe: {
            id: RECIPE_ID,
            title: "김치찌개",
            cooking_servings: 2,
            ingredients: [
              {
                ingredient_id: "ing-1",
                standard_name: "양파",
                amount: 1,
                unit: "개",
                display_text: "양파 1개",
                ingredient_type: "QUANT",
                scalable: true,
              },
              {
                ingredient_id: "ing-2",
                standard_name: "김치",
                amount: 200,
                unit: "g",
                display_text: "김치 200g",
                ingredient_type: "QUANT",
                scalable: true,
              },
            ],
            steps: [
              {
                step_number: 1,
                instruction: "양파를 썰어주세요.",
                cooking_method: {
                  code: "stir_fry",
                  label: "볶기",
                  color_key: "stir_fry",
                },
                ingredients_used: [],
                heat_level: null,
                duration_seconds: null,
                duration_text: null,
              },
              {
                step_number: 2,
                instruction: "김치를 넣고 끓여주세요.",
                cooking_method: {
                  code: "boil",
                  label: "끓이기",
                  color_key: "boil",
                },
                ingredients_used: [],
                heat_level: "medium",
                duration_seconds: 600,
                duration_text: null,
              },
            ],
          },
        },
        error: null,
      },
    });
  });
}

async function mockStandaloneCompleteRoute(
  page: Page,
  options: { unauthorized?: boolean } = {},
) {
  await page.route("**/api/v1/cooking/standalone-complete", async (route) => {
    if (options.unauthorized) {
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
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          leftover_dish_id: "ld-1",
          pantry_removed: 1,
          cook_count: 5,
        },
        error: null,
      },
    });
  });
}

test.describe("15b standalone cook mode", () => {
  test("happy path: enter standalone cook mode, view data, complete with consumed ingredients, return to recipe", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await installRecipeDetailRoutes(page);
    await mockStandaloneCookModeRoute(page);
    await mockStandaloneCompleteRoute(page);

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "요리하기" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/cooking/recipes/${RECIPE_ID}/cook-mode\\?servings=2$`),
    );
    await page.waitForSelector('[data-testid="standalone-cook-mode-title"]');

    // Verify recipe title and servings displayed
    await expect(page.getByTestId("standalone-cook-mode-title")).toHaveText(
      "김치찌개",
    );
    await expect(page.getByTestId("standalone-cook-mode-servings")).toHaveText(
      "2인분",
    );

    // Verify ingredients are shown
    await expect(page.getByTestId("ingredient-list")).toBeVisible();
    const ingredients = page.getByTestId("ingredient-item");
    await expect(ingredients).toHaveCount(2);

    // Click complete button
    await page.getByTestId("standalone-complete-button").click();

    // Consumed ingredient sheet appears
    await expect(
      page.getByTestId("consumed-ingredient-sheet"),
    ).toBeVisible();

    // Check first ingredient
    await page.getByTestId("consumed-check-ing-1").click();

    // Click confirm
    await page.getByTestId("consumed-confirm-button").click();

    // Navigates to recipe detail
    await page.waitForURL(`**${RECIPE_PATH}`);
  });

  test("cancel returns to recipe detail without API call", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockStandaloneCookModeRoute(page);

    await page.goto(`/cooking/recipes/${RECIPE_ID}/cook-mode?servings=2`);
    await page.waitForSelector('[data-testid="standalone-cook-mode-title"]');

    // Click cancel
    await page.getByTestId("standalone-cancel-button").click();

    // Navigates to recipe detail (no confirm dialog for standalone)
    await page.waitForURL(`**${RECIPE_PATH}`);
  });

  test("unauthenticated user sees login gate on complete attempt", async ({
    page,
  }) => {
    await setAuthOverride(page, "guest");
    await mockStandaloneCookModeRoute(page);

    await page.goto(`/cooking/recipes/${RECIPE_ID}/cook-mode?servings=2`);
    await page.waitForSelector('[data-testid="standalone-cook-mode-title"]');

    // Unauthenticated user can still view the cook mode data
    await expect(page.getByTestId("ingredient-list")).toBeVisible();

    // Click complete button
    await page.getByTestId("standalone-complete-button").click();

    // Login gate is shown
    await expect(
      page.getByRole("heading", { name: "로그인이 필요해요" }),
    ).toBeVisible();
  });

  test("swipe switches between ingredients and steps tabs", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockStandaloneCookModeRoute(page);

    await page.goto(`/cooking/recipes/${RECIPE_ID}/cook-mode?servings=2`);
    await page.waitForSelector('[data-testid="standalone-cook-mode-content"]');

    // Initially shows ingredients
    await expect(page.getByTestId("ingredient-list")).toBeVisible();

    const content = page.getByTestId("standalone-cook-mode-content");

    await content.dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: 240, clientY: 160 }],
    });
    await content.dispatchEvent("touchend", {
      changedTouches: [{ identifier: 1, clientX: 120, clientY: 160 }],
    });
    await expect(page.getByTestId("step-list")).toBeVisible();

    await content.dispatchEvent("touchstart", {
      touches: [{ identifier: 2, clientX: 120, clientY: 160 }],
    });
    await content.dispatchEvent("touchend", {
      changedTouches: [{ identifier: 2, clientX: 240, clientY: 160 }],
    });
    await expect(page.getByTestId("ingredient-list")).toBeVisible();
  });

  test("complete with skip (empty consumed_ingredient_ids)", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockStandaloneCookModeRoute(page);
    await mockStandaloneCompleteRoute(page);

    await page.goto(`/cooking/recipes/${RECIPE_ID}/cook-mode?servings=2`);
    await page.waitForSelector('[data-testid="standalone-complete-button"]');

    await page.getByTestId("standalone-complete-button").click();
    await expect(
      page.getByTestId("consumed-ingredient-sheet"),
    ).toBeVisible();

    // Skip without checking anything
    await page.getByTestId("consumed-skip-button").click();

    await page.waitForURL(`**${RECIPE_PATH}`);
  });
});
