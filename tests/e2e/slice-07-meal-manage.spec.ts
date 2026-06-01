import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const PLAN_DATE = "2026-04-18";
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440050";
const SLOT_NAME = "아침";
const MEAL_SCREEN_URL = `/planner/${PLAN_DATE}/${COLUMN_ID}?slot=${encodeURIComponent(SLOT_NAME)}`;

interface MealItem {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  planned_servings: number;
  status: "registered" | "shopping_done" | "cook_done";
  is_leftover: boolean;
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

async function installMealsListRoute(page: Page, meals: MealItem[]) {
  await page.route(`**/api/v1/meals?*`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: { items: meals },
        error: null,
      },
    });
  });
}

async function installMealsPatchRoute(page: Page, updatedMeal: MealItem) {
  await page.route(`**/api/v1/meals/${updatedMeal.id}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          id: updatedMeal.id,
          planned_servings: updatedMeal.planned_servings,
          status: updatedMeal.status,
        },
        error: null,
      },
    });
  });
}

async function installMealsDeleteRoute(page: Page, mealId: string) {
  await page.route(`**/api/v1/meals/${mealId}`, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
}

async function installCookingSessionCreateRoute(page: Page) {
  let requestBody: unknown = null;

  await page.route("**/api/v1/cooking/sessions", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    requestBody = route.request().postDataJSON();
    await route.fulfill({
      json: {
        success: true,
        data: {
          session_id: "session-e2e",
          recipe_id: "recipe-1",
          status: "in_progress",
          cooking_servings: 2,
          meals: [{ meal_id: "meal-1", is_cooked: false }],
        },
        error: null,
      },
    });
  });

  return {
    getRequestBody: () => requestBody,
  };
}

function buildMeal(overrides: Partial<MealItem> = {}): MealItem {
  return {
    id: "meal-1",
    recipe_id: "recipe-1",
    recipe_title: "김치찌개",
    recipe_thumbnail_url: null,
    planned_servings: 2,
    status: "registered",
    is_leftover: false,
    ...overrides,
  };
}

function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true }).first();
}

function visibleTextContaining(page: Page, text: string) {
  return page.getByText(text).filter({ visible: true }).first();
}

function visibleTestId(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

test.describe("Slice 07 meal manage — MEAL_SCREEN", () => {
  // ── Unauthorized ──────────────────────────────────────────────────────────

  test("guest sees login gate with return-to-action path", async ({ page }) => {
    await setAuthOverride(page, "guest");

    await page.goto(MEAL_SCREEN_URL);

    // Server redirects unauthenticated users to /login?next=...
    await expect(page).toHaveURL(/\/login/);
  });

  // ── Load ──────────────────────────────────────────────────────────────────

  test("shows a meal-shaped skeleton while the slot meals are loading", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    let releaseMeals!: () => void;
    const allowMeals = new Promise<void>((resolve) => {
      releaseMeals = resolve;
    });

    await page.route(`**/api/v1/meals?*`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      await allowMeals;
      await route.fulfill({
        json: {
          success: true,
          data: { items: [buildMeal()] },
          error: null,
        },
      });
    });

    await page.goto(MEAL_SCREEN_URL);

    if (page.viewportSize()?.width && page.viewportSize()!.width >= 1024) {
      await expect(visibleTestId(page, "web-meal-loading-skeleton")).toBeVisible();
      await expect(visibleTestId(page, "web-meal-loading-card").first()).toBeVisible();
      await expect(visibleTestId(page, "web-meal-loading-summary")).toBeVisible();
    } else {
      await expect(visibleTestId(page, "meal-screen-loading-summary")).toBeVisible();
      await expect(visibleTestId(page, "meal-screen-loading-card").first()).toBeVisible();
      await expect(visibleTestId(page, "meal-screen-loading-thumb").first()).toBeVisible();
    }

    releaseMeals();
    await expect(visibleText(page, "김치찌개")).toBeVisible();
  });

  test("authenticated user loads meal list and sees meal cards", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [
      buildMeal({ id: "meal-1", recipe_title: "김치찌개", status: "registered", planned_servings: 2 }),
      buildMeal({ id: "meal-2", recipe_title: "미역국", status: "shopping_done", planned_servings: 3 }),
    ]);

    await page.goto(MEAL_SCREEN_URL);

    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await expect(visibleText(page, "미역국")).toBeVisible();
    // Wave1: status badges removed visually; verify they do NOT appear
    await expect(page.getByLabel("식사 등록 완료")).toHaveCount(0);
    await expect(page.getByLabel("장보기 완료")).toHaveCount(0);
  });

  test("shows date and slot name in app bar", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, []);

    await page.goto(MEAL_SCREEN_URL);

    if (page.viewportSize()?.width && page.viewportSize()!.width >= 1024) {
      await expect(page.getByRole("navigation", { name: "식사 경로" })).toContainText("4월 18일 · 아침");
    } else {
      await expect(page.locator("h1:visible").first()).toBeVisible();
      await expect(page.locator("h1:visible").first()).toContainText("아침");
    }
  });

  test("shows empty state when no meals registered for slot", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, []);

    await page.goto(MEAL_SCREEN_URL);

    await expect(visibleTestId(page, "meal-screen-empty")).toBeVisible();
    await expect(visibleTextContaining(page, "이 끼니에 등록된 식사가 없어요")).toBeVisible();
    await expect(visibleTestId(page, "meal-screen-add-cta")).toBeVisible();
  });

  // ── 식사 추가 CTA ─────────────────────────────────────────────────────────

  test("식사 추가 CTA is visible on ready state", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [buildMeal()]);

    await page.goto(MEAL_SCREEN_URL);

    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await expect(visibleTestId(page, "meal-screen-add-cta")).toBeVisible();
  });

  // ── Stepper — registered (no modal) ──────────────────────────────────────

  test("stepper increment for registered meal calls PATCH directly without modal", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    const meal = buildMeal({ id: "meal-1", planned_servings: 2, status: "registered" });
    await installMealsListRoute(page, [meal]);

    const patchRequests: string[] = [];
    await page.route(`**/api/v1/meals/meal-1`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchRequests.push(route.request().url());
        await route.fulfill({
          json: {
            success: true,
            data: { id: "meal-1", planned_servings: 3, status: "registered" },
            error: null,
          },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await page.getByRole("button", { name: "인분 증가" }).click();

    // No dialog should appear
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => patchRequests.length).toBe(1);
  });

  test("minus button is disabled at 1 serving", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [buildMeal({ planned_servings: 1, status: "registered" })]);

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await expect(page.getByRole("button", { name: "인분 감소" })).toBeDisabled();
  });

  // ── Stepper — shopping_done / cook_done (modal required) ─────────────────

  test("stepper for shopping_done meal shows confirmation modal before PATCH", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const meal = buildMeal({ id: "meal-1", planned_servings: 2, status: "shopping_done" });
    await installMealsListRoute(page, [meal]);
    await installMealsPatchRoute(page, { ...meal, planned_servings: 3 });

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await page.getByRole("button", { name: "인분 증가" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(visibleTextContaining(page, "상태가 진행된 식사입니다.")).toBeVisible();
  });

  test("serving-change confirm calls PATCH and dismisses modal", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const meal = buildMeal({ id: "meal-1", planned_servings: 2, status: "shopping_done" });
    await installMealsListRoute(page, [meal]);

    const patchRequests: string[] = [];
    await page.route(`**/api/v1/meals/meal-1`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchRequests.push(route.request().url());
        await route.fulfill({
          json: {
            success: true,
            data: { id: "meal-1", planned_servings: 3, status: "shopping_done" },
            error: null,
          },
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await page.getByRole("button", { name: "인분 증가" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await visibleTestId(page, "serving-change-confirm").click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => patchRequests.length).toBe(1);
  });

  test("shopping_done meal starts direct cook mode with a meal-screen return path", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const meal = buildMeal({ id: "meal-1", planned_servings: 2, status: "shopping_done" });
    const cookingSession = await installCookingSessionCreateRoute(page);
    await installMealsListRoute(page, [meal]);

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await page.getByRole("button", { name: /요리하기/ }).filter({ visible: true }).first().click();

    await expect.poll(() => cookingSession.getRequestBody()).toEqual({
      recipe_id: "recipe-1",
      meal_ids: ["meal-1"],
      cooking_servings: 2,
    });
    await expect(page).toHaveURL(/\/cooking\/sessions\/session-e2e\/cook-mode/);

    const currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.get("returnTo")).toBe(MEAL_SCREEN_URL);
  });

  test("serving-change cancel dismisses modal without PATCH", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    const meal = buildMeal({ id: "meal-1", planned_servings: 2, status: "cook_done" });
    await installMealsListRoute(page, [meal]);

    const patchRequests: string[] = [];
    await page.route(`**/api/v1/meals/meal-1`, async (route) => {
      if (route.request().method() === "PATCH") {
        patchRequests.push(route.request().url());
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await page.getByRole("button", { name: "인분 감소" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "취소" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(patchRequests).toHaveLength(0);
  });

  // ── Delete ────────────────────────────────────────────────────────────────

  test("delete button shows confirmation modal", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [buildMeal({ id: "meal-1", recipe_title: "김치찌개" })]);

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await page.getByRole("button", { name: "김치찌개 삭제" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(visibleText(page, "이 식사를 삭제하시겠어요?")).toBeVisible();
  });

  test("delete confirm removes meal card and shows empty state when last", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [buildMeal({ id: "meal-1", recipe_title: "김치찌개" })]);
    await installMealsDeleteRoute(page, "meal-1");

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await page.getByRole("button", { name: "김치찌개 삭제" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await visibleTestId(page, "delete-confirm").click();

    await expect(page.getByText("김치찌개", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(visibleTestId(page, "meal-screen-empty")).toBeVisible();
  });

  test("delete cancel dismisses modal without removing card", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [buildMeal({ id: "meal-1", recipe_title: "김치찌개" })]);

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await page.getByRole("button", { name: "김치찌개 삭제" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "취소" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(visibleText(page, "김치찌개")).toBeVisible();
  });

  // ── No horizontal overflow ────────────────────────────────────────────────

  test("no horizontal overflow on meal screen", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [
      buildMeal({ id: "meal-1", recipe_title: "김치찌개", status: "registered" }),
      buildMeal({ id: "meal-2", recipe_title: "미역국 끓이기", status: "shopping_done" }),
    ]);

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 4;
    });

    expect(hasOverflow).toBe(false);
  });

  // ── Wave1 acceptance: recipe click → RECIPE_DETAIL ─────────────────────────

  test("clicking recipe title navigates to RECIPE_DETAIL (Wave1)", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [
      buildMeal({ id: "meal-1", recipe_id: "recipe-abc", recipe_title: "김치찌개" }),
    ]);

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    await visibleTestId(page, "meal-recipe-link-meal-1").click();

    await expect(page).toHaveURL(/\/recipe\/recipe-abc/);
  });

  // ── Wave1 acceptance: trash icon + data-testid ─────────────────────────────

  test("delete uses trash icon button with data-testid (Wave1)", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [
      buildMeal({ id: "meal-1", recipe_title: "김치찌개" }),
    ]);

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();

    const trashBtn = visibleTestId(page, "meal-delete-meal-1");
    await expect(trashBtn).toBeVisible();
    // Should contain an SVG icon (trash), no text "삭제"
    await expect(trashBtn.locator("svg")).toBeVisible();

    await trashBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  // ── Wave1 acceptance: visible status tags without status selectors ─────────

  test("status tags are visible on meal cards without status selectors (Wave1)", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installMealsListRoute(page, [
      buildMeal({ id: "meal-1", status: "registered" }),
      buildMeal({ id: "meal-2", recipe_id: "r2", recipe_title: "파스타", status: "shopping_done" }),
    ]);

    await page.goto(MEAL_SCREEN_URL);
    await expect(visibleText(page, "김치찌개")).toBeVisible();
    await expect(visibleText(page, "파스타")).toBeVisible();

    await expect(visibleText(page, "등록")).toBeVisible();
    await expect(visibleText(page, "장보기 완료")).toBeVisible();
    // Legacy status-badge aria labels and status dropdown remain removed.
    await expect(page.getByLabel("식사 등록 완료")).toHaveCount(0);
    await expect(page.getByLabel("장보기 완료")).toHaveCount(0);
    await expect(page.getByLabel("요리 완료")).toHaveCount(0);
    await expect(page.getByLabel("상태 변경")).toHaveCount(0);
  });
});
