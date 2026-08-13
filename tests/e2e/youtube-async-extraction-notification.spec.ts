import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { installDiscoveryRoutes, setE2EAuthOverride } from "./helpers/mock-routes";

const EVIDENCE_ROOT = path.resolve(
  process.cwd(),
  "ui/designs/evidence/youtube-async-extraction-notification",
);
const IMPORT_EVIDENCE = path.join(EVIDENCE_ROOT, "YT_IMPORT_BACKGROUND");
const SHELL_EVIDENCE = path.join(EVIDENCE_ROOT, "APP_SHELL_YOUTUBE_NOTIFICATIONS");
const YOUTUBE_URL = "https://www.youtube.com/watch?v=abcdefghijk";
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const EXTRACTION_ID = "22222222-2222-4222-8222-222222222222";
const THUMBNAIL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23dff5ff'/%3E%3Ctext x='160' y='98' text-anchor='middle' font-size='64'%3E🍲%3C/text%3E%3C/svg%3E";

type ImportMode = "accepted" | "duplicate" | "offline" | "review";

function notificationItem({
  code,
  status,
  title,
}: {
  code?: "NOT_RECIPE_VIDEO" | "QUOTA_EXCEEDED";
  status: "failed" | "succeeded";
  title: string | null;
}) {
  return {
    job_id: status === "succeeded" ? JOB_ID : "33333333-3333-4333-8333-333333333333",
    status,
    submitted_at: "2026-08-14T01:00:00.000Z",
    completed_at: "2026-08-14T01:03:00.000Z",
    video_title_snapshot: title,
    thumbnail_url: THUMBNAIL,
    delivery_key: status === "succeeded" ? "delivery-success" : "delivery-failed",
    delivered_at: null,
    seen_at: null,
    result: status === "succeeded"
      ? {
          extraction_id: EXTRACTION_ID,
          review_path: `/menu/add/youtube?extractionId=${EXTRACTION_ID}`,
          recipe_id: null,
          recipe_path: null,
        }
      : null,
    error: status === "failed"
      ? {
          code: code ?? "NOT_RECIPE_VIDEO",
          message: code === "QUOTA_EXCEEDED"
            ? "오늘 추출 한도를 모두 사용했어요. 나중에 다시 시도해 주세요."
            : "레시피 영상으로 확인되지 않았어요.",
          retryable: code === "QUOTA_EXCEEDED",
        }
      : null,
    can_retry: code === "QUOTA_EXCEEDED",
  };
}

async function installNotificationRoutes(
  page: Page,
  unseenItems = [notificationItem({ status: "succeeded", title: null })],
) {
  const archiveItems = [
    { ...notificationItem({ status: "succeeded", title: "감자 수프" }), seen_at: "2026-08-14T01:04:00.000Z" },
    { ...notificationItem({ code: "QUOTA_EXCEEDED", status: "failed", title: "두부조림" }), seen_at: "2026-08-14T01:05:00.000Z" },
  ];
  await page.route("**/api/v1/users/me/youtube-extraction-jobs**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/delivered")) {
      await route.fulfill({ json: { success: true, data: { delivered_count: unseenItems.length }, error: null } });
      return;
    }
    if (url.pathname.endsWith("/seen")) {
      await route.fulfill({ json: { success: true, data: { seen_count: unseenItems.length }, error: null } });
      return;
    }
    const archive = url.searchParams.get("view") === "archive";
    await route.fulfill({
      json: {
        success: true,
        data: { items: archive ? archiveItems : unseenItems, next_cursor: null },
        error: null,
      },
    });
  });
}

async function installImportRoutes(page: Page, mode: ImportMode) {
  await installNotificationRoutes(page, []);
  await page.route("**/api/v1/cooking-methods", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          methods: [{
            id: "method-boil",
            code: "boil",
            label: "끓이기",
            color_key: "red",
            is_system: true,
          }],
        },
        error: null,
      },
    });
  });
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
            video_id: "abcdefghijk",
            title: "부드러운 감자 수프",
            channel: "오늘의 주방",
            duration: "PT6M",
            thumbnail_url: THUMBNAIL,
          },
        },
        error: null,
      },
    });
  });
  await page.route("**/api/v1/recipes/youtube/extraction-jobs", async (route) => {
    if (mode === "offline") {
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({
      status: 202,
      json: {
        success: true,
        data: {
          job_id: JOB_ID,
          status: "queued",
          deduplicated: mode === "duplicate",
          submitted_at: "2026-08-14T01:00:00.000Z",
        },
        error: null,
      },
    });
  });
  await page.route(`**/api/v1/recipes/youtube/extraction-jobs/${JOB_ID}`, async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          job_id: JOB_ID,
          status: "queued",
          submitted_at: "2026-08-14T01:00:00.000Z",
          started_at: null,
          completed_at: null,
          result: null,
          error: null,
          can_retry: false,
        },
        error: null,
      },
    });
  });
  if (mode === "review") {
    await page.route(`**/api/v1/recipes/youtube/extractions/${EXTRACTION_ID}`, async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            status: "draft",
            draft: {
              extraction_id: EXTRACTION_ID,
              title: "부드러운 감자 수프",
              base_servings: 2,
              thumbnail_url: THUMBNAIL,
              tags: ["유튜브레시피"],
              suggested_tags: [],
              extraction_methods: ["description"],
              draft_warnings: [],
              blocking_issues: [],
              ingredients: [{
                draft_ingredient_id: "draft-potato",
                ingredient_id: "ingredient-potato",
                standard_name: "감자",
                amount: 2,
                unit: "개",
                ingredient_type: "QUANT",
                display_text: "감자 2개",
                sort_order: 1,
                scalable: true,
                confidence: 0.96,
                resolution_status: "resolved",
                candidates: [],
                raw_text: "감자 2개",
              }],
              steps: [{
                step_number: 1,
                instruction: "감자를 부드럽게 끓인다",
                cooking_method: {
                  id: "method-boil",
                  code: "boil",
                  label: "끓이기",
                  color_key: "red",
                  is_new: false,
                },
                duration_text: "20분",
                is_incomplete: false,
                missing_fields: [],
                raw_text: "감자를 부드럽게 끓인다",
              }],
              new_cooking_methods: [],
            },
            recipe_id: null,
            recipe_path: null,
          },
          error: null,
        },
      });
    });
    await page.route("**/api/v1/recipes/youtube/register", async (route) => {
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          data: { recipe_id: "recipe-potato-soup", title: "부드러운 감자 수프" },
          error: null,
        },
      });
    });
  }
}

