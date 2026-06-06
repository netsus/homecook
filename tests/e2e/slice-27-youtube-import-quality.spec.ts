import { expect, test, type Page } from "@playwright/test";

/**
 * Slice 27: YouTube Import Quality Uplift — E2E tests
 *
 * These tests verify frontend acceptance items for slice 27:
 * - Resolved ingredients are usable without correction (accept-resolved-usable)
 * - 409 conflict / consumed session handling (accept-conflict)
 * - 410 session expired handling (accept-session-expired)
 * - Full flow happy path with fixture-backed mock (accept-playwright-flow)
 *
 * Automation Split:
 * - These tests are deterministic fixture-backed Playwright tests (no YouTube API, no LLM).
 * - Non-recipe blocking remains covered by the existing slice-19 regression suite.
 * - Live YouTube Data API extraction is Manual Only (not tested here).
 * - @live-oauth scenarios are excluded from this suite.
 */

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";

const YOUTUBE_IMPORT_URL = "/menu/add/youtube";
const YOUTUBE_REVIEW_HEADING = "추출 결과를 확인해주세요";

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
            { id: "ing-1", standard_name: "김치", category: "채소" },
            { id: "ing-2", standard_name: "돼지고기", category: "육류" },
            { id: "ing-3", standard_name: "두부", category: "기타" },
          ],
        },
        error: null,
      },
    });
  });
}

async function installValidateRoute(page: Page) {
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
          is_recipe_video: true,
          classification_status: "recipe",
          classification_reasons: [],
          video_info: {
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

/** Extract route returning all-resolved ingredients (simulating improved parser quality). */
async function installAllResolvedExtractRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "ext-quality-27",
          title: "백종원 김치찌개",
          base_servings: 2,
          extraction_methods: ["description"],
          draft_warnings: [],
          blocking_issues: [],
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
              confidence: 0.95,
              resolution_status: "resolved",
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
              confidence: 0.92,
              resolution_status: "resolved",
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김치를 한입 크기로 썬다",
              cooking_method: { id: "method-3", code: "prep", label: "손질", color_key: "gray", is_new: false },
              duration_text: null,
              is_incomplete: false,
              missing_fields: [],
            },
            {
              step_number: 2,
              instruction: "돼지고기를 중불에서 볶는다",
              cooking_method: { id: "method-1", code: "stir_fry", label: "볶기", color_key: "orange", is_new: false },
              duration_text: "5분",
              is_incomplete: false,
              missing_fields: [],
            },
          ],
          new_cooking_methods: [],
        },
        error: null,
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
          recipe_id: "recipe-yt-027",
          title: "백종원 김치찌개",
        },
        error: null,
      },
    });
  });
}

