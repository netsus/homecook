import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";
const E2E_APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const YOUTUBE_IMPORT_URL = "/recipes/new/youtube";
const YOUTUBE_REVIEW_URL = "/menu/add/youtube";
const PUBLIC_RECIPE_URL = "https://www.youtube.com/watch?v=i031test001";
const EVIDENCE_DIR = path.resolve(
  process.cwd(),
  "ui/designs/evidence/33-youtube-i031-direct-extraction",
);

const VIEWPORTS = [
  { name: "desktop-1280", width: 1280, height: 720 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 568 },
] as const;

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
  await page.route("**/api/v1/recipes/youtube/recipio/check**", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { is_duplicate: false, recipe: null },
        error: null,
      },
    });
  });
}

async function installCookingMethodsRoute(page: Page) {
  await page.route("**/api/v1/cooking-methods", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          methods: [
            {
              id: "method-boil",
              code: "boil",
              label: "끓이기",
              color_key: "red",
              is_system: true,
            },
          ],
        },
        error: null,
      },
    });
  });
}

async function installValidateRoute(page: Page) {
  await page.route("**/api/v1/recipes/youtube/validate", async (route) => {
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
            thumbnail_url: createThumbDataUri(),
          },
        },
        error: null,
      },
    });
  });
}

async function installGamificationRoute(page: Page) {
  await page.route("**/api/v1/users/me/gamification", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          level: {
            current_level: 1,
            total_xp: 0,
            xp_to_next_level: 100,
            progress_percent: 0,
          },
          grade: {
            grade_key: "homecook_beginner",
            label: "집밥 새싹",
            level_min: 1,
            level_max: 3,
          },
          featured_badges: [],
          badges: { earned: [], locked: [] },
          quests: { active: [], completed_recent: [] },
          tutorial: {
            category_key: "tutorial",
            completed_count: 0,
            total_count: 0,
            active_steps: [],
          },
          achievement_album: {
            summary: {
              earned_count: 0,
              total_count: 0,
              completed_category_count: 0,
            },
            categories: [],
          },
          notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
          last_updated_at: "2026-08-12T00:00:00.000Z",
        },
        error: null,
      },
    });
  });
}

async function stabilize(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
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

async function assertViewportQuality(page: Page) {
  const geometry = await page.evaluate(() => {
    const capabilityBoxes = Array.from(
      document.querySelectorAll("main section > div.grid.grid-cols-2 > span"),
    ).map((element) => element.getBoundingClientRect());
    const hasCapabilityOverlap = capabilityBoxes.some((box, index) =>
      capabilityBoxes.slice(index + 1).some((other) =>
        box.left < other.right &&
        box.right > other.left &&
        box.top < other.bottom &&
        box.bottom > other.top,
      ),
    );
    const capabilityLineCounts = Array.from(
      document.querySelectorAll("main div.grid.grid-cols-4 > span"),
    ).map((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    });

    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasCapabilityOverlap,
      capabilityLineCounts,
    };
  });

  expect(geometry.bodyOverflow).toBeLessThanOrEqual(1);
  expect(geometry.hasCapabilityOverlap).toBe(false);
  expect(geometry.capabilityLineCounts).toEqual(geometry.capabilityLineCounts.map(() => 1));
}

function createThumbDataUri() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">',
    '<rect width="960" height="540" fill="#dfe8d5"/>',
    '<text x="480" y="290" text-anchor="middle" font-family="sans-serif" font-size="72">i031 recipe</text>',
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

function strictProviderError() {
  return {
    success: false,
    data: null,
    error: {
      code: "PROVIDER_ERROR",
      message: "i031 실행 환경을 확인한 뒤 다시 시도해 주세요.",
      fields: [],
    },
  };
}

