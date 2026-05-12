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

function getSaveButton(page: Page) {
  return page.getByRole("button", { name: /^(저장|완료)$/ });
}

async function fillRecipeTitle(page: Page, title: string) {
  await page.getByLabel("요리 이름").fill(title);
}

async function setBaseServings(page: Page, servings: number) {
  await page.getByLabel("기준 인분").fill(String(servings));
}

async function openStepAdd(page: Page) {
  await page.getByRole("button", { name: "+ 단계" }).click();
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
    await fillRecipeTitle(page, "김치찌개");

    // Increase servings to 3
    await setBaseServings(page, 3);
    await expect(page.getByLabel("기준 인분")).toHaveValue("3");

    // Add ingredient
    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "양파");
    await page.waitForTimeout(400); // Debounce
    await page.locator('div.fixed.inset-0.z-50').last().getByText("양파", { exact: true }).click();
    await page.fill('input[placeholder="수량"]', "200");

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();
    await ingredientModal.locator('button:has-text("완료")').click();

    // Verify ingredient added
    await expect(page.locator("text=양파")).toBeVisible();
    await expect(page.locator("text=200g")).toBeVisible();

    // Add step
    await openStepAdd(page);
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
    await getSaveButton(page).click();

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
    await fillRecipeTitle(page, "재시도 레시피");

    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "양파");
    await page.waitForTimeout(400);
    await page.locator('div.fixed.inset-0.z-50').last().getByText("양파", { exact: true }).click();
    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();
    await ingredientModal.locator('button:has-text("완료")').click();

    await openStepAdd(page);
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

    const saveButton = getSaveButton(page);
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
    const saveButton = getSaveButton(page);
    await expect(saveButton).toBeDisabled();

    // Add title only
    await fillRecipeTitle(page, "테스트 레시피");
    await expect(saveButton).toBeDisabled(); // Still disabled (no ingredients/steps)

    // Add ingredient
    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "소금");
    await page.waitForTimeout(400);
    await page.locator('div.fixed.inset-0.z-50').last().getByText("소금", { exact: true }).click();

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();
    await ingredientModal.locator('button:has-text("완료")').click();

    await expect(saveButton).toBeDisabled(); // Still disabled (no steps)

    // Add step
    await openStepAdd(page);
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
    await fillRecipeTitle(page, "테스트 레시피");

    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "소금");
    await page.waitForTimeout(400);
    await page.locator('div.fixed.inset-0.z-50').last().getByText("소금", { exact: true }).click();
    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();
    await ingredientModal.locator('button:has-text("완료")').click();

    await openStepAdd(page);
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="조리 설명을 입력하세요"]', "소금을 약간 넣어주세요");
    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await stepModal.locator('button:has-text("추가")').click();

    await getSaveButton(page).click();
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

    await fillRecipeTitle(page, createdRecipe.title);

    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "소금");
    await page.waitForTimeout(400);
    await page.locator('div.fixed.inset-0.z-50').last().getByText("소금", { exact: true }).click();
    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();
    await ingredientModal.locator('button:has-text("완료")').click();

    await openStepAdd(page);
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="조리 설명을 입력하세요"]', "재료를 잘 섞어주세요");
    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await stepModal.locator('button:has-text("추가")').click();

    await getSaveButton(page).click();
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

    await fillRecipeTitle(page, createdRecipe.title);

    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "소금");
    await page.waitForTimeout(400);
    await page.locator('div.fixed.inset-0.z-50').last().getByText("소금", { exact: true }).click();
    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();
    await ingredientModal.locator('button:has-text("완료")').click();

    await openStepAdd(page);
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="조리 설명을 입력하세요"]', "재료를 잘 섞어주세요");
    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await stepModal.locator('button:has-text("추가")').click();

    await getSaveButton(page).click();
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
    await expect(page.getByText("내가 추가한 레시피").first()).toBeVisible();
    await expect(page.getByText(createdRecipe.title)).toBeVisible();

    // Verify my_added book has no remove/unlike buttons (read-only virtual book)
    const removeButtons = page.getByRole("button", {
      name: /제거|좋아요 해제/,
    });
    await expect(removeButtons).toHaveCount(0);
  });

  test("ingredient modal defaults to g and has no type selector", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "야채" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "양파");
    await page.waitForTimeout(400);
    await page.locator('div.fixed.inset-0.z-50').last().getByText("양파", { exact: true }).click();

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await expect(ingredientModal.getByText("정량 (QUANT)")).toHaveCount(0);
    await expect(ingredientModal.getByText("가감형 (TO_TASTE)")).toHaveCount(0);
    await expect(ingredientModal.getByRole("button", { name: /^g$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(ingredientModal.getByRole("button", { name: "ml" })).toBeVisible();
    await expect(ingredientModal.getByRole("button", { name: "큰술" })).toHaveCount(0);
    await expect(ingredientModal.getByRole("button", { name: "개" })).toHaveCount(0);
  });

  test("ingredient modal shows all ingredients before search and filters by category", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);

    const ingredients = [
      { id: "ing-1", standard_name: "양파", category: "채소" },
      { id: "ing-2", standard_name: "돼지고기", category: "육류" },
      { id: "ing-3", standard_name: "두부", category: "기타" },
    ];
    const ingredientRequests: string[] = [];

    await page.route("**/api/v1/ingredients*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      const requestUrl = new URL(route.request().url());
      const query = requestUrl.searchParams.get("q")?.trim() ?? "";
      const category = requestUrl.searchParams.get("category");
      ingredientRequests.push(requestUrl.search);

      await route.fulfill({
        json: {
          success: true,
          data: {
            items: ingredients.filter((ingredient) => {
              const matchesQuery =
                query.length === 0 || ingredient.standard_name.includes(query);
              const matchesCategory =
                !category || ingredient.category === category;

              return matchesQuery && matchesCategory;
            }),
          },
          error: null,
        },
      });
    });

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await expect(ingredientModal.locator("ul").getByText("양파", { exact: true })).toBeVisible();
    await expect(ingredientModal.getByText("돼지고기", { exact: true })).toBeVisible();
    expect(ingredientRequests[0]).toBe("");

    await ingredientModal.getByRole("button", { name: "육류" }).click();
    await expect(ingredientModal.getByText("돼지고기", { exact: true })).toBeVisible();
    await expect(ingredientModal.getByText("양파", { exact: true })).toHaveCount(0);
    expect(ingredientRequests).toContain("?category=%EC%9C%A1%EB%A5%98");

    await page.fill('input[placeholder="재료 검색"]', "양파");
    await page.waitForTimeout(400);
    await expect(ingredientModal.getByText("검색 결과가 없어요")).toBeVisible();
  });

  test("ingredient unit can switch between g and ml", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "야채" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "양파");
    await page.waitForTimeout(400);
    await page.locator('div.fixed.inset-0.z-50').last().getByText("양파", { exact: true }).click();

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await page.fill('input[placeholder="수량"]', "1");
    await ingredientModal.getByRole("button", { name: "ml" }).click();

    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();
    await ingredientModal.locator('button:has-text("완료")').click();

    await expect(page.getByText("양파")).toBeVisible();
    await expect(page.getByText("1ml")).toBeVisible();
  });

  test("ingredient selection keeps the list visible while editing amount and unit", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "채소" },
      { id: "ing-2", standard_name: "돼지고기", category: "육류" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByText("양파", { exact: true }).click();

    await expect(
      ingredientModal.locator("ul").getByText("양파", { exact: true }),
    ).toBeVisible();
    await expect(ingredientModal.getByText("돼지고기", { exact: true })).toBeVisible();
    await expect(ingredientModal.getByRole("group", { name: "단위" })).toBeVisible();
    await expect(ingredientModal.getByText("선택된 재료")).toHaveCount(0);
  });

  test("ingredient modal shows selected ingredient and added chips near quantity controls", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "대파", category: "채소" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByText("대파", { exact: true }).click();

    const editor = ingredientModal.getByTestId("ingredient-editor");
    await expect(editor.getByText("대파", { exact: true })).toBeVisible();
    await page.fill('input[placeholder="수량"]', "100");
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();

    const addedChips = ingredientModal.getByTestId("added-ingredient-chips");
    await expect(addedChips.getByText("대파 100g", { exact: true })).toBeVisible();
  });

  test("mobile unit options are large tappable chips", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "채소" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByText("양파", { exact: true }).click();

    const unitButton = ingredientModal.getByRole("button", { name: /^g$/ });
    await expect(unitButton).toBeVisible();

    const box = await unitButton.boundingBox();
    const fontSize = await unitButton.evaluate((element) =>
      Number.parseFloat(window.getComputedStyle(element).fontSize),
    );

    expect(box?.height).toBeGreaterThanOrEqual(36);
    expect(fontSize).toBeGreaterThanOrEqual(14);
  });

  test("ingredient modal can add multiple ingredients before closing", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "채소" },
      { id: "ing-2", standard_name: "돼지고기", category: "육류" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await ingredientModal.getByText("양파", { exact: true }).click();
    await page.fill('input[placeholder="수량"]', "1");
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();

    await expect(ingredientModal.getByText("재료 추가")).toBeVisible();
    await expect(ingredientModal.getByText("1개 추가됨")).toBeVisible();

    await ingredientModal.getByText("돼지고기", { exact: true }).click();
    await ingredientModal.getByRole("button", { name: "ml" }).click();
    await ingredientModal.getByRole("button", { name: "선택한 재료 추가" }).click();
    await expect(ingredientModal.getByText("2개 추가됨")).toBeVisible();

    await ingredientModal.locator('button:has-text("완료")').click();
    await expect(page.locator('div.fixed.inset-0.z-50')).toHaveCount(0);
    await expect(page.getByText("양파")).toBeVisible();
    await expect(page.getByText("돼지고기")).toBeVisible();
  });

  test("ingredient modal keeps its height stable while category results load", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);

    const ingredients = [
      { id: "ing-1", standard_name: "양파", category: "채소" },
      { id: "ing-2", standard_name: "대파", category: "채소" },
      { id: "ing-3", standard_name: "감자", category: "채소" },
      { id: "ing-4", standard_name: "당근", category: "채소" },
      { id: "ing-5", standard_name: "돼지고기", category: "육류" },
    ];

    await page.route("**/api/v1/ingredients*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      const requestUrl = new URL(route.request().url());
      const category = requestUrl.searchParams.get("category");
      if (category) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      await route.fulfill({
        json: {
          success: true,
          data: {
            items: ingredients.filter(
              (ingredient) => !category || ingredient.category === category,
            ),
          },
          error: null,
        },
      });
    });

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");

    const dialog = page.locator('div.fixed.inset-0.z-50').last().locator('[role="dialog"]');
    await expect(dialog.getByText("양파", { exact: true })).toBeVisible();
    const heightBefore = (await dialog.boundingBox())?.height;

    await dialog.getByRole("button", { name: "육류" }).click();
    await expect(dialog.getByText("돼지고기", { exact: true })).toBeVisible();
    const heightAfter = (await dialog.boundingBox())?.height;

    expect(heightBefore).toBeTruthy();
    expect(heightAfter).toBeTruthy();
    expect(Math.abs(heightAfter! - heightBefore!)).toBeLessThanOrEqual(4);
  });

  test("ingredient modal closes when clicking the backdrop", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "야채" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await page.click("text=+ 재료 추가");

    const ingredientModal = page.locator('div.fixed.inset-0.z-50').last();
    await expect(ingredientModal.getByText("재료 추가")).toBeVisible();

    await page.mouse.click(12, 12);
    await expect(page.locator('div.fixed.inset-0.z-50')).toHaveCount(0);
  });

  test("step modal closes when clicking the backdrop", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "야채" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    await openStepAdd(page);

    const stepModal = page.locator('div.fixed.inset-0.z-50').last();
    await expect(stepModal.getByText("조리 과정 추가")).toBeVisible();

    await page.mouse.click(12, 12);
    await expect(page.locator('div.fixed.inset-0.z-50')).toHaveCount(0);
  });
});
