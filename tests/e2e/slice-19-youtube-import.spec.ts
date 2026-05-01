import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const YOUTUBE_IMPORT_URL = "/menu/add/youtube";

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

function parseLoginReturnToAction(loginUrl: string) {
  const login = new URL(loginUrl);
  const next = login.searchParams.get("next");
  expect(next).toBeTruthy();
  return new URL(next!, E2E_APP_ORIGIN);
}

// ── Route installers ────────────────────────────────────────────────────────

async function installCookingMethodsRoute(page: Page) {
  await page.route("**/api/v1/cooking-methods", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          methods: [
            { id: "method-1", code: "stir_fry", label: "볶기", color_key: "orange", is_system: true },
            { id: "method-2", code: "boil", label: "끓이기", color_key: "red", is_system: true },
            { id: "method-3", code: "prep", label: "손질", color_key: "gray", is_system: true },
          ],
        },
        error: null,
      },
    });
  });
}

async function installIngredientsRoute(page: Page) {
  await page.route("**/api/v1/ingredients*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            { id: "ing-1", standard_name: "김치", category: "반찬" },
            { id: "ing-2", standard_name: "돼지고기", category: "고기" },
            { id: "ing-3", standard_name: "두부", category: "콩류" },
          ],
        },
        error: null,
      },
    });
  });
}

async function installValidateRoute(
  page: Page,
  response: { is_recipe_video: boolean; video_info?: object },
) {
  await page.route("**/api/v1/recipes/youtube/validate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          is_valid_url: true,
          is_recipe_video: response.is_recipe_video,
          video_info: response.video_info ?? {
            video_id: "recipe12345",
            title: "백종원 김치찌개",
            channel: "백종원의 요리비책",
            thumbnail_url: "https://i.ytimg.com/vi/recipe12345/hqdefault.jpg",
          },
        },
        error: null,
      },
    });
  });
}

async function installValidateErrorRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/validate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 400,
      json: {
        success: false,
        data: null,
        error: {
          code: "INVALID_URL",
          message: "올바른 유튜브 URL을 입력해주세요",
          fields: [{ field: "youtube_url", reason: "invalid_url" }],
        },
      },
    });
  });
}

async function installExtractRoute(page: Page, delayMs = 1500) {
  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    // Add delay so the extraction progress UI is visible before results arrive
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "ext-001",
          title: "백종원 김치찌개",
          base_servings: 2,
          extraction_methods: ["description", "ocr"],
          ingredients: [
            {
              ingredient_id: "ing-1",
              standard_name: "김치",
              amount: 200,
              unit: "g",
              ingredient_type: "QUANT",
              display_text: "김치 200g",
              sort_order: 1,
              scalable: true,
              confidence: 0.9,
            },
            {
              ingredient_id: "ing-2",
              standard_name: "돼지고기",
              amount: 300,
              unit: "g",
              ingredient_type: "QUANT",
              display_text: "돼지고기 300g",
              sort_order: 2,
              scalable: true,
              confidence: 0.85,
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김치를 한입 크기로 썬다",
              cooking_method: { id: "method-3", code: "prep", label: "손질", color_key: "gray", is_new: false },
              duration_text: null,
            },
            {
              step_number: 2,
              instruction: "돼지고기를 중불에서 볶는다",
              cooking_method: { id: "method-1", code: "stir_fry", label: "볶기", color_key: "orange", is_new: false },
              duration_text: "5분",
            },
            {
              step_number: 3,
              instruction: "물을 넣고 끓인다",
              cooking_method: { id: "method-2", code: "boil", label: "끓이기", color_key: "red", is_new: false },
              duration_text: "20분",
            },
          ],
          new_cooking_methods: [],
        },
        error: null,
      },
    });
  });
}

async function installExtractErrorRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      json: {
        success: false,
        data: null,
        error: {
          code: "EXTRACTION_FAILED",
          message: "서버 오류가 발생했어요",
          fields: [],
        },
      },
    });
  });
}

async function installRegisterRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/register", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          recipe_id: "recipe-yt-001",
          title: "백종원 김치찌개",
        },
        error: null,
      },
    });
  });
}

