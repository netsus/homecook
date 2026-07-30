import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { buildUnavailableRecipeNutrition } from "@/lib/nutrition/recipe-nutrition-presentation";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_AUTH_OVERRIDE_COOKIE = E2E_AUTH_OVERRIDE_KEY;
const QUARANTINE_STATE_COOKIE = "homecook.qa-account-quarantine-state";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/31-recipe-media-tags",
);

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const NARROW_VIEWPORT = { width: 320, height: 568 } as const;

function hybridViewport(projectName: string) {
  const width = projectName === "mobile-ios-small"
    ? 320
    : projectName === "mobile-chrome"
      ? 390
      : 1280;
  return { width, height: width < 500 ? 844 : 900 };
}

function observeImageMutations(page: Page) {
  const directStorage: string[] = [];
  const serverImageApi: string[] = [];
  page.on("request", (request) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (pathname.includes("/storage/v1/object")) {
      directStorage.push(`${request.method()} ${pathname}`);
    }
    if (pathname.startsWith("/api/v1/recipes/images")) {
      serverImageApi.push(`${request.method()} ${pathname}`);
    }
  });
  return { directStorage, serverImageApi };
}

function hybridImageFile(name: string) {
  return {
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/l4e5WQAAAABJRU5ErkJggg==",
      "base64",
    ),
    mimeType: "image/png",
    name,
  };
}

async function fillRequiredManualRecipeFields(page: Page, title: string) {
  await page.getByLabel("요리 이름").fill(title);
  await page.getByRole("button", { name: "+ 재료 추가하기" }).click();
  const ingredientDialog = page.getByRole("dialog", { name: "재료로 검색" });
  await ingredientDialog.locator("label").filter({ hasText: "김치" }).click();
  await ingredientDialog.getByRole("button", { name: "선택한 재료 1개 추가" }).click();
  await page.getByRole("button", { name: "손질" }).click();
  await page.getByLabel("만들기 1 설명").fill("김치를 손질한다");
  await page.getByRole("button", { name: "+ 만들기 추가" }).click();
}

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

