import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/31-recipe-media-tags",
);

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const NARROW_VIEWPORT = { width: 320, height: 568 } as const;

function createFoodThumbDataUri(label: string, background: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${background}"/><circle cx="480" cy="270" r="150" fill="rgba(255,255,255,0.72)"/><text x="480" y="306" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif" font-size="108">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function preparePage(
  browser: Browser,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport,
  });
  const page = await context.newPage();
  await setAuthOverride(page);
  return { context, page };
}

async function setAuthOverride(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: "authenticated",
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

async function installCookingMethodRoutes(page: Page) {
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
            { id: "method-prep", code: "prep", label: "손질", color_key: "gray", is_system: true },
            { id: "method-boil", code: "boil", label: "끓이기", color_key: "red", is_system: true },
          ],
        },
        error: null,
      },
    });
  });
}

async function installYoutubeRoutes(page: Page) {
  const thumbnailUrl = createFoodThumbDataUri("찌개", "#FFC6CA");
  await installCookingMethodRoutes(page);

  await page.route("**/api/v1/ingredients*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [
            { id: "ingredient-kimchi", standard_name: "김치", category: "채소" },
            { id: "ingredient-pork", standard_name: "돼지고기", category: "고기" },
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
            video_id: "recipe31video",
            title: "김치찌개 자세한 레시피",
            channel: "집밥 채널",
            thumbnail_url: thumbnailUrl,
          },
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      json: {
        success: true,
        data: {
          extraction_id: "slice31-extract",
          title: "김치찌개 자세한 레시피",
          base_servings: 2,
          thumbnail_url: thumbnailUrl,
          tags: ["한식", "찌개", "저녁"],
          extraction_methods: ["description", "ocr"],
          draft_warnings: [],
          blocking_issues: [],
          ingredients: [
            {
              ingredient_id: "ingredient-kimchi",
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
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김치를 한입 크기로 썬다",
              cooking_method: {
                id: "method-prep",
                code: "prep",
                label: "손질",
                color_key: "gray",
                is_new: false,
              },
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

async function installManualRoutes(
  page: Page,
  onCreateBody?: (body: Record<string, unknown>) => void,
) {
  await installCookingMethodRoutes(page);

  await page.route("**/api/v1/ingredients*", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          items: [{ id: "ingredient-kimchi", standard_name: "김치", category: "채소" }],
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes/images", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          thumbnail_url: createFoodThumbDataUri("김밥", "#FFE2CF"),
          storage_path: "recipe-images/user-1/slice31.webp",
        },
        error: null,
      },
    });
  });

  await page.route("**/api/v1/recipes", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    onCreateBody?.(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data: {
          id: "recipe-31-manual",
          title: "이미지 김치찌개",
          source_type: "manual",
          created_by: "user-1",
          base_servings: 2,
        },
        error: null,
      },
    });
  });
}

async function installRecipeDetailRoute(page: Page) {
  await page.route("**/api/v1/recipes/recipe-31-youtube", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          id: "recipe-31-youtube",
          title: "김치찌개 자세한 레시피",
          description: "유튜브에서 가져온 집밥 레시피예요.",
          thumbnail_url: createFoodThumbDataUri("찌개", "#FFC6CA"),
          base_servings: 2,
          tags: ["한식", "찌개", "저녁"],
          source_type: "youtube",
          source: {
            youtube_url: "https://www.youtube.com/watch?v=recipe31video",
            youtube_video_id: "recipe31video",
          },
          view_count: 128,
          like_count: 12,
          save_count: 8,
          plan_count: 4,
          cook_count: 3,
          ingredients: [
            {
              id: "ingredient-kimchi",
              ingredient_id: "ingredient-kimchi",
              standard_name: "김치",
              amount: 200,
              unit: "g",
              ingredient_type: "QUANT",
              display_text: "김치 200g",
              scalable: true,
              sort_order: 1,
            },
          ],
          steps: [
            {
              id: "step-1",
              step_number: 1,
              instruction: "김치를 한입 크기로 썬다",
              cooking_method: {
                id: "method-prep",
                code: "prep",
                label: "손질",
                color_key: "gray",
              },
              ingredients_used: [],
              heat_level: null,
              duration_seconds: null,
              duration_text: null,
            },
          ],
          user_status: {
            is_liked: false,
            is_saved: false,
            saved_recipe_book_ids: [],
          },
        },
        error: null,
      },
    });
  });
}

