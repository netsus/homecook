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

async function mockCookModeRoute(
  page: Page,
  options: { notFound?: boolean } = {},
) {
  await page.route("**/api/v1/cooking/sessions/*/cook-mode", async (route) => {
    if (options.notFound) {
      await route.fulfill({
        status: 404,
        json: {
          success: false,
          data: null,
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "요리 세션을 찾을 수 없어요.",
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
          recipe: {
            id: "recipe-1",
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

async function mockCompleteRoute(page: Page) {
  await page.route("**/api/v1/cooking/sessions/*/complete", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: "session-abc",
          status: "completed",
          meals_updated: 1,
          leftover_dish_id: "session-abc",
          pantry_removed: 1,
          cook_count: 1,
        },
        error: null,
      },
    });
  });
}

async function mockCancelRoute(page: Page) {
  await page.route("**/api/v1/cooking/sessions/*/cancel", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: "session-abc",
          status: "cancelled",
        },
        error: null,
      },
    });
  });
}

async function mockCookingReadyRoute(page: Page) {
  await page.route("**/api/v1/cooking/ready", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          date_range: { start: "2026-04-27", end: "2026-05-03" },
          recipes: [],
        },
        error: null,
      },
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Slice 15a cook planner complete", () => {
  test("authenticated user sees cook-mode with recipe data", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page);

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    await expect(page.getByTestId("cook-mode-title")).toBeVisible();
    await expect(page.getByText("김치찌개")).toBeVisible();
    await expect(page.getByText("2인분")).toBeVisible();
  });

  test("ingredients tab shows by default", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page);

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    await expect(page.getByTestId("ingredient-list")).toBeVisible();
    await expect(page.getByText("양파 1개")).toBeVisible();
    await expect(page.getByText("김치 200g")).toBeVisible();
  });

  test("switching to steps tab shows step cards", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page);

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    await expect(page.getByTestId("tab-steps")).toBeVisible();
    await page.getByTestId("tab-steps").click();

    await expect(page.getByTestId("step-list")).toBeVisible();
    await expect(page.getByText("양파를 썰어주세요.")).toBeVisible();
    await expect(page.getByText("김치를 넣고 끓여주세요.")).toBeVisible();
  });

  test("complete flow: opens consumed sheet, checks ingredient, confirms, navigates to ready", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page);
    await mockCompleteRoute(page);
    await mockCookingReadyRoute(page);

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    await expect(page.getByTestId("complete-button")).toBeVisible();
    await page.getByTestId("complete-button").click();

    await expect(
      page.getByTestId("consumed-ingredient-sheet"),
    ).toBeVisible();
    await expect(
      page.getByText("소진한 재료를 체크해주세요"),
    ).toBeVisible();

    // Check an ingredient
    await page.getByTestId("consumed-check-ing-1").click();
    await page.getByTestId("consumed-confirm-button").click();

    await expect(page).toHaveURL(/\/cooking\/ready/);
  });

  test("skip consumed ingredients sends empty array and navigates to ready", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page);
    await mockCompleteRoute(page);
    await mockCookingReadyRoute(page);

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    await page.getByTestId("complete-button").click();

    await expect(
      page.getByTestId("consumed-ingredient-sheet"),
    ).toBeVisible();
    await page.getByTestId("consumed-skip-button").click();

    await expect(page).toHaveURL(/\/cooking\/ready/);
  });

  test("cancel flow: opens confirm, clicks yes, navigates to ready", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page);
    await mockCancelRoute(page);
    await mockCookingReadyRoute(page);

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    await page.getByTestId("cancel-button").click();

    await expect(
      page.getByTestId("cancel-confirm-overlay"),
    ).toBeVisible();
    await expect(page.getByText("요리를 취소할까요?")).toBeVisible();

    await page.getByTestId("cancel-confirm-yes").click();

    await expect(page).toHaveURL(/\/cooking\/ready/);
  });

  test("guest user sees login gate", async ({ page }) => {
    await setAuthOverride(page, "guest");

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    await expect(
      page.getByRole("heading", { name: "로그인이 필요해요" }),
    ).toBeVisible();
  });

  test("swipe left switches from ingredients to steps", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page);

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    await expect(page.getByTestId("ingredient-list")).toBeVisible();

    const content = page.getByTestId("cook-mode-content");
    const box = await content.boundingBox();
    if (!box) throw new Error("content box not found");

    const startX = box.x + box.width * 0.8;
    const endX = box.x + box.width * 0.2;
    const y = box.y + box.height / 2;

    // Use page.evaluate to dispatch touch events with proper TouchInit
    await page.evaluate(
      ({ sx, ex, cy }) => {
        const el = document.querySelector(
          '[data-testid="cook-mode-content"]',
        )!;
        const touchStart = new Touch({
          identifier: 0,
          target: el,
          clientX: sx,
          clientY: cy,
        });
        el.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [touchStart],
            bubbles: true,
          }),
        );
        const touchEnd = new Touch({
          identifier: 0,
          target: el,
          clientX: ex,
          clientY: cy,
        });
        el.dispatchEvent(
          new TouchEvent("touchend", {
            changedTouches: [touchEnd],
            bubbles: true,
          }),
        );
      },
      { sx: startX, ex: endX, cy: y },
    );

    await expect(page.getByTestId("step-list")).toBeVisible();
  });

  test("swipe right switches from steps back to ingredients", async ({
    page,
  }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page);

    await page.goto("/cooking/sessions/session-abc/cook-mode");

    // Switch to steps tab first
    await page.getByTestId("tab-steps").click();
    await expect(page.getByTestId("step-list")).toBeVisible();

    const content = page.getByTestId("cook-mode-content");
    const box = await content.boundingBox();
    if (!box) throw new Error("content box not found");

    const startX = box.x + box.width * 0.2;
    const endX = box.x + box.width * 0.8;
    const y = box.y + box.height / 2;

    // Use page.evaluate to dispatch touch events with proper TouchInit
    await page.evaluate(
      ({ sx, ex, cy }) => {
        const el = document.querySelector(
          '[data-testid="cook-mode-content"]',
        )!;
        const touchStart = new Touch({
          identifier: 0,
          target: el,
          clientX: sx,
          clientY: cy,
        });
        el.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: [touchStart],
            bubbles: true,
          }),
        );
        const touchEnd = new Touch({
          identifier: 0,
          target: el,
          clientX: ex,
          clientY: cy,
        });
        el.dispatchEvent(
          new TouchEvent("touchend", {
            changedTouches: [touchEnd],
            bubbles: true,
          }),
        );
      },
      { sx: startX, ex: endX, cy: y },
    );

    await expect(page.getByTestId("ingredient-list")).toBeVisible();
  });

  test("404 session shows not-found state", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await mockCookModeRoute(page, { notFound: true });

    await page.goto("/cooking/sessions/nonexistent/cook-mode");

    await expect(
      page.getByRole("heading", { name: "세션을 찾을 수 없어요" }),
    ).toBeVisible();
  });
});