/** Navigate to review step via URL input → validate → extract. */
async function navigateToReview(page: Page) {
  await page.goto(YOUTUBE_IMPORT_URL);
  await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
  await page.click('button:has-text("가져오기")');
  await expect(page.getByRole("heading", { name: YOUTUBE_REVIEW_HEADING })).toBeVisible({ timeout: 15000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Slice 27: YouTube Import Quality Uplift", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-chrome",
      "Slice 27 mobile flow; desktop parity covered separately.",
    );
  });

  test("all-resolved ingredients register without correction (quality uplift)", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page);
    await installAllResolvedExtractRoute(page);
    await installRegisterRoute(page);

    await navigateToReview(page);

    // No resolution warnings should be shown
    await expect(page.getByText("확인이 필요한 재료")).toHaveCount(0);
    await expect(page.getByText("재료를 찾지 못했어요")).toHaveCount(0);

    // Register button should be immediately enabled
    const registerButton = page.locator('button:has-text("등록")');
    await expect(registerButton).toBeEnabled();

    // Register directly without any edits
    await registerButton.click();
    await expect(page.locator("text=레시피가 등록됐어요")).toBeVisible({ timeout: 5000 });
  });

  test("conflict 409: shows session conflict message during register", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page);
    await installAllResolvedExtractRoute(page);

    // Register returns 409 (consumed session)
    await page.route("**/api/v1/recipes/youtube/register", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 409,
        json: {
          success: false,
          data: null,
          error: {
            code: "SESSION_CONSUMED",
            message: "이미 사용된 추출 세션이에요. 새로 추출해주세요.",
            fields: [],
          },
        },
      });
    });

    await navigateToReview(page);
    await page.click('button:has-text("등록")');

    // Error modal should show the conflict message
    await expect(page.locator("text=레시피 등록 실패")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=이미 사용된 추출 세션이에요")).toBeVisible();
    // Should NOT show success
    await expect(page.locator("text=레시피가 등록됐어요")).toHaveCount(0);
  });

  test("session expired 410: shows expiration message during register", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page);
    await installAllResolvedExtractRoute(page);

    // Register returns 410 (expired session)
    await page.route("**/api/v1/recipes/youtube/register", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 410,
        json: {
          success: false,
          data: null,
          error: {
            code: "EXTRACTION_EXPIRED",
            message: "추출 세션이 만료됐어요. 다시 추출해주세요.",
            fields: [],
          },
        },
      });
    });

    await navigateToReview(page);
    await page.click('button:has-text("등록")');

    // Error modal should show the expired message
    await expect(page.locator("text=레시피 등록 실패")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=추출 세션이 만료됐어요")).toBeVisible();
    await expect(page.locator("text=레시피가 등록됐어요")).toHaveCount(0);
  });

  test("full flow: URL → extract → review → register with quality-uplifted extraction", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page);
    await installAllResolvedExtractRoute(page);
    await installRegisterRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);

    // Step 1: URL input
    await expect(page.getByRole("heading", { name: "영상 링크에서 레시피를 추출해요" })).toBeVisible();
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=recipe12345");
    await page.click('button:has-text("가져오기")');

    // Step 2 → Step 3: review
    await expect(page.getByRole("heading", { name: YOUTUBE_REVIEW_HEADING })).toBeVisible({ timeout: 15000 });

    await expect(page.locator("[data-testid='extraction-method-chips']")).toHaveCount(0);
    await expect(page.locator("[data-testid^='extraction-method-']")).toHaveCount(0);

    // Verify extracted data
    await expect(page.locator('input[value="백종원 김치찌개"]')).toBeVisible();
    await expect(page.getByText("김치", { exact: true })).toBeVisible();
    await expect(page.getByText("돼지고기", { exact: true })).toBeVisible();
    await expect(page.locator("text=재료 (2개)")).toBeVisible();
    await expect(page.locator("text=만들기 (2단계)")).toBeVisible();

    // No resolution issues
    await expect(page.getByText("확인이 필요한 재료")).toHaveCount(0);
    await expect(page.getByText("재료를 찾지 못했어요")).toHaveCount(0);

    // Register
    await page.click('button:has-text("등록")');

    // Step 4: Complete
    await expect(page.locator("text=레시피가 등록됐어요")).toBeVisible({ timeout: 5000 });
  });

  test("guest redirect preserves return-to-action for youtube import", async ({ page }) => {
    await setAuthOverride(page, "guest");

    await page.goto(
      `${YOUTUBE_IMPORT_URL}?date=2026-05-25&columnId=col-1&slot=dinner`,
    );

    await expect(page).toHaveURL(/\/login\?next=/);

    const loginUrl = new URL(page.url());
    const next = loginUrl.searchParams.get("next");
    expect(next).toBeTruthy();
    const returnUrl = new URL(next!, E2E_APP_ORIGIN);
    expect(returnUrl.pathname).toBe("/menu/add/youtube");
    expect(returnUrl.searchParams.get("date")).toBe("2026-05-25");
    expect(returnUrl.searchParams.get("columnId")).toBe("col-1");
    expect(returnUrl.searchParams.get("slot")).toBe("dinner");
  });
});