test.describe("Workpack 33: YouTube i031 direct extraction closeout", () => {
  test("blocks duplicate submission while strict extraction is loading", async ({ page }) => {
    await setAuthOverride(page);
    await installDuplicateMissRoute(page);

    let validateRequestCount = 0;
    await page.route("**/api/v1/recipes/youtube/validate", async (route) => {
      validateRequestCount += 1;
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
              thumbnail_url: "https://i.ytimg.com/vi/i031test001/mqdefault.jpg",
            },
          },
          error: null,
        },
      });
    });

    let extractRequestCount = 0;
    await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
      extractRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        json: {
          success: true,
          data: createReviewDraft(),
          error: null,
        },
      });
    });

    await page.goto(YOUTUBE_IMPORT_URL);
    const urlInput = page.getByLabel("유튜브 링크");
    const submitButton = page.getByRole("button", { name: "가져오기" });

    await urlInput.fill(PUBLIC_RECIPE_URL);
    await submitButton.click();
    await expect(submitButton).toBeDisabled();
    await expect(urlInput).toBeDisabled();

    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await expect.poll(() => extractRequestCount).toBe(1);
    await expect(page.getByText("검수가 필요해요")).toBeVisible();
    expect(validateRequestCount).toBe(0);
  });

  test("keeps strict provider failures in the existing error and retry flow", async ({ page }) => {
    await setAuthOverride(page);
    await installCookingMethodsRoute(page);
    await installValidateRoute(page);

    let extractRequestCount = 0;
    await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
      extractRequestCount += 1;
      await route.fulfill(
        extractRequestCount === 1
          ? { status: 502, json: strictProviderError() }
          : {
              json: {
                success: true,
                data: createReviewDraft(),
                error: null,
              },
            },
      );
    });

    await page.goto(YOUTUBE_REVIEW_URL);
    await page.getByLabel("유튜브 URL").fill(PUBLIC_RECIPE_URL);
    await page.getByRole("button", { name: "가져오기" }).click();

    await expect(page.getByRole("heading", { name: "레시피 추출에 실패했어요" })).toBeVisible();
    await expect(page.getByText("i031 실행 환경을 확인한 뒤 다시 시도해 주세요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();

    await page.getByRole("button", { name: "다시 시도" }).click();

    await expect(page.getByRole("heading", { name: "추출 결과를 확인해 주세요" })).toBeVisible();
    expect(extractRequestCount).toBe(2);
  });

  test("captures overlap-free loading, error, and review evidence at 1280, 390, and 320", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "single-browser evidence matrix");

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedResponses: Array<{ status: number; url: string }> = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push({ status: response.status(), url: response.url() });
      }
    });

    await mkdir(EVIDENCE_DIR, { recursive: true });
    await setAuthOverride(page);
    await installDuplicateMissRoute(page);
    await installGamificationRoute(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      let extractRequestCount = 0;
      let releaseFirstExtract!: () => void;
      const firstExtractReleased = new Promise<void>((resolve) => {
        releaseFirstExtract = resolve;
      });

      await page.route("**/api/v1/recipes/youtube/extract", async (route) => {
        extractRequestCount += 1;
        if (extractRequestCount === 1) {
          await firstExtractReleased;
          await route.fulfill({ json: strictProviderError() });
          return;
        }

        await route.fulfill({
          json: {
            success: true,
            data: createReviewDraft(),
            error: null,
          },
        });
      });

      await page.goto(YOUTUBE_IMPORT_URL);
      await stabilize(page);
      const urlInput = page.getByLabel("유튜브 링크");
      const submitButton = page.getByRole("button", { name: "가져오기" });

      await urlInput.fill(PUBLIC_RECIPE_URL);
      await submitButton.click();
      await expect(submitButton).toBeDisabled();
      await assertViewportQuality(page);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `${viewport.name}-loading.png`),
        fullPage: true,
      });

      releaseFirstExtract();
      await expect(page.getByText("i031 실행 환경을 확인한 뒤 다시 시도해 주세요.")).toBeVisible();
      await assertViewportQuality(page);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `${viewport.name}-error-retry.png`),
        fullPage: true,
      });

      await submitButton.click();
      await expect(page.getByText("검수가 필요해요")).toBeVisible();
      await assertViewportQuality(page);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `${viewport.name}-review.png`),
        fullPage: true,
      });

      await expect(page.getByText(/YOUTUBE_API_KEY|API key|모델 설정|gpt-5\.4|i031_codex_vision/)).toHaveCount(0);
      expect(extractRequestCount).toBe(2);
      await page.unroute("**/api/v1/recipes/youtube/extract");
    }

    expect(failedResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
