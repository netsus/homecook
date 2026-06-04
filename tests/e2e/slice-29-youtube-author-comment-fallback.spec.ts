import { expect, test, type Page } from "@playwright/test";

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
            { id: "method-1", code: "prep", label: "손질", color_key: "gray", is_system: true },
            { id: "method-2", code: "mix", label: "무치기", color_key: "green", is_system: true },
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
            { id: "ing-1", standard_name: "오이", category: "채소" },
            { id: "ing-2", standard_name: "참치", category: "수산물" },
            { id: "ing-3", standard_name: "김", category: "해조류" },
          ],
        },
        error: null,
      },
    });
  });
}

async function installValidateRoute(page: Page, videoId: string) {
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
            video_id: videoId,
            title: "작성자 댓글 오이 김밥",
            channel: "집밥 채널",
            thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          },
        },
        error: null,
      },
    });
  });
}

async function installAuthorCommentExtractRoute(page: Page, delayMs = 0) {
  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "ext-29-author-comment-e2e",
          title: "작성자 댓글 오이 김밥",
          base_servings: 1,
          extraction_methods: ["comment"],
          draft_warnings: [],
          blocking_issues: [],
          ingredients: [
            {
              ingredient_id: "ing-1",
              standard_name: "오이",
              amount: 1,
              unit: "개",
              ingredient_type: "QUANT",
              display_text: "오이 1개",
              sort_order: 1,
              scalable: true,
              confidence: 0.9,
              resolution_status: "resolved",
            },
            {
              ingredient_id: "ing-2",
              standard_name: "참치",
              amount: 100,
              unit: "g",
              ingredient_type: "QUANT",
              display_text: "참치 100g",
              sort_order: 2,
              scalable: true,
              confidence: 0.88,
              resolution_status: "resolved",
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "오이를 소금에 절여 물기를 빼주세요.",
              cooking_method: { id: "method-1", code: "prep", label: "손질", color_key: "gray", is_new: false },
              duration_text: "5분",
              is_incomplete: false,
              missing_fields: [],
            },
            {
              step_number: 2,
              instruction: "참치와 오이를 김 위에 올려 말아주세요.",
              cooking_method: { id: "method-2", code: "mix", label: "무치기", color_key: "green", is_new: false },
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

async function installDescriptionExtractRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "ext-29-description-ready-e2e",
          title: "설명란 김밥",
          base_servings: 1,
          extraction_methods: ["description"],
          draft_warnings: [],
          blocking_issues: [],
          ingredients: [
            {
              ingredient_id: "ing-3",
              standard_name: "김",
              amount: 1,
              unit: "장",
              ingredient_type: "QUANT",
              display_text: "김 1장",
              sort_order: 1,
              scalable: true,
              confidence: 0.9,
              resolution_status: "resolved",
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김 위에 밥을 얇게 펴주세요.",
              cooking_method: { id: "method-1", code: "prep", label: "손질", color_key: "gray", is_new: false },
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
          recipe_id: "recipe-yt-29",
          title: "작성자 댓글 오이 김밥",
        },
        error: null,
      },
    });
  });
}

async function installRegisterErrorRoute(
  page: Page,
  status: number,
  error: { code: string; message: string },
) {
  await page.route("**/api/v1/recipes/youtube/register", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status,
      json: {
        success: false,
        data: null,
        error: {
          ...error,
          fields: [],
        },
      },
    });
  });
}

async function navigateToReview(page: Page, videoId: string) {
  await page.goto(YOUTUBE_IMPORT_URL);
  await page.locator('input[type="url"]').fill(`https://www.youtube.com/watch?v=${videoId}`);
  await page.click('button:has-text("가져오기")');
  await expect(page.getByRole("heading", { name: YOUTUBE_REVIEW_HEADING })).toBeVisible({ timeout: 15000 });
}

test.describe("Slice 29: YouTube Author Comment Fallback", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name === "desktop-chrome",
      "Slice 29 source-label flow follows the mobile import path; desktop parity is covered by component tests.",
    );
  });

  test("author-comment fallback flow: URL → extract → review → register → complete", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, "authorcmt29");
    await installAuthorCommentExtractRoute(page);
    await installRegisterRoute(page);

    await navigateToReview(page, "authorcmt29");

    await expect(page.locator("[data-testid='extraction-method-comment']")).toHaveText("작성자 댓글");
    await expect(page.locator("text=comment")).toHaveCount(0);
    await expect(page.locator("text=재료 (2개)")).toBeVisible();
    await expect(page.locator("text=만들기 (2단계)")).toBeVisible();

    await page.click('button:has-text("등록")');
    await expect(page.locator("text=레시피가 등록됐어요")).toBeVisible({ timeout: 5000 });
  });

  test("loading state remains visible while author-comment fallback extraction waits", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, "loadingcm29");
    await installAuthorCommentExtractRoute(page, 1200);
    await installRegisterRoute(page);

    await page.goto(YOUTUBE_IMPORT_URL);
    await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=loadingcm29");
    await page.click('button:has-text("가져오기")');

    await expect(page.locator("text=설명란 분석")).toBeVisible();
    await expect(page.locator("text=잠시만 기다려주세요")).toBeVisible();
    await expect(page.getByRole("heading", { name: YOUTUBE_REVIEW_HEADING })).toBeVisible({ timeout: 15000 });
  });

  test("register conflict uses the existing error modal", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, "conflictm29");
    await installAuthorCommentExtractRoute(page);
    await installRegisterErrorRoute(page, 409, {
      code: "EXTRACTION_CONSUMED",
      message: "이미 등록된 추출 세션이에요. 다시 추출해주세요.",
    });

    await navigateToReview(page, "conflictm29");
    await page.click('button:has-text("등록")');

    await expect(page.locator("text=레시피 등록 실패")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=이미 등록된 추출 세션이에요. 다시 추출해주세요.")).toBeVisible();
    await expect(page.locator("text=레시피가 등록됐어요")).toHaveCount(0);
  });

  test("description-ready flow: does not show author-comment source when unused", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installCookingMethodsRoute(page);
    await installIngredientsRoute(page);
    await installValidateRoute(page, "descready29");
    await installDescriptionExtractRoute(page);

    await navigateToReview(page, "descready29");

    await expect(page.locator("[data-testid='extraction-method-description']")).toHaveText("설명란");
    await expect(page.locator("[data-testid='extraction-method-comment']")).toHaveCount(0);
  });
});
