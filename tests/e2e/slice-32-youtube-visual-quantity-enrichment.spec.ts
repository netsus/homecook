import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const YOUTUBE_IMPORT_URL = "/menu/add/youtube";
const RECIPIO_IMPORT_URL = "/recipes/new/youtube";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/32-youtube-visual-quantity-enrichment",
);

const VISUAL_DRAFT_INGREDIENT_ID = "11111111-1111-4111-8111-111111111111";

async function setAuthOverride(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      value: "authenticated",
      url: E2E_APP_ORIGIN,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: "authenticated" },
  );
}

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }

      nextjs-portal,
      [data-next-badge-root],
      [aria-label="Open Next.js Dev Tools"],
      [data-nextjs-dev-tools-button],
      [data-nextjs-toast] {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
}

async function installCommonYoutubeRoutes(page: Page) {
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
            { id: "method-boil", code: "boil", label: "끓이기", color_key: "red", is_system: true },
          ],
        },
        error: null,
      },
    });
  });

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
            { id: "ingredient-tofu", standard_name: "두부", category: "채소" },
          ],
        },
        error: null,
      },
    });
  });

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
            video_id: "visual12345",
            title: "두부조림 화면 수량 레시피",
            channel: "집밥 채널",
            thumbnail_url: createFoodThumbDataUri("두부", "#F8D8A8"),
          },
        },
        error: null,
      },
    });
  });
}

async function installVisualExtractRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: createVisualQuantityDraft(),
        error: null,
      },
    });
  });
}

async function installRecipioDuplicateRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/recipio/check**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          is_duplicate: false,
          recipe: null,
        },
        error: null,
      },
    });
  });
}

async function openYoutubeReview(page: Page) {
  await setAuthOverride(page);
  await installCommonYoutubeRoutes(page);
  await installVisualExtractRoute(page);
  await page.goto(YOUTUBE_IMPORT_URL);
  await stabilize(page);
  await page.getByLabel("유튜브 URL").fill("https://www.youtube.com/watch?v=visual12345");
  await page.getByRole("button", { name: "가져오기" }).click();
  await expect(page.getByTestId("quantity-source-yt-ing-0")).toHaveText("화면 확인");
  await expect(page.getByTestId("quantity-review-yt-ing-0")).toBeVisible();
}

function createFoodThumbDataUri(label: string, background: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${background}"/><text x="480" y="300" text-anchor="middle" font-family="sans-serif" font-size="96">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createVisualQuantityDraft() {
  return {
    extraction_id: "ext-visual-quantity",
    title: "두부조림",
    base_servings: 2,
    thumbnail_url: createFoodThumbDataUri("두부", "#F8D8A8"),
    tags: ["두부조림"],
    extraction_methods: ["description"],
    draft_warnings: [],
    blocking_issues: [],
    ingredients: [
      {
        draft_ingredient_id: VISUAL_DRAFT_INGREDIENT_ID,
        ingredient_id: "ingredient-tofu",
        standard_name: "두부",
        amount: 300,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "두부 300g",
        sort_order: 1,
        scalable: true,
        confidence: 0.9,
        resolution_status: "resolved",
        candidates: [],
        raw_text: "두부",
        quantity_source: "visual_explicit",
        quantity_confidence: 0.86,
        quantity_raw_text: "화면 자막: 두부 300g",
        quantity_evidence_refs: [
          {
            source_method: "visual",
            source_provider: "gemini",
            frame_ts_ms: 12000,
            snippet: "두부 300g",
            locator_hash: "hash-tofu-300g",
          },
        ],
        quantity_review_required: true,
        quantity_user_confirmed: false,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "두부를 양념장에 졸인다",
        cooking_method: {
          id: "method-boil",
          code: "boil",
          label: "끓이기",
          color_key: "red",
          is_new: false,
        },
        duration_text: "10분",
        is_incomplete: false,
        missing_fields: [],
        raw_text: "두부를 양념장에 졸인다",
      },
    ],
    new_cooking_methods: [],
  };
}