async function setAuthOverride(
  page: Page,
  state: "authenticated" | "guest" = "authenticated",
) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: state,
    },
  ]);
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state },
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
  options?: {
    imageUploadMode?: "legacy" | "managed";
    onCreateBody?: (body: Record<string, unknown>) => void;
    onUploadHeaders?: (headers: Record<string, string>) => void;
  },
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

    options?.onUploadHeaders?.(route.request().headers());

    await route.fulfill({
      status: 201,
      json: {
        success: true,
        data:
          options?.imageUploadMode === "managed"
            ? {
                image_object_id: "550e8400-e29b-41d4-a716-446655440331",
                state: "uploaded_unlinked",
                read_url: createFoodThumbDataUri("김밥", "#FFE2CF"),
                read_url_expires_at: "2099-07-30T03:05:00.000Z",
              }
            : {
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

    options?.onCreateBody?.(route.request().postDataJSON() as Record<string, unknown>);
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
          nutrition: buildUnavailableRecipeNutrition(),
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
      await installManualRoutes(manual.page, {
        onCreateBody: (body) => {
          manualCreateBody.current = body;
        },
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

  test("hybrid-auth-local-data-production keeps managed image mutations server-side at exact target widths", async ({
    page,
  }, testInfo) => {
    const viewport = hybridViewport(testInfo.project.name);
    await page.setViewportSize(viewport);
    const imageMutations = observeImageMutations(page);
    const manualCreateBody: { current: Record<string, unknown> | null } = {
      current: null,
    };
    const uploadHeaders: { current: Record<string, string> | null } = {
      current: null,
    };

    await setAuthOverride(page);
    await installManualRoutes(page, {
      imageUploadMode: "managed",
      onCreateBody: (body) => {
        manualCreateBody.current = body;
      },
      onUploadHeaders: (headers) => {
        uploadHeaders.current = headers;
      },
    });
    await page.goto("/menu/add/manual");
    await stabilize(page);
    expect(await page.evaluate(() => window.innerWidth)).toBe(viewport.width);
    await page
      .getByTestId("manual-image-file-input")
      .setInputFiles(hybridImageFile("slice31-managed.png"));
    await expect(page.getByTestId("manual-image-preview")).toBeVisible();

    await fillRequiredManualRecipeFields(page, "관리형 이미지 김치찌개");
    await page.getByRole("button", { name: "저장" }).click();

    await expect(page.getByText("레시피 등록 완료")).toBeVisible();
    expect(uploadHeaders.current?.["idempotency-key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(manualCreateBody.current?.image_object_id).toBe(
      "550e8400-e29b-41d4-a716-446655440331",
    );
    expect(manualCreateBody.current?.thumbnail_url).toBeUndefined();
    expect(imageMutations.directStorage).toEqual([]);
    expect(imageMutations.serverImageApi).toEqual(["POST /api/v1/recipes/images"]);
  });

  test("hybrid-auth-local-data-production preserves upload failure, cancel, create failure, and retry", async ({
    page,
  }, testInfo) => {
    const viewport = hybridViewport(testInfo.project.name);
    await page.setViewportSize(viewport);
    const imageMutations = observeImageMutations(page);

    await setAuthOverride(page);
    await installManualRoutes(page, { imageUploadMode: "managed" });

    let uploadAttempt = 0;
    await page.route("**/api/v1/recipes/images", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      uploadAttempt += 1;
      if (uploadAttempt === 1) {
        await route.fulfill({
          status: 503,
          json: {
            success: false,
            data: null,
            error: {
              code: "NETWORK_ERROR",
              message: "네트워크 오류가 발생했어요.",
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
            image_object_id: `550e8400-e29b-41d4-a716-44665544033${uploadAttempt}`,
            state: "uploaded_unlinked",
            read_url: createFoodThumbDataUri("재시도", "#FFE2CF"),
            read_url_expires_at: "2099-07-30T03:05:00.000Z",
          },
          error: null,
        },
      });
    });

    const cancelledObjectIds: string[] = [];
    await page.route("**/api/v1/recipes/images/*/cancel", async (route) => {
      const imageObjectId = new URL(route.request().url()).pathname.split("/").at(-2) ?? "";
      cancelledObjectIds.push(imageObjectId);
      await route.fulfill({
        json: {
          success: true,
          data: { image_object_id: imageObjectId, state: "cleanup_pending" },
          error: null,
        },
      });
    });

    let createAttempt = 0;
    await page.route("**/api/v1/recipes", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      createAttempt += 1;
      if (createAttempt === 1) {
        await route.fulfill({
          status: 409,
          json: {
            success: false,
            data: null,
            error: {
              code: "IMAGE_NOT_FOUND",
              message: "이미지를 다시 확인해 주세요.",
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
            id: "recipe-31-retried",
            title: "재시도 김치찌개",
            source_type: "manual",
            created_by: "user-1",
            base_servings: 2,
          },
          error: null,
        },
      });
    });

    await page.goto("/menu/add/manual");
    await stabilize(page);
    expect(await page.evaluate(() => window.innerWidth)).toBe(viewport.width);

    const imageFile = hybridImageFile("hybrid-stage4.png");
    await page.getByTestId("manual-image-file-input").setInputFiles(imageFile);
    await expect(page.getByTestId("manual-image-error")).toContainText("네트워크 오류");
    await page.getByTestId("manual-image-retry-button").click();
    await expect(page.getByTestId("manual-image-replace-button")).toBeVisible();
    await page.getByTestId("manual-image-remove-button").click();
    await expect(page.getByTestId("manual-image-choose-button")).toBeVisible();
    expect(cancelledObjectIds).toEqual(["550e8400-e29b-41d4-a716-446655440332"]);

    await page.getByTestId("manual-image-file-input").setInputFiles(imageFile);
    await expect(page.getByTestId("manual-image-replace-button")).toBeVisible();
    await fillRequiredManualRecipeFields(page, "재시도 김치찌개");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByTestId("manual-image-error")).toContainText(
      "이미지를 다시 확인해 주세요.",
    );
    await page.getByTestId("manual-image-retry-button").click();
    await expect(page.getByTestId("manual-image-replace-button")).toBeVisible();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("레시피 등록 완료")).toBeVisible();

    expect(uploadAttempt).toBe(4);
    expect(createAttempt).toBe(2);
    expect(cancelledObjectIds).toEqual([
      "550e8400-e29b-41d4-a716-446655440332",
      "550e8400-e29b-41d4-a716-446655440333",
    ]);
    expect(imageMutations.directStorage).toEqual([]);
    expect(imageMutations.serverImageApi).toHaveLength(6);
    expect(imageMutations.serverImageApi.every((entry) =>
      entry.startsWith("POST /api/v1/recipes/images")
    )).toBe(true);
  });

  test("hybrid-auth-local-data-production preserves return-to-action and account error states", async ({
    page,
  }, testInfo) => {
    const viewport = hybridViewport(testInfo.project.name);
    await page.setViewportSize(viewport);

    await setAuthOverride(page, "guest");
    await page.goto("/menu/add/manual?date=2026-07-30&columnId=dinner");
    await expect(page).toHaveURL(/\/login\?next=/);
    const nextValue = new URL(page.url()).searchParams.get("next");
    expect(nextValue).toBe(
      "/menu/add/manual?date=2026-07-30&columnId=dinner",
    );

    await page.goto(
      "/login?authError=oauth_failed&next=%2Fmenu%2Fadd%2Fmanual",
    );
    await expect(page.getByText(/로그인|다시 시도/).first()).toBeVisible();

    await setAuthOverride(page, "authenticated");
    await page.context().addCookies([{
      name: QUARANTINE_STATE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: "error",
    }]);
    await page.goto("/account-quarantine?next=%2Fmypage");
    await expect(page.locator('[data-screen-id="ACCOUNT_QUARANTINE"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();

    await page.context().addCookies([{
      name: QUARANTINE_STATE_COOKIE,
      sameSite: "Lax",
      url: BASE_URL,
      value: "unauthorized",
    }]);
    await page.reload();
    await expect(page.getByText("세션이 바뀌었어요. 다시 로그인해 주세요.")).toBeVisible();
    await expect(page.getByRole("link", { name: "다시 로그인" })).toBeVisible();
    expect(await page.evaluate(() => window.innerWidth)).toBe(viewport.width);
  });
});
