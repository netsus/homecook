import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const MANUAL_RECIPE_CREATE_URL = "/menu/add/manual";

interface CookingMethodItem {
  id: string;
  code: string;
  label: string;
  color_key: string;
  is_system: boolean;
}

interface IngredientItem {
  id: string;
  standard_name: string;
  category: string;
}

interface ManualRecipeCreateData {
  id: string;
  title: string;
  source_type: "manual";
  created_by: string;
  base_servings: number;
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

function parseLoginReturnToAction(loginUrl: string) {
  const login = new URL(loginUrl);
  const next = login.searchParams.get("next");
  expect(next).toBeTruthy();

  return new URL(next!, E2E_APP_ORIGIN);
}

async function installCookingMethodsRoute(page: Page, methods: CookingMethodItem[]) {
  await page.route("**/api/v1/cooking-methods", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          methods,
        },
        error: null,
      },
    });
  });
}

async function installIngredientsRoute(page: Page, ingredients: IngredientItem[]) {
  await page.route("**/api/v1/ingredients*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: ingredients,
        },
        error: null,
      },
    });
  });
}

async function installManualRecipeCreateRoute(
  page: Page,
  createdRecipe: ManualRecipeCreateData
) {
  await page.route("**/api/v1/recipes", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: createdRecipe,
        error: null,
      },
    });
  });
}