test.describe("Slice 32: YouTube visual quantity enrichment", () => {
  test("review screen shows quantity provenance and registers confirmed suggestions", async ({ page }) => {
    const registerBodies: unknown[] = [];
    await page.route("**/api/v1/recipes/youtube/register", async (route) => {
      registerBodies.push(await route.request().postDataJSON());
      await route.fulfill({
        json: {
          success: true,
          data: { recipe_id: "recipe-visual-quantity", title: "두부조림" },
          error: null,
        },
      });
    });

    await openYoutubeReview(page);

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "review-quantity-confirm-desktop.png"),
      fullPage: true,
    });

    const registerButton = page.getByRole("button", { name: "등록" });
    await expect(registerButton).toBeDisabled();
    await page.getByRole("button", { name: "수량 확인" }).click();
    await expect(page.getByTestId("quantity-review-yt-ing-0")).toBeHidden();
    await expect(registerButton).toBeEnabled();
    await registerButton.click();

    expect(registerBodies).toHaveLength(1);
    expect(registerBodies[0]).toMatchObject({
      ingredients: [
        {
          draft_ingredient_id: VISUAL_DRAFT_INGREDIENT_ID,
          amount: 300,
          unit: "g",
          quantity_confirmation_status: "confirmed_suggestion",
        },
      ],
    });
  });

  test("review screen sends edited and cleared quantity decisions", async ({ page }) => {
    const registerBodies: unknown[] = [];
    await page.route("**/api/v1/recipes/youtube/register", async (route) => {
      registerBodies.push(await route.request().postDataJSON());
      await route.fulfill({
        json: {
          success: true,
          data: { recipe_id: `recipe-visual-quantity-${registerBodies.length}`, title: "두부조림" },
          error: null,
        },
      });
    });

    await openYoutubeReview(page);
    await page.getByLabel("두부 수량").fill("250");
    await expect(page.getByTestId("quantity-source-yt-ing-0")).toHaveText("직접 입력");
    await page.getByRole("button", { name: "등록" }).click();

    expect(registerBodies[0]).toMatchObject({
      ingredients: [
        {
          amount: 250,
          unit: "g",
          quantity_confirmation_status: "edited_quantity",
        },
      ],
    });

    await openYoutubeReview(page);
    await page.getByRole("button", { name: "약간으로 저장" }).click();
    await page.getByRole("button", { name: "등록" }).click();

    expect(registerBodies[1]).toMatchObject({
      ingredients: [
        {
          amount: null,
          unit: null,
          ingredient_type: "TO_TASTE",
          quantity_confirmation_status: "cleared_to_taste",
        },
      ],
    });
  });

  test("quick import falls back to review when quantity confirmation is required", async ({ page }) => {
    let registerCalled = false;
    await setAuthOverride(page);
    await installCommonYoutubeRoutes(page);
    await installRecipioDuplicateRoute(page);
    await installVisualExtractRoute(page);
    await page.route("**/api/v1/recipes/youtube/register", async (route) => {
      registerCalled = true;
      await route.fulfill({
        json: {
          success: true,
          data: { recipe_id: "unexpected-auto-register", title: "두부조림" },
          error: null,
        },
      });
    });

    await page.goto(RECIPIO_IMPORT_URL);
    await stabilize(page);
    await page.getByLabel("유튜브 링크").fill("https://www.youtube.com/watch?v=visual12345");
    await page.getByRole("button", { name: "가져오기" }).click();

    await expect(page.getByText("검수가 필요해요")).toBeVisible();
    await expect(page.getByText("수량 확인이 필요한 재료가 있어요.")).toBeVisible();
    await expect(page.getByRole("link", { name: "검수 화면에서 마무리" })).toHaveAttribute(
      "href",
      `/menu/add/youtube?youtubeUrl=${encodeURIComponent("https://www.youtube.com/watch?v=visual12345")}`,
    );
    expect(registerCalled).toBe(false);
  });
});