test.describe("Slice 31: Recipe media and tags evidence", () => {
  test("captures mobile and narrow evidence for recipe media/tag surfaces", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "Evidence test creates explicit mobile/narrow contexts once.",
    );
    test.setTimeout(120_000);
    await mkdir(EVIDENCE_DIR, { recursive: true });

    const youtube = await preparePage(browser, MOBILE_VIEWPORT);
    try {
      await installYoutubeRoutes(youtube.page);
      await youtube.page.goto("/menu/add/youtube");
      await stabilize(youtube.page);
      await youtube.page
        .locator('input[type="url"]')
        .fill("https://www.youtube.com/watch?v=recipe31video");
      await youtube.page.getByRole("button", { name: "가져오기" }).click();
      await expect(youtube.page.getByTestId("youtube-draft-thumbnail")).toBeVisible();
      await expect(youtube.page.getByTestId("youtube-draft-tags")).toContainText("한식");
      await youtube.page.screenshot({
        fullPage: true,
        path: path.join(EVIDENCE_DIR, "YT_IMPORT-thumbnail-tag-preview-mobile-screenshot.png"),
      });
    } finally {
      void youtube.context.close().catch(() => {});
    }

    const manual = await preparePage(browser, MOBILE_VIEWPORT);
    const manualCreateBody: { current: Record<string, unknown> | null } = {
      current: null,
    };
    try {
      await installManualRoutes(manual.page, (body) => {
        manualCreateBody.current = body;
      });
      await manual.page.goto("/menu/add/manual");
      await stabilize(manual.page);
      await manual.page
        .getByTestId("manual-image-file-input")
        .setInputFiles({
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/l4e5WQAAAABJRU5ErkJggg==",
            "base64",
          ),
          mimeType: "image/png",
          name: "slice31.png",
        });
      await expect(manual.page.getByTestId("manual-image-preview")).toBeVisible();
      await expect(manual.page.getByTestId("manual-image-replace-button")).toBeVisible();
      await manual.page.screenshot({
        fullPage: true,
        path: path.join(EVIDENCE_DIR, "MANUAL_RECIPE_CREATE-image-upload-mobile-screenshot.png"),
      });
      await manual.page.getByLabel("요리 이름").fill("이미지 김치찌개");
      await manual.page.getByRole("button", { name: "+ 재료 추가하기" }).click();
      const ingredientDialog = manual.page.getByRole("dialog", { name: "재료로 검색" });
      await ingredientDialog.locator("label").filter({ hasText: "김치" }).click();
      await ingredientDialog.getByRole("button", { name: "선택한 재료 1개 추가" }).click();
      await manual.page.getByRole("button", { name: "손질" }).click();
      await manual.page.getByLabel("만들기 1 설명").fill("김치를 한입 크기로 썬다");
      await manual.page.getByRole("button", { name: "+ 만들기 추가" }).click();
      await manual.page.getByRole("button", { name: "저장" }).click();
      await expect(manual.page.getByText("레시피 등록 완료")).toBeVisible();
      expect(String(manualCreateBody.current?.thumbnail_url)).toContain("data:image/svg+xml");
    } finally {
      void manual.context.close().catch(() => {});
    }

    const detail = await preparePage(browser, MOBILE_VIEWPORT);
    try {
      await installRecipeDetailRoute(detail.page);
      await detail.page.goto("/recipe/recipe-31-youtube");
      await stabilize(detail.page);
      await expect(detail.page.locator('[data-testid="recipe-youtube-source-note"]:visible')).toBeVisible();
      await expect(detail.page.locator('[data-testid="recipe-detail-tags"]:visible')).toContainText("한식");
      await detail.page.screenshot({
        fullPage: true,
        path: path.join(EVIDENCE_DIR, "RECIPE_DETAIL-source-note-tag-display-mobile-screenshot.png"),
      });
    } finally {
      void detail.context.close().catch(() => {});
    }

    const narrow = await preparePage(browser, NARROW_VIEWPORT);
    try {
      await installRecipeDetailRoute(narrow.page);
      await narrow.page.goto("/recipe/recipe-31-youtube");
      await stabilize(narrow.page);
      await expect(narrow.page.locator('[data-testid="recipe-youtube-source-note"]:visible')).toBeVisible();
      await narrow.page.screenshot({
        fullPage: true,
        path: path.join(EVIDENCE_DIR, "RECIPE_DETAIL-narrow-viewport-text-fit-screenshot.png"),
      });
    } finally {
      void narrow.context.close().catch(() => {});
    }
  });
});