async function installRecipeDetailRoute(page: Page, recipeId: string) {
  await page.route(`**/api/v1/recipes/${recipeId}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          id: recipeId,
          title: "김치찌개",
          description: null,
          thumbnail_url: null,
          base_servings: 3,
          tags: [],
          source_type: "manual",
          source: null,
          view_count: 0,
          like_count: 0,
          save_count: 0,
          plan_count: 0,
          cook_count: 0,
          ingredients: [],
          steps: [],
          user_status: null,
        },
        error: null,
      },
    });
  });
}

test.describe("Slice 18: Manual Recipe Create", () => {
  test("authenticated happy path: create recipe and view detail", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    const cookingMethods: CookingMethodItem[] = [
      { id: "method-1", code: "stir_fry", label: "볶기", color_key: "orange", is_system: true },
      { id: "method-2", code: "boil", label: "끓이기", color_key: "blue", is_system: true },
      { id: "method-3", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ];

    const ingredients: IngredientItem[] = [
      { id: "ing-1", standard_name: "양파", category: "야채" },
      { id: "ing-2", standard_name: "소금", category: "조미료" },
    ];

    const createdRecipe: ManualRecipeCreateData = {
      id: "recipe-manual-1",
      title: "김치찌개",
      source_type: "manual",
      created_by: "user-1",
      base_servings: 3,
    };

    await installCookingMethodsRoute(page, cookingMethods);
    await installIngredientsRoute(page, ingredients);
    await installManualRecipeCreateRoute(page, createdRecipe);
    await installRecipeDetailRoute(page, createdRecipe.id);

    await page.goto(MANUAL_RECIPE_CREATE_URL);

    // Fill in title
    await page.fill('input[placeholder="레시피명 (필수)"]', "김치찌개");

    // Increase servings to 3
    await page.click('button[aria-label="인분 늘리기"]');
    await expect(page.locator("text=3")).toBeVisible();

    // Add ingredient
    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "양파");
    await page.waitForTimeout(400); // Debounce
    await page.click("text=· 양파");
    await page.click("text=정량 (QUANT)");
    await page.fill('input[placeholder="수량"]', "200");
    await page.fill('input[placeholder="단위"]', "g");

    // Click the "추가" button within the modal footer
    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.locator('button:has-text("추가")').click();

    // Verify ingredient added
    await expect(page.locator("text=양파")).toBeVisible();
    await expect(page.locator("text=200g")).toBeVisible();

    // Add step
    await page.click("text=+ 조리 과정 추가");
    await page.click('button:has-text("볶기")');
    await page.fill(
      'textarea[placeholder="조리 설명을 입력하세요"]',
      "양파를 한입 크기로 썰어 중불에서 볶아주세요"
    );

    // Click the "추가" button within the step modal footer
    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await stepModal.locator('button:has-text("추가")').click();

    // Verify step added
    await expect(page.locator("text=1.")).toBeVisible();
    await expect(page.locator("text=볶기")).toBeVisible();

    // Save recipe
    await page.click('button:has-text("저장")');

    // Success modal should appear
    await expect(page.locator("text=레시피 등록 완료")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=김치찌개")).toBeVisible();

    // Navigate to recipe detail
    await page.click('button:has-text("레시피 상세로 이동")');

    // Verify navigation to detail page
    await expect(page).toHaveURL(/\/recipe\/recipe-manual-1/);
  });

  test("create failure shows error and allows retry", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      {
        id: "method-1",
        code: "stir_fry",
        label: "볶기",
        color_key: "orange",
        is_system: true,
      },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "야채" },
    ]);

    let createPostCount = 0;
    await page.route("**/api/v1/recipes", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      createPostCount += 1;
      if (createPostCount === 1) {
        await route.fulfill({
          status: 500,
          json: {
            success: false,
            data: null,
            error: {
              code: "INTERNAL_ERROR",
              message: "테스트용 등록 실패",
              fields: [],
            },
          },
        });
        return;
      }

      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: {
            id: "recipe-manual-retry",
            title: "재시도 레시피",
            source_type: "manual",
            created_by: "user-1",
            base_servings: 2,
          },
          error: null,
        },
      });
    });

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.fill('input[placeholder="레시피명 (필수)"]', "재시도 레시피");

    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "양파");
    await page.waitForTimeout(400);
    await page.click("text=· 양파");
    await page
      .locator('div.fixed.inset-0.z-50')
      .last()
      .locator('button:has-text("추가")')
      .click();

    await page.click("text=+ 조리 과정 추가");
    await page.click('button:has-text("볶기")');
    await page.fill(
      'textarea[placeholder="조리 설명을 입력하세요"]',
      "양파를 볶아주세요"
    );
    await page
      .locator('div.fixed.inset-0.z-50')
      .last()
      .locator('button:has-text("추가")')
      .click();

    const saveButton = page.locator('button:has-text("저장")');
    await expect(saveButton).toBeEnabled();

    await saveButton.click();
    await expect(page.getByText("테스트용 등록 실패")).toBeVisible();
    await expect(saveButton).toBeEnabled();

    await saveButton.click();
    await expect(page.locator("text=레시피 등록 완료")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=재시도 레시피")).toBeVisible();
    expect(createPostCount).toBe(2);
  });

  test("validation: cannot save without required fields", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    const cookingMethods: CookingMethodItem[] = [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ];

    const ingredients: IngredientItem[] = [
      { id: "ing-1", standard_name: "소금", category: "조미료" },
    ];

    await installCookingMethodsRoute(page, cookingMethods);
    await installIngredientsRoute(page, ingredients);

    await page.goto(MANUAL_RECIPE_CREATE_URL);

    // Save button should be disabled initially
    const saveButton = page.locator('button:has-text("저장")');
    await expect(saveButton).toBeDisabled();

    // Add title only
    await page.fill('input[placeholder="레시피명 (필수)"]', "테스트 레시피");
    await expect(saveButton).toBeDisabled(); // Still disabled (no ingredients/steps)

    // Add ingredient
    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "소금");
    await page.waitForTimeout(400);
    await page.click("text=· 소금");
    await page.click("text=가감형 (TO_TASTE)");

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.locator('button:has-text("추가")').click();

    await expect(saveButton).toBeDisabled(); // Still disabled (no steps)

    // Add step
    await page.click("text=+ 조리 과정 추가");
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="조리 설명을 입력하세요"]', "소금을 약간 넣어주세요");

    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await stepModal.locator('button:has-text("추가")').click();

    // Now save button should be enabled
    await expect(saveButton).toBeEnabled();
  });

  test("guest: redirects to login with return-to-action", async ({ page }) => {
    await setAuthOverride(page, "guest");

    await page.goto(MANUAL_RECIPE_CREATE_URL);

    // Should redirect to login
    await expect(page).toHaveURL(/\/login\?next=/);

    const returnUrl = parseLoginReturnToAction(page.url());
    expect(returnUrl.pathname).toBe("/menu/add/manual");
  });

  test("context preservation: query params passed through from menu-add", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    const testDate = "2026-05-15";
    const testColumnId = "column-123";
    const testSlot = "lunch";

    const cookingMethods: CookingMethodItem[] = [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ];

    await installCookingMethodsRoute(page, cookingMethods);

    await page.goto(
      `${MANUAL_RECIPE_CREATE_URL}?date=${testDate}&columnId=${testColumnId}&slot=${testSlot}`
    );

    // Verify URL has all query params
    await expect(page).toHaveURL(
      new RegExp(`date=${testDate}.*columnId=${testColumnId}.*slot=${testSlot}`)
    );
  });

  test("meal add flow: creates meal with correct context and navigates", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    const testDate = "2026-05-15";
    const testColumnId = "column-abc-123";
    const testSlot = "dinner";

    const cookingMethods: CookingMethodItem[] = [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ];

    const ingredients: IngredientItem[] = [
      { id: "ing-1", standard_name: "소금", category: "조미료" },
    ];

    const createdRecipe: ManualRecipeCreateData = {
      id: "recipe-meal-test",
      title: "테스트 레시피",
      source_type: "manual",
      created_by: "user-1",
      base_servings: 2,
    };

    await installCookingMethodsRoute(page, cookingMethods);
    await installIngredientsRoute(page, ingredients);
    await installManualRecipeCreateRoute(page, createdRecipe);

    // Mock meal creation endpoint
    let mealCreateRequestBody: unknown = null;
    await page.route("**/api/v1/meals", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      mealCreateRequestBody = route.request().postDataJSON();
      await route.fulfill({
        json: {
          success: true,
          data: {
            id: "meal-123",
            recipe_id: createdRecipe.id,
            plan_date: testDate,
            column_id: testColumnId,
            planned_servings: 4,
          },
          error: null,
        },
      });
    });

    await page.goto(
      `${MANUAL_RECIPE_CREATE_URL}?date=${testDate}&columnId=${testColumnId}&slot=${testSlot}`
    );

    // Create minimal recipe
    await page.fill('input[placeholder="레시피명 (필수)"]', "테스트 레시피");

    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "소금");
    await page.waitForTimeout(400);
    await page.click("text=· 소금");
    await page.click("text=가감형 (TO_TASTE)");
    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.locator('button:has-text("추가")').click();

    await page.click("text=+ 조리 과정 추가");
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="조리 설명을 입력하세요"]', "소금을 약간 넣어주세요");
    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await stepModal.locator('button:has-text("추가")').click();

    await page.click('button:has-text("저장")');
    await expect(page.locator("text=레시피 등록 완료")).toBeVisible({ timeout: 5000 });

    // Click "끼니에 추가"
    await page.click('button:has-text("끼니에 추가")');

    // Servings modal should appear (modal header says "끼니에 추가")
    const servingsModal = page.locator('div.fixed.inset-0.z-50').last();
    await expect(servingsModal.locator('h2:has-text("끼니에 추가")')).toBeVisible();

    // Increase servings to 4 (default is 2, so click twice)
    await servingsModal.locator('button[aria-label="인분 늘리기"]').click();
    await servingsModal.locator('button[aria-label="인분 늘리기"]').click();

    // Confirm (button text is "추가")
    await servingsModal.locator('button:has-text("추가")').click();

    // Wait for navigation
    await page.waitForURL(new RegExp(`/planner/${testDate}/${testColumnId}`), { timeout: 5000 });

    // Verify request body had correct values
    expect(mealCreateRequestBody).toBeTruthy();
    const body = mealCreateRequestBody as { recipe_id: string; plan_date: string; column_id: string; planned_servings: number };
    expect(body.recipe_id).toBe(createdRecipe.id);
    expect(body.plan_date).toBe(testDate);
    expect(body.column_id).toBe(testColumnId);
    expect(body.planned_servings).toBe(4);

    // Verify URL includes slot param
    await expect(page).toHaveURL(`/planner/${testDate}/${testColumnId}?slot=${testSlot}`);
  });

  test("meal add flow: shows error when planner context is missing", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    const cookingMethods: CookingMethodItem[] = [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ];

    const ingredients: IngredientItem[] = [
      { id: "ing-1", standard_name: "소금", category: "조미료" },
    ];

    const createdRecipe: ManualRecipeCreateData = {
      id: "recipe-missing-context",
      title: "문맥 없는 레시피",
      source_type: "manual",
      created_by: "user-1",
      base_servings: 2,
    };

    await installCookingMethodsRoute(page, cookingMethods);
    await installIngredientsRoute(page, ingredients);
    await installManualRecipeCreateRoute(page, createdRecipe);

    let mealPostCount = 0;
    await page.route("**/api/v1/meals", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      mealPostCount += 1;
      await route.fulfill({
        status: 500,
        json: {
          success: false,
          data: null,
          error: {
            code: "UNEXPECTED_MEAL_CREATE",
            message: "Missing planner context should prevent meal creation",
            fields: [],
          },
        },
      });
    });

    await page.goto(MANUAL_RECIPE_CREATE_URL);

    await page.fill('input[placeholder="레시피명 (필수)"]', createdRecipe.title);

    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "소금");
    await page.waitForTimeout(400);
    await page.click("text=· 소금");
    await page.click("text=가감형 (TO_TASTE)");
    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.locator('button:has-text("추가")').click();

    await page.click("text=+ 조리 과정 추가");
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="조리 설명을 입력하세요"]', "재료를 잘 섞어주세요");
    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await stepModal.locator('button:has-text("추가")').click();

    await page.click('button:has-text("저장")');
    await expect(page.locator("text=레시피 등록 완료")).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("끼니에 추가")');

    await expect(
      page.getByText("끼니 추가 정보가 없어요. 플래너에서 다시 시도해주세요.")
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "끼니에 추가" })).toHaveCount(0);
    expect(mealPostCount).toBe(0);
  });

  test("my_added virtual book: created manual recipe appears in my_added recipebook", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    const cookingMethods: CookingMethodItem[] = [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ];

    const ingredients: IngredientItem[] = [
      { id: "ing-1", standard_name: "소금", category: "조미료" },
    ];

    const createdRecipe: ManualRecipeCreateData = {
      id: "recipe-my-added-test",
      title: "내가 만든 직접 레시피",
      source_type: "manual",
      created_by: "user-1",
      base_servings: 2,
    };

    await installCookingMethodsRoute(page, cookingMethods);
    await installIngredientsRoute(page, ingredients);
    await installManualRecipeCreateRoute(page, createdRecipe);

    // Create manual recipe
    await page.goto(MANUAL_RECIPE_CREATE_URL);

    await page.fill('input[placeholder="레시피명 (필수)"]', createdRecipe.title);

    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "소금");
    await page.waitForTimeout(400);
    await page.click("text=· 소금");
    await page.click("text=가감형 (TO_TASTE)");
    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.locator('button:has-text("추가")').click();

    await page.click("text=+ 조리 과정 추가");
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="조리 설명을 입력하세요"]', "재료를 잘 섞어주세요");
    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await stepModal.locator('button:has-text("추가")').click();

    await page.click('button:has-text("저장")');
    await expect(page.locator("text=레시피 등록 완료")).toBeVisible({ timeout: 5000 });

    // Mock my_added recipebook API to return the created recipe
    await page.route("**/api/v1/recipe-books/*/recipes**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          json: {
            success: true,
            data: {
              items: [
                {
                  recipe_id: createdRecipe.id,
                  title: createdRecipe.title,
                  thumbnail_url: null,
                  tags: [],
                  added_at: new Date().toISOString(),
                },
              ],
              next_cursor: null,
              has_next: false,
            },
            error: null,
          },
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to my_added recipebook
    const myAddedUrl = "/mypage/recipe-books/my_added?type=my_added&name=내가%20추가한%20레시피";
    await page.goto(myAddedUrl);

    // Verify the created recipe appears in my_added
    await expect(page.getByText("내가 추가한 레시피")).toBeVisible();
    await expect(page.getByText(createdRecipe.title)).toBeVisible();

    // Verify my_added book has no remove/unlike buttons (read-only virtual book)
    const removeButtons = page.getByRole("button", {
      name: /제거|좋아요 해제/,
    });
    await expect(removeButtons).toHaveCount(0);
  });
});