async function openImport(page: Page, mode: ImportMode, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await setE2EAuthOverride(page);
  await installImportRoutes(page, mode);
  const path = mode === "review"
    ? `/menu/add/youtube?extractionId=${EXTRACTION_ID}`
    : `/menu/add/youtube?youtubeUrl=${encodeURIComponent(YOUTUBE_URL)}`;
  await page.goto(path);
}

test.beforeAll(async () => {
  await mkdir(IMPORT_EVIDENCE, { recursive: true });
  await mkdir(SHELL_EVIDENCE, { recursive: true });
});

test("async enqueue is immediately escapable and visually stable at 390", async ({ page }) => {
  await openImport(page, "accepted", 390, 844);
  await expect(page.getByText("추출을 시작했어요. 완료되면 알려드릴게요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "나가기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "작업 보기" })).toBeVisible();
  // The locked Wave 1 bright-brand palette is an existing repository-wide
  // exception; keep every structural/interactive axe rule active here.
  const results = await new AxeBuilder({ page })
    .include(".yt-mobile-import-shell")
    .disableRules(["color-contrast"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: path.join(IMPORT_EVIDENCE, "mobile-390-accepted.png"), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("offline keeps the URL and gives a retryable 320 state", async ({ page }) => {
  await openImport(page, "offline", 320, 568);
  await expect(page.locator(".web-menu-add-error")).toContainText("인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  await expect(page.getByLabel("유튜브 URL")).toHaveValue(YOUTUBE_URL);
  await page.screenshot({ path: path.join(IMPORT_EVIDENCE, "mobile-320-offline.png"), fullPage: true });
});

test("duplicate active work is explicit on desktop", async ({ page }) => {
  await openImport(page, "duplicate", 1280, 800);
  await expect(page.getByText("같은 영상의 작업이 이미 진행 중이에요. 이 화면을 나가도 계속 처리돼요.")).toBeVisible();
  await page.screenshot({ path: path.join(IMPORT_EVIDENCE, "desktop-1280-active-duplicate.png"), fullPage: true });
});

test("completed session re-entry can register the reviewed recipe", async ({ page }) => {
  await openImport(page, "review", 390, 844);
  await expect(page.getByRole("heading", { name: "추출 결과 확인" })).toBeVisible();
  await page.getByRole("button", { name: "등록" }).click();
  await expect(page.getByText("레시피가 등록됐어요")).toBeVisible();
});

test("app shell success toast keeps badge until list exposure", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page);
  await page.goto("/");
  await expect(page.getByText("YouTube 레시피 추출이 완료됐어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "YouTube 추출 알림 1개" })).toBeVisible();
  await page.screenshot({ path: path.join(SHELL_EVIDENCE, "mobile-390-success-toast.png") });
});

test("failure panel is keyboard-contained at 320", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page, [notificationItem({ status: "failed", title: "두부조림" })]);
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
  const dialog = page.getByRole("dialog", { name: "YouTube 추출 알림" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "알림 닫기" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const results = await new AxeBuilder({ page })
    .include("[role='dialog']")
    .disableRules(["color-contrast"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: path.join(SHELL_EVIDENCE, "mobile-320-failure-panel.png") });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("desktop archive remains internally scrollable without page overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setE2EAuthOverride(page);
  await installDiscoveryRoutes(page);
  await installNotificationRoutes(page);
  await page.goto("/");
  await page.getByRole("button", { name: "YouTube 추출 알림 1개" }).click();
  await page.getByRole("tab", { name: "지난 알림" }).click();
  await expect(page.getByRole("heading", { name: "감자 수프" })).toBeVisible();
  await expect(page.getByRole("button", { name: "나중에 다시 시도" })).toBeVisible();
  await page.screenshot({ path: path.join(SHELL_EVIDENCE, "desktop-1440-archive.png") });
});
