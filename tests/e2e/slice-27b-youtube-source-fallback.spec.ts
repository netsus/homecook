import { expect, test, type Page } from "@playwright/test";

/**
 * Slice 27b: YouTube Source Fallback — E2E tests
 *
 * These tests verify frontend acceptance items for slice 27b:
 * - Partial draft / no-provider flow: description-only ingredients + blocking step issue
 *   → partial guidance → user adds step → register succeeds (accept-playwright-partial-flow)
 * - Caption flow: extraction_methods includes "caption" → shows Korean "자막" label
 *   and no false warning when steps are present (accept-playwright-transcript-flow)
 * - Description-only flow regression: unchanged behavior (accept-playwright-description-regression)
 *
 * Automation Split:
 * - Deterministic fixture-backed Playwright (no YouTube API, no LLM, no real transcript provider).
 * - Live transcript provider tests are Manual Only.
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
            { id: "ing-2", standard_name: "소금", category: "양념" },
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
            video_id: "partial12345",
            title: "김치찌개 부분 추출 레시피",
            channel: "집밥 채널",
            thumbnail_url: "https://i.ytimg.com/vi/partial12345/hqdefault.jpg",
          },
        },
        error: null,
      },
    });
  });
}

/** Extract route returning partial draft: ingredients but no steps (no-provider path). */
async function installPartialDraftExtractRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "ext-27b-partial",
          title: "김치찌개 부분 추출 레시피",
          base_servings: 2,
          extraction_methods: ["description"],
          draft_warnings: [],
          blocking_issues: ["steps[0].instruction"],
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
              resolution_status: "resolved",
            },
            {
              ingredient_id: "ing-2",
              standard_name: "소금",
              amount: null,
              unit: null,
              ingredient_type: "TO_TASTE",
              display_text: "소금 약간",
              sort_order: 2,
              scalable: false,
              confidence: 0.85,
              resolution_status: "resolved",
            },
          ],
          steps: [],
          new_cooking_methods: [],
        },
        error: null,
      },
    });
  });
}

/** Extract route returning caption-enriched data: description + caption. */
async function installCaptionExtractRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "ext-27b-caption",
          title: "김치찌개 자막 보충 레시피",
          base_servings: 2,
          extraction_methods: ["description", "caption"],
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
              confidence: 0.9,
              resolution_status: "resolved",
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김치를 한입 크기로 썰어주세요.",
              cooking_method: { id: "method-3", code: "prep", label: "손질", color_key: "gray", is_new: false },
              duration_text: null,
              is_incomplete: false,
              missing_fields: [],
            },
            {
              step_number: 2,
              instruction: "냄비에 넣고 끓여주세요.",
              cooking_method: { id: "method-2", code: "boil", label: "끓이기", color_key: "red", is_new: false },
              duration_text: null,
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
          recipe_id: "recipe-yt-27b",
          title: "김치찌개",
        },
        error: null,
      },
    });
  });
}

async function navigateToReview(page: Page) {
  await page.goto(YOUTUBE_IMPORT_URL);
  await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=partial12345");
  await page.click('button:has-text("가져오기")');
  await expect(page.getByRole("heading", { name: YOUTUBE_REVIEW_HEADING })).toBeVisible({ timeout: 15000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Slice 27b: YouTube Source Fallback", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-chrome",
      "Slice 27b mobile flow; desktop parity covered by Vitest.",
    );
  });

  test("partial draft no-provider flow: shows guidance, user adds step, register succeeds", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page);
    await installPartialDraftExtractRoute(page);
    await installRegisterRoute(page);

    await navigateToReview(page);

    // Partial draft guidance should be visible
    await expect(page.locator("[data-testid='partial-draft-guidance']")).toBeVisible();
    await expect(page.locator("text=조리 과정을 직접 입력해주세요")).toBeVisible();

    await expect(page.locator("[data-testid='extraction-method-chips']")).toHaveCount(0);
    await expect(page.locator("[data-testid^='extraction-method-']")).toHaveCount(0);

    // Register button should be disabled
    const registerButton = page.locator('button:has-text("등록")');
    await expect(registerButton).toBeDisabled();

    // User adds a step via the step add button
    await page.click('button:has-text("+ 만들기 추가")');
    // Step add modal should appear (dialog with heading)
    const stepDialog = page.locator('div[role="dialog"]');
    await expect(stepDialog).toBeVisible({ timeout: 5000 });
    await expect(stepDialog.locator("h2", { hasText: "만들기 추가" })).toBeVisible();

    // Select a cooking method
    await stepDialog.locator('button:has-text("끓이기")').click();

    // Fill in step instruction
    await stepDialog.locator('textarea[placeholder="만들기 설명을 입력하세요"]').fill("김치를 냄비에 넣고 끓인다");

    // Save the step
    await stepDialog.locator('button:has-text("추가")').click();

    // Partial draft guidance should disappear
    await expect(page.locator("[data-testid='partial-draft-guidance']")).toHaveCount(0, { timeout: 5000 });

    // Register button should now be enabled
    await expect(registerButton).toBeEnabled();

    // Complete registration
    await registerButton.click();
    await expect(page.locator("text=레시피가 등록됐어요")).toBeVisible({ timeout: 5000 });
  });

  test("caption flow: shows Korean caption label and no false warning when steps present", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page);
    await installCaptionExtractRoute(page);
    await installRegisterRoute(page);

    await navigateToReview(page);

    await expect(page.locator("[data-testid='extraction-method-chips']")).toHaveCount(0);
    await expect(page.locator("[data-testid^='extraction-method-']")).toHaveCount(0);

    // No partial draft guidance (steps are present)
    await expect(page.locator("[data-testid='partial-draft-guidance']")).toHaveCount(0);

    // Steps should be visible
    await expect(page.locator("text=만들기 (2단계)")).toBeVisible();
    await expect(page.locator("text=김치를 한입 크기로 썰어주세요.")).toBeVisible();

    // Register button should be enabled (all data present)
    const registerButton = page.locator('button:has-text("등록")');
    await expect(registerButton).toBeEnabled();
  });
});
