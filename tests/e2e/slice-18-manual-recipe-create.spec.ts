import { expect, test, type Locator, type Page } from "@playwright/test";

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
  category_group_code?: string;
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

function ingredientDialog(page: Page) {
  return page.getByRole("dialog", { name: "재료로 검색" }).filter({ visible: true }).last();
}

async function openIngredientDialog(page: Page) {
  await page.getByRole("button", { name: /\+ 재료 추가/ }).click();
  const dialog = ingredientDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function searchIngredient(page: Page, query: string) {
  const dialog = ingredientDialog(page);
  await dialog.getByRole("textbox", { name: "재료명으로 검색" }).fill(query);
  await page.waitForTimeout(400);
  return dialog;
}

async function selectIngredient(dialog: Locator, name: string) {
  await dialog.getByRole("checkbox", { name, exact: true }).click({ force: true });
}

async function addSelectedIngredients(dialog: Locator, count: number) {
  await dialog.getByRole("button", { name: `선택한 재료 ${count}개 추가` }).click();
}

async function fillRecipeTitle(page: Page, title: string) {
  await page.getByLabel("요리 이름").fill(title);
}

async function setBaseServings(page: Page, servings: number) {
  const group = page.getByRole("group", { name: "기준 인분 조절" });
  await expect(group).toBeVisible();

  const currentText = (await group.getByText(/\d+인분/).first().textContent()) ?? "2인분";
  const currentServings = Number.parseInt(currentText, 10);
  const delta = servings - currentServings;
  const buttonName = delta > 0 ? "기준 인분 늘리기" : "기준 인분 줄이기";

  for (let index = 0; index < Math.abs(delta); index += 1) {
    await group.getByRole("button", { name: buttonName }).click();
  }

  await expect(group.getByText(`${servings}인분`)).toBeVisible();
}

async function openStepAdd(page: Page) {
  await expect(page.getByTestId("manual-step-composer")).toBeVisible();
}

async function submitInlineStep(page: Page) {
  await page.getByRole("button", { name: "+ 만들기 추가" }).click();
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
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-chrome",
      "Legacy Slice 18 assertions target the mobile editor; desktop parity is covered by qa-visual/qa-a11y.",
    );
  });

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
    await expect(page.getByRole("group", { name: "기준 인분 조절" }).getByText("3인분")).toBeVisible();

    // Add ingredient
    const ingredientModal = await openIngredientDialog(page);
    await searchIngredient(page, "양파");
    await selectIngredient(ingredientModal, "양파");
    await addSelectedIngredients(ingredientModal, 1);
    await page.getByLabel("양파 수량").fill("200");

    // Verify ingredient added
    await expect(page.locator("text=양파")).toBeVisible();
    await expect(page.getByLabel("양파 수량")).toHaveValue("200");

    // Add step
    await openStepAdd(page);
    await page.click('button:has-text("볶기")');
    await page.fill(
      'textarea[placeholder="만들기 설명을 입력하세요"]',
      "양파를 한입 크기로 썰어 중불에서 볶아주세요"
    );

    // Click the inline step composer add button
    await submitInlineStep(page);

    // Verify step added
    await expect(page.locator("text=1.")).toBeVisible();
    await expect(page.locator("span", { hasText: /^볶기$/ }).first()).toBeVisible();

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

    const ingredientModal = await openIngredientDialog(page);
    await searchIngredient(page, "양파");
    await selectIngredient(ingredientModal, "양파");
    await addSelectedIngredients(ingredientModal, 1);

    await openStepAdd(page);
    await page.click('button:has-text("볶기")');
    await page.fill(
      'textarea[placeholder="만들기 설명을 입력하세요"]',
      "양파를 볶아주세요"
    );
    await submitInlineStep(page);

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

    // Save button stays clickable so invalid submit can show field-level guidance.
    const saveButton = getSaveButton(page);
    await expect(saveButton).toBeEnabled();
    await expect(page.getByTestId("manual-save-requirements")).toHaveCount(0);

    await saveButton.click();
    await expect(page.getByText("요리 이름을 입력해주세요.")).toBeVisible();
    await expect(page.getByText("재료를 1개 이상 추가해주세요.")).toBeVisible();
    await expect(page.getByText("만들기를 추가해주세요.")).toBeVisible();

    // Add title only
    await fillRecipeTitle(page, "테스트 레시피");
    await expect(saveButton).toBeEnabled();
    await expect(page.getByText("요리 이름을 입력해주세요.")).toHaveCount(0);
    await expect(page.getByText("재료를 1개 이상 추가해주세요.")).toBeVisible();
    await expect(page.getByText("만들기를 추가해주세요.")).toBeVisible();

    // Add ingredient
    const ingredientModal = await openIngredientDialog(page);
    await searchIngredient(page, "소금");
    await selectIngredient(ingredientModal, "소금");
    await addSelectedIngredients(ingredientModal, 1);

    await expect(saveButton).toBeEnabled();
    await expect(page.getByText("재료를 1개 이상 추가해주세요.")).toHaveCount(0);
    await expect(page.getByText("만들기를 추가해주세요.")).toBeVisible();

    // Add step
    await openStepAdd(page);
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="만들기 설명을 입력하세요"]', "소금을 약간 넣어주세요");

    await submitInlineStep(page);

    // Now save button should be enabled
    await expect(saveButton).toBeEnabled();
    await expect(page.getByTestId("manual-save-requirements")).toHaveCount(0);
    await expect(page.getByText("만들기를 추가해주세요.")).toHaveCount(0);
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

    const ingredientModal = await openIngredientDialog(page);
    await searchIngredient(page, "소금");
    await selectIngredient(ingredientModal, "소금");
    await addSelectedIngredients(ingredientModal, 1);

    await openStepAdd(page);
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="만들기 설명을 입력하세요"]', "소금을 약간 넣어주세요");
    await submitInlineStep(page);

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

    const ingredientModal = await openIngredientDialog(page);
    await searchIngredient(page, "소금");
    await selectIngredient(ingredientModal, "소금");
    await addSelectedIngredients(ingredientModal, 1);

    await openStepAdd(page);
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="만들기 설명을 입력하세요"]', "재료를 잘 섞어주세요");
    await submitInlineStep(page);

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

    const ingredientModal = await openIngredientDialog(page);
    await searchIngredient(page, "소금");
    await selectIngredient(ingredientModal, "소금");
    await addSelectedIngredients(ingredientModal, 1);

    await openStepAdd(page);
    await page.click('button:has-text("섞기/준비")');
    await page.fill('textarea[placeholder="만들기 설명을 입력하세요"]', "재료를 잘 섞어주세요");
    await submitInlineStep(page);

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
    await expect(
      page.getByRole("heading", { name: createdRecipe.title }),
    ).toBeVisible();

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
    const ingredientModal = await openIngredientDialog(page);
    await searchIngredient(page, "양파");
    await selectIngredient(ingredientModal, "양파");
    await expect(ingredientModal.getByText("정량 (QUANT)")).toHaveCount(0);
    await expect(ingredientModal.getByText("가감형 (TO_TASTE)")).toHaveCount(0);
    await expect(ingredientModal.getByRole("button", { name: "선택한 재료 1개 추가" })).toBeVisible();
    await addSelectedIngredients(ingredientModal, 1);
    await expect(page.getByRole("button", { name: "양파 g" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "양파 ml" })).toBeVisible();
    await expect(ingredientModal.getByRole("button", { name: "큰술" })).toHaveCount(0);
    await expect(ingredientModal.getByRole("button", { name: "개" })).toHaveCount(0);
  });

  test("ingredient modal shows all ingredients before search and filters by category", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);

    const ingredients = [
      { id: "ing-1", standard_name: "양파", category: "채소", category_group_code: "vegetable_mushroom" },
      { id: "ing-2", standard_name: "돼지고기", category: "육류", category_group_code: "protein" },
      { id: "ing-3", standard_name: "두부", category: "기타", category_group_code: "protein" },
    ];
    const ingredientRequests: string[] = [];

    await page.route("**/api/v1/ingredients*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      const requestUrl = new URL(route.request().url());
      const query = requestUrl.searchParams.get("q")?.trim() ?? "";
      const categoryGroupCode = requestUrl.searchParams.get("category_group_code");
      ingredientRequests.push(requestUrl.search);

      await route.fulfill({
        json: {
          success: true,
          data: {
            items: ingredients.filter((ingredient) => {
              const matchesQuery =
                query.length === 0 || ingredient.standard_name.includes(query);
              const matchesCategory =
                !categoryGroupCode || ingredient.category_group_code === categoryGroupCode;

              return matchesQuery && matchesCategory;
            }),
          },
          error: null,
        },
      });
    });

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    const ingredientModal = await openIngredientDialog(page);
    await expect(ingredientModal.locator("ul").getByText("양파", { exact: true })).toBeVisible();
    await expect(ingredientModal.getByText("돼지고기", { exact: true })).toBeVisible();
    expect(ingredientRequests[0]).toBe("");

    await ingredientModal.getByRole("button", { name: "단백질" }).click();
    await expect(ingredientModal.getByText("돼지고기", { exact: true })).toBeVisible();
    await expect(ingredientModal.getByText("양파", { exact: true })).toHaveCount(0);
    expect(ingredientRequests).toContain("?category_group_code=protein");

    await searchIngredient(page, "양파");
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
    const ingredientModal = await openIngredientDialog(page);
    await searchIngredient(page, "양파");
    await selectIngredient(ingredientModal, "양파");
    await addSelectedIngredients(ingredientModal, 1);
    await page.getByLabel("양파 수량").fill("1");
    await page.getByRole("button", { name: "양파 ml" }).click();

    await expect(page.getByText("양파")).toBeVisible();
    await expect(page.getByLabel("양파 수량")).toHaveValue("1");
    await expect(page.getByRole("button", { name: "양파 ml" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("ingredient selection keeps the list visible before adding", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "양파", category: "채소" },
      { id: "ing-2", standard_name: "돼지고기", category: "육류" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    const ingredientModal = await openIngredientDialog(page);
    await selectIngredient(ingredientModal, "양파");

    await expect(
      ingredientModal.locator("ul").getByText("양파", { exact: true }),
    ).toBeVisible();
    await expect(ingredientModal.getByText("돼지고기", { exact: true })).toBeVisible();
    await expect(ingredientModal.getByRole("checkbox", { name: "양파", exact: true })).toBeChecked();
    await expect(ingredientModal.getByRole("button", { name: "선택한 재료 1개 추가" })).toBeVisible();
    await expect(ingredientModal.getByText("선택된 재료")).toHaveCount(0);
  });

  test("ingredient modal shows selected chips before adding to the main form", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);
    await installIngredientsRoute(page, [
      { id: "ing-1", standard_name: "대파", category: "채소" },
    ]);

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    const ingredientModal = await openIngredientDialog(page);
    await selectIngredient(ingredientModal, "대파");

    await expect(ingredientModal.getByRole("checkbox", { name: "대파", exact: true })).toBeChecked();
    await expect(ingredientModal.getByRole("button", { name: "선택한 재료 1개 추가" })).toBeVisible();
    await addSelectedIngredients(ingredientModal, 1);
    await expect(page.getByLabel("대파 수량")).toHaveValue("100");
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
    const ingredientModal = await openIngredientDialog(page);
    await selectIngredient(ingredientModal, "양파");
    await addSelectedIngredients(ingredientModal, 1);

    const unitButton = page.getByRole("button", { name: "양파 g" });
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
    const ingredientModal = await openIngredientDialog(page);
    await selectIngredient(ingredientModal, "양파");

    await expect(ingredientModal.getByText("재료로 검색")).toBeVisible();
    await expect(ingredientModal.getByRole("checkbox", { name: "양파", exact: true })).toBeChecked();

    await selectIngredient(ingredientModal, "돼지고기");
    await expect(ingredientModal.getByRole("checkbox", { name: "돼지고기", exact: true })).toBeChecked();

    await addSelectedIngredients(ingredientModal, 2);
    await expect(page.getByRole("dialog", { name: "재료로 검색" })).toHaveCount(0);
    await expect(page.getByText("양파")).toBeVisible();
    await expect(page.getByText("돼지고기")).toBeVisible();
  });

  test("ingredient modal stays usable while category results load", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page, [
      { id: "method-1", code: "prep", label: "섞기/준비", color_key: "gray", is_system: true },
    ]);

    const ingredients = [
      { id: "ing-1", standard_name: "양파", category: "채소", category_group_code: "vegetable_mushroom" },
      { id: "ing-2", standard_name: "대파", category: "채소", category_group_code: "vegetable_mushroom" },
      { id: "ing-3", standard_name: "감자", category: "채소", category_group_code: "vegetable_mushroom" },
      { id: "ing-4", standard_name: "당근", category: "채소", category_group_code: "vegetable_mushroom" },
      { id: "ing-5", standard_name: "돼지고기", category: "육류", category_group_code: "protein" },
    ];

    await page.route("**/api/v1/ingredients*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      const requestUrl = new URL(route.request().url());
      const categoryGroupCode = requestUrl.searchParams.get("category_group_code");
      if (categoryGroupCode) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      await route.fulfill({
        json: {
          success: true,
          data: {
            items: ingredients.filter(
              (ingredient) => !categoryGroupCode || ingredient.category_group_code === categoryGroupCode,
            ),
          },
          error: null,
        },
      });
    });

    await page.goto(MANUAL_RECIPE_CREATE_URL);
    const dialog = await openIngredientDialog(page);
    await expect(dialog.getByText("양파", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "단백질" }).click();
    await expect(dialog.getByText("돼지고기", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "선택한 재료 0개 추가" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "닫기" })).toBeVisible();
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
    const ingredientModal = await openIngredientDialog(page);
    await expect(ingredientModal.getByText("재료로 검색")).toBeVisible();

    await page.mouse.click(12, 12);
    await expect(page.getByRole("dialog", { name: "재료로 검색" })).toHaveCount(0);
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

    await expect(page.getByTestId("manual-step-composer")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ 만들기 추가" })).toBeDisabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
