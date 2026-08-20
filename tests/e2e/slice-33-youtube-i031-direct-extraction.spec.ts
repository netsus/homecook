import { expect, test, type Page } from "@playwright/test";

import { installCompletedYoutubeExtractionRoutes } from "./helpers/youtube-background-extraction";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_APP_ORIGIN =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const YOUTUBE_REVIEW_URL = "/menu/add/youtube";
const PUBLIC_RECIPE_URL = "https://www.youtube.com/watch?v=i031test001";

async function setAuthOverride(page: Page) {
  await page.context().addCookies([
    {
      name: E2E_AUTH_OVERRIDE_KEY,
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

async function installDuplicateMissRoute(page: Page) {
  await page.route(
    "**/api/v1/recipes/youtube/recipio/check**",
    async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: { is_duplicate: false, recipe: null },
          error: null,
        },
      });
    },
  );
}

async function installValidateRoute(page: Page, delayMs = 0) {
  await page.route(
    "**/api/v1/recipes/youtube/validate",
    async (route) => {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
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
              video_id: "i031test001",
              title: "i031 회귀 확인 영상",
              channel: "회귀 확인 채널",
              thumbnail_url:
                "https://i.ytimg.com/vi/i031test001/mqdefault.jpg",
            },
          },
          error: null,
        },
      });
    },
  );
}

function createReviewDraft() {
  return {
    extraction_id: "ext-i031-stage4",
    title: "i031 회귀 확인 레시피",
    base_servings: 2,
    extraction_methods: ["description"],
    draft_warnings: [],
    blocking_issues: [],
    ingredients: [],
    steps: [],
    new_cooking_methods: [],
  };
}

test.describe("Workpack 33: YouTube i031 direct extraction closeout", () => {
  test("blocks duplicate background submission while URL validation is pending", async ({
    page,
  }) => {
    await setAuthOverride(page);
    await installDuplicateMissRoute(page);
    await installCompletedYoutubeExtractionRoutes(page, createReviewDraft(), {
      keepQueued: true,
    });

    let validateRequestCount = 0;
    await installValidateRoute(page, 600);
    await page.route(
      "**/api/v1/recipes/youtube/validate",
      async (route) => {
        validateRequestCount += 1;
        await route.fallback();
      },
    );

    let enqueueRequestCount = 0;
    await page.route(
      "**/api/v1/recipes/youtube/extraction-jobs",
      async (route) => {
        enqueueRequestCount += 1;
        await route.fallback();
      },
    );

    await page.goto(YOUTUBE_REVIEW_URL);
    const urlInput = page.getByLabel("유튜브 URL");

    await urlInput.fill(PUBLIC_RECIPE_URL);
    await page.getByRole("button", { name: "가져오기" }).click();
    await expect(
      page.getByRole("button", { name: "확인 중..." }),
    ).toBeDisabled();
    await expect(urlInput).toBeDisabled();

    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("heading", {
        name: "추출을 시작했어요. 완료되면 알려드릴게요.",
      }),
    ).toBeVisible();
    expect(validateRequestCount).toBe(1);
    expect(enqueueRequestCount).toBe(1);
  });

  test("keeps queue failures inline and retries through background enqueue", async ({
    page,
  }) => {
    await setAuthOverride(page);
    await installValidateRoute(page);
    await installCompletedYoutubeExtractionRoutes(page, createReviewDraft(), {
      keepQueued: true,
    });

    let enqueueRequestCount = 0;
    await page.route(
      "**/api/v1/recipes/youtube/extraction-jobs",
      async (route) => {
        enqueueRequestCount += 1;
        if (enqueueRequestCount === 1) {
          await route.fulfill({
            status: 503,
            json: {
              success: false,
              data: null,
              error: {
                code: "QUEUE_UNAVAILABLE",
                message: "추출 대기열을 잠시 사용할 수 없어요.",
                fields: [],
              },
            },
          });
          return;
        }
        await route.fallback();
      },
    );

    await page.goto(YOUTUBE_REVIEW_URL);
    await page.getByLabel("유튜브 URL").fill(PUBLIC_RECIPE_URL);
    await page.getByRole("button", { name: "가져오기" }).click();

    await expect(page.locator(".web-menu-add-error")).toContainText(
      "추출 대기열을 잠시 사용할 수 없어요.",
    );
    await expect(page.getByLabel("유튜브 URL")).toHaveValue(
      PUBLIC_RECIPE_URL,
    );

    await page.getByRole("button", { name: "가져오기" }).click();

    await expect(
      page.getByRole("heading", {
        name: "추출을 시작했어요. 완료되면 알려드릴게요.",
      }),
    ).toBeVisible();
    expect(enqueueRequestCount).toBe(2);
  });

  test("restores the completed i031 review without viewport overflow", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chrome",
      "one browser drives the explicit viewport matrix",
    );
    await setAuthOverride(page);
    await installDuplicateMissRoute(page);
    await installCompletedYoutubeExtractionRoutes(page, createReviewDraft());

    let syncExtractRequestCount = 0;
    await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
      syncExtractRequestCount += 1;
      await route.abort("blockedbyclient");
    });

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(
        `${YOUTUBE_REVIEW_URL}?extractionId=${createReviewDraft().extraction_id}`,
      );

      await expect(
        page.getByRole("heading", { name: "추출 결과를 확인해 주세요" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }

    expect(syncExtractRequestCount).toBe(0);
  });
});