async function installRegisterErrorRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/register", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      json: {
        success: false,
        data: null,
        error: {
          code: "REGISTER_FAILED",
          message: "레시피를 등록하지 못했어요",
          fields: [],
        },
      },
    });
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe("Slice 19: YouTube Import", () => {
  test("happy path: URL → extract → review → register → complete", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });
    await installExtractRoute(page);
    await installRegisterRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);

    // Step 1: URL input
    await expect(page.locator("text=유튜브 영상에서")).toBeVisible();
    const urlInput = page.locator('input[type="url"]');
    await urlInput.fill("https://www.youtube.com/watch?v=recipe12345");

    // Click fetch
    await page.click('button:has-text("가져오기")');

    // Step 2 → Step 3: extraction progress transitions to review
    // The extracting screen may be brief; we verify review arrives
    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 15000 });

    // Verify extraction methods pills
    await expect(page.locator("text=description")).toBeVisible();
    await expect(page.locator("text=ocr")).toBeVisible();

    // Verify extracted data
    await expect(page.locator('input[value="백종원 김치찌개"]')).toBeVisible();
    await expect(page.getByText("김치", { exact: true })).toBeVisible();
    await expect(page.getByText("돼지고기", { exact: true })).toBeVisible();
    await expect(page.locator("text=200g")).toBeVisible();
    await expect(page.locator("text=재료 (2개)")).toBeVisible();
    await expect(page.locator("text=조리 과정 (3단계)")).toBeVisible();

    // Register
    await page.click('button:has-text("등록")');

    // Step 4: Complete
    await expect(page.locator("text=레시피가 등록됐어요")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=백종원 김치찌개")).toBeVisible();
  });

  test("non-recipe warning: shows warning and allows proceed", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installValidateRoute(page, {
      is_recipe_video: false,
      video_info: {
        video_id: "nonrecipe123",
        title: "고양이 영상",
        channel: "캣채널",
        thumbnail_url: "https://i.ytimg.com/vi/nonrecipe123/hqdefault.jpg",
      },
    });
    await installExtractRoute(page);
    await installRegisterRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);

    // Enter URL and validate
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=nonrecipe123");
    await page.click('button:has-text("가져오기")');

    // Step 1.5: Non-recipe warning
    await expect(page.locator("text=이 영상은 요리 레시피가 아닌 것 같아요")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=고양이 영상")).toBeVisible();
    await expect(page.locator("text=캣채널")).toBeVisible();

    // Click proceed anyway
    await page.click('button:has-text("그래도 진행")');

    // Should eventually reach review step (extraction progress is shown while API responds)
    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 15000 });
  });

  test("non-recipe warning: re-enter goes back to URL input", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installValidateRoute(page, { is_recipe_video: false });

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=nonrecipe123");
    await page.click('button:has-text("가져오기")');

    await expect(page.locator("text=이 영상은 요리 레시피가 아닌 것 같아요")).toBeVisible({ timeout: 5000 });

    await page.click('button:has-text("다시 입력")');

    // Should go back to URL input with cleared field
    await expect(page.locator("text=유튜브 영상에서")).toBeVisible();
    const urlInput = page.locator('input[type="url"]');
    await expect(urlInput).toHaveValue("");
  });

  test("URL validation error: shows error message", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installValidateErrorRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://invalid-url.com");
    await page.click('button:has-text("가져오기")');

    await expect(page.locator("text=올바른 유튜브 URL을 입력해주세요")).toBeVisible({ timeout: 5000 });
  });

  test("extraction error: shows retry and reenter options", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });
    await installExtractErrorRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=fail999999");
    await page.click('button:has-text("가져오기")');

    // Should show extraction error
    await expect(page.locator("text=레시피 추출에 실패했어요")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=서버 오류가 발생했어요")).toBeVisible();

    // Click "다른 영상 입력" to go back to step 1
    await page.click('button:has-text("다른 영상 입력")');
    await expect(page.locator("text=유튜브 영상에서")).toBeVisible();
  });

  test("register error: shows error modal with retry", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });
    await installExtractRoute(page);
    await installRegisterErrorRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
    await page.click('button:has-text("가져오기")');

    // Wait for review step
    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 10000 });

    // Try to register
    await page.click('button:has-text("등록")');

    // Error modal should appear
    await expect(page.locator("text=레시피 등록 실패")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=레시피를 등록하지 못했어요")).toBeVisible();
  });

  test("guest: redirects to login with return-to-action", async ({ page }) => {
    await setAuthOverride(page, "guest");

    await page.goto(YOUTUBE_IMPORT_URL);

    await expect(page).toHaveURL(/\/login\?next=/);

    const returnUrl = parseLoginReturnToAction(page.url());
    expect(returnUrl.pathname).toBe("/menu/add/youtube");
  });

  test("guest with query params: preserves plan context in return URL", async ({ page }) => {
    await setAuthOverride(page, "guest");

    const testDate = "2026-05-15";
    const testColumnId = "column-abc";
    const testSlot = "dinner";

    await page.goto(
      `${YOUTUBE_IMPORT_URL}?date=${testDate}&columnId=${testColumnId}&slot=${testSlot}`,
    );

    await expect(page).toHaveURL(/\/login\?next=/);

    const returnUrl = parseLoginReturnToAction(page.url());
    expect(returnUrl.pathname).toBe("/menu/add/youtube");
    expect(returnUrl.searchParams.get("date")).toBe(testDate);
    expect(returnUrl.searchParams.get("columnId")).toBe(testColumnId);
    expect(returnUrl.searchParams.get("slot")).toBe(testSlot);
  });

  test("meal add flow: complete → add to meal → navigate to planner", async ({ page }) => {
    await setAuthOverride(page, "authenticated");

    const testDate = "2026-05-15";
    const testColumnId = "column-abc-123";
    const testSlot = "lunch";

    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });
    await installExtractRoute(page);
    await installRegisterRoute(page);

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
            id: "meal-yt-001",
            recipe_id: "recipe-yt-001",
            plan_date: testDate,
            column_id: testColumnId,
            planned_servings: 3,
          },
          error: null,
        },
      });
    });

    await page.goto(
      `${YOUTUBE_IMPORT_URL}?date=${testDate}&columnId=${testColumnId}&slot=${testSlot}`,
    );

    // Go through full flow to complete
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
    await page.click('button:has-text("가져오기")');
    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("등록")');
    await expect(page.locator("text=레시피가 등록됐어요")).toBeVisible({ timeout: 5000 });

    // Click "이 끼니에 추가"
    await page.click('button:has-text("이 끼니에 추가")');

    // Servings modal
    const servingsModal = page.locator("div.fixed.inset-0.z-50").last();
    await expect(servingsModal.locator('h2:has-text("이 끼니에 추가")')).toBeVisible();

    // Increase servings by 1 (default is 2 → 3)
    await servingsModal.locator('button[aria-label="인분 늘리기"]').click();

    // Confirm
    await servingsModal.locator('button:has-text("추가")').click();

    // Should navigate to planner
    await page.waitForURL(new RegExp(`/planner/${testDate}/${testColumnId}`), { timeout: 5000 });

    // Verify meal creation body
    expect(mealCreateRequestBody).toBeTruthy();
    const body = mealCreateRequestBody as {
      recipe_id: string;
      plan_date: string;
      column_id: string;
      planned_servings: number;
    };
    expect(body.recipe_id).toBe("recipe-yt-001");
    expect(body.plan_date).toBe(testDate);
    expect(body.column_id).toBe(testColumnId);
    expect(body.planned_servings).toBe(3);

    await expect(page).toHaveURL(`/planner/${testDate}/${testColumnId}?slot=${testSlot}`);
  });

  test("review: can add and remove ingredients", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });
    await installExtractRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
    await page.click('button:has-text("가져오기")');

    // Wait for review step
    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 10000 });

    // Should start with 2 ingredients
    await expect(page.locator("text=재료 (2개)")).toBeVisible();

    // Remove first ingredient (김치)
    await page.locator('button[aria-label="김치 삭제"]').click();
    await expect(page.locator("text=재료 (1개)")).toBeVisible();

    // Add new ingredient
    await page.click("text=+ 재료 추가");
    await page.fill('input[placeholder="재료 검색"]', "두부");
    await page.waitForTimeout(400);
    await page.click("text=두부");
    await page.click("text=정량 (QUANT)");
    await page.fill('input[placeholder="수량"]', "1");
    await page.fill('input[placeholder="단위"]', "모");

    const ingredientModal = page.locator("div.fixed.inset-0.z-50").last();
    await ingredientModal.locator('button:has-text("추가")').click();

    await expect(page.locator("text=재료 (2개)")).toBeVisible();
    await expect(page.locator("text=두부")).toBeVisible();
  });

  test("review: can remove steps and numbers renumber", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });
    await installExtractRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
    await page.click('button:has-text("가져오기")');

    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 10000 });

    // Start with 3 steps
    await expect(page.locator("text=조리 과정 (3단계)")).toBeVisible();

    // Remove step 1
    await page.locator('button[aria-label="스텝 1 삭제"]').click();

    // Should renumber to 2 steps
    await expect(page.locator("text=조리 과정 (2단계)")).toBeVisible();
  });

  test("fetch button disabled when URL is empty", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);

    const fetchButton = page.locator('button:has-text("가져오기")');
    await expect(fetchButton).toBeDisabled();

    await page.locator('input[type="url"]').fill("https://youtube.com/watch?v=test");
    await expect(fetchButton).toBeEnabled();
  });

  test("register button disabled without required fields", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });

    // Return extract data with empty ingredients and steps
    await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: {
          success: true,
          data: {
            extraction_id: "ext-empty",
            title: "빈 레시피",
            base_servings: 2,
            extraction_methods: ["description"],
            ingredients: [],
            steps: [],
            new_cooking_methods: [],
          },
          error: null,
        },
      });
    });

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
    await page.click('button:has-text("가져오기")');

    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 10000 });

    // Register button should be disabled (no ingredients or steps)
    const registerButton = page.locator('button:has-text("등록")');
    await expect(registerButton).toBeDisabled();

    // Empty section messages should show
    await expect(page.locator("text=추출된 재료가 없어요. 직접 추가해주세요")).toBeVisible();
    await expect(page.locator("text=추출된 조리 과정이 없어요. 직접 추가해주세요")).toBeVisible();
  });

  test("base_servings null defaults to 1", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });
    await installRegisterRoute(page);

    // Custom extract route returning base_servings: null
    await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        json: {
          success: true,
          data: {
            extraction_id: "ext-null-servings",
            title: "인분 없는 레시피",
            base_servings: null,
            extraction_methods: ["description"],
            ingredients: [
              {
                ingredient_id: "ing-1",
                standard_name: "김치",
                amount: 200,
                unit: "g",
                ingredient_type: "QUANT",
                display_text: "김치 200g",
                sort_order: 1,
                scalable: true,
                confidence: 0.9,
              },
            ],
            steps: [
              {
                step_number: 1,
                instruction: "김치를 썬다",
                cooking_method: { id: "method-3", code: "prep", label: "손질", color_key: "gray", is_new: false },
                duration_text: null,
              },
            ],
            new_cooking_methods: [],
          },
          error: null,
        },
      });
    });

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
    await page.click('button:has-text("가져오기")');
    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 10000 });

    // Verify base_servings defaults to 1 via the stepper's aria-label
    await expect(page.getByLabel("1인분")).toBeVisible();

    // Register and verify the request body carries base_servings: 1
    let registerBody: Record<string, unknown> | null = null;
    await page.route("**/api/v1/recipes/youtube/register", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      registerBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: { recipe_id: "recipe-null-srv", title: "인분 없는 레시피" },
          error: null,
        },
      });
    });

    await page.click('button:has-text("등록")');
    await expect(page.locator("text=레시피가 등록됐어요")).toBeVisible({ timeout: 5000 });
    expect(registerBody).toBeTruthy();
    expect((registerBody as unknown as Record<string, unknown>).base_servings).toBe(1);
  });

  test("complete without plan context: no meal-add button", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, { is_recipe_video: true });
    await installExtractRoute(page);
    await installRegisterRoute(page);

    // Navigate without plan context (no date/columnId)
    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
    await page.click('button:has-text("가져오기")');
    await expect(page.locator("text=추출 결과를 확인해주세요")).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("등록")');

    await expect(page.locator("text=레시피가 등록됐어요")).toBeVisible({ timeout: 5000 });

    // "이 끼니에 추가" button should NOT be visible (no plan context)
    await expect(page.locator('button:has-text("이 끼니에 추가")')).toHaveCount(0);

    // But "레시피 상세 보기" and "닫기" should be visible
    await expect(page.locator('button:has-text("레시피 상세 보기")')).toBeVisible();
    await expect(page.locator("text=닫기")).toBeVisible();
  });
});
